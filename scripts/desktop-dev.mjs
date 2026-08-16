import { spawn } from "node:child_process";
import net from "node:net";

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const { hostname, port } = new URL(DEV_URL);
const isWin = process.platform === "win32";

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port) });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitForServer(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

let vite = null;
let electron = null;

function shutdown(code = 0) {
  if (vite && !vite.killed) vite.kill("SIGTERM");
  if (electron && !electron.killed) electron.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (await isPortOpen()) {
  console.log(`[desktop:dev] Vite ya corre en ${DEV_URL}; conectando Electron...`);
} else {
  console.log(`[desktop:dev] arrancando Vite en ${DEV_URL}...`);
  vite = spawn("npm", ["run", "dev"], {
    shell: isWin,
    stdio: "inherit",
  });
  vite.on("exit", (code) => {
    console.error(`[desktop:dev] Vite terminó con código ${code}`);
  });
  if (!(await waitForServer())) {
    console.error(`[desktop:dev] Vite no respondió a tiempo en ${DEV_URL}`);
    shutdown(1);
  }
}

electron = spawn("npx", ["electron", "."], {
  shell: isWin,
  stdio: "inherit",
});
electron.on("exit", (code) => shutdown(code ?? 0));
