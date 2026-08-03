import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSentry } from "@/lib/sentry";
import App from "./App";
import "./index.css";

initSentry();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
