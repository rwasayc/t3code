# Personal Android SSH workbench

This fork adds SSH to the native Android T3 client. It opens a local forward from
`127.0.0.1:37730` to the SSH server's `127.0.0.1:13773`, where an existing reverse
SSH tunnel reaches the development machine's T3 server. The SSH server must allow
that exact destination. T3 still requires its normal pairing and authentication.

The personal app uses `com.workbench.t3ssh` / **T3 Workbench** and can coexist with
the official app. It reconnects when opened, disconnects after backgrounding,
and uses ordinary SSH sockets rather than Android's VPN service. Official OTA
and APK update checks are disabled for this build.

## Connection configuration

Save the real enrollment JSON **outside this repository**. The schema is:

```json
{
  "schemaVersion": 1,
  "name": "My workbench",
  "host": "your-ssh-server",
  "port": 22,
  "username": "your-restricted-ssh-user",
  "hostKey": "ssh-ed25519 BASE64_PUBLIC_HOST_KEY",
  "privateKey": "PEM_PRIVATE_KEY",
  "pairingCode": "OPTIONAL_ONE_TIME_T3_PAIRING_CODE"
}
```

Host keys are pinned exactly; there is no accept-unknown-key fallback. The SSH
account should permit only local forwarding to `127.0.0.1:13773`, with no shell,
password, agent forwarding, or other destination ports.

The app can import this file, or a personal build can embed it for automatic
first-launch setup. Profiles are saved in Android's Keystore-backed SecureStore.
Existing profiles survive updates. Deleting a profile prevents the embedded
profile from silently returning. After pairing, the stored one-time code is
removed. The code in an embedded APK can expire or be spent; reinstalling after
clearing app data may require a fresh code.

**An embedded APK contains the private key and pairing credential. Do not publish
it in GitHub Releases, CI artifacts, or public download links.** This repository
contains the implementation only; private enrollment files, signing files and
APKs stay outside it.

## Build locally

Use the Node / pnpm versions in the root package manifest, Java 17 and the Android
SDK. Install mobile dependencies with `pnpm install --frozen-lockfile --filter
@t3tools/mobile...`. The build retains upstream's Android SDK / NDK requirements.

Keep an existing release signing key for updates. Create a Java properties file
outside this checkout containing `storeFile` (an absolute keystore path),
`storePassword`, `keyAlias`, and `keyPassword`. Do not use a debug signing key for
an installed personal release.

```sh
export JAVA_HOME=/path/to/jdk17
export ANDROID_HOME=/path/to/android-sdk
export T3CODE_SSH_SIGNING_PROPERTIES=/private/path/release.properties
export T3CODE_SSH_ENROLLMENT_FILE=/private/path/enrollment.json
export T3CODE_SSH_OUTPUT_DIR=/private/path/apks
node apps/mobile/scripts/build-ssh-android.mjs
```

Omit `T3CODE_SSH_ENROLLMENT_FILE` to build without embedded credentials. The script
regenerates the ignored Android native project, signs an arm64 release, and
removes its temporary enrollment asset even on a build failure. Use
`--skip-prebuild` to reuse an existing personal native project when native config
has not changed. `T3CODE_SSH_PNPM` can select a particular pnpm executable. Network
proxies can be set in the shell; no proxy or machine-specific paths are committed.

For a later APK update, raise the personal `versionCode` in `app.config.ts` and set
`T3CODE_MOBILE_VERSION` to the new version. Regenerate the native project after
changing native configuration. Keep the same signing key and package ID.

## Development and validation

The `workbench/android-ssh` branch is based on upstream `v0.1.6`. `origin` is the
personal fork; `upstream` is `pingdotgg/t3code`. Future changes go on this branch.
Review upstream mobile changes before merging them into the fork.

From `apps/mobile`, run focused SSH tests with `pnpm exec vp test run --project
unit src/features/ssh/`, then the package typecheck, lint and formatting checks.
Run `vp run check:changed` before pushing from a complete dependency checkout.
The native `TunnelClientTest` also covers host-key rejection and redacted errors.

Local builds, unit checks, signature checks and real server-side SSH forwarding
have been verified. Android runtime behavior requires a real phone: first-launch
setup, pairing, foreground recovery, network switching and concurrent proxy use.
The original file-picker issue has been bypassed by embedded setup and has not
been diagnosed on the target phone.
