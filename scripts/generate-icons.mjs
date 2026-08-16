// Generates the PWA/brand PNG icons from the Pritio mark.
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");

const BACKGROUND = "#F4F7F8";

const MARK = `
  <g>
    <rect x="2" y="2" width="13" height="13" rx="3" fill="#4FC38A"/>
    <rect x="17" y="2" width="13" height="13" rx="3" fill="#F27D72"/>
    <rect x="2" y="17" width="13" height="13" rx="3" fill="#5BA7D1"/>
    <rect x="17" y="17" width="13" height="13" rx="3" fill="#9B7EDC"/>
  </g>
`;

const MARK_BOX = 28;

function svg(size, fraction, background) {
  const scale = (size * fraction) / MARK_BOX;
  const center = size / 2;
  const transform = `translate(${center} ${center}) scale(${scale}) translate(-16 -16)`;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  <g transform="${transform}">${MARK}</g>
</svg>`;
}

function render(name, size, fraction, background) {
  const resvg = new Resvg(svg(size, fraction, background), {
    fitTo: { mode: "original" },
  });
  const png = resvg.render().asPng();
  const file = join(outDir, name);
  writeFileSync(file, png);
  console.log(`✓ ${name} (${size}x${size})`);
}

mkdirSync(outDir, { recursive: true });

render("icon-192.png", 192, 0.75, null);
render("icon-512.png", 512, 0.75, null);
render("icon-maskable-512.png", 512, 0.5, BACKGROUND);
render("apple-touch-icon.png", 180, 0.55, BACKGROUND);
render("pritio-logo-1024.png", 1024, 0.5, BACKGROUND);
