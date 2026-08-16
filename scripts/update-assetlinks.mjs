// Copia el assetlinks.json generado por Bubblewrap al origen web
// (public/.well-known/assetlinks.json) para que Vercel lo sirva en
// https://app.pritio.com.mx/.well-known/assetlinks.json
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "twa", "assetlinks.json");
const targetDir = join(root, "public", ".well-known");
const target = join(targetDir, "assetlinks.json");

mkdirSync(targetDir, { recursive: true });

try {
  copyFileSync(source, target);
  console.log(`✓ ${target}`);
} catch {
  console.error(
    `No se encontró ${source}. Primero ejecuta: npm run twa:build`,
  );
  process.exit(1);
}
