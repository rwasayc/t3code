package expo.modules.t3ssh;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import com.jcraft.jsch.JSchException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;

import org.junit.Test;

import expo.modules.t3ssh.TunnelClient.ErrorCategory;
import expo.modules.t3ssh.TunnelClient.TunnelException;

public class TunnelClientTest {
  private static final String DISTINCTIVE_KEY_BODY =
      "MIIEowIBAAKCAQEA0distinctivePrivateKeyBodyMarker";
  private static final String VALID_PEM =
      "-----BEGIN RSA PRIVATE KEY-----\n"
          + DISTINCTIVE_KEY_BODY
          + "\n-----END RSA PRIVATE KEY-----\n";

  private static byte[] ed25519WireKey() throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] algorithm = "ssh-ed25519".getBytes(StandardCharsets.UTF_8);
    out.write(new byte[] {0, 0, 0, (byte) algorithm.length});
    out.write(algorithm);
    out.write(new byte[] {0, 0, 0, 32});
    byte[] key = new byte[32];
    Arrays.fill(key, (byte) 7);
    out.write(key);
    return out.toByteArray();
  }

  private static String validHostKey() throws IOException {
    return "ssh-ed25519 " + Base64.getEncoder().encodeToString(ed25519WireKey());
  }

  private static TunnelClient.Config validConfig() throws Exception {
    return new TunnelClient.Config(
        "ecs.example.internal", 22, "tunnel", validHostKey(), VALID_PEM, 15_000);
  }

  @Test
  public void acceptsAValidProfile() throws Exception {
    TunnelClient.Config config = validConfig();
    assertEquals("ecs.example.internal", config.host);
    assertEquals(22, config.port);
    assertArrayEquals(ed25519WireKey(), config.pinnedHostKey);
  }

  @Test
  public void rejectsUnknownKeyAlgorithms() throws Exception {
    String ecdsa =
        "ecdsa-sha2-nistp256 " + Base64.getEncoder().encodeToString(ed25519WireKey());
    try {
      new TunnelClient.Config("host", 22, "tunnel", ecdsa, VALID_PEM, 15_000);
      fail("expected rejection");
    } catch (TunnelException e) {
      assertEquals(ErrorCategory.CONFIG, e.getCategory());
    }
  }

  @Test
  public void rejectsMalformedHostKeyBase64AndWireFormat() throws Exception {
    String notWireFormat = "ssh-ed25519 " + Base64.getEncoder().encodeToString(new byte[] {1, 2, 3});
    for (String hostKey : new String[] {"ssh-ed25519 !!!", "ssh-ed25519", notWireFormat}) {
      try {
        new TunnelClient.Config("host", 22, "tunnel", hostKey, VALID_PEM, 15_000);
        fail("expected rejection for " + hostKey);
      } catch (TunnelException e) {
        assertEquals(ErrorCategory.CONFIG, e.getCategory());
      }
    }
  }

  @Test
  public void rejectsIncorrectWireLengthPrefixes() throws Exception {
    for (int index : new int[] {0, 3, 15, 18}) {
      byte[] changed = ed25519WireKey();
      changed[index] ^= 1;
      try {
        TunnelClient.Config.parsePinnedHostKey("ssh-ed25519 " + Base64.getEncoder().encodeToString(changed));
        fail("Invalid wire length prefix accepted");
      } catch (TunnelException expected) {
        assertEquals(ErrorCategory.CONFIG, expected.getCategory());
      }
    }
  }

  @Test
  public void rejectsBadPortsHostsAndKeys() throws Exception {
    String hostKey = validHostKey();
    Object[][] cases = {
      {"whitespace host", "exa mple.com", 22, "tunnel", hostKey, VALID_PEM},
      {"blank host", "  ", 22, "tunnel", hostKey, VALID_PEM},
      {"zero port", "host", 0, "tunnel", hostKey, VALID_PEM},
      {"overflow port", "host", 70000, "tunnel", hostKey, VALID_PEM},
      {"blank username", "host", 22, " ", hostKey, VALID_PEM},
      {"non-pem key", "host", 22, "tunnel", hostKey, "not a pem"},
      {"oversized key", "host", 22, "tunnel", hostKey, pemOfLength(17 * 1024)},
    };
    for (Object[] testCase : cases) {
      String label = (String) testCase[0];
      try {
        new TunnelClient.Config(
            (String) testCase[1],
            (Integer) testCase[2],
            (String) testCase[3],
            (String) testCase[4],
            (String) testCase[5],
            15_000);
        fail("expected rejection: " + label);
      } catch (TunnelException e) {
        assertEquals(label, ErrorCategory.CONFIG, e.getCategory());
      }
    }
  }

  private static String pemOfLength(int length) {
    StringBuilder builder = new StringBuilder("-----BEGIN RSA PRIVATE KEY-----\n");
    while (builder.length() < length - 32) builder.append('A');
    builder.append("\n-----END RSA PRIVATE KEY-----\n");
    return builder.toString();
  }

  @Test
  public void pinnedRepositoryAcceptsOnlyTheExactKey() throws Exception {
    byte[] pinned = ed25519WireKey();
    TunnelClient.PinnedHostKeyRepository repository =
        new TunnelClient.PinnedHostKeyRepository(pinned);
    assertEquals(
        com.jcraft.jsch.HostKeyRepository.OK, repository.check("any-host", pinned.clone()));
    byte[] different = pinned.clone();
    different[different.length - 1] ^= 0x01;
    assertEquals(
        com.jcraft.jsch.HostKeyRepository.CHANGED, repository.check("any-host", different));
    // The repository never learns: adding a key must not make it accepted later.
    repository.add(null, null);
    repository.remove("any-host", "ssh-ed25519");
    assertEquals(
        com.jcraft.jsch.HostKeyRepository.CHANGED, repository.check("any-host", different));
  }

  @Test
  public void categorizesHostKeyFailures() {
    // JSchUnknownHostKeyException/JSchChangedHostKeyException have package-private constructors;
    // their real messages drive the same category through the fallback.
    assertEquals(
        ErrorCategory.HOST_KEY,
        TunnelClient.categorize(new JSchException("reject HostKey: example.internal"))
            .getCategory());
    assertEquals(
        ErrorCategory.HOST_KEY,
        TunnelClient.categorize(new JSchException("HostKey has been changed: example.internal"))
            .getCategory());
    assertEquals(
        ErrorCategory.HOST_KEY,
        TunnelClient.categorize(new JSchException("UnknownHostKey: example.internal"))
            .getCategory());
  }

  @Test
  public void categorizesAuthNetworkTimeoutAndUnknown() {
    assertEquals(
        ErrorCategory.AUTH,
        TunnelClient.categorize(new JSchException("Auth fail")).getCategory());
    assertEquals(
        ErrorCategory.AUTH,
        TunnelClient.categorize(new JSchException("Auth cancel")).getCategory());
    assertEquals(
        ErrorCategory.TIMEOUT,
        TunnelClient.categorize(
                new JSchException("session is down", new SocketTimeoutException("timed out")))
            .getCategory());
    assertEquals(
        ErrorCategory.NETWORK,
        TunnelClient.categorize(new JSchException("socket failed", new ConnectException()))
            .getCategory());
    assertEquals(
        ErrorCategory.NETWORK,
        TunnelClient.categorize(new JSchException("session is down")).getCategory());
    assertEquals(
        ErrorCategory.UNKNOWN,
        TunnelClient.categorize(new IllegalStateException("unexpected")).getCategory());
  }

  @Test
  public void categorizedMessagesNeverCarryProfileMaterial() throws Exception {
    TunnelClient.Config config = validConfig();
    TunnelException categorized =
        TunnelClient.categorize(
            new JSchException("Auth fail for tunnel@ecs.example.internal " + DISTINCTIVE_KEY_BODY));
    String exposed = categorized.getMessage() + " " + categorized.getCategory();
    assertFalse(exposed.contains(DISTINCTIVE_KEY_BODY));
    assertFalse(exposed.contains(config.username));
    assertFalse(exposed.contains(config.host));
  }

  @Test
  public void reportsDisconnectedBeforeAnyConnect() {
    assertFalse(new TunnelClient().isConnected());
  }
}
