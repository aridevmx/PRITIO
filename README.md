# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Escritorio (Electron)

La SPA se envuelve en un wrapper de Electron que expone el puente
`window.__PRIO_DESKTOP__` (ver `src/lib/desktop.ts` y `electron/preload.cjs`).

### Comandos

```bash
npm run desktop:dev     # arranca Vite (si no está corriendo) y abre la app en Electron
npm run desktop:build   # build web + empaquetado (NSIS para Windows en release/)
npm run desktop:dir     # build + app desempaquetada (más rápido, sin instalador)
```

- En desarrollo se carga `http://localhost:5173`; si ya hay un Vite corriendo,
  se reutiliza.
- En producción se carga la build desde `dist/` vía el protocolo `app://bundle`
  (mantiene BrowserRouter y PKCE funcionando).

### Deep link de auth (`pritio://`)

Para que el magic link y la recuperación de contraseña vuelvan a la app de
escritorio (y no abran la web), el wrapper registra el protocolo `pritio://` y
el frontend redirige a `pritio://auth` / `pritio://auth/reset` en desktop.

Requisito en Supabase: **Auth → URL Configuration → Redirect URLs** debe incluir:

```
pritio://auth
pritio://auth/reset
https://app.pritio.com.mx/**
```

Y el **Site URL** debe ser `https://app.pritio.com.mx` (los templates de correo
usan `.ConfirmationURL`/`.SiteURL`, que se resuelven contra esa URL).

### Descarga, instalación y actualizaciones

- Los instaladores se publican automáticamente en **GitHub Releases**
  (`https://github.com/aridevmx/PRITIO/releases/latest`) en cada push a `main`
  (jobs `desktop` → Windows y `desktop-linux` → AppImage, después del bump de
  versión y tag `vX.Y.Z`).
- La página pública de descarga vive en `https://app.pritio.com.mx/download`
  (detecta el sistema operativo y enlaza el `.exe` o `.AppImage` según corre
  responda; la landing enlaza a esa página).
- La app usa **electron-updater**: al abrirla comprueba si hay una versión
  nueva en GitHub, la descarga en segundo plano y la instala al cerrar (o con
  "Reiniciar e instalar" desde *Mi cuenta → Acerca de*).
  - Windows: lee `latest.yml` (job `desktop`).
  - Linux: lee `latest-linux.yml` (job `desktop-linux`, **solo AppImage**;
    un `.deb` instalado no se auto-actualiza).
- Mientras no haya firma de código, Windows muestra el aviso de **SmartScreen**
  ("Editor desconocido") al instalar; se puede continuar con
  "Más información → Ejecutar de todos modos".
- La Release incluye `Pritio-Setup-<versión>.exe`, `latest.yml`,
  `*.exe.blockmap`, `Pritio-<versión>.AppImage` y `latest-linux.yml`.

## Web / PWA

- La web se sirve desde `https://app.pritio.com.mx` (Vercel).
- **PWA instalable**: manifest + service worker (`src/sw.js`, modo
  `injectManifest` de `vite-plugin-pwa`). Precache del app-shell, runtime cache
  *cache-first* para assets estáticos y fuentes, *network-first* para
  navegación. **No** se cachean llamadas a Supabase (siempre en línea).
- Iconos en `public/brand/`; se regeneran con `node scripts/generate-icons.mjs`.
- Botón *Instalar app* en *Mi cuenta → Acerca de* (muestra el prompt del
  navegador). En el escritorio, `https://app.pritio.com.mx/download` y la
  landing enlazan la descarga del instalador nativo.

### Push notifications (web / PWA / Android TWA)

- Suscripción VAPID y manejo de `push`/`notificationclick` en el service
  worker; las suscripciones se guardan en la tabla `push_subscriptions`.
- El permiso se pide explícitamente desde *Mi cuenta → Notificaciones*
  (toggle "Este dispositivo"), no al cargar la app.
- Envío: edge function `send-push` (ver `.env.example`).
  ```bash
  npx web-push generate-vapid-keys
  # VITE_VAPID_PUBLIC_KEY en el frontend
  # supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:admin@pritio.com.mx
  supabase functions deploy send-push
  ```

## Android (TWA)

La app de Android envuelve la PWA en un Trusted Web Activity. Ver
[`twa/README.md`](twa/README.md) para generar el proyecto, construir el `.aab`
y configurar los Digital Asset Links. Resumen:

```bash
npm run twa:init               # una vez: genera twa/twa-manifest.json + keystore
npm run twa:build              # por versión: produce el .aab firmado
npm run twa:update-assetlinks  # twa/assetlinks.json → public/.well-known/
```

- La app Android es **gratuita**; las suscripciones Pro se compran en la web
  (Stripe). No usa Play Billing.
- Requiere cuenta de **Play Developer** ($25 USD, pago único) para publicar.

## Notas

- El login con contraseña funciona sin configuración extra.
- El empaquetado usa `electronDist: ./node_modules/electron/dist` (versión
  instalada vía npm), lo que evita descargar/extraer el binario en cada build.
- Instalador y binarios se generan en `release/` (ignorado por git).
- macOS requiere build en macOS, cuenta de Apple Developer ($99/año),
  notarización y `.dmg`+`.zip`; se puede añadir como job futuro del CI.

