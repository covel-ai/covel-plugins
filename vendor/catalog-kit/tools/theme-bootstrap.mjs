import { fileURLToPath } from "node:url";
import path from "node:path";
import { readPreference, readTheme, applyTheme } from "../src/preferences.mjs";

/** Inline this in <head>, before styles/modules, and keep <html class="dark">.
 * The synchronous script uses the exact preference functions used by React.
 * Initialization never persists a preference. Palette fallbacks cover the time
 * before the main stylesheet supplies --frame and --foreground.
 */
export function themeBootstrap() {
  const script = [readPreference, readTheme, applyTheme].map(fn => fn.toString()).join("\n");
  return `<!-- covel-theme:start -->
<meta name="color-scheme" content="dark light" />
<style data-covel-theme>
html { color-scheme: light; background: var(--frame, #edf0ea); color: var(--foreground, #27332e); }
html.dark { color-scheme: dark; background: var(--frame, #121915); color: var(--foreground, #e7ece6); }
</style>
<script data-covel-theme>
(() => {
${script}
applyTheme(readTheme());
})();
</script>
<!-- covel-theme:end -->`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${themeBootstrap()}\n`);
}
