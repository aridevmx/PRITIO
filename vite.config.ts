import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { APP_NAME, APP_TAGLINE } from "./src/lib/branding";

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

export default defineConfig({
  plugins: [react(), brandHtml()],
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
});
