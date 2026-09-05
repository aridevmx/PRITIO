#!/usr/bin/env node
// Release de la app nativa Android (Capacitor).
//
// Hace:
//   1. Verifica que CAPACITOR_ANDROID_VERSION (versionName) coincide con APP_VERSION (branding).
//   2. Build web + `cap sync android`.
//   3. Compila APK release firmado y AAB (para Google Play).
//   4. Copia el APK a public/apk/pritio.apk (servido en /apk/pritio.apk).
//   5. Imprime las instrucciones restantes para publicar en Play Console.
//
// Uso:
//   node scripts/release-android.mjs
//
// Notas:
//   - Requiere que `org.gradle.java.home` apunte a un JDK 21+ (ver android/gradle.properties).
//   - El keystore de firma vive en android/app/signing/android.keystore y su backup
//     en C:\Users\Aridev\Pritio\backup-android.keystore. Nunca debe publicarse.

import { execSync } from "node:child_process";
import { copyFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url));
const androidDir = join(root, "android");

function run(cmd, cwd = root) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: process.platform === "win32" });
}

// 1. Coincidencia de versiones
const branding = readFileSync(join(root, "src", "lib", "branding.ts"), "utf8");
const appVersion = branding.match(/export const APP_VERSION = "([^"]+)";/)?.[1];
const buildGradle = readFileSync(join(androidDir, "app", "build.gradle"), "utf8");
const gradleVersion = buildGradle.match(/versionName\s+"([^"]+)"/)?.[1];

if (!appVersion || !gradleVersion) {
  console.error("No se pudo leer la versión de branding.ts o build.gradle.");
  process.exit(1);
}
if (appVersion !== gradleVersion) {
  console.error(
    `Versiones desalineadas: APP_VERSION=${appVersion} vs versionName=${gradleVersion}.\n` +
      "Sincroniza manualmente android/app/build.gradle antes de releasear.",
  );
  process.exit(1);
}
console.log(`Versiones OK: ${appVersion}`);

// 2. Build web + sync
run("npm run build");
run("npx cap sync android");

// 3. Compilar APK + AAB firmados
run(`${process.platform === "win32" ? "gradlew.bat" : "./gradlew"} assembleRelease bundleRelease`, androidDir);

// 4. Copiar APK al dominio
const apkSrc = join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
const apkDest = join(root, "public", "apk", "pritio.apk");
copyFileSync(apkSrc, apkDest);
const sizeMb = (statSync(apkDest).size / (1024 * 1024)).toFixed(2);
console.log(`APK copiado a public/apk/pritio.apk (${sizeMb} MB)`);

// 5. Instrucciones de Play
const aabPath = join(androidDir, "app", "build", "outputs", "bundle", "release", "app-release.aab");
console.log(`AAB listo: ${aabPath}`);
console.log("\n--- Para Google Play (cuando estés listo) ---");
console.log("1. Sube el AAB en Play Console > App > Releases > Create new release.");
console.log("2. Firma de publicación: Play App Signing usará el APK de subida; " +
  "generará su propia clave y los certificados del AAB deben coincidir con los del keystore reutilizado (alias pritio).");
console.log("3. Deep links: configura el scheme `pritio://` (ya registrado en el manifest) y " +
  "los enlaces universales si los usas con `.well-known/assetlinks.json`.");
console.log("4. FCM (opcional): añade google-services.json y @capacitor/push-notifications cuando actives push nativo.");