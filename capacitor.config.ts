import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pritio.app",
  appName: "Pritio",
  webDir: "dist",
  server: {
    // Sirve los assets desde https://localhost en el WebView para que fetch,
    // WebSocket (Supabase Realtime) y el heartbeat offline funcionen sin
    // mixed-content. Es la config por defecto recomendada por Capacitor.
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // Oculta el splash cuando la web termina de cargar (evita parpadeo).
      launchShowDuration: 2000,
      showSpinner: false,
      backgroundColor: "#4fc38a",
    },
  },
};

export default config;
