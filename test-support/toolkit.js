// packages/plugin-handlers-utils/src/json-text.ts
var EXTRA_CLOSERS = 4;
var AFTER_STRING = /* @__PURE__ */ new Set([",", "}", "]", ":"]);
var NOT_PARSED = /* @__PURE__ */ Symbol("not parsed");
function withoutExtraClosers(text) {
  let rest = text.trimEnd();
  for (let dropped = 0; dropped <= EXTRA_CLOSERS; dropped += 1) {
    try {
      return JSON.parse(rest);
    } catch {
      if (!/[\]}]$/.test(rest)) break;
      rest = rest.slice(0, -1).trimEnd();
    }
  }
  return NOT_PARSED;
}
var nextAfterSpace = (text, from) => {
  let index = from;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
};
function escapeInnerQuotes(text) {
  let out = "";
  let inString = false;
  let escapedHere = 0;
  let escaped = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!inString) {
      if (char === '"') {
        inString = true;
        escapedHere = 0;
      }
      out += char;
      continue;
    }
    if (char === "\\") {
      out += char + (text[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (char !== '"') {
      out += char;
      continue;
    }
    const next = nextAfterSpace(text, i + 1);
    const after = text[next];
    const ends = after === void 0 || AFTER_STRING.has(after);
    const closesQuotedText = after === '"' && next === i + 1 && endsString(text, next);
    if (ends || after === '"' && !closesQuotedText) {
      if (escapedHere > 0 && (escapedHere % 2 === 1 || after === ":"))
        return void 0;
      inString = false;
      out += char;
    } else {
      escapedHere += 1;
      escaped += 1;
      out += '\\"';
    }
  }
  return escaped > 0 ? out : void 0;
}
function endsString(text, index) {
  const after = text[nextAfterSpace(text, index + 1)];
  return after === void 0 || AFTER_STRING.has(after);
}
function closeOpenElements(text) {
  const open = [];
  let comma = -1;
  const missing = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (/\s/.test(char)) continue;
    if (char === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i += 1)
        if (text[i] === "\\") i += 1;
      comma = -1;
      continue;
    }
    if (char === "{" && comma >= 0 && open.at(-1) === "{" && open.at(-2) === "[") {
      missing.push(comma);
      open.pop();
    }
    if (char === "{" || char === "[") open.push(char);
    else if (char === "}" || char === "]") open.pop();
    comma = char === "," ? i : -1;
  }
  if (missing.length === 0) return void 0;
  let out = "";
  let from = 0;
  for (const at of missing) {
    out += `${text.slice(from, at)}}`;
    from = at;
  }
  return out + text.slice(from);
}
function withMatchingClosers(text, closeAtEnd) {
  const open = [];
  let out = "";
  let changed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      let end = i + 1;
      for (; end < text.length && text[end] !== '"'; end += 1)
        if (text[end] === "\\") end += 1;
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (char === "{" || char === "[") open.push(char);
    else if (char === "}" || char === "]") {
      const top = open.at(-1);
      const matching = top === "{" ? "}" : top === "[" ? "]" : void 0;
      if (matching !== void 0 && char !== matching) {
        changed = true;
        if (text.slice(i + 1).trim() === "") {
          out += matching;
          open.pop();
        }
        continue;
      }
      open.pop();
    }
    out += char;
  }
  if (closeAtEnd && open.length > 0) {
    changed = true;
    out = out.trimEnd() + open.reverse().map((bracket) => bracket === "{" ? "}" : "]").join("");
  }
  return changed ? out : void 0;
}
function withoutRepeatedOpening(text) {
  let out = "";
  let changed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{" && text.startsWith('"{"', i + 1) && /[\p{L}_]/u.test(text[i + 4] ?? "")) {
      out += char;
      i += 2;
      changed = true;
      continue;
    }
    if (char === '"') {
      let end = i + 1;
      for (; end < text.length && text[end] !== '"'; end += 1)
        if (text[end] === "\\") end += 1;
      out += text.slice(i, end + 1);
      i = end;
      continue;
    }
    out += char;
  }
  return changed ? out : void 0;
}
function parseJsonText(text, options) {
  try {
    return JSON.parse(text);
  } catch (error) {
    for (const candidate of [text, escapeInnerQuotes(text)]) {
      if (candidate === void 0) continue;
      const value = withoutExtraClosers(candidate);
      if (value !== NOT_PARSED) return value;
      for (const settled of [
        closeOpenElements(candidate),
        withMatchingClosers(candidate, options?.complete === true),
        withoutRepeatedOpening(candidate)
      ]) {
        if (settled === void 0) continue;
        try {
          return JSON.parse(settled);
        } catch {
        }
      }
    }
    throw error;
  }
}

