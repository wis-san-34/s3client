const path = require("path");
const { spawn } = require("child_process");

const electronBinary = require("electron");
if (typeof electronBinary !== "string") {
  console.error("Unable to resolve Electron binary path.");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [path.resolve(__dirname, "..")], {
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
