/**
 * Purpose: Validate the packaged macOS application before publishing release artifacts.
 */
import { existsSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appPath = resolve(process.argv[2] ?? "dist/mac-arm64/OpenCreate Forge.app");
const appName = basename(appPath, ".app");
const executablePath = join(appPath, "Contents", "MacOS", appName);
const asarPath = join(appPath, "Contents", "Resources", "app.asar");
const infoPlistPath = join(appPath, "Contents", "Info.plist");
const asarCliPath = resolve("node_modules/.bin/asar");
const reportPath = resolve("dist/macos-smoke.log");

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
const hasBundleSignature =
  signatureInfo.status === 0 &&
  signatureInfo.output.includes("Identifier=app.opencreate.forge") &&
  signatureInfo.output.includes("Sealed Resources");

if (hasBundleSignature) {
  const signatureResult = run("codesign", ["--verify", "--deep", "--strict", appPath]);
  if (signatureResult.status !== 0) {
    fail("Packaged macOS application failed code-signature verification.", signatureResult.output);
  }
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

console.log(`macOS bundle smoke test passed: ${appPath}`);
