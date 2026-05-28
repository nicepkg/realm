import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DocsApp } from "./app.tsx";
import "./styles.css";
import "./responsive.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
