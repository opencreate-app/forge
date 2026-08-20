/**
 * Purpose: Validate and launch the packaged macOS application before publishing release artifacts.
 */
import { existsSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const appPath = resolve(process.argv[2] ?? "dist/mac-arm64/OpenCreate Forge.app");
const appName = basename(appPath, ".app");
const executablePath = join(appPath, "Contents", "MacOS", appName);
const asarPath = join(appPath, "Contents", "Resources", "app.asar");
const infoPlistPath = join(appPath, "Contents", "Info.plist");
const reportPath = resolve("dist/macos-smoke.log");

function fail(message, details = "") {
  const report = `${message}${details ? `\n${details}` : ""}\n`;
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

const fileResult = spawnSync("file", [executablePath], { encoding: "utf8" });
if (fileResult.status !== 0 || !fileResult.stdout.includes("arm64")) {
  fail(`Expected an arm64 executable, received: ${fileResult.stdout.trim()}`);
}

const signatureResult = spawnSync("codesign", ["--verify", "--deep", "--strict", appPath], {
  encoding: "utf8",
});
if (signatureResult.status !== 0) {
  fail(
    "Packaged macOS application failed code-signature verification.",
    signatureResult.stderr.trim(),
  );
}

const child = spawn(executablePath, ["--enable-logging=stderr"], {
  cwd: resolve("."),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let exited = false;
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
child.once("exit", () => {
  exited = true;
});

const startupResult = await Promise.race([
  new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal }))),
  new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), 8000)),
]);

if (startupResult !== null) {
  fail(
    `Packaged macOS application exited during startup: ${JSON.stringify(startupResult)}`,
    output.trim(),
  );
}

child.kill("SIGTERM");
await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000));
if (!exited) child.kill("SIGKILL");

console.log(`macOS smoke test passed: ${appPath}`);
