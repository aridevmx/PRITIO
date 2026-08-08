#!/usr/bin/env node
// Renombra la app en todo el repo manteniendo una sola fuente de verdad.
//
// Uso:
//   node scripts/rename-app.mjs "PRITIO"
//   node scripts/rename-app.mjs "PRITIO" "Nuevo tagline"
//   node scripts/rename-app.mjs "PRITIO" --dry-run
//
// Actualiza:
//   1. src/lib/branding.ts        (frontend, lo usa la app)
//   2. supabase/functions/_shared/app-info.ts (edge functions)
//   3. Cualquier literal restante en src/ supabase/ public/ index.html
//
// NO toca: node_modules, dist, .git, PRODUCT.md/README.

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const newName = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!newName) {
  console.error("Uso: node scripts/rename-app.mjs \"Nombre\" [tagline] [--dry-run]");
  process.exit(1);
}

const newTagline = process.argv[3] && !process.argv[3].startsWith("--")
  ? process.argv[3]
  : undefined;

const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git"]);
const EXCLUDED_PREFIXES = [];
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".html", ".css",
  ".toml", ".sql", ".yml", ".yaml", ".txt", ".svg", ".env.example",
]);

function isExcluded(relPath) {
  const segments = relPath.split(sep);
  if (segments.some((s) => EXCLUDED_DIRS.has(s))) return true;
  return EXCLUDED_PREFIXES.some((p) => relPath.startsWith(p) || relPath.includes(sep + p));
}

async function walk(dir, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const childRel = rel ? join(rel, entry.name) : entry.name;
    if (isExcluded(childRel)) continue;
    if (entry.isDirectory()) {
      files.push(...await walk(full, childRel));
    } else if (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function updateBrandingFile(path, oldName, tagline) {
  let content = await readFile(path, "utf8");
  const before = content;
  if (oldName !== newName) {
    content = content.replace(
      `export const APP_NAME = ${JSON.stringify(oldName)};`,
      `export const APP_NAME = ${JSON.stringify(newName)};`,
    );
  }
  if (tagline) {
    content = content.replace(
      /export const APP_TAGLINE\s*=\s*"[\s\S]*?";/,
      `export const APP_TAGLINE =\n  ${JSON.stringify(tagline)};`,
    );
  }
  return content !== before ? { content } : null;
}

const brandingFile = join(root, "src", "lib", "branding.ts");
const appInfoFile = join(root, "supabase", "functions", "_shared", "app-info.ts");

let oldName;
try {
  oldName = (await readFile(brandingFile, "utf8")).match(/APP_NAME = "([^"]+)"/)?.[1];
} catch { /* ignore */ }

if (!oldName) {
  console.error("No se pudo leer APP_NAME de src/lib/branding.ts");
  process.exit(1);
}

if (oldName === newName && !newTagline) {
  console.log(`Ya se llama "${newName}". Nada que hacer.`);
  process.exit(0);
}

let changed = 0;
for (const [file, tagline] of [
  [brandingFile, newTagline],
  [appInfoFile, newTagline],
]) {
  const result = await updateBrandingFile(file, oldName, tagline);
  if (result) {
    changed++;
    console.log(`  ${dryRun ? "[DRY] " : ""}branding: ${file.replace(root, "")}`);
    if (!dryRun) await writeFile(file, result.content);
  }
}

if (oldName !== newName) {
  for (const file of await walk(root)) {
    const content = await readFile(file, "utf8");
    if (!content.includes(oldName)) continue;
    const updated = content.split(oldName).join(newName);
    if (updated === content) continue;
    changed++;
    console.log(`  ${dryRun ? "[DRY] " : ""}${file.replace(root, "")} (${countOccurrences(content, oldName)}×)`);
    if (!dryRun) await writeFile(file, updated);
  }
}

function countOccurrences(haystack, needle) {
  let count = 0, idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

console.log(dryRun
  ? `[dry-run] Se renombraría de "${oldName}" a "${newName}"${newTagline ? ` con nuevo tagline` : ""}: ${changed} archivo(s).`
  : `Listo: "${oldName}" → "${newName}"${newTagline ? ` (tagline actualizado)` : ""}. ${changed} archivo(s) actualizado(s).`);
