import { cp, rm } from "node:fs/promises";
const destination = new URL("../../dist/", import.meta.url);
await rm(destination, { recursive: true, force: true });
await cp(new URL("../../site/dist/", import.meta.url), destination, { recursive: true });
