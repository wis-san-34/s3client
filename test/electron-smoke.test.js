const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

test("renderer smoke test has primary UI wiring", () => {
  const appRoot = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(appRoot, "renderer", "index.html"), "utf8");
  const requiredSelectors = [
    "connection-select",
    "save-config",
    "page-dashboard",
    "page-explorer",
    "page-logs",
    "page-connections",
    "transfer-body",
    "connection-body",
  ];
  requiredSelectors.forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  });
  [
    "dialogs.js",
    "renderer-utils.js",
    "renderer-connections.js",
    "renderer-explorer.js",
    "renderer-transfers.js",
    "renderer.js",
  ].forEach((script) => {
    assert.match(html, new RegExp(`<script src="./${script}"></script>`));
  });
});

test("electron smoke test loads the primary UI", { timeout: 20000, skip: process.env.S3_RUN_ELECTRON_SMOKE !== "1" }, async () => {
  const electron = require("electron");
  const appRoot = path.resolve(__dirname, "..");
  const userData = path.join(os.tmpdir(), `s3-desktop-smoke-${process.pid}`);
  const env = {
    ...process.env,
    S3_SMOKE_TEST: "1",
    S3_SMOKE_USER_DATA: userData,
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    XDG_CONFIG_HOME: userData,
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const result = await new Promise((resolve, reject) => {
    const child = spawn(electron, [
      appRoot,
      "--disable-gpu",
      "--disable-gpu-compositing",
      `--user-data-dir=${userData}`,
    ], {
      cwd: appRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Electron smoke test timed out. Output:\n${output}`));
    }, 18000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /S3_SMOKE_OK S3 Desktop Client/);
});
