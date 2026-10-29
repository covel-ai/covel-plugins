/** Storage can be unavailable even when the browser exposes localStorage. */
export function readPreference(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; }
  catch { return null; }
}

export function writePreference(key, value) {
  try { globalThis.localStorage?.setItem(key, value); }
  catch { /* The current tab can still use the selected preference. */ }
}

export function readTheme() {
  return readPreference("covel-theme") === "light" ? "light" : "dark";
}

export function readLocale() {
  return readPreference("covel-locale") === "zh-CN" ? "zh-CN" : "en-US";
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  const dark = theme !== "light";
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}
