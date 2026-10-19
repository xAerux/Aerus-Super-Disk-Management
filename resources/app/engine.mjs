import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, statfsSync } from "node:fs";
import { lstat, opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { classifyFileDup, classifyJunk, fileGroupKind, junkFolder, looksLikeLoop, matchInstall, shouldSkipDirectory } from "./logic.mjs";

export const control = { paused: false, aborted: false };

export function resetControl() {
  control.paused = false;
  control.aborted = false;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toPosix(p) {
  return p.replaceAll("\\", "/");
}

function ps(script) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 12000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? "" : String(stdout || "")),
    );
  });
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

export async function listVolumes() {
  if (process.platform === "win32") {
    const raw = await ps(
      "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 -or $_.DriveType -eq 2 } | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace,DriveType | ConvertTo-Json -Compress",
    );
    const rows = raw.trim() ? asArray(JSON.parse(raw)) : [];
    if (rows.length) {
      return rows.map((row) => {
        const letter = String(row.DeviceID || "").replace(":", "");
        const total = Number(row.Size);
        const free = Number(row.FreeSpace);
        return volumeFrom(letter, row.VolumeName || letter, Number.isFinite(total) ? total : null, Number.isFinite(free) ? free : null, row.FileSystem || null, Number(row.DriveType) === 2 ? "Removable" : "Unknown");
      });
    }
    const found = [];
    for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      try {
        const stats = statfsSync(`${letter}:/`);
        if (!stats.blocks) continue;
        found.push(volumeFrom(letter, letter, stats.blocks * stats.bsize, stats.bavail * stats.bsize, null, "Unknown"));
      } catch {
        /* drive not present */
      }
    }
    return found;
  }
  try {
    const stats = statfsSync("/");
    return [volumeFrom("/", "This computer", stats.blocks * stats.bsize, stats.bavail * stats.bsize, null, "Unknown", "/")];
  } catch {
    return [];
  }
}

