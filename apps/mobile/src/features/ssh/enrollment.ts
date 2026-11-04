import * as Schema from "effect/Schema";

/**
 * Enrollment file handed to the user out of band:
 * `{schemaVersion:1, name, host, port?, username, hostKey, privateKey, pairingCode?}`.
 * Everything below is validated before it is stored; unknown schema versions are rejected.
 */

export const SSH_PROFILE_MAX_FILE_BYTES = 64 * 1024;
const MAX_PRIVATE_KEY_LENGTH = 16 * 1024;
const MAX_PAIRING_CODE_LENGTH = 256;
const HOST_KEY_PATTERN = /^ssh-ed25519[ \t]+([A-Za-z0-9+/]+={0,2})$/;
const PEM_PATTERN =
  /-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY-----[\s\S]+-----END (?:[A-Z0-9 ]* )?PRIVATE KEY-----/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

export type EnrollmentRejectionReason =
  | "too-large"
  | "not-json"
  | "unsupported-version"
  | "invalid-name"
  | "invalid-host"
  | "invalid-port"
  | "invalid-username"
  | "invalid-host-key"
  | "invalid-private-key"
  | "invalid-pairing-code";

export class EnrollmentRejection extends Schema.TaggedError<EnrollmentRejection>()(
  "EnrollmentRejection",
  { reason: Schema.String },
) {
  override get message(): string {
    return `Enrollment rejected: ${this.reason}.`;
  }
}

export interface SshTunnelProfile {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  /** `ssh-ed25519 <base64>` public host key, pinned exactly. */
  readonly hostKey: string;
  /** PEM-encoded private key. */
  readonly privateKey: string;
  readonly pairingCode?: string;
}

function reject(reason: EnrollmentRejectionReason): never {
  throw new EnrollmentRejection({ reason });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Dependency-free decode; Hermes does not guarantee atob. Returns null on malformed input. */
function decodeBase64(value: string): Uint8Array | null {
  if (value.length % 4 !== 0) return null;
  const output: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    let block = 0;
    let padding = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      const char = value[index + offset]!;
      if (char === "=") {
        padding += 1;
        block <<= 6;
        continue;
      }
      if (padding > 0) return null;
      const digit = BASE64_ALPHABET.indexOf(char);
      if (digit < 0) return null;
      block = (block << 6) | digit;
    }
    output.push((block >> 16) & 0xff);
    if (padding < 2) output.push((block >> 8) & 0xff);
    if (padding < 1) output.push(block & 0xff);
  }
  return new Uint8Array(output);
}

/** The wire encoding of an ed25519 key is exactly 51 bytes; loose check against garbage input. */
function hostKeyDecodesToWireKey(encoded: string): boolean {
  const binary = decodeBase64(encoded);
  if (binary === null || binary.length !== 51) return false;
  if (
    binary[0] !== 0 ||
    binary[1] !== 0 ||
    binary[2] !== 0 ||
    binary[3] !== 11 ||
    binary[15] !== 0 ||
    binary[16] !== 0 ||
    binary[17] !== 0 ||
    binary[18] !== 32
  ) {
    return false;
  }
  const algorithm = "ssh-ed25519";
  for (let index = 0; index < algorithm.length; index += 1) {
    if (binary[4 + index] !== algorithm.charCodeAt(index)) return false;
  }
  return true;
}

export function parseEnrollment(text: string): SshTunnelProfile {
  if (text.length === 0 || text.length > SSH_PROFILE_MAX_FILE_BYTES) reject("too-large");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    reject("not-json");
  }
  if (!isPlainObject(value)) reject("not-json");
  if (value.schemaVersion !== 1) reject("unsupported-version");

  const name = value.name;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    reject("invalid-name");
  }

  const host = value.host;
  if (
    typeof host !== "string" ||
    host.length === 0 ||
    host.length > 253 ||
    !HOST_PATTERN.test(host)
  ) {
    reject("invalid-host");
  }

  const portValue = value.port ?? 22;
  if (
    typeof portValue !== "number" ||
    !Number.isInteger(portValue) ||
    portValue < 1 ||
    portValue > 65535
  ) {
    reject("invalid-port");
  }

  const username = value.username;
  if (typeof username !== "string" || username.length === 0 || !USERNAME_PATTERN.test(username)) {
    reject("invalid-username");
  }

  const hostKey = value.hostKey;
  if (typeof hostKey !== "string") reject("invalid-host-key");
  const hostKeyMatch = HOST_KEY_PATTERN.exec(hostKey.trim());
  if (hostKeyMatch === null || !hostKeyDecodesToWireKey(hostKeyMatch[1]!)) {
    reject("invalid-host-key");
  }

  const privateKey = value.privateKey;
  if (
    typeof privateKey !== "string" ||
    privateKey.length > MAX_PRIVATE_KEY_LENGTH ||
    !PEM_PATTERN.test(privateKey)
  ) {
    reject("invalid-private-key");
  }

  const pairingCode = value.pairingCode;
  if (pairingCode !== undefined) {
    if (
      typeof pairingCode !== "string" ||
      pairingCode.trim().length === 0 ||
      pairingCode.length > MAX_PAIRING_CODE_LENGTH
    ) {
      reject("invalid-pairing-code");
    }
  }

  return {
    schemaVersion: 1,
    name: name.trim(),
    host,
    port: portValue,
    username,
    hostKey: hostKey.trim(),
    privateKey,
    ...(pairingCode === undefined ? {} : { pairingCode: pairingCode.trim() }),
  };
}

/** The pairing code is a one-time credential; it never survives a successful pair. */
export function stripPairingCode(profile: SshTunnelProfile): SshTunnelProfile {
  const { pairingCode: _pairingCode, ...rest } = profile;
  return rest;
}
