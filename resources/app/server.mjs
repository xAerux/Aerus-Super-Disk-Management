import { createReadStream, existsSync, statSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { control, listDirectory, listDisks, listVolumes, measurePath, readJsonBody, resetControl, scanRoot, verifyPaths } from "./engine.mjs";
import { deletionAllowed } from "./logic.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(root, "payload", "static");
const indexFile = path.join(staticDir, "index.html");
const requestedPort = Number.parseInt(process.env.PORT || "", 10);
const port = Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 0;
const AERUS_SESSION_CAPABILITY = randomBytes(32).toString("base64url");

function recallPaths() {
  const base =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || homedir(), "Aerus SDM")
      : path.join(homedir(), ".aerus-sdm");
  const legacy =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || homedir(), "DriveScope", "last-scan.json")
      : path.join(homedir(), ".drivescope", "last-scan.json");
  return { base, file: path.join(base, "last-scan.json"), legacy };
}

async function readRecall() {
  const { file, legacy } = recallPaths();
  for (const candidate of [file, legacy]) {
    try {
      const data = JSON.parse(await readFile(candidate, "utf8"));
      if (data?.scan) return data.scan;
    } catch {
      /* try the next saved scan */
    }
  }
  return null;
}

async function writeRecall(scan) {
  const { base, file } = recallPaths();
  await mkdir(base, { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, savedAt: Date.now(), scan }));
  await rename(tmp, file);
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

