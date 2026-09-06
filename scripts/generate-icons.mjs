// Generates the PWA/brand PNG icons from the Pritio mark.
// Also emits the native iOS assets (AppIcon + Splash) reusing the mark.
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "public", "brand");

const BACKGROUND = "#F4F7F8";
const SPLASH_GREEN = "#4fc38a";

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

// ─── Assets nativos iOS ────────────────────────────────────────────
// AppIcon: cuadrado a sangre completo (verde) porque iOS aplica su propia
// máscara de esquinas redondeadas. Splash: verde con el logo centrado,
// el storyboard la escala como scaleAspectFill.
const iosIconDir = join(rootDir, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
const iosSplashDir = join(rootDir, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
mkdirSync(iosIconDir, { recursive: true });
mkdirSync(iosSplashDir, { recursive: true });

function write(name, size, fraction, background) {
  const resvg = new Resvg(svg(size, fraction, background), { fitTo: { mode: "original" } });
  writeFileSync(join(iosIconDir, name), resvg.render().asPng());
  console.log(`✓ ios/AppIcon ${name} (${size}x${size})`);
}

function writeSplash(name, size, fraction, background) {
  const resvg = new Resvg(svg(size, fraction, background), { fitTo: { mode: "original" } });
  writeFileSync(join(iosSplashDir, name), resvg.render().asPng());
  console.log(`✓ ios/Splash ${name} (${size}x${size})`);
}

write("AppIcon-512@2x.png", 1024, 0.5, SPLASH_GREEN);
writeSplash("splash-2732x2732.png", 2732, 0.18, SPLASH_GREEN);
writeSplash("splash-2732x2732-1.png", 2732, 0.18, SPLASH_GREEN);
writeSplash("splash-2732x2732-2.png", 2732, 0.18, SPLASH_GREEN);
