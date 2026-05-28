import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./app/app-shell.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  </StrictMode>,
);
