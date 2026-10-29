export function readPreference(key: string): string | null;
export function writePreference(key: string, value: string): void;
export function readTheme(): "dark" | "light";
export function readLocale(): "en-US" | "zh-CN";
export function applyTheme(theme: "dark" | "light", root?: HTMLElement): void;
