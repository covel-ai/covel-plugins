import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/site", fullyParallel: true, timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "VITE_CATALOG_API=http://127.0.0.1:8787 pnpm --filter @covel/directory-site exec vite build --emptyOutDir --outDir ../artifacts/browser-site && pnpm --filter @covel/directory-site exec vite preview --outDir ../artifacts/browser-site --port 4173 --host 127.0.0.1",
    url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI,
  },
});
