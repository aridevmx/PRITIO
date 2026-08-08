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
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
