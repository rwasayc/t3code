import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

const mobileRoot = NodePath.resolve(import.meta.dirname, "..");
const repoRoot = NodePath.resolve(mobileRoot, "../..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Build the personal Android SSH APK.
Required: JAVA_HOME, ANDROID_HOME, T3CODE_SSH_SIGNING_PROPERTIES.
Optional: T3CODE_SSH_ENROLLMENT_FILE (private JSON outside the repository),
T3CODE_SSH_OUTPUT_DIR, T3CODE_SSH_PNPM, T3CODE_MOBILE_VERSION.
Use --skip-prebuild to reuse an existing personal Android native project.
Embedded APKs contain private credentials; keep them private.`);
  process.exit(0);
}
if (args.some((arg) => arg !== "--skip-prebuild")) throw new Error("Unknown argument.");

function externalPath(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  const resolved = NodePath.resolve(value);
  const relative = NodePath.relative(repoRoot, resolved);
  if (!relative.startsWith(`..${NodePath.sep}`) && !NodePath.isAbsolute(relative)) {
    throw new Error(`${name} must be outside the repository.`);
  }
  return resolved;
}

const signingFile = externalPath(
  process.env.T3CODE_SSH_SIGNING_PROPERTIES,
  "T3CODE_SSH_SIGNING_PROPERTIES",
);
NodeFS.accessSync(signingFile, NodeFS.constants.R_OK);
const enrollmentFile = process.env.T3CODE_SSH_ENROLLMENT_FILE
  ? externalPath(process.env.T3CODE_SSH_ENROLLMENT_FILE, "T3CODE_SSH_ENROLLMENT_FILE")
  : null;
if (enrollmentFile) NodeFS.accessSync(enrollmentFile, NodeFS.constants.R_OK);
const outputDir = externalPath(
  process.env.T3CODE_SSH_OUTPUT_DIR ??
    NodePath.join(NodeOS.homedir(), ".local/share/t3-workbench/releases"),
  "T3CODE_SSH_OUTPUT_DIR",
);
const version = process.env.T3CODE_MOBILE_VERSION ?? "2.2.0-ssh.2";
if (!/^[\w.+-]+$/.test(version)) throw new Error("Invalid T3CODE_MOBILE_VERSION.");
const env = {
  ...process.env,
  T3CODE_SSH_PERSONAL: "1",
  T3CODE_SSH_SIGNING_PROPERTIES: signingFile,
  APP_VARIANT: "production",
  T3CODE_MOBILE_VERSION: version,
  T3CODE_MOBILE_UPDATES_ENABLED: "0",
  EXPO_NO_DOTENV: "1",
  EXPO_NO_GIT_STATUS: "1",
};
const pnpm = process.env.T3CODE_SSH_PNPM ?? "pnpm";
function run(command, commandArgs, cwd) {
  const result = NodeChildProcess.spawnSync(command, commandArgs, { cwd, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`${NodePath.basename(command)} failed.`);
}

const asset = NodePath.join(
  mobileRoot,
  "modules/t3-ssh/android/src/main/assets/private/t3-enrollment.json",
);
if (NodeFS.existsSync(asset))
  throw new Error("Remove the existing private enrollment asset first.");
if (!args.includes("--skip-prebuild")) {
  run(
    pnpm,
    ["exec", "expo", "prebuild", "--clean", "--platform", "android", "--no-install"],
    mobileRoot,
  );
}
const gradleFile = NodePath.join(mobileRoot, "android/app/build.gradle");
let gradle = NodeFS.readFileSync(gradleFile, "utf8");
if (!gradle.includes("applicationId 'com.workbench.t3ssh'")) {
  throw new Error("Native project is not the personal build; rerun without --skip-prebuild.");
}
gradle = gradle.replace(/def personalSigning = new Properties\(\)[\s\S]*?\n\n(?=android \{)/, "");
gradle = gradle.replace(
  "android {",
  `def personalSigning = new Properties()
new File(System.getenv('T3CODE_SSH_SIGNING_PROPERTIES')).withInputStream { personalSigning.load(it) }

android {`,
);
if (!gradle.includes("signingConfigs.personal")) {
  gradle = gradle.replace(
    "signingConfigs {",
    `signingConfigs {
        personal {
            storeFile file(personalSigning.getProperty('storeFile'))
            storePassword personalSigning.getProperty('storePassword')
            keyAlias personalSigning.getProperty('keyAlias')
            keyPassword personalSigning.getProperty('keyPassword')
        }`,
  );
}
const releaseAt = gradle.indexOf("release {", gradle.indexOf("buildTypes"));
if (releaseAt < 0) throw new Error("Release signing configuration not found.");
gradle =
  gradle.slice(0, releaseAt) +
  gradle
    .slice(releaseAt)
    .replace(/signingConfig signingConfigs\.\w+/, "signingConfig signingConfigs.personal");
NodeFS.writeFileSync(gradleFile, gradle);

let staged = false;
try {
  if (enrollmentFile) {
    NodeFS.mkdirSync(NodePath.dirname(asset), { recursive: true, mode: 0o700 });
    NodeFS.copyFileSync(enrollmentFile, asset, NodeFS.constants.COPYFILE_EXCL);
    staged = true;
    NodeFS.chmodSync(asset, 0o600);
  }
  run(
    NodePath.join(mobileRoot, "android/gradlew"),
    [
      "app:assembleRelease",
      "-PreactNativeArchitectures=arm64-v8a",
      "-Pandroid.enableMinifyInReleaseBuilds=false",
      "--max-workers=4",
      "--console=plain",
    ],
    NodePath.join(mobileRoot, "android"),
  );
  NodeFS.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const output = NodePath.join(outputDir, `T3-Workbench-SSH-${version}-arm64.apk`);
  NodeFS.copyFileSync(
    NodePath.join(mobileRoot, "android/app/build/outputs/apk/release/app-release.apk"),
    output,
  );
  NodeFS.chmodSync(output, 0o600);
  console.log(`APK: ${output}`);
} finally {
  if (staged) NodeFS.rmSync(asset);
}