async function cleanNow(paths, permanent) {
  const targets = [...new Set(paths.map((item) => String(item).replace(/\\/g, "/").replace(/\/+$/, "")))].filter(deletionAllowed);
  const skipped = paths.filter((item) => !targets.includes(String(item).replace(/\\/g, "/").replace(/\/+$/, "")));
  if (process.platform !== "win32") {
    return { removed: [], failed: [], skipped, error: "Cleanup runs in the Windows app." };
  }
  if (!targets.length) return { removed: [], failed: [], skipped };
  const dir = await mkdtemp(path.join(tmpdir(), "aerus-"));
  const plan = path.join(dir, "plan.json");
  const script = path.join(dir, "clean.ps1");
  await writeFile(plan, JSON.stringify({ permanent: Boolean(permanent), paths: targets.map((item) => item.replace(/\//g, "\\")) }));
  await writeFile(
    script,
    [
      "$ErrorActionPreference = 'Continue'",
      "$payload = Get-Content -LiteralPath $env:AERUS_PLAN -Raw -Encoding UTF8 | ConvertFrom-Json",
      "Add-Type -AssemblyName Microsoft.VisualBasic",
      "$removed = @()",
      "$failed = @()",
      "foreach ($target in @($payload.paths)) {",
      "  if (-not (Test-Path -LiteralPath $target)) { continue }",
      "  try {",
      "    $isDir = (Get-Item -LiteralPath $target -Force).PSIsContainer",
      "    if ($payload.permanent) {",
      "      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop",
      "    } elseif ($isDir) {",
      "      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, 'OnlyErrorDialogs', 'SendToRecycleBin')",
      "    } else {",
      "      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, 'OnlyErrorDialogs', 'SendToRecycleBin')",
      "    }",
      "    $removed += $target",
      "  } catch {",
      "    $failed += \"$target — $($_.Exception.Message)\"",
      "  }",
      "}",
      "@{ removed = @($removed); failed = @($failed) } | ConvertTo-Json -Compress -Depth 4",
      "",
    ].join("\r\n"),
  );
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
        windowsHide: true,
        env: { ...process.env, AERUS_PLAN: plan },
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && !out.trim()) reject(new Error(err.trim() || "Cleanup failed."));
        else resolve(out);
      });
    });
    const parsed = JSON.parse(String(output).trim() || "{}");
    return { removed: asList(parsed.removed), failed: asList(parsed.failed), skipped };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function startupId(item) {
  return Buffer.from(JSON.stringify({ kind: item.kind, scope: item.scope, view: item.view || "", name: item.name }), "utf8").toString("base64url");
}

function readStartupId(id) {
  try {
    const parsed = JSON.parse(Buffer.from(String(id), "base64url").toString("utf8"));
    if (!parsed || !["run", "startup-folder"].includes(parsed.kind)) return null;
    if (!['user', 'machine'].includes(parsed.scope) || !['32', '64', ''].includes(parsed.view || '')) return null;
    if (typeof parsed.name !== 'string' || !parsed.name || parsed.name.includes("\0")) return null;
    return parsed;
  } catch {
    return null;
  }
}

// StartupApproved is the Windows-supported on/off state.  We leave the Run
// value or shortcut in place; disabling only writes the reversible state flag.
const STARTUP_LIST_PS = `
$ErrorActionPreference = 'SilentlyContinue'
$list = @()
$runPath = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'
$approvedBase = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
function Approval($hiveName, $viewName, $group, $name) {
  try {
    # StartupApproved\Run and StartupApproved\Run32 live in the native
    # Explorer view even when the corresponding Run value is 32-bit.
    $approvalView = if ([Environment]::Is64BitOperatingSystem) { 'Registry64' } else { 'Default' }
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hiveName, [Microsoft.Win32.RegistryView]::$approvalView)
    $key = $base.OpenSubKey("$approvedBase\\$group", $false)
    if ($null -eq $key) { return @{ flag = $null; raw = $null } }
    $raw = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $key.Dispose(); $base.Dispose()
    if ($raw -is [byte[]] -and $raw.Length -gt 0) { return @{ flag = [int]$raw[0]; raw = [Convert]::ToBase64String($raw) } }
  } catch {}
  return @{ flag = $null; raw = $null }
}
function Publisher($command) {
  try {
    $candidate = [regex]::Match([string]$command, '^\\s*"([^\"]+\\.(?:exe|com|bat|cmd))"|^\\s*([^\\s]+\\.(?:exe|com|bat|cmd))', 'IgnoreCase')
    $file = if ($candidate.Groups[1].Success) { $candidate.Groups[1].Value } else { $candidate.Groups[2].Value }
    if ($file -and (Test-Path -LiteralPath $file)) {
      $company = [Diagnostics.FileVersionInfo]::GetVersionInfo($file).CompanyName
      if ($company) { return [string]$company }
    }
  } catch {}
  return ''
}
function Is-Protected($name, $command) {
  $text = ("$name $command").ToLowerInvariant()
  return $text.Contains('aerus sdm') -or $text.Contains('securityhealth') -or $text.Contains('windowsdefender') -or $text.Contains('windows defender')
}
function Add-Run($scope, $hiveName, $viewName, $group, $viewLabel) {
  try {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hiveName, [Microsoft.Win32.RegistryView]::$viewName)
    $key = $base.OpenSubKey($runPath, $false)
    if ($null -eq $key) { $base.Dispose(); return }
    foreach ($name in @($key.GetValueNames())) {
      $command = [string]$key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $approval = Approval $hiveName $viewName $group $name
      $enabled = -not ($approval.flag -eq 3 -or $approval.flag -eq 1)
      $protected = Is-Protected $name $command
      $script:list += [pscustomobject]@{ kind='run'; scope=$scope; view=$viewLabel; name=[string]$name; command=$command; publisher=(Publisher $command); source=("{0} Run registry ({1}-bit)" -f $scope,$viewLabel); enabled=[bool]$enabled; canToggle=(-not $protected); reason=($(if($protected){'Protected Windows or Aerus entry. Manage it outside Aerus.'}else{''})); approval=$approval.raw }
    }
    $key.Dispose(); $base.Dispose()
  } catch {}
}
function Add-Folder($scope, $dir, $hiveName) {
  if (-not (Test-Path -LiteralPath $dir)) { return }
  Get-ChildItem -LiteralPath $dir -File | ForEach-Object {
    $approval = Approval $hiveName 'Default' 'StartupFolder' $_.Name
    $enabled = -not ($approval.flag -eq 3 -or $approval.flag -eq 1)
    $protected = Is-Protected $_.Name $_.FullName
    $script:list += [pscustomobject]@{ kind='startup-folder'; scope=$scope; view=''; name=$_.Name; command=$_.FullName; publisher=(Publisher $_.FullName); source=("{0} Startup folder" -f $scope); enabled=[bool]$enabled; canToggle=(-not $protected); reason=($(if($protected){'Protected Windows or Aerus entry. Manage it outside Aerus.'}else{''})); approval=$approval.raw }
  }
}
Add-Run 'user' 'CurrentUser' 'Registry64' 'Run' '64'
Add-Run 'user' 'CurrentUser' 'Registry32' 'Run32' '32'
Add-Run 'machine' 'LocalMachine' 'Registry64' 'Run' '64'
Add-Run 'machine' 'LocalMachine' 'Registry32' 'Run32' '32'
Add-Folder 'user' ([Environment]::GetFolderPath('Startup')) 'CurrentUser'
Add-Folder 'machine' ([Environment]::GetFolderPath('CommonStartup')) 'LocalMachine'
@($list) | ConvertTo-Json -Compress -Depth 5
`;

function runPowerShell(script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !out.trim()) reject(new Error(err.trim() || "PowerShell failed."));
      else resolve(out);
    });
  });
}