function formatRough(n) {
  if (!Number.isFinite(n) || n <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i >= 3 ? 2 : 1)} ${units[i]}`;
}

function volumeFrom(letter, label, total, free, fileSystem, mediaKind, rootKey) {
  const id = `vol:${letter}`;
  return {
    id,
    letter: letter === "/" ? "/" : `${letter}:`,
    label: label || letter,
    totalBytes: total,
    freeBytes: free,
    fileSystem,
    mediaKind,
    origin: "measured",
    folders: [],
    listed: false,
    rootKey: rootKey || `${letter}:/`,
    measuredBytes: null,
    pathNote: "",
  };
}

export async function listDisks() {
  if (process.platform !== "win32") return [];
  const raw = await ps(
    "Get-PhysicalDisk | Select-Object FriendlyName,MediaType,BusType,Size,HealthStatus | ConvertTo-Json -Compress",
  );
  if (!raw.trim()) return [];
  let rows = [];
  try {
    rows = asArray(JSON.parse(raw));
  } catch {
    return [];
  }
  return rows.map((row, index) => {
    const media = String(row.MediaType || "");
    const kind = media === "SSD" || media === "HDD" ? media : "Unknown";
    const bytes = Number(row.Size);
    return {
      id: `disk-${index}`,
      model: String(row.FriendlyName || "Physical disk"),
      kind,
      capacity: formatRough(bytes),
      connection: String(row.BusType || "Unknown"),
      health: String(row.HealthStatus || "Not reported"),
      smart: null,
      fileSystem: "—",
      freeLabel: "Shown on each drive letter",
      optimize:
        kind === "SSD"
          ? "TRIM is appropriate for an SSD. Aerus SDM will not run it."
          : kind === "HDD"
            ? "Windows can optimize a hard drive. Aerus SDM will not defragment it."
            : "Aerus SDM will not optimize this disk.",
      limitation: "Reported by Windows. Raw SMART attributes were not read. Nothing is repaired or optimized automatically.",
    };
  });
}

async function pumpPause() {
  while (control.paused && !control.aborted) await delay(160);
}

export async function scanRoot(rootPath, hooks) {
  const rootPosix = toPosix(rootPath).replace(/\/+$/, "") || rootPath;
  const rootName = rootPosix.split("/").pop() || rootPosix;
  const volumeId = hooks.volumeId || `live:${rootName}`;
  const installs = new Map();
  const dup = new Map();
  const cleanerGroups = new Map();
  const dirBytes = new Map();
  const errors = [];
  let filesSeen = 0;
  let bytesSeen = 0;
  let partial = false;
  const queue = [{ dir: rootPath, rel: rootPosix, depth: 0 }];
  const seen = new Set([rootPosix.toLowerCase()]);
  let cursor = 0;

  while (cursor < queue.length) {
    if (control.aborted || hooks.signal?.aborted) {
      partial = true;
      break;
    }
    await pumpPause();
    const job = queue[cursor];
    cursor += 1;
    if (!job) break;
    if (looksLikeLoop(job.rel, job.depth)) {
      partial = true;
      errors.push({ path: job.rel, message: "Stopped this branch — depth or path length looked unsafe." });
      continue;
    }
    let dir;
    try {
      dir = await opendir(job.dir);
    } catch (err) {
      errors.push({ path: job.rel, message: err instanceof Error ? err.message : "Access denied" });
      continue;
    }
    try {
      for await (const entry of dir) {
        if (control.aborted || hooks.signal?.aborted) {
          partial = true;
          break;
        }
        const name = entry.name;
        if (!name || name === "." || name === "..") continue;
        const full = path.join(job.dir, name);
        const rel = `${job.rel}/${name}`;
        let st;
        try {
          st = await lstat(full);
        } catch (err) {
          errors.push({ path: rel, message: err instanceof Error ? err.message : "Unreadable" });
          continue;
        }
        if (st.isSymbolicLink()) {
          errors.push({ path: rel, message: "Skipped — link or junction, not followed." });
          continue;
        }
        if (st.isDirectory()) {
          if (shouldSkipDirectory(name, job.rel)) {
            errors.push({ path: rel, message: "Skipped — profile junction name, not followed." });
            continue;
          }
          const mark = rel.toLowerCase();
          if (seen.has(mark)) {
            partial = true;
            errors.push({ path: rel, message: "Skipped — path already visited." });
            continue;
          }
          seen.add(mark);
          queue.push({ dir: full, rel, depth: job.depth + 1 });
          continue;
        }
        if (!st.isFile()) continue;
        filesSeen += 1;
        bytesSeen += st.size;
        const hit = matchInstall(rel);
        if (hit) {
          const key = `${hit.launcher}|${hit.root}`;
          const acc = installs.get(key) ?? {
            name: hit.name,
            launcher: hit.launcher,
            category: hit.category,
            path: hit.root,
            bytes: 0,
            sharedRisk: hit.sharedRisk,
            files: 0,
            modified: 0,
          };
          acc.bytes += st.size;
          acc.files += 1;
          acc.modified = Math.max(acc.modified, st.mtimeMs || 0);
          installs.set(key, acc);
        }
        const seg = rel.split("/").slice(0, 3).join("/");
        dirBytes.set(seg, (dirBytes.get(seg) ?? 0) + st.size);
        const junk = classifyJunk(name, rel, st.size, st.mtimeMs || null);
        if (junk) {
          const folder = junkFolder(rel, junk.category);
          const key = `${junk.category}|${folder}`;
          const row = cleanerGroups.get(key) ?? {
            category: junk.category,
            path: folder,
            count: 0,
            bytes: 0,
            risk: junk.risk,
            reason: junk.reason,
            names: [],
          };
          row.count += 1;
          row.bytes += st.size;
          if (row.names.length < 8) row.names.push(name);
          if (junk.risk === "medium") row.risk = "medium";
          cleanerGroups.set(key, row);
        }
        const dupKind = classifyFileDup(name);
        if (dupKind && st.size >= 1024 * 1024) {
          const key = `${name.toLowerCase()}|${st.size}|${dupKind}`;
          const row = dup.get(key) ?? { name, size: st.size, paths: [], kind: dupKind };
          if (row.paths.length < 8) row.paths.push(rel);
          dup.set(key, row);
          if (dup.size > 8000) partial = true;
        }
        if (filesSeen % 200 === 0) {
          hooks.onProgress?.({ filesSeen, bytesSeen, currentPath: rel });
          if (hooks.gentle) await delay(12);
        }
      }
    } finally {
      await dir.close().catch(() => undefined);
    }
  }

  let installList = [...installs.values()].map((acc) => ({
    id: `live:${acc.launcher}:${acc.path}`,
    name: acc.name,
    category: acc.category,
    sizeBytes: acc.bytes,
    sizeKind: partial ? "partial" : "measured",
    driveId: volumeId,
    launcher: acc.launcher,
    path: acc.path,
    status: partial ? "partial" : "ready",
    sharedRisk: acc.sharedRisk,
    modified: acc.modified ? new Date(acc.modified).toISOString().slice(0, 10) : undefined,
  }));
  if (!installList.length && filesSeen > 0) {
    installList = [
      {
        id: `live:folder:${volumeId}`,
        name: rootName,
        category: "program",
        sizeBytes: bytesSeen,
        sizeKind: partial ? "partial" : "measured",
        driveId: volumeId,
        launcher: "Folder",
        path: rootPosix,
        status: partial ? "partial" : "ready",
        sharedRisk: false,
      },
    ];
  }
  const fileGroups = [];
  for (const [key, row] of dup) {
    if (row.paths.length < 2) continue;
    fileGroups.push({
      id: `file:${key}`,
      kind: fileGroupKind(row.kind),
      title: row.name,
      confidence: "possible",
      note: "Same file name and size. Content has not been hashed, so this is only a candidate.",
      copies: row.paths.map((filePath, index) => ({
        id: `${key}:${index}`,
        label: row.name,
        driveId: volumeId,
        launcher: null,
        path: filePath,
        sizeBytes: row.size,
        sizeKind: "measured",
        activeInstall: false,
        sharedRisk: false,
      })),
    });
  }
  const ranked = [...cleanerGroups.values()].sort((a, b) => b.bytes - a.bytes);
  const cleaner = ranked.slice(0, 400).map((row) => ({
    id: `junk:${volumeId}:${row.category}:${row.path}`,
    category: row.category,
    path: row.path,
    name: row.path.split("/").pop() || row.path,
    sizeBytes: row.bytes,
    files: row.names,
    reason: `${row.count.toLocaleString()} files in this folder. ${row.reason}. One checkbox removes the whole folder.`,
    risk: row.risk,
    driveId: volumeId,
  }));
  const rolled =
    ranked.length > cleaner.length
      ? [
          {
            id: `roll:${volumeId}:more`,
            category: "temp",
            path: rootPosix,
            name: `${ranked.length - cleaner.length} more folders not listed`,
            sizeBytes: ranked.slice(400).reduce((sum, row) => sum + row.bytes, 0),
            reason: "Only the 400 largest folders are listed. This note is not a second copy of those rows.",
            risk: "low",
            driveId: volumeId,
          },
        ]
      : [];
  return {
    volume: {
      ...volumeFrom(rootName, rootName, null, null, null, "Unknown", rootPosix),
      id: volumeId,
      letter: hooks.letter || rootName,
      label: hooks.label || rootName,
      measuredBytes: bytesSeen,
      origin: "measured",
    },
    installs: installList,
    fileGroups,
    cleaner: cleaner.concat(rolled),
    topDirs: [...dirBytes.entries()]
      .map(([dirPath, bytes]) => ({ path: dirPath, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 12),
    filesSeen,
    bytesSeen,
    errors: errors.slice(0, 200),
    partial,
  };
}

export async function listDirectory(dirPath) {
  const nodes = [];
  let dir;
  try {
    dir = await opendir(dirPath);
  } catch {
    return [
      {
        id: `${dirPath}:denied`,
        name: "Access denied",
        path: toPosix(dirPath),
        kind: "folder",
        sizeBytes: null,
        sizeKind: "unavailable",
        children: [],
        denied: true,
      },
    ];
  }
  const parent = toPosix(dirPath);
  try {
    for await (const entry of dir) {
      if (!entry.name || entry.name === "." || entry.name === "..") continue;
      const full = path.join(dirPath, entry.name);
      const rel = `${parent}/${entry.name}`;
      let st;
      try {
        st = await lstat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (shouldSkipDirectory(entry.name, parent)) continue;
        nodes.push({
          id: rel,
          name: entry.name,
          path: rel,
          kind: "folder",
          sizeBytes: null,
          sizeKind: "unknown",
          children: null,
        });
      } else if (st.isFile()) {
        nodes.push({
          id: rel,
          name: entry.name,
          path: rel,
          kind: "file",
          sizeBytes: st.size,
          sizeKind: "measured",
          children: null,
        });
      }
    }
  } finally {
    await dir.close().catch(() => undefined);
  }
  nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
  return nodes;
}

export async function measurePath(dirPath) {
  let bytes = 0;
  let partial = false;
  const queue = [{ dir: dirPath, depth: 0 }];
  const seen = new Set();
  let cursor = 0;
  while (cursor < queue.length) {
    if (control.aborted) return { bytes, partial: true, error: "Cancelled" };
    const job = queue[cursor];
    cursor += 1;
    if (!job) continue;
    const key = job.dir.toLowerCase();
    if (seen.has(key) || looksLikeLoop(job.dir, job.depth)) {
      partial = true;
      continue;
    }
    seen.add(key);
    let dir;
    try {
      dir = await opendir(job.dir);
    } catch (err) {
      partial = true;
      return { bytes, partial, error: err instanceof Error ? err.message : "Access denied" };
    }
    try {
      for await (const entry of dir) {
        const full = path.join(job.dir, entry.name);
        const st = await lstat(full).catch(() => null);
        if (!st || st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          if (!shouldSkipDirectory(entry.name, toPosix(job.dir))) queue.push({ dir: full, depth: job.depth + 1 });
        } else if (st.isFile()) bytes += st.size;
      }
    } finally {
      await dir.close().catch(() => undefined);
    }
  }
  return { bytes, partial };
}

function hashFile(filePath, signal) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    const onAbort = () => {
      stream.destroy();
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => {
      signal?.removeEventListener("abort", onAbort);
      resolve(hash.digest("hex"));
    });
  });
}

async function indexTree(root, cap, signal) {
  const map = new Map();
  const queue = [{ dir: root, rel: "" }];
  let partial = false;
  let cursor = 0;
  while (cursor < queue.length) {
    if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    const job = queue[cursor];
    cursor += 1;
    if (!job) continue;
    let dir;
    try {
      dir = await opendir(job.dir);
    } catch {
      partial = true;
      continue;
    }
    try {
      for await (const entry of dir) {
        const rel = job.rel ? `${job.rel}/${entry.name}` : entry.name;
        const full = path.join(job.dir, entry.name);
        const st = await lstat(full).catch(() => null);
        if (!st || st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          if (!shouldSkipDirectory(entry.name, job.rel)) queue.push({ dir: full, rel });
        } else if (st.isFile()) {
          if (map.size < cap) map.set(rel, { size: st.size, full });
          else partial = true;
        }
      }
    } finally {
      await dir.close().catch(() => undefined);
    }
  }
  return { map, partial };
}

export async function verifyPaths(body, signal) {
  const paths = Array.isArray(body.paths) ? body.paths.map(String) : [];
  const cap = Math.max(1, Math.min(20000, Number(body.cap) || 2000));
  if (body.kind === "install" && paths.length >= 2) {
    const left = await indexTree(paths[0], cap, signal);
    const right = await indexTree(paths[1], cap, signal);
    let compared = 0;
    let differed = 0;
    let onlyA = 0;
    let onlyB = 0;
    const keys = new Set([...left.map.keys(), ...right.map.keys()]);
    for (const key of keys) {
      if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      const a = left.map.get(key);
      const b = right.map.get(key);
      if (a && !b) {
        onlyA += 1;
        continue;
      }
      if (!a && b) {
        onlyB += 1;
        continue;
      }
      if (!a || !b) continue;
      compared += 1;
      if (a.size !== b.size) {
        differed += 1;
        continue;
      }
      const ha = await hashFile(a.full, signal);
      const hb = await hashFile(b.full, signal);
      if (ha !== hb) differed += 1;
    }
    const partial = left.partial || right.partial;
    if (!partial && differed === 0 && onlyA === 0 && onlyB === 0 && compared > 0) {
      return { status: "exact", detail: `SHA-256 matched for all ${compared} compared files.`, compared, onlyA, onlyB, differed };
    }
    if (differed === 0 && onlyA === 0 && onlyB === 0) {
      return {
        status: "partial",
        detail: `No differences in ${compared} files. The walk stopped early, so this is not complete proof.`,
        compared,
        onlyA,
        onlyB,
        differed,
      };
    }
    return {
      status: "different",
      detail: `Compared ${compared}. Differed ${differed}. Only in first ${onlyA}. Only in second ${onlyB}.${partial ? " Subset only." : ""}`,
      compared,
      onlyA,
      onlyB,
      differed,
    };
  }
  const existing = [];
  for (const filePath of paths) {
    try {
      const st = await stat(filePath);
      if (st.isFile()) existing.push(filePath);
    } catch {
      /* missing */
    }
  }
  if (existing.length < 2) {
    return {
      status: "partial",
      detail: "Could not open two files to hash.",
      compared: existing.length,
      onlyA: 0,
      onlyB: Math.max(0, paths.length - existing.length),
      differed: 0,
    };
  }
  const hexes = [];
  for (const filePath of existing) hexes.push(await hashFile(filePath, signal));
  const unique = new Set(hexes);
  if (unique.size === 1 && existing.length === paths.length) {
    return { status: "exact", detail: "SHA-256 hashes match. These files are exact copies.", compared: existing.length, onlyA: 0, onlyB: 0, differed: 0 };
  }
  if (unique.size === 1) {
    return {
      status: "partial",
      detail: `Hashed ${existing.length} of ${paths.length} paths.`,
      compared: existing.length,
      onlyA: 0,
      onlyB: paths.length - existing.length,
      differed: 0,
    };
  }
  return { status: "different", detail: "SHA-256 hashes differ. Same name and size, different content.", compared: existing.length, onlyA: 0, onlyB: 0, differed: unique.size };
}

export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

void readFile;
