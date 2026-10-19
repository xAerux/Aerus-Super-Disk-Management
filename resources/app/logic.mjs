// src/lib/drivescope/logic.ts
var JUNCTION_NAMES = /* @__PURE__ */ new Set([
  "application data",
  "local settings",
  "documents and settings",
  "my documents",
  "cookies",
  "history",
  "temporary internet files",
  "nethood",
  "printhood",
  "recent",
  "sendto",
  "start menu",
  "templates"
]);
function shouldSkipDirectory(name, parentPath2) {
  const n = name.trim().toLowerCase();
  if (!n || n === "." || n === "..") return true;
  const parent = parentPath2.replace(/\\/g, "/").toLowerCase();
  const inProfile = parent.includes("/users/") || parent.includes("/documents and settings");
  if (!inProfile) return false;
  return JUNCTION_NAMES.has(n);
}
function looksLikeLoop(path, depth) {
  if (depth > 32) return true;
  if (path.length > 4e3) return true;
  return false;
}
function normalizeName(name) {
  return name.toLowerCase().replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function parentPath(path) {
  const norm = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = norm.lastIndexOf("/");
  return i > 0 ? norm.slice(0, i) : norm;
}
var EXCLUDE_INSTALL = /^(steamworks shared|steamworks common redistributables|_commonredist|directx|vcredist|epic games launcher|launcher|riot client|steam)$/i;
var RULES = [
  { re: /(?:^|\/)steamapps\/common\/([^/]+)/i, launcher: "Steam", category: "game" },
  { re: /(?:^|\/)XboxGames\/([^/]+)/i, launcher: "Xbox", category: "game", sharedRisk: true },
  { re: /(?:^|\/)Epic Games(?:\/Games)?\/([^/]+)/i, launcher: "Epic Games", category: "game" },
  { re: /(?:^|\/)GOG Games\/([^/]+)/i, launcher: "GOG", category: "game" },
  { re: /(?:^|\/)Ubisoft(?: Game Launcher)?\/games\/([^/]+)/i, launcher: "Ubisoft Connect", category: "game" },
  { re: /(?:^|\/)EA Games\/([^/]+)/i, launcher: "EA App", category: "game" },
  { re: /(?:^|\/)Electronic Arts\/([^/]+)/i, launcher: "EA App", category: "game" },
  { re: /(?:^|\/)Riot Games\/([^/]+)/i, launcher: "Riot Games", category: "game" },
  { re: /(?:^|\/)Rockstar Games\/([^/]+)/i, launcher: "Rockstar", category: "game" },
  { re: /(?:^|\/)Battle\.net\/([^/]+)/i, launcher: "Battle.net", category: "game" },
  {
    re: /(?:^|\/)Program Files(?: \(x86\))?\/([^/]+)/i,
    launcher: "Windows",
    category: "program"
  }
];
function matchInstall(relPath) {
  const path = relPath.replace(/\\/g, "/");
  const hits = [];
  for (const rule of RULES) {
    const m = rule.re.exec(path);
    if (!m?.[1]) continue;
    const name = m[1];
    if (EXCLUDE_INSTALL.test(name)) continue;
    const root = path.slice(0, (m.index ?? 0) + m[0].length);
    hits.push({
      name,
      root,
      launcher: rule.launcher,
      category: rule.category,
      sharedRisk: Boolean(rule.sharedRisk)
    });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.root.length - a.root.length);
  return hits[0] ?? null;
}
function classifyFileDup(name) {
  const lower = name.toLowerCase();
  if (/\.(bak|old)$/.test(lower)) return "backup";
  if (/\.(zip|rar|7z|iso|cab)$/.test(lower)) return "archive";
  if (/\.(mp4|mkv|mov|mp3|flac|wav)$/.test(lower)) return "media";
  if (/\.(msi)$/.test(lower)) return "installer";
  if (/\.(exe)$/.test(lower) && /(setup|install|installer)/.test(lower)) return "installer";
  return null;
}
var JUNK_DIR = /^(temp|tmp|cache|caches|crashdumps|crashdump|dumps|inetcache|thumbcache|thumbnails|logs|log|backups|backup)$/i;
var BROAD_DIR = /^(windows|program files|program files \(x86\)|users|appdata|local|roaming|locallow|programdata)$/i;
var FOLDER_CATEGORIES = /* @__PURE__ */ new Set(["temp", "logs", "dumps", "cache", "backups"]);
function junkFolder(filePath, category) {
  const norm = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = norm.split("/");
  for (let i = 1; i < parts.length; i++) {
    if (JUNK_DIR.test(parts[i] ?? "")) return parts.slice(0, i + 1).join("/");
  }
  const base = parts[parts.length - 1] ?? "";
  const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(base);
  if (category && FOLDER_CATEGORIES.has(category) && looksLikeFile && parts.length >= 3) {
    const parent = parts[parts.length - 2] ?? "";
    if (!BROAD_DIR.test(parent)) return parts.slice(0, -1).join("/");
  }
  return norm;
}
function classifyJunk(name, path, sizeBytes, modifiedMs, now = Date.now()) {
  const lower = name.toLowerCase();
  const p = path.replace(/\\/g, "/").toLowerCase();
  if (isWindowsPath(path)) return null;
  if (lower === "desktop.ini" || lower === ".ds_store") return null;
  if (p.includes("/node_modules/") || p.includes("/.git/")) return null;
  if (lower.endsWith(".tmp") || lower.endsWith(".temp") || lower.startsWith("~$")) {
    return { category: "temp", reason: "Temporary file", risk: "low" };
  }
  if (/\/(temp|tmp)(\/|$)/.test(p) && sizeBytes > 0 && !lower.endsWith(".exe")) {
    return { category: "temp", reason: "File inside a temp folder", risk: "low" };
  }
  if (lower.endsWith(".log")) {
    const old = modifiedMs != null && now - modifiedMs > 14 * 24 * 3600 * 1e3;
    if (old || sizeBytes > 5 * 1024 * 1024) {
      return { category: "logs", reason: old ? "Log older than 14 days" : "Large log file", risk: "low" };
    }
  }
  if (/\.(dmp|mdmp)$/.test(lower)) {
    return { category: "dumps", reason: "Crash dump", risk: "low" };
  }
  if (lower === "thumbs.db" || lower === "ehthumbs.db" || /thumbcache/.test(lower)) {
    return { category: "thumbs", reason: "Thumbnail cache", risk: "low" };
  }
  if (/\.(cache|tmpcache)$/.test(lower) || /\/cache\//.test(p)) {
    return { category: "cache", reason: "Cache file", risk: "low" };
  }
  if (/\.(bak|old)$/.test(lower)) {
    return { category: "backups", reason: "Old backup or leftover copy", risk: "medium" };
  }
  if (classifyFileDup(name) === "installer" && sizeBytes > 20 * 1024 * 1024 && /\/downloads(\/|$)/.test(p)) {
    return { category: "installers", reason: "Installer sitting in Downloads", risk: "medium" };
  }
  return null;
}
function buildInstallDuplicateGroups(installs) {
  const buckets = /* @__PURE__ */ new Map();
  for (const install of installs) {
    if (install.status === "unavailable") continue;
    const key = normalizeName(install.name);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(install);
    buckets.set(key, list);
  }
  const groups = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const sizes = new Set(list.map((i) => i.sizeBytes).filter((n) => n != null));
    const launchers = new Set(list.map((i) => i.launcher));
    let confidence = "possible";
    if (sizes.size === 1 && launchers.size === 1) confidence = "likely";
    const copies = list.map((install) => ({
      id: `${key}:${install.id}`,
      label: install.name,
      driveId: install.driveId,
      launcher: install.launcher,
      path: install.path,
      sizeBytes: install.sizeBytes,
      sizeKind: install.sizeKind,
      modified: install.modified,
      activeInstall: install.status === "ready",
      sharedRisk: install.sharedRisk,
      installId: install.id
    }));
    groups.push({
      id: `install:${key}`,
      kind: "install",
      title: list[0]?.name ?? key,
      confidence,
      note: confidence === "likely" ? "Same name, launcher, and measured size. That is still not proof the files match. Hash to verify." : "Same name only. Different launchers or sizes mean this may not be a real duplicate.",
      copies
    });
  }
  return groups.sort((a, b) => b.copies.length - a.copies.length || a.title.localeCompare(b.title));
}
function fileGroupKind(kind) {
  if (kind === "installer") return "installer";
  if (kind === "archive") return "archive";
  if (kind === "media") return "media";
  return "backup";
}
function estimateSavings(items) {
  const usable = items.filter((i) => i.sizeBytes != null && i.sizeBytes > 0 && i.path.trim());
  const sorted = [...usable].sort((a, b) => a.path.length - b.path.length);
  const kept = [];
  const warnings = [];
  let logicalBytes = 0;
  let skippedNested = 0;
  for (const item of sorted) {
    const path = item.path.replace(/\\/g, "/").replace(/\/+$/, "");
    const parent = kept.find((k) => {
      const kp = k.path.replace(/\\/g, "/").replace(/\/+$/, "");
      return path !== kp && path.startsWith(kp + "/");
    });
    if (parent) {
      skippedNested += 1;
      warnings.push(`\u201C${item.label}\u201D is inside \u201C${parent.label}\u201D. Its size is not added again.`);
      continue;
    }
    kept.push({ ...item, path });
    logicalBytes += item.sizeBytes ?? 0;
    if (item.sharedRisk) {
      warnings.push(
        `\u201C${item.label}\u201D may use shared packages, hard links, or Xbox content. Its full size may not come back as free space.`
      );
    }
  }
  return {
    logicalBytes,
    uncertain: kept.some((i) => i.sharedRisk) || skippedNested > 0,
    warnings,
    counted: kept.length,
    skippedNested
  };
}
function sumInstallBytes(installs) {
  return installs.reduce((s, i) => s + (i.sizeBytes ?? 0), 0);
}
function largestParents(installs) {
  const map = /* @__PURE__ */ new Map();
  for (const install of installs) {
    if (install.sizeBytes == null) continue;
    const key = parentPath(install.path);
    map.set(key, (map.get(key) ?? 0) + install.sizeBytes);
  }
  return [...map.entries()].map(([path, bytes]) => ({ path, bytes })).sort((a, b) => b.bytes - a.bytes);
}
function updateNode(nodes, id, fn) {
  return nodes.map((n) => {
    if (n.id === id) return fn(n);
    if (!n.children) return n;
    return { ...n, children: updateNode(n.children, id, fn) };
  });
}
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}
function filterTree(nodes, query) {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out = [];
  for (const n of nodes) {
    const kids = n.children ? filterTree(n.children, q) : [];
    if (n.name.toLowerCase().includes(q) || kids.length) {
      out.push(kids.length ? { ...n, children: kids } : n);
    }
  }
  return out;
}
function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function toWindowsPath(filePath) {
  return filePath.replace(/\//g, "\\");
}
function deletionAllowed(filePath) {
  if (isWindowsPath(filePath)) return false;
  const norm = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!/^[A-Za-z]:\//.test(norm) || norm.includes("..")) return false;
  const parts = norm.split("/").filter(Boolean);
  if (parts.length < 3) return false;
  const rest = parts.slice(1).join("/").toLowerCase();
  if (rest === "windows" || rest === "windows/system32" || rest === "windows/syswow64" || rest === "program files" || rest === "program files (x86)" || rest === "users" || rest === "programdata" || /^users\/[^/]+$/.test(rest)) {
    return false;
  }
  return true;
}
function isWindowsPath(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((part, index) => index > 0 && part.toLowerCase() === "windows");
}
function uniqueFolders(paths) {
  const norm = paths.map((p) => p.replace(/\\/g, "/").replace(/\/+$/, ""));
  return norm.filter((p, index) => !norm.some((other, otherIndex) => otherIndex !== index && (p === other ? index > otherIndex : p.startsWith(`${other}/`))));
}
function cleanupTargets(opts) {
  const skipped = [];
  const cleanerPaths = opts.cleaner.map((item) => {
    const folder = junkFolder(item.path, item.category);
    if (!deletionAllowed(folder)) {
      skipped.push(`${item.name} is too broad to remove`);
      return null;
    }
    return folder;
  });
  const installPaths = opts.installs.map((item) => {
    if (item.shared || !deletionAllowed(item.path)) {
      skipped.push(`${item.name} stays. Uninstall it from ${item.launcher}.`);
      return null;
    }
    return item.path;
  });
  const targets = uniqueFolders([...cleanerPaths, ...installPaths].filter((path) => Boolean(path)));
  return { targets, skipped };
}
function planScript(opts) {
  const header = [
    "# Aerus SDM cleanup",
    `# Generated: ${opts.generatedAt}`,
    "# This file is not run for you. Right-click it, choose Run with PowerShell, then type YES.",
    "# Or: powershell -NoProfile -ExecutionPolicy Bypass -File .\\Aeru-cleanup.ps1",
    opts.permanent ? "# Permanent delete is on. These paths will not go to the Recycle Bin." : "# Recycle Bin is the default. Files can be restored until you empty the bin yourself.",
    ""
  ];
  if (opts.origin === "sample") {
    return [
      ...header,
      "Write-Host 'This script came from the sample profile, not a scan of this PC.'",
      "Write-Host 'Nothing will be deleted.'",
      "exit 1",
      ""
    ].join("\n");
  }
  const cleaner = uniqueFolders(opts.cleaner.map((item) => junkFolder(item.path, item.category))).filter(deletionAllowed);
  const installs = uniqueFolders(opts.installs.filter((item) => !item.shared).map((item) => item.path)).filter(deletionAllowed);
  const skippedGames = opts.installs.filter((item) => item.shared || !deletionAllowed(item.path));
  const targets = uniqueFolders([...cleaner, ...installs]);
  const lines = [
    ...header,
    "$ErrorActionPreference = 'Continue'",
    `$permanent = $${opts.permanent ? "true" : "false"}`,
    "Add-Type -AssemblyName Microsoft.VisualBasic",
    "$targets = @(",
    ...targets.map((p) => `  ${psQuote(toWindowsPath(p))}`),
    ")",
    ""
  ];
  if (skippedGames.length) {
    lines.push("# Not touched. Shared game files, or a path that is too broad. Uninstall these from their launcher.");
    for (const item of skippedGames) {
      lines.push(`# ${item.name} (${item.launcher}) ${toWindowsPath(item.path)}`);
    }
    lines.push("");
  }
  lines.push(
    "if ($targets.Count -eq 0) {",
    "  Write-Host 'Nothing safe to remove was on the plan.'",
    "  exit 0",
    "}",
    "if ($permanent) { Write-Host 'These paths will be permanently deleted:' } else { Write-Host 'These paths will go to the Recycle Bin:' }",
    'foreach ($target in $targets) { Write-Host "  $target" }',
    "$answer = Read-Host 'Type YES to continue'",
    "if ($answer -cne 'YES') {",
    "  Write-Host 'Cancelled. Nothing was changed.'",
    "  exit 1",
    "}",
    "foreach ($target in $targets) {",
    "  if (-not (Test-Path -LiteralPath $target)) {",
    '    Write-Host "Missing, skipped: $target"',
    "    continue",
    "  }",
    "  try {",
    "    $isDir = (Get-Item -LiteralPath $target -Force).PSIsContainer",
    "    if ($permanent) {",
    "      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop",
    '      Write-Host "Deleted: $target"',
    "    } elseif ($isDir) {",
    "      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target, 'OnlyErrorDialogs', 'SendToRecycleBin')",
    '      Write-Host "Recycled: $target"',
    "    } else {",
    "      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target, 'OnlyErrorDialogs', 'SendToRecycleBin')",
    '      Write-Host "Recycled: $target"',
    "    }",
    "  } catch {",
    '    Write-Host "Failed: $target \u2014 $($_.Exception.Message)"',
    "  }",
    "}",
    "Write-Host 'Done. Empty the Recycle Bin yourself if you want that space back now. Scan again before trusting the free-space number.'",
    ""
  );
  return lines.join("\n");
}
function planMarkdown(opts) {
  const lines = [
    "# Aerus SDM removal plan",
    "",
    `Generated: ${opts.generatedAt}`,
    `Data: ${opts.origin === "sample" ? "SAMPLE PROFILE \u2014 not a scan of this computer" : "Measured from folders you granted"}`,
    "",
    "Aerus SDM did not delete, move, or uninstall anything.",
    "This file is a review list. You decide what to remove, using the official uninstaller or File Explorer.",
    "",
    "## Installations marked for review",
    ""
  ];
  if (!opts.installs.length) lines.push("_None._", "");
  for (const item of opts.installs) {
    lines.push(`- **${item.name}**`);
    lines.push(`  - Launcher: ${item.launcher}`);
    lines.push(`  - Path: ${item.path}`);
    lines.push(`  - Logical size: ${item.size}${item.shared ? " (shared-package warning)" : ""}`);
  }
  lines.push("", "## Cleaner candidates", "");
  if (!opts.cleaner.length) lines.push("_None._", "");
  for (const item of opts.cleaner) {
    lines.push(`- **${item.name}** (${item.category}, ${item.risk} risk)`);
    lines.push(`  - Path: ${item.path}`);
    lines.push(`  - Reason: ${item.reason}`);
  }
  lines.push("", "## Estimate", "", `Combined logical size: ${opts.logical}`, "");
  lines.push(
    "Potential free space is an estimate until you remove items yourself and measure the drive again.",
    "Overlapping folders and shared game packages are not added up as if each were fully reclaimable.",
    ""
  );
  if (opts.warnings.length) {
    lines.push("## Warnings", "");
    for (const w of opts.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  lines.push("## Saves and mods", "");
  lines.push(
    "Saves and mods sometimes live inside the install folder and sometimes under Documents. Check before you uninstall. Aerus SDM will not remove them for you.",
    ""
  );
  return lines.join("\n");
}
var CATEGORY_LABEL = {
  temp: "Temporary files",
  logs: "Old logs",
  dumps: "Crash dumps",
  thumbs: "Thumbnail caches",
  installers: "Installers in Downloads",
  cache: "Cache files",
  backups: "Old backups"
};
export {
  CATEGORY_LABEL,
  buildInstallDuplicateGroups,
  classifyFileDup,
  classifyJunk,
  cleanupTargets,
  deletionAllowed,
  estimateSavings,
  fileGroupKind,
  filterTree,
  findNode,
  isWindowsPath,
  junkFolder,
  largestParents,
  looksLikeLoop,
  matchInstall,
  normalizeName,
  parentPath,
  planMarkdown,
  planScript,
  shouldSkipDirectory,
  sumInstallBytes,
  updateNode
};
