import { CONTRACT, SERVICE_NAME } from "../../lib/contract.js";

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export default async function providers(ctx) {
  const providers = (await ctx.services.discover(CONTRACT))
    .filter((service) => service.name === SERVICE_NAME)
    .map(({ pluginId, name, description }) => ({
      pluginId,
      name,
      ...(description === undefined ? {} : { description }),
    }))
    .sort(
      (left, right) =>
        compare(left.pluginId, right.pluginId) ||
        compare(left.name, right.name),
    );

  return { outcome: "success", value: { providers } };
}
