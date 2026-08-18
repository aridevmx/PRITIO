import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { initSentry } from "@/lib/sentry";
import App from "./App";
import "./index.css";

initSentry();
if (!window.__PRIO_DESKTOP__) {
  registerSW({ immediate: true });
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
