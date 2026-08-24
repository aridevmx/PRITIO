import { defineConfig, type Plugin } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "url";
import { resolveBranding } from "./src/lib/branding";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const { name: APP_NAME, tagline: APP_TAGLINE } = resolveBranding(env);

  function brandHtml(): Plugin {
    return {
      name: "brand-html",
      transformIndexHtml(html) {
        return html
          .replaceAll("__APP_NAME__", APP_NAME)
          .replaceAll("__APP_TAGLINE__", APP_TAGLINE);
      },
    };
  }

  return {
  plugins: [
    react(),
    brandHtml(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      includeAssets: ["favicon.svg", "icons.svg", "brand/apple-touch-icon.png"],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_TAGLINE,
        theme_color: "#F4F7F8",
        background_color: "#F4F7F8",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "es",
        categories: ["productivity"],
        icons: [
          {
            src: "/brand/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/brand/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/brand/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        swSrc: "src/sw.js",
        rollupFormat: "iife",
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: "classic",
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `jsdom` loads undici 8.x, which requires Node >= 22 (webidl.util.markAsUncloneable).
    // Tests that need a DOM must opt in per-file with: // @vitest-environment jsdom
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  };
});