async function listStartup() {
  if (process.platform !== "win32") return [];
  const output = await runPowerShell(STARTUP_LIST_PS);
  const parsed = JSON.parse(String(output).trim() || "[]");
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return items
    .filter((item) => item && item.name)
    .map((item) => ({
      id: startupId(item),
      name: String(item.name),
      command: String(item.command || ""),
      publisher: String(item.publisher || ""),
      source: String(item.source || "Windows startup"),
      scope: item.scope === "machine" ? "machine" : "user",
      kind: item.kind === "startup-folder" ? "folder" : "run",
      enabled: item.enabled !== false,
      canToggle: item.canToggle !== false,
      reason: String(item.reason || ""),
      approval: typeof item.approval === "string" ? item.approval : null,
    }));
}

function startupBackupPath() {
  const base = process.platform === "win32" ? path.join(process.env.APPDATA || homedir(), "Aerus SDM") : path.join(homedir(), ".aerus-sdm");
  return { base, file: path.join(base, "startup-toggle-backups.json") };
}

async function saveStartupBackup(item) {
  const { base, file } = startupBackupPath();
  await mkdir(base, { recursive: true });
  let history = [];
  try { history = JSON.parse(await readFile(file, "utf8")); } catch { /* first change */ }
  if (!Array.isArray(history)) history = [];
  history.push({ id: item.id, name: item.name, source: item.source, previousEnabled: item.enabled, previousApproval: item.approval, savedAt: new Date().toISOString() });
  await writeFile(file, JSON.stringify(history.slice(-100), null, 2), "utf8");
}

async function setStartup(id, enabled) {
  const item = readStartupId(id);
  if (!item) return { ok: false, error: "Unknown startup item." };
  if (process.platform !== "win32") return { ok: false, error: "Startup changes run in the Windows app." };
  const current = (await listStartup()).find((entry) => entry.id === id);
  if (!current) return { ok: false, error: "This startup entry no longer exists." };
  if (!current.canToggle) return { ok: false, error: current.reason || "This protected entry is read-only in Aerus." };
  await saveStartupBackup(current);
  const hive = item.scope === "machine" ? "HKLM" : "HKCU";
  const group = item.kind === "startup-folder" ? "StartupFolder" : item.view === "32" ? "Run32" : "Run";
  const approved = `${hive}:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${group}`;
  const bytes = enabled ? "2,0,0,0,0,0,0,0,0,0,0,0" : "3,0,0,0,0,0,0,0,0,0,0,0";
  const script = `
$ErrorActionPreference = 'Stop'
New-Item -Path $env:AERUS_KEY -Force | Out-Null
New-ItemProperty -Path $env:AERUS_KEY -Name $env:AERUS_NAME -PropertyType Binary -Value ([byte[]](${bytes})) -Force | Out-Null
'ok'
`;
  try {
    await runPowerShell(script, { AERUS_KEY: approved, AERUS_NAME: item.name });
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Windows rejected the change.";
    return {
      ok: false,
      error: item.scope === "machine" ? `Administrator permission is required to change this all-users startup entry. ${detail}` : detail,
    };
  }
}

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

let scanning = false;

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function safeStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  if (decoded.includes("\0") || decoded.includes("..")) return null;
  const file = path.resolve(staticDir, `.${decoded}`);
  if (!file.startsWith(path.resolve(staticDir))) return null;
  if (!existsSync(file)) return null;
  const st = statSync(file);
  if (!st.isFile()) return null;
  return file;
}

function sendFile(res, req, file, type) {
  res.writeHead(200, { "content-type": type, "cache-control": type.startsWith("text/html") ? "no-store" : "public, max-age=3600" });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

function hasSessionCapability(req) {
  const cookie = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("aerus_session="));
  const presented = cookie ? cookie.slice("aerus_session=".length) : "";
  if (!presented || presented.length !== AERUS_SESSION_CAPABILITY.length) return false;
  try { return timingSafeEqual(Buffer.from(presented), Buffer.from(AERUS_SESSION_CAPABILITY)); } catch { return false; }
}

function allowedLocalOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") && (host === parsed.hostname || host === "127.0.0.1" || host === "localhost");
  } catch { return false; }
}

function rejectUnauthorized(res) {
  sendJson(res, 403, { error: "Unauthorized local application request." });
}

