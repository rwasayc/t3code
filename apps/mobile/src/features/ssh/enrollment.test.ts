import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  EnrollmentRejection,
  SSH_PROFILE_MAX_FILE_BYTES,
  parseEnrollment,
  stripPairingCode,
} from "./enrollment";

const WIRE_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH";
const HOST_KEY = `ssh-ed25519 ${WIRE_KEY}`;

const PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA3f5akeybase64body
-----END RSA PRIVATE KEY-----
`;

function enrollment(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    name: "工作台",
    host: "47.98.12.3",
    username: "tunnel",
    hostKey: HOST_KEY,
    privateKey: PEM,
    ...overrides,
  });
}

const isEnrollmentRejection = Schema.is(EnrollmentRejection);

function rejectionOf(input: string): EnrollmentRejection {
  try {
    parseEnrollment(input);
  } catch (error) {
    if (isEnrollmentRejection(error)) return error;
    throw error;
  }
  throw new Error("expected the enrollment to be rejected");
}

describe("parseEnrollment", () => {
  it("parses a valid enrollment and defaults the port to 22", () => {
    const profile = parseEnrollment(enrollment());
    expect(profile).toMatchObject({
      schemaVersion: 1,
      name: "工作台",
      host: "47.98.12.3",
      port: 22,
      username: "tunnel",
      hostKey: HOST_KEY,
      privateKey: PEM,
    });
    expect(profile.pairingCode).toBeUndefined();
  });

  it("keeps an explicit port and pairing code", () => {
    const profile = parseEnrollment(enrollment({ port: 2222, pairingCode: "t3-code-123" }));
    expect(profile.port).toBe(2222);
    expect(profile.pairingCode).toBe("t3-code-123");
  });

  it("rejects unknown schema versions", () => {
    expect(rejectionOf(enrollment({ schemaVersion: 2 })).reason).toBe("unsupported-version");
    expect(rejectionOf(enrollment({ schemaVersion: 0 })).reason).toBe("unsupported-version");
    expect(rejectionOf(enrollment({ schemaVersion: "1" })).reason).toBe("unsupported-version");
  });

  it("rejects non-JSON and non-object input", () => {
    expect(rejectionOf("not json").reason).toBe("not-json");
    expect(rejectionOf("[1,2]").reason).toBe("not-json");
  });

  it("rejects oversized files", () => {
    const padding = " ".repeat(SSH_PROFILE_MAX_FILE_BYTES);
    expect(rejectionOf(enrollment({ name: `a${padding}` })).reason).toBe("too-large");
  });

  it("rejects hosts that are not plain names or IP literals", () => {
    expect(rejectionOf(enrollment({ host: "exam ple.com" })).reason).toBe("invalid-host");
    expect(rejectionOf(enrollment({ host: "https://example.com" })).reason).toBe("invalid-host");
    expect(rejectionOf(enrollment({ host: "" })).reason).toBe("invalid-host");
  });

  it("rejects out-of-range and fractional ports", () => {
    expect(rejectionOf(enrollment({ port: 0 })).reason).toBe("invalid-port");
    expect(rejectionOf(enrollment({ port: 65536 })).reason).toBe("invalid-port");
    expect(rejectionOf(enrollment({ port: 22.5 })).reason).toBe("invalid-port");
    expect(rejectionOf(enrollment({ port: "22" })).reason).toBe("invalid-port");
  });

  it("rejects usernames with shell-unsafe characters", () => {
    expect(rejectionOf(enrollment({ username: "root; rm -rf /" })).reason).toBe("invalid-username");
  });

  it("rejects host keys that are not a pinned ssh-ed25519 wire key", () => {
    expect(rejectionOf(enrollment({ hostKey: "ssh-rsa AAAAB3NzaC1yc2E" })).reason).toBe(
      "invalid-host-key",
    );
    expect(rejectionOf(enrollment({ hostKey: "ssh-ed25519 !!!" })).reason).toBe("invalid-host-key");
    expect(rejectionOf(enrollment({ hostKey: `ssh-ed25519 ${WIRE_KEY}A` })).reason).toBe(
      "invalid-host-key",
    );
    const wrongPrefix = Buffer.from("AAAAB3NzaC1yc2EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(
      rejectionOf(enrollment({ hostKey: `ssh-ed25519 ${wrongPrefix.toString("base64")}` })).reason,
    ).toBe("invalid-host-key");
  });

  it("rejects private keys without PEM armor", () => {
    expect(rejectionOf(enrollment({ privateKey: "raw bytes" })).reason).toBe("invalid-private-key");
    expect(
      rejectionOf(
        enrollment({
          privateKey: `-----BEGIN RSA PRIVATE KEY-----\n${"A".repeat(17 * 1024)}\n-----END RSA PRIVATE KEY-----`,
        }),
      ).reason,
    ).toBe("invalid-private-key");
  });

  it("rejects empty or overlong pairing codes", () => {
    expect(rejectionOf(enrollment({ pairingCode: "   " })).reason).toBe("invalid-pairing-code");
    expect(rejectionOf(enrollment({ pairingCode: 42 })).reason).toBe("invalid-pairing-code");
  });
});

describe("stripPairingCode", () => {
  it("removes the one-time code and keeps the rest", () => {
    const profile = parseEnrollment(enrollment({ pairingCode: "t3-code-123" }));
    const stripped = stripPairingCode(profile);
    expect(stripped.pairingCode).toBeUndefined();
    expect(stripped.host).toBe(profile.host);
    expect(stripped.privateKey).toBe(profile.privateKey);
    expect(profile.pairingCode).toBe("t3-code-123");
  });
});
