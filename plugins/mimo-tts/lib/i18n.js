/**
 * Text helpers, the same contract as `translate` / `labelText` of
 * `@covel/plugin-handlers-utils`. This package is standalone (no
 * dependencies, no build step), so it carries its own copy.
 *
 * The host hands each handler this plugin's translations as `ctx.messages`,
 * read from the `messages` section of `locales/<locale>.yaml`. The English
 * text in code is the key, so callers pass it as a string literal and put
 * the values that change in `{name}` placeholders.
 */

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * The text in the session's content language, with each `{name}` replaced
 * from `params`. Without `ctx.messages` (a test context) it is the English.
 *
 * @param {{ messages?: { translations?: Record<string, string> } } | undefined} ctx
 * @param {string} text
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function translate(ctx, text, params) {
  const translations = ctx?.messages?.translations;
  const template =
    translations && Object.hasOwn(translations, text)
      ? translations[text]
      : text;
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * The text in every language the plugin ships, for data only the client
 * draws (a badge); the client picks the player's UI language. Without a
 * translation it is the English string.
 *
 * @param {{ messages?: { labels?: Record<string, Record<string, string>> } } | undefined} ctx
 * @param {string} text
 * @returns {string | Record<string, string>}
 */
export function labelText(ctx, text) {
  const labels = ctx?.messages?.labels;
  if (!labels || !Object.hasOwn(labels, text)) return text;
  return { en: text, ...labels[text] };
}
