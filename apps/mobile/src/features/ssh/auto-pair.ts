import { buildPairingUrl } from "../connection/pairing";
import { pairEnvironment } from "../../state/use-remote-environment-registry";
import { loadSshProfile, stripStoredPairingCode } from "./profile-store";
import { TUNNEL_HTTP_ORIGIN } from "./ssh-build";

/** Profiles whose one-time code redemption already ran this session. */
const attemptedAutoPairs = new Set<string>();

/**
 * Redeems the enrollment file's one-time pairing code against the tunnel origin using the stock
 * pairing path. Success (or an already-paired origin) strips the code from the stored profile;
 * failure reports to the manual entry card and leaves the SSH config untouched.
 */
export async function autoPairOverTunnel(options: {
  readonly tunnelPaired: boolean;
  readonly onError: (message: string) => void;
}): Promise<void> {
  try {
    const stored = await loadSshProfile();
    if (!stored?.pairingCode) return;
    const attemptKey = `${stored.name}@${stored.host}:${stored.port}`;
    if (options.tunnelPaired) {
      // Already paired on this origin; the stored one-time code is spent.
      attemptedAutoPairs.add(attemptKey);
      await stripStoredPairingCode();
      return;
    }
    if (attemptedAutoPairs.has(attemptKey)) return;
    attemptedAutoPairs.add(attemptKey);
    const outcome = await pairEnvironment(buildPairingUrl(TUNNEL_HTTP_ORIGIN, stored.pairingCode));
    if (outcome.ok) {
      await stripStoredPairingCode();
    } else {
      // A later tunnel reconnect may retry automatically.
      attemptedAutoPairs.delete(attemptKey);
      options.onError(outcome.error ?? "Automatic pairing failed. Enter a pairing code manually.");
    }
  } catch {
    // A SecureStore or pairing hiccup leaves the manual code entry in place.
  }
}