// packages/plugin-handlers-utils/src/tool.ts
var ToolValidationError = class extends Error {
  code = "VALIDATION_ERROR";
  details;
  /**
   * @param messages - A more specific message for an issue path, used in
   *   place of Zod's when one exists.
   */
  constructor(zodError, messages) {
    super("Tool parameter validation failed");
    this.name = "ToolValidationError";
    this.details = zodError.issues.map((issue) => {
      const path = issue.path.join(".");
      return {
        path: path || "(root)",
        message: (issue.code === "invalid_type" ? messages?.get(path) : void 0) ?? issue.message
      };
    });
  }
};
var isStructure = (value, expected) => expected === "array" ? Array.isArray(value) : value !== null && typeof value === "object" && !Array.isArray(value);
function jsonTextProblem(text, expected, parseError) {
  const structure = expected === "array" ? "an array" : "an object";
  const send = `Send ${expected === "array" ? "the array" : "the object"} itself as the value, not a string that contains it.`;
  if (parseError === void 0)
    return `Expected ${structure}, but received text that holds another JSON type. ${send}`;
  const reason = parseError instanceof Error ? parseError.message : "";
  const position = Number(/position (\d+)/.exec(reason)?.[1]);
  const near = Number.isInteger(position) ? ` near \`${text.slice(Math.max(0, position - 40), position + 20)}\`` : "";
  return `Expected ${structure}, but received text that is not valid JSON: ${reason.slice(0, 160)}${near}. ${send}`;
}
function withParsedJsonText(params, issues) {
  const problems = /* @__PURE__ */ new Map();
  let repaired;
  for (const issue of issues) {
    if (issue.code !== "invalid_type" || issue.expected !== "array" && issue.expected !== "object" || issue.path.length === 0)
      continue;
    repaired ??= structuredClone(params);
    let parent = repaired;
    for (const key2 of issue.path.slice(0, -1))
      parent = parent?.[key2];
    if (parent === null || typeof parent !== "object") continue;
    const record = parent;
    const key = issue.path[issue.path.length - 1];
    const text = record[key];
    if (typeof text !== "string") continue;
    if (!/^\s*[[{]/.test(text)) continue;
    const path = issue.path.join(".");
    try {
      const parsed = parseJsonText(text, { complete: true });
      if (isStructure(parsed, issue.expected)) record[key] = parsed;
      else problems.set(path, jsonTextProblem(text, issue.expected));
    } catch (error) {
      problems.set(path, jsonTextProblem(text, issue.expected, error));
    }
  }
  return { repaired, problems };
}
var SCHEMA_MAPS = /* @__PURE__ */ new Set(["properties", "$defs", "definitions"]);
var SCHEMA_LISTS = /* @__PURE__ */ new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
var SCHEMAS = /* @__PURE__ */ new Set([
  "items",
  "additionalProperties",
  "propertyNames",
  "contains",
  "not",
  "if",
  "then",
  "else"
]);
function withPortablePatterns(schema) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema))
    return schema;
  const portable = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "pattern" && typeof value === "string" && /\\[pP]\{/.test(value))
      continue;
    if (SCHEMA_MAPS.has(key) && value !== null && typeof value === "object")
      portable[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          withPortablePatterns(child)
        ])
      );
    else if (SCHEMA_LISTS.has(key) && Array.isArray(value))
      portable[key] = value.map(withPortablePatterns);
    else if (SCHEMAS.has(key)) portable[key] = withPortablePatterns(value);
    else portable[key] = value;
  }
  return portable;
}
function tool(definition) {
  let jsonSchema;
  try {
    const raw = definition.parameters.toJSONSchema({ io: "input" });
    const { $schema: _drop, ...rest } = raw;
    jsonSchema = withPortablePatterns(rest);
  } catch (cause) {
    throw new Error(
      `Tool "${definition.name}" parameters cannot be represented as JSON Schema: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
  }
  return {
    _type: "covel-tool",
    name: definition.name,
    description: definition.description,
    parametersSchema: definition.parameters,
    jsonSchema,
    async execute(params, context) {
      let result = definition.parameters.safeParse(params);
      let problems;
      if (!result.success) {
        const parsed = withParsedJsonText(params, result.error.issues);
        problems = parsed.problems;
        if (parsed.repaired !== void 0)
          result = definition.parameters.safeParse(parsed.repaired);
      }
      if (!result.success)
        throw new ToolValidationError(result.error, problems);
      const validated = result.data;
      return definition.execute(
        validated,
        context
      );
    }
  };
}

// packages/plugin-handlers-utils/src/short-id.ts
var MAX_SLUG_LENGTH = 32;
var randomPart = (random) => random ? random.int(0, 2 ** 32).toString(16).padStart(8, "0") : crypto.randomUUID().replaceAll("-", "").slice(0, 8);
function wordSlug(label) {
  return (label.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-").slice(0, MAX_SLUG_LENGTH).replace(/-$/, "");
}
function shortId(prefix, label, _sessionId, random) {
  return [prefix, wordSlug(label), randomPart(random)].filter(Boolean).join("-");
}

// packages/plugin-handlers-utils/src/tool-result.ts
function isToolResult(value) {
  return value !== null && typeof value === "object" && "kind" in value && value.kind === "covel.tool-result";
}
function getToolContent(value) {
  return isToolResult(value) ? value.content : value;
}
function getPendingProposals(value) {
  return isToolResult(value) ? value.pendingProposals : [];
}
function getEmittedEvents(value) {
  return isToolResult(value) ? value.emittedEvents : void 0;
}

// <stdin>
import { z } from "zod";
export {
  getEmittedEvents,
  getPendingProposals,
  getToolContent,
  shortId,
  tool,
  z
};
