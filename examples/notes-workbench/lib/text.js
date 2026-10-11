/**
 * Text that this plugin's code shows to the player. The code holds English;
 * `locales/<locale>.yaml` translates it under `messages`, and the host passes
 * the translations for the session's language as `ctx.messages`.
 *
 * This is the SDK's `translate` written out by hand, because the package is
 * standalone and has no dependencies. Pass the English text as a literal: the
 * validator reads it from the source to match translations.
 */
export function translate(ctx, text) {
  const translations = ctx?.messages?.translations;
  return translations && Object.hasOwn(translations, text)
    ? translations[text]
    : text;
}
