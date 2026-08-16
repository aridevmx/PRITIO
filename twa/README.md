# App Android (TWA) — Pritio

La app de Android envuelve la PWA (`https://app.pritio.com.mx`) en un
**Trusted Web Activity** usando [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
Un solo código (la web), actualizaciones automáticas (siempre sirve la PWA más
reciente) y presencia en Play Store.

## Requisitos

- PWA desplegada y funcional en `https://app.pritio.com.mx`
  (manifest + service worker + iconos + HTTPS).
- JDK 11+ y Android SDK (`ANDROID_HOME` o `ANDROID_SDK_ROOT`) — típicamente
  instalando [Android Studio](https://developer.android.com/studio).
- Java en el `PATH` (Bubblewrap invoca `keytool`).

## Generar el proyecto (una vez)

```bash
# Debe haber un manifest.webmanifest válido en el dominio de la PWA.
npx @bubblewrap/cli init \
  --manifest https://app.pritio.com.mx/manifest.webmanifest \
  --directory twa
```

Responde el prompt (package id: `com.pritio.app`, alias de la llave: `pritio`,
etc.). Creará `twa/twa-manifest.json` y `twa/android.keystore`. El keystore
**no debe perderse** (es con lo que se firman las actualizaciones de Play).
Guárdalo fuera de git y respáldalo.

Ver el ejemplo en `twa/twa-manifest.example.json`.

## Construir el AAB (cada versión)

```bash
npm run twa:build
```

Genera `twa/project-name-release-signed.aab` (o similar) listo para subir a
Play Console.

## Digital Asset Links (verificación de propiedad)

La verificación usa la huella (SHA-256) del certificado con el que se firma el
APK/AAB. Tras el primer build, Bubblewrap escribe `twa/assetlinks.json` con la
huella correcta. Copialo al origen web:

```bash
npm run twa:update-assetlinks
```

Esto sobreescribe `public/.well-known/assetlinks.json` (se sirve en
`https://app.pritio.com.mx/.well-known/assetlinks.json`, que es lo que verifica
Google). Verifica con:

```bash
curl https://app.pritio.com.mx/.well-known/assetlinks.json
```

Si cambias el keystore de firma en el futuro, vuelve a ejecutar
`npm run twa:build && npm run twa:update-assetlinks`.

## Play Store

1. Cuenta de **Play Developer** ($25 USD, pago único).
2. Play Console → *Crear aplicación* → subir el `.aab`.
3. La app es **gratuita** (login + free tier). Las suscripciones Pro se
   compran en la web (Stripe). No usa Play Billing.
4. Push notifications en el TWA usan **web push** (VAPID) — las mismas llaves
   del proyecto web.

## Scripts disponibles

```bash
npm run twa:init              # bubblewrap init (genera el proyecto)
npm run twa:build             # bubblewrap build (AAB firmado)
npm run twa:update-assetlinks # copia twa/assetlinks.json → public/.well-known/
```
