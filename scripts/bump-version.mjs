#!/usr/bin/env node
// Bump de versión semántica en package.json, src/lib/branding.ts y CHANGELOG.md.
// Pensado para correr en CI tras cada push a main (o a mano con --commit).
//
// Uso:
//   node scripts/bump-version.mjs            # +patch
//   node scripts/bump-version.mjs minor      # +minor (0.1.0 -> 0.2.0)
//   node scripts/bump-version.mjs major      # +major (0.1.0 -> 1.0.0)
//   node scripts/bump-version.mjs 1.2.3      # versión exacta
//   node scripts/bump-version.mjs --commit   # además commitea y taggea vX.Y.Z

import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const doCommit = process.argv.includes("--commit");
const arg = process.argv[2];

const packageJsonPath = join(root, "package.json");
const brandingPath = join(root, "src", "lib", "branding.ts");
const changelogPath = join(root, "CHANGELOG.md");

const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
const current = pkg.version;
const [major, minor, patch] = current.split(".").map(Number);

let next;
if (/^\d+\.\d+\.\d+$/.test(arg ?? "")) {
  next = arg;
} else if (arg === "major") {
  next = `${major + 1}.0.0`;
} else if (arg === "minor") {
  next = `${major}.${minor + 1}.0`;
} else {
  next = `${major}.${minor}.${patch + 1}`;
}

console.log(`Bump: v${current} -> v${next}`);

if (next === current) {
  console.log("La versión no cambió. Saliendo sin modificar nada.");
  process.exit(0);
}

const branding = await readFile(brandingPath, "utf8");
await writeFile(
  brandingPath,
  branding.replace(
    /export const APP_VERSION = "[^"]+";/,
    `export const APP_VERSION = "${next}";`,
  ),
);

pkg.version = next;
await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");

const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD en hora local
const changelog = await readFile(changelogPath, "utf8");
await writeFile(
  changelogPath,
  changelog.replace(/## \[Unreleased\][\s\S]*?(?=## \[)/, `## [Unreleased]\n\n## [${next}] - ${today}\n\n`),
);

console.log("Archivos actualizados: package.json, src/lib/branding.ts, CHANGELOG.md");

if (doCommit) {
  execSync("git add package.json src/lib/branding.ts CHANGELOG.md", { cwd: root, stdio: "inherit" });
  execSync(`git commit -m "chore: release v${next}"`, { cwd: root, stdio: "inherit" });
  execSync(`git tag "v${next}"`, { cwd: root, stdio: "inherit" });
  console.log(`Commit + tag v${next} creados.`);
}
