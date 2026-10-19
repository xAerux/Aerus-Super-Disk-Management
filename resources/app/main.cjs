const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const STARTUP_TIMEOUT_MS = 20_000;
let serverProc = null;
let win = null;

function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}/__drivescope/health`;
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry(left);
      });
      req.on("error", () => retry(left));
      req.setTimeout(1500, () => {
        req.destroy();
        retry(left);
      });
    };
    const retry = (left) => {
      if (left <= 0) reject(new Error("The Aerus SDM local service did not become ready."));
      else setTimeout(() => attempt(left - 1), 250);
    };
    attempt(80);
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "server.mjs")], {
      cwd: __dirname,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    serverProc = child;

    let settled = false;
    let stdout = "";
    let stderr = "";
    const finish = (error, port) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        if (serverProc === child) serverProc = null;
        if (!child.killed) child.kill();
        reject(error);
      } else {
        resolve(port);
      }
    };
    const timeout = setTimeout(() => {
      const details = stderr.trim() ? ` ${stderr.trim()}` : "";
      finish(new Error(`The Aerus SDM local service timed out while starting.${details}`));
    }, STARTUP_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Aerus SDM listening on 127\.0\.0\.1:(\d+)/);
      if (match) finish(null, Number(match[1]));
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (err) => finish(new Error(`Could not start the Aerus SDM local service: ${err.message}`)));
    child.once("exit", (code, signal) => {
      if (!settled) {
        const details = stderr.trim() ? ` ${stderr.trim()}` : "";
        finish(new Error(`The Aerus SDM local service stopped during startup (code ${code}, signal ${signal || "none"}).${details}`));
      }
    });
  });
}

function stopServer() {
  if (serverProc && !serverProc.killed) serverProc.kill();
  serverProc = null;
}

async function openWindow(port) {
  const icon = path.join(__dirname, "Aeru.ico");
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#07091a",
    title: "Aerus SDM",
    icon,
    frame: false,
    thickFrame: true,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setIcon(icon);
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

ipcMain.on("aerus-min", () => win?.minimize());
ipcMain.on("aerus-max", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on("aerus-close", () => win?.close());

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.aeru.sdm");
    try {
      const port = await startServer();
      await waitForHealth(port);
      await openWindow(port);
    } catch (err) {
      stopServer();
      const message = err instanceof Error ? err.message : "Unknown startup error.";
      console.error(message);
      dialog.showErrorBox("Aerus SDM could not start", `${message}\n\nClose any stale Aerus SDM processes and try again.`);
      app.quit();
    }
  });
  app.on("before-quit", stopServer);
  app.on("window-all-closed", () => {
    stopServer();
    app.quit();
  });
}
