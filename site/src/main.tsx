import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogApp } from "../../packages/catalog-kit/ui/catalog-app";
import "../../packages/catalog-kit/ui/styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><CatalogApp config={{
  kind: "plugins", title: "Plugins", repository: "https://github.com/covel-ai/covel-plugins",
  siteUrl: "https://covel-ai.github.io/covel-plugins/", siblingUrl: "https://covel-ai.github.io/covel-worlds/",
  apiBase: import.meta.env.VITE_CATALOG_API || undefined,
  catalogUrl: `${import.meta.env.BASE_URL}catalog.json`,
  guideUrl: "https://github.com/covel-ai/covel-plugins/blob/main/docs/publishing.md",
}} /></React.StrictMode>);