async function sendIndex(res, req) {
  const html = await readFile(indexFile, "utf8");
  // The packaged page was produced with a builder-only remote helper.  Aerus
  // is a local disk utility, so it must not execute code fetched from a third
  // party when its window opens.
  const localHtml = html.replace('<script src="https://grok.com/grok-app-builder/extensions.js" defer></script>', "");
  const data = localHtml.replace("</body>", '<script src="/startup-ui.js" defer></script></body>');
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": [`aerus_session=${AERUS_SESSION_CAPABILITY}; HttpOnly; SameSite=Strict; Path=/`], "content-length": Buffer.byteLength(data) });
  res.end(req.method === "HEAD" ? undefined : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const localApi = url.pathname.startsWith("/__drivescope/") || url.pathname.startsWith("/api/drivescope/");
    if (localApi && url.pathname !== "/__drivescope/health" && (!hasSessionCapability(req) || !allowedLocalOrigin(req))) {
      rejectUnauthorized(res);
      return;
    }
    if (url.pathname === "/__drivescope/health") {
      sendJson(res, 200, { ok: true, product: "aerus-sdm" });
      return;
    }
    if (url.pathname === "/__drivescope/ping" || url.pathname === "/api/drivescope/ping") {
      const disks = await listDisks();
      sendJson(res, 200, { ok: true, product: "drivescope", platform: process.platform, disks });
      return;
    }
    if (url.pathname === "/__drivescope/volumes" && req.method === "GET") {
      sendJson(res, 200, { volumes: await listVolumes() });
      return;
    }
    if (url.pathname === "/__drivescope/recall" && req.method === "GET") {
      sendJson(res, 200, { scan: await readRecall() });
      return;
    }
    if (url.pathname === "/__drivescope/recall" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (body.forget) {
        await unlink(recallPaths().file).catch(() => undefined);
        sendJson(res, 200, { ok: true, scan: null });
        return;
      }
      if (!body.scan || typeof body.scan !== "object") {
        sendJson(res, 400, { error: "Missing scan" });
        return;
      }
      await writeRecall(body.scan);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/__drivescope/control" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (body.action === "pause") control.paused = true;
      if (body.action === "resume") control.paused = false;
      if (body.action === "cancel") control.aborted = true;
      sendJson(res, 200, { ok: true, ...control });
      return;
    }
    if (url.pathname === "/__drivescope/list" && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 200, { children: await listDirectory(String(body.path || "")) });
      return;
    }
    if (url.pathname === "/__drivescope/measure" && req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 200, await measurePath(String(body.path || "")));
      return;
    }
    if (url.pathname === "/__drivescope/verify" && req.method === "POST") {
      const body = await readJsonBody(req);
      const ac = new AbortController();
      req.on("close", () => ac.abort());
      sendJson(res, 200, await verifyPaths(body, ac.signal));
      return;
    }
    if (url.pathname === "/__drivescope/clean" && req.method === "POST") {
      const body = await readJsonBody(req);
      const paths = Array.isArray(body.paths) ? body.paths.map(String) : [];
      const result = await cleanNow(paths, Boolean(body.permanent));
      sendJson(res, result.error ? 400 : 200, result);
      return;
    }
    if (url.pathname === "/__drivescope/startup" && req.method === "GET") {
      sendJson(res, 200, { items: await listStartup() });
      return;
    }
    if (url.pathname === "/__drivescope/startup" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await setStartup(String(body.id || ""), Boolean(body.enabled));
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }
    if (url.pathname === "/__drivescope/open" && req.method === "POST") {
      const body = await readJsonBody(req);
      const target = String(body.path || "");
      if (process.platform === "win32" && target && !target.includes("\0")) {
        const { execFile } = await import("node:child_process");
        execFile("explorer.exe", [target.replaceAll("/", "\\")], { windowsHide: false });
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/__drivescope/scan" && req.method === "POST") {
      if (scanning) {
        sendJson(res, 409, { error: "A scan is already running." });
        return;
      }
      const body = await readJsonBody(req);
      const roots = Array.isArray(body.roots) ? body.roots.map(String).filter(Boolean) : [];
      scanning = true;
      resetControl();
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      });
      const send = (obj) => {
        res.write(`${JSON.stringify(obj)}\n`);
      };
      res.on("close", () => {
        if (!res.writableEnded) control.aborted = true;
      });
      try {
        for (const rootPath of roots) {
          if (control.aborted) break;
          const output = await scanRoot(rootPath, {
            gentle: Boolean(body.gentle),
            volumeId: body.ids?.[rootPath] || undefined,
            letter: body.letters?.[rootPath] || undefined,
            label: body.labels?.[rootPath] || undefined,
            onProgress: (patch) => send({ type: "progress", root: rootPath, ...patch }),
          });
          send({ type: "volume", root: rootPath, output });
        }
        send({ type: "done", partial: control.aborted });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Scan failed" });
      } finally {
        scanning = false;
        control.paused = false;
        res.end();
      }
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      await sendIndex(res, req);
      return;
    }
    const file = safeStatic(url.pathname);
    if (file) {
      sendFile(res, req, file, TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && existsSync(indexFile) && !path.extname(url.pathname)) {
      await sendIndex(res, req);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: err instanceof Error ? err.message : "Server error" });
    else res.end();
  }
});

server.once("error", (err) => {
  process.stderr.write(`Aerus SDM server failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;
  process.stdout.write(`Aerus SDM listening on 127.0.0.1:${activePort}\n`);
});
