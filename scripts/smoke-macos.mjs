/**
 * Purpose: Validate the packaged macOS application before publishing release artifacts.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

const appPath = resolve(process.argv[2] ?? "dist/mac-arm64/OpenCreate Forge.app");
const appName = basename(appPath, ".app");
const executablePath = join(appPath, "Contents", "MacOS", appName);
const asarPath = join(appPath, "Contents", "Resources", "app.asar");
const infoPlistPath = join(appPath, "Contents", "Info.plist");
const asarCliPath = resolve("node_modules/.bin/asar");
const reportPath = resolve("dist/macos-smoke.log");
const startupLogPath = join(os.homedir(), "Library", "Logs", "OpenCreate Forge", "startup.log");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function collectDiagnostics() {
  const codeSign = run("codesign", ["-dvvv", "--entitlements", ":-", appPath]);
  const gatekeeper = run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
  const quarantine = run("xattr", ["-l", appPath]);

  return [
    `Executable: ${executablePath}`,
    `Architecture:\n${run("file", [executablePath]).output}`,
    `Code signing:\n${codeSign.output || "unsigned"}`,
    `Gatekeeper assessment:\n${gatekeeper.output || "assessment unavailable"}`,
    `Extended attributes:\n${quarantine.output || "none"}`,
  ].join("\n\n");
}

function fail(message, details = "") {
  const report = `${message}${details ? `\n${details}` : ""}\n\n${collectDiagnostics()}\n`;
  console.error(report.trim());
  try {
    writeFileSync(reportPath, report);
  } catch {
    // The build directory may not exist when bundle validation fails.
  }
  process.exit(1);
}

if (process.platform !== "darwin") {
  fail("macOS smoke test must run on macOS.");
}

const requiredPaths = [appPath, executablePath, asarPath, infoPlistPath];
const missingPath = requiredPaths.find((filePath) => !existsSync(filePath));
if (missingPath) {
  fail(`Packaged macOS application is incomplete; missing: ${missingPath}`);
}

const fileResult = run("file", [executablePath]);
if (fileResult.status !== 0 || !fileResult.output.includes("arm64")) {
  fail(`Expected an arm64 executable, received: ${fileResult.output}`);
}

const signatureInfo = run("codesign", ["-dv", appPath]);
const hasAdHocBundleSignature =
  signatureInfo.status === 0 &&
  signatureInfo.output.includes("Identifier=app.opencreate.forge") &&
  signatureInfo.output.includes("Signature=adhoc");

if (!hasAdHocBundleSignature) {
  fail(
    "Packaged macOS application is not ad-hoc signed as expected.",
    signatureInfo.output || "codesign returned no diagnostics",
  );
}

const signatureResult = run("codesign", ["--verify", "--deep", "--strict", appPath]);
if (signatureResult.status !== 0) {
  fail("Packaged macOS application failed code-signature verification.", signatureResult.output);
}

const plistResult = spawnSync("plutil", ["-lint", infoPlistPath], { encoding: "utf8" });
if (plistResult.status !== 0) {
  fail("Packaged macOS application has an invalid Info.plist.", plistResult.stderr.trim());
}

if (!existsSync(asarCliPath)) {
  fail(`The local asar CLI is missing: ${asarCliPath}`);
}

const asarResult = run(asarCliPath, ["list", asarPath]);
if (asarResult.status !== 0) {
  fail("Packaged macOS application has an unreadable app.asar.", asarResult.output);
}

const archiveEntries = new Set(asarResult.output.split(/\r?\n/).filter(Boolean));
const requiredEntries = [
  "/dist-electron/main.js",
  "/dist-electron/preload.mjs",
  "/dist/index.html",
  "/dist/splash.html",
  "/package.json",
];
const missingEntry = requiredEntries.find((entry) => !archiveEntries.has(entry));
if (missingEntry) {
  fail(`Packaged macOS application is missing an app.asar entry: ${missingEntry}`);
}

function hasFinishedStartup(log, logMtime, previousMtime) {
  return (
    logMtime > previousMtime &&
    log.includes("Application ready") &&
    log.includes("Renderer finished loading")
  );
}

async function waitForStartup(previousMtime) {
  const startupDeadline = Date.now() + 8000;
  let startupLog = "";

  while (Date.now() < startupDeadline) {
    if (existsSync(startupLogPath)) {
      const startupLogStat = statSync(startupLogPath);
      startupLog = readFileSync(startupLogPath, "utf8");
      if (hasFinishedStartup(startupLog, startupLogStat.mtimeMs, previousMtime)) {
        return { success: true, log: startupLog };
      }
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 250));
  }

  return { success: false, log: startupLog };
}

const startupLogBeforeLaunch = existsSync(startupLogPath)
  ? statSync(startupLogPath).mtimeMs
  : 0;
const launchedInGitHubActions = process.env.GITHUB_ACTIONS === "true";
let childProcess;
let launchDetails = "";

if (launchedInGitHubActions) {
  // GitHub's unsigned/ad-hoc CI runner rejects the app through Gatekeeper.
  // Start the executable directly there to validate Electron startup without Gatekeeper.
  childProcess = spawn(executablePath, ["--enable-logging=stderr"], {
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  childProcess.stdout.on("data", (chunk) => {
    launchDetails += chunk.toString();
  });
  childProcess.stderr.on("data", (chunk) => {
    launchDetails += chunk.toString();
  });
} else {
  const launchResult = run("open", ["-n", appPath]);
  if (launchResult.status !== 0) {
    fail("Packaged macOS application could not be opened through Launch Services.", launchResult.output);
  }
}

const startupResult = await waitForStartup(startupLogBeforeLaunch);
if (!startupResult.success) {
  if (childProcess && !childProcess.killed) {
    childProcess.kill("SIGTERM");
  }

  fail(
    launchedInGitHubActions
      ? "Packaged macOS application did not finish startup from the CI executable."
      : "Packaged macOS application did not finish startup through Launch Services.",
    `${startupResult.log}\n${launchDetails}`.trim(),
  );
}

if (childProcess) {
  childProcess.kill("SIGTERM");
  await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1500));
  if (!childProcess.killed) childProcess.kill("SIGKILL");
} else {
  run("pkill", ["-TERM", "-x", appName]);
  await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1500));
  run("pkill", ["-KILL", "-x", appName]);
}

console.log(`macOS bundle smoke test passed: ${appPath}`);
