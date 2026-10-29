import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readPreference, writePreference, readTheme, readLocale, applyTheme } from "../src/preferences.mjs";
import { themeBootstrap } from "../tools/theme-bootstrap.mjs";

function root() {
  const classes = new Set(["dark", "existing-class"]);
  return { classes, classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } }, style: {} };
}

test("synchronous head bootstrap defaults dark and preserves explicit light without writing storage", () => {
  const script = /<script data-covel-theme>\n([\s\S]+?)<\/script>/.exec(themeBootstrap())[1];
  for (const preference of [null, "light", "dark", "system", "", "invalid"]) {
    const element = root(); let writes = 0;
    runInNewContext(script, { document: { documentElement: element }, localStorage: {
      getItem(key) { assert.equal(key, "covel-theme"); return preference; },
      setItem() { writes++; },
    } });
    assert.equal(element.classes.has("dark"), preference !== "light");
    assert.equal(element.style.colorScheme, preference === "light" ? "light" : "dark");
    assert.ok(element.classes.has("existing-class"));
    assert.equal(writes, 0);
  }
  for (const storage of [undefined, { getItem() { throw new Error("SecurityError"); } }]) {
    const element = root();
    runInNewContext(script, { document: { documentElement: element }, localStorage: storage });
    assert.equal(element.style.colorScheme, "dark");
  }
  const element = root(), sandbox = { document: { documentElement: element } };
  Object.defineProperty(sandbox, "localStorage", { get() { throw new Error("Blocked storage getter"); } });
  runInNewContext(script, sandbox);
  assert.equal(element.style.colorScheme, "dark");
});

test("runtime theme and locale remain usable when storage access or persistence fails", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    assert.equal(readTheme(), "dark");
    assert.equal(readLocale(), "en-US");
    assert.equal(readPreference("any"), null);
    assert.doesNotThrow(() => writePreference("covel-theme", "light"));
    const element = root();
    applyTheme("light", element);
    assert.equal(element.classes.has("dark"), false);
    assert.equal(element.style.colorScheme, "light");
    applyTheme("dark", element);
    assert.equal(element.style.colorScheme, "dark");

    const saved = new Map([["covel-theme", "light"], ["covel-locale", "zh-CN"]]);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: key => saved.get(key) ?? null,
      setItem() { throw new Error("QuotaExceededError"); },
    } });
    assert.equal(readTheme(), "light");
    assert.equal(readLocale(), "zh-CN");
    assert.doesNotThrow(() => writePreference("covel-theme", "dark"));
    assert.doesNotThrow(() => writePreference("covel-locale", "en-US"));
    globalThis.localStorage.setItem = (key, value) => saved.set(key, value);
    writePreference("covel-theme", "dark");
    writePreference("covel-locale", "en-US");
    assert.equal(readTheme(), "dark");
    assert.equal(readLocale(), "en-US");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
