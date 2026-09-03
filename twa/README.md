# App Android (TWA) — Pritio

La app de Android envuelve la PWA (**`https://pritio.clipot.com.mx`**) en un
**Trusted Web Activity** usando [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
Un solo código (la web), actualizaciones automáticas (siempre sirve la PWA más
reciente) y presencia en Play Store.

## Requisitos

- PWA desplegada y funcional en `https://pritio.clipot.com.mx`
  (manifest + service worker + iconos + HTTPS).
- **JDK 17** en el `PATH` (`JAVA_HOME`). Se instaló Eclipse Temurin 17 vía
  `winget install --id EclipseAdoptium.Temurin.17.JDK`.
- **Android SDK** (`ANDROID_HOME` / `ANDROID_SDK_ROOT`, o `twa/local.properties`
  con `sdk.dir`). Se usa el de `%LOCALAPPDATA%\Android\Sdk`.

## Dominio

El manifest apunta a **`pritio.clipot.com.mx`** (el dominio vivo de la PWA).
Nota: `app.pritio.com.mx` **no existe / no resuelve** — no usarlo para el TWA.

## Generar el proyecto (una vez)

Bubblewrap genera el proyecto Android a partir del manifest webmanifest. Si
necesitas regenerar la estructura de `twa/` desde cero:

```bash
npm run twa:init -- --manifest https://pritio.clipot.com.mx/manifest.webmanifest --directory twa
```

El proyecto generado (carpetas `app/`, `gradle/`, wrappers, `build/`) **no se
versiona** (ver `twa/.gitignore`); puede regenerarse. Los archivos versionados
son `twa-manifest.json`, `twa-manifest.example.json`, `README.md` y `.gitignore`.

## Keystore de firma (crítico)

`twa/android.keystore` se genera con **`keytool`** (alias `pritio`). Está
excluido de git (`twa/.gitignore`). **No debe perderse** (con él se firman las
actualizaciones instalables). Respáldalo fuera del repo.

Credenciales del keystore actual (para pruebas locales):

- Alias: `pritio`
- Contraseña (keystore y key): `pritio-keystore-2026`

Cuando regeneres el proyecto o cambies de keystore, actualiza también el bloque
`signingConfigs.release` en `twa/app/build.gradle`.

## Construir el APK instalable (cada versión)

Para un **APK firmado instalable directo** (side-loading, sin Play):

```bash
# Desde twa/ (con JAVA_HOME + ANDROID_HOME configurados)
./gradlew assembleRelease
```

Resultado: `twa/app/build/outputs/apk/release/app-release.apk` (firmado, ~1 MB).
Cópialo a la raíz con un nombre descriptivo (p. ej. `pritio-<version>-release.apk`)
e instálalo con `adb install` o copiándolo al teléfono.

Requiere haber configurado la firma en `twa/app/build.gradle`
(`signingConfigs.release` con la ruta/alias/contraseñas del keystore).

## AAB para Play Store (cuando se necesite)

```bash
npm run twa:build
```

Bubblewrap genera el **AAB firmado** (`*_release_signed.aab`) listo para Play
Console y también el APK. Requiere JDK + SDK y que Bubblewrap tenga
`cmdline-tools`; define las contraseñas vía
`BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD` para evitar prompts.

## Digital Asset Links (verificación de propiedad)

La verificación usa la huella (SHA-256) del certificado con el que se firma el
APK/AAB. Ya se completó `public/.well-known/assetlinks.json` con la huella real
del keystore actual:

```
F1:78:E9:77:23:27:DF:F7:7A:EF:14:A5:F2:42:5B:C7:37:9A:DA:07:FF:FB:38:D4:1C:AD:11:19:DF:0B:AA:B9
```

Si cambias el keystore, recalcula la huella:

```bash
# SHA-256 del certificado
keytool -list -v -keystore android.keystore -storepass <pass> | Select-String "SHA256"
```

y **pública** el archivo en el dominio web:
`https://pritio.clipot.com.mx/.well-known/assetlinks.json` (es lo que verifica
Google). Sin la verificación el TWA igual se instala y funciona, pero abre en
Custom Tab (con barra de navegación) en lugar de full-screen.

## Play Store

1. Cuenta de **Play Developer** ($25 USD, pago único).
2. Play Console → *Crear aplicación* → subir el `.aab`.
3. La app es **gratuita** (login + free tier). Las suscripciones Pro se
   compran en la web (Stripe). No usa Play Billing.
4. Push notifications en el TWA usan **web push** (VAPID) — las mismas llaves
   del proyecto web.
