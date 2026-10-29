import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogApp } from "@covel/catalog-kit/ui";
import "@covel/catalog-kit/ui/styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><CatalogApp config={{
  kind: "plugins", title: "Plugins", repository: "https://github.com/covel-ai/covel-plugins",
  siteUrl: import.meta.env.VITE_SITE_URL || "https://plugins.covel.cc/", siblingUrl: import.meta.env.VITE_SIBLING_URL || "https://worlds.covel.cc/",
  apiBase: import.meta.env.VITE_CATALOG_API || undefined,
  catalogUrl: `${import.meta.env.BASE_URL}catalog.json`,
  guideUrl: "https://github.com/covel-ai/covel-plugins/blob/main/docs/publishing.md",
}} /></React.StrictMode>);
