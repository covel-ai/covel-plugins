import { readFile } from "node:fs/promises";
import { policySchema } from "../../packages/catalog-kit/src/schema.mjs";
import { serviceUrl } from "../../packages/catalog-kit/src/publish.mjs";

try {
  const policy = policySchema.parse(JSON.parse(await readFile(new URL("../../catalog/policy.json", import.meta.url), "utf8")));
  if (Date.parse(policy.expiresAt) <= Date.now()) throw new Error("Expired policy");
  const token = process.env.CATALOG_POLICY_TOKEN;
  if (!token || token.length < 32) throw new Error("Missing policy credential");
  const response = await fetch(`${serviceUrl(process.env.CATALOG_API_URL)}/admin/policy`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(policy) });
  if (!response.ok) throw new Error("Policy publication failed");
  console.log(`Published policy sequence ${policy.sequence}`);
} catch { console.error("Policy publication failed. Verify the HTTPS origin, scoped secret, current expiry and increasing sequence. No credentials or service response bodies are logged."); process.exitCode = 1; }
