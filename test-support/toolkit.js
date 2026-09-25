// packages/tools/src/tool.ts
import { ZodError } from "zod";
var ToolValidationError = class extends Error {
  code = "VALIDATION_ERROR";
  details;
  constructor(zodError) {
    super("Tool parameter validation failed");
    this.name = "ToolValidationError";
    this.details = zodError.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    }));
  }
};
function tool(definition) {
  let jsonSchema;
  try {
    const params = definition.parameters;
    const raw = params.toJSONSchema();
    const { $schema: _drop, ...rest } = raw;
    jsonSchema = rest;
  } catch {
    jsonSchema = { type: "object" };
  }
  return {
    _type: "covel-tool",
    name: definition.name,
    description: definition.description,
    parametersSchema: definition.parameters,
    jsonSchema,
    async execute(params, context) {
      let validated;
      try {
        validated = definition.parameters.parse(params);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new ToolValidationError(err);
        }
        throw err;
      }
      return definition.execute(validated, context);
    },
  };
}

// packages/tools/src/short-id.ts
function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 24)
    .replace(/-$/, "");
}
function shortId(prefix, label, _sessionId) {
  const slug = slugify(label);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return [prefix, ...(slug ? [slug] : []), nonce].join("-");
}

// packages/tools/src/result.ts
var TOOL_PENDING_PROPOSALS = /* @__PURE__ */ Symbol.for(
  "covel.tools.pendingProposals",
);
var TOOL_EMITTED_EVENTS = /* @__PURE__ */ Symbol.for(
  "covel.tools.emittedEvents",
);
var TOOL_EXECUTION_ENVELOPE = /* @__PURE__ */ Symbol.for(
  "covel.tools.executionEnvelope",
);
function isExecutionEnvelope(value) {
  return (
    !!value &&
    typeof value === "object" &&
    value[TOOL_EXECUTION_ENVELOPE] === true
  );
}
function getToolContent(value) {
  return isExecutionEnvelope(value) ? value.content : value;
}
function getPendingProposals(value) {
  if (isExecutionEnvelope(value)) {
    return value.pendingProposals ?? [];
  }
  if (value !== null && typeof value === "object") {
    const proposals = value[TOOL_PENDING_PROPOSALS];
    if (Array.isArray(proposals)) {
      return proposals;
    }
  }
  return [];
}
function getEmittedEvents(value) {
  if (isExecutionEnvelope(value)) {
    return value.emittedEvents;
  }
  if (value !== null && typeof value === "object") {
    const events = value[TOOL_EMITTED_EVENTS];
    if (Array.isArray(events)) {
      return events;
    }
  }
  return void 0;
}

// <stdin>
import { z } from "zod";
export {
  getEmittedEvents,
  getPendingProposals,
  getToolContent,
  shortId,
  tool,
  z,
};
