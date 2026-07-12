import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(wrapper, process.argv.slice(2), {
  cwd: backendDirectory,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
