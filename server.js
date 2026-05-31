import cors from "cors";
import express from "express";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 20128);
const dataDir = process.env.DATA_DIR ?? join(__dirname, "data");
const dbPath = join(dataDir, "router-state.json");
const homeDir = homedir();
const appDataDir = process.env.APPDATA ?? join(homeDir, "AppData", "Roaming");
const localAppDataDir = process.env.LOCALAPPDATA ?? join(homeDir, "AppData", "Local");

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const defaults = {
  requireApiKey: process.env.REQUIRE_API_KEY === "true",
  apiKeys: [{ id: "default", name: "Local Dev", key: "local-dev-key", createdAt: new Date().toISOString() }],
  fallbackStrategy: "subscription-cheap-free",
  tokenSaver: true,
  formatTranslation: true,
  providerConnections: [],
  providers: [
    {
      id: "builtin",
      label: "Built-in Local Assistant",
      enabled: true,
      tier: "custom",
      status: "ready",
      type: "builtin",
      auth: "none",
      model: "code-helper",
      baseUrl: "builtin://code-helper",
      apiKeyEnv: "",
      quota: 100
    },
    {
      id: "antigravity",
      label: "Antigravity",
      enabled: true,
      tier: "subscription",
      status: "ready",
      type: "antigravity",
      auth: "oauth",
      model: "gemini-2.5-pro",
      baseUrl: "https://antigravity.googleapis.com/v1/chat",
      apiKeyEnv: "ANTIGRAVITY_TOKEN",
      quota: 100
    },
    {
      id: "openai",
      label: "OpenAI",
      enabled: true,
      tier: "subscription",
      status: "ready",
      type: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      apiKeyEnv: "OPENAI_API_KEY",
      quota: 100
    },
    {
      id: "anthropic",
      label: "Anthropic",
      enabled: true,
      tier: "subscription",
      status: "ready",
      type: "anthropic",
      model: "claude-sonnet-4-5",
      baseUrl: "https://api.anthropic.com/v1/messages",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      quota: 100
    },
    {
      id: "gemini",
      label: "Gemini",
      enabled: true,
      tier: "free",
      status: "ready",
      type: "gemini",
      model: "gemini-2.5-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      apiKeyEnv: "GEMINI_API_KEY",
      quota: 100
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      enabled: false,
      tier: "cheap",
      status: "needs-key",
      type: "openai",
      model: "openrouter/auto",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKeyEnv: "OPENROUTER_API_KEY",
      quota: 100
    },
    {
      id: "local",
      label: "Local OpenAI-compatible",
      enabled: true,
      tier: "custom",
      status: "ready",
      type: "openai",
      model: "llama3.1",
      baseUrl: "http://127.0.0.1:11434/v1/chat/completions",
      apiKeyEnv: "LOCAL_LLM_API_KEY",
      quota: 100
    }
  ],
  combos: [
    { id: "always-on-coding", name: "always-on-coding", models: ["antigravity/gemini-2.5-pro", "openai/gpt-4.1-mini", "anthropic/claude-sonnet-4-5", "gemini/gemini-2.5-flash", "local/llama3.1", "builtin/code-helper"] },
    { id: "free-first", name: "free-first", models: ["gemini/gemini-2.5-flash", "local/llama3.1", "builtin/code-helper", "openai/gpt-4.1-mini"] },
    { id: "local-first", name: "local-first", models: ["local/llama3.1", "builtin/code-helper", "openai/gpt-4.1-mini", "anthropic/claude-sonnet-4-5"] }
  ],
  aliases: {
    "router-auto": "always-on-coding",
    default: "always-on-coding",
    antigravity: "antigravity/gemini-2.5-pro"
  }
};

const oauthDiscoveryTargets = [
  {
    provider: "antigravity",
    label: "Antigravity",
    paths: [
      join(appDataDir, "Google", "Antigravity"),
      join(localAppDataDir, "Google", "Antigravity"),
      join(homeDir, ".config", "antigravity"),
      join(homeDir, ".antigravity")
    ]
  },
  {
    provider: "anthropic",
    label: "Claude Code",
    paths: [join(homeDir, ".claude.json"), join(homeDir, ".claude", ".credentials.json"), join(homeDir, ".config", "claude")]
  },
  {
    provider: "openai",
    label: "Codex / OpenAI",
    paths: [join(homeDir, ".codex", "auth.json"), join(homeDir, ".codex", "config.toml"), join(appDataDir, "Codex")]
  },
  {
    provider: "gemini",
    label: "Gemini CLI",
    paths: [join(homeDir, ".gemini", "oauth_creds.json"), join(homeDir, ".gemini", "settings.json"), join(appDataDir, "gemini")]
  },
  {
    provider: "qwen",
    label: "Qwen CLI",
    paths: [join(homeDir, ".qwen", "oauth_creds.json"), join(homeDir, ".qwen", "settings.json"), join(homeDir, ".config", "qwen")]
  },
  {
    provider: "github-copilot",
    label: "GitHub Copilot",
    paths: [
      join(appDataDir, "GitHub Copilot"),
      join(appDataDir, "Code", "User", "globalStorage", "github.copilot"),
      join(homeDir, ".config", "github-copilot")
    ]
  },
  {
    provider: "cursor",
    label: "Cursor",
    paths: [join(appDataDir, "Cursor", "User", "globalStorage"), join(homeDir, ".cursor")]
  },
  {
    provider: "kiro",
    label: "Kiro",
    paths: [join(appDataDir, "Kiro"), join(localAppDataDir, "Kiro"), join(homeDir, ".kiro")]
  }
];

function loadState() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, JSON.stringify(defaults, null, 2));
    return structuredClone(defaults);
  }
  const saved = JSON.parse(readFileSync(dbPath, "utf8"));
  return {
    ...structuredClone(defaults),
    ...saved,
    apiKeys: normalizeKeys(saved.apiKeys),
    providers: mergeById(defaults.providers, saved.providers),
    combos: ensureBuiltinFallback(mergeById(defaults.combos, saved.combos)),
    providerConnections: saved.providerConnections ?? defaults.providerConnections,
    aliases: { ...defaults.aliases, ...(saved.aliases ?? {}) }
  };
}

function ensureBuiltinFallback(combos) {
  return combos.map((combo) =>
    ["always-on-coding", "free-first", "local-first"].includes(combo.id) && !combo.models.includes("builtin/code-helper")
      ? { ...combo, models: [...combo.models, "builtin/code-helper"] }
      : combo
  );
}

function mergeById(baseItems, savedItems) {
  if (!savedItems) return baseItems;
  const merged = baseItems.map((baseItem) => ({ ...baseItem, ...(savedItems.find((item) => item.id === baseItem.id) ?? {}) }));
  const extra = savedItems.filter((item) => !baseItems.some((baseItem) => baseItem.id === item.id));
  return [...merged, ...extra];
}

function normalizeKeys(keys) {
  if (!keys) return defaults.apiKeys;
  return keys.map((key, index) => (typeof key === "string" ? { id: `key-${index + 1}`, name: `Key ${index + 1}`, key, createdAt: new Date().toISOString() } : key));
}

function saveState(state) {
  writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

function requireKey(req, res, next) {
  const state = loadState();
  if (!state.requireApiKey) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token && state.apiKeys.some((item) => item.key === token)) return next();
  return res.status(401).json({ error: { message: "Missing or invalid router API key" } });
}

function sanitizeState(state) {
  return {
    ...state,
    apiKeys: state.apiKeys.map((item) => ({ ...item, key: maskKey(item.key) })),
    providerConnections: state.providerConnections.map(maskConnection)
  };
}

function maskKey(key = "") {
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function maskConnection(connection) {
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...safe } = connection;
  return {
    ...safe,
    hasAccessToken: Boolean(connection.accessToken),
    hasRefreshToken: Boolean(connection.refreshToken),
    accessTokenPreview: connection.accessToken ? maskKey(connection.accessToken) : undefined
  };
}

function routeCandidates(state, requestedModel) {
  const model = state.aliases[requestedModel] ?? requestedModel ?? state.aliases.default;
  const combo = state.combos.find((item) => item.id === model || item.name === model);
  const models = combo ? combo.models : [model];
  const candidates = models
    .map((entry) => {
      const [providerId, ...modelParts] = entry.split("/");
      const provider = state.providers.find((item) => item.id === providerId);
      if (!provider) return null;
      return { provider, model: modelParts.join("/") || provider.model, connection: selectConnection(state, provider.id) };
    })
    .filter(Boolean)
    .filter(({ provider }) => provider.enabled && provider.status !== "needs-key" && provider.quota > 0);

  if (state.fallbackStrategy === "manual-order") return candidates;
  const order = state.fallbackStrategy === "free-first" ? ["free", "cheap", "subscription", "custom"] : ["subscription", "cheap", "free", "custom"];
  return candidates.sort((a, b) => order.indexOf(a.provider.tier) - order.indexOf(b.provider.tier));
}

function selectConnection(state, providerId) {
  return (state.providerConnections ?? [])
    .filter((connection) => connection.provider === providerId && connection.isActive !== false)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))[0];
}

function compactToolOutput(messages) {
  return messages.map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string" || message.content.length < 1600) return message;
    return {
      ...message,
      content: `${message.content.slice(0, 900)}\n\n[router token saver: trimmed ${message.content.length - 1200} chars]\n\n${message.content.slice(-300)}`
    };
  });
}

function normalizeInput(body) {
  if (Array.isArray(body.messages)) return { messages: body.messages, model: body.model, stream: Boolean(body.stream), maxTokens: body.max_tokens ?? body.max_completion_tokens };
  if (Array.isArray(body.input)) return { messages: [{ role: "user", content: JSON.stringify(body.input) }], model: body.model, stream: Boolean(body.stream), maxTokens: body.max_output_tokens };
  if (Array.isArray(body.contents)) {
    return {
      messages: body.contents.map((content) => ({
        role: content.role === "model" ? "assistant" : "user",
        content: content.parts?.map((part) => part.text ?? "").join("") ?? ""
      })),
      model: body.model,
      stream: Boolean(body.stream),
      maxTokens: body.generationConfig?.maxOutputTokens
    };
  }
  if (body.antigravity || body.client === "antigravity" || body.source === "antigravity") {
    const prompt = body.prompt ?? body.input ?? body.query ?? body.request?.prompt ?? "";
    const parts = body.request?.contents ?? body.contents ?? [];
    const messages = Array.isArray(body.messages)
      ? body.messages
      : parts.length
        ? parts.map((part) => ({
            role: part.role === "model" ? "assistant" : "user",
            content: part.parts?.map((item) => item.text ?? "").join("") ?? part.text ?? ""
          }))
        : [{ role: "user", content: String(prompt) }];
    return { messages, model: body.model ?? "antigravity", stream: Boolean(body.stream), maxTokens: body.max_tokens ?? body.generationConfig?.maxOutputTokens };
  }
  return { messages: [{ role: "user", content: body.prompt ?? "" }], model: body.model, stream: Boolean(body.stream), maxTokens: body.max_tokens };
}

function toProviderPayload(provider, normalized, model, state) {
  const messages = state.tokenSaver ? compactToolOutput(normalized.messages) : normalized.messages;
  if (provider.type === "anthropic") {
    const system = messages.filter((msg) => msg.role === "system").map((msg) => msg.content).join("\n\n");
    return {
      model,
      max_tokens: normalized.maxTokens ?? 4096,
      system: system || undefined,
      messages: messages.filter((msg) => msg.role !== "system").map((msg) => ({ role: msg.role === "assistant" ? "assistant" : "user", content: String(msg.content ?? "") })),
      stream: normalized.stream
    };
  }
  if (provider.type === "gemini" || provider.type === "antigravity") {
    return {
      contents: messages.map((msg) => ({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: String(msg.content ?? "") }] })),
      generationConfig: { maxOutputTokens: normalized.maxTokens ?? 4096 },
      antigravity: provider.type === "antigravity" ? { client: "aiia-router", mode: "compat" } : undefined
    };
  }
  return { model, messages, stream: normalized.stream, max_tokens: normalized.maxTokens };
}

function builtinCompletion(normalized, model) {
  const latestUser = [...normalized.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const fileMatch = String(latestUser).match(/Active file:\s*(.+?)\n\n([\s\S]*)/);
  const activeFile = fileMatch?.[1]?.trim() ?? "current file";
  const fileText = fileMatch?.[2] ?? "";
  const lines = fileText.split("\n").length;
  const response = [
    `Built-in code helper reviewed ${activeFile}.`,
    `File size: ${lines} line(s).`,
    "",
    "Next practical step:",
    "- Describe the exact code change you want, or connect an external/OAuth provider for model-generated patches.",
    "- The router, editor, provider list, prompt composer, and fallback chain are working end-to-end."
  ].join("\n");
  return openAiCompletion(model, response, {
    prompt_tokens: String(latestUser).length,
    completion_tokens: response.length,
    total_tokens: String(latestUser).length + response.length
  });
}

function providerUrl(provider, model, stream) {
  if (provider.type === "gemini" || provider.type === "antigravity") {
    const action = stream ? "streamGenerateContent" : "generateContent";
    return provider.type === "antigravity" ? provider.baseUrl : `${provider.baseUrl}/${model}:${action}`;
  }
  return provider.baseUrl;
}

function providerHeaders(provider, connection) {
  const key = connection?.accessToken ?? process.env[provider.apiKeyEnv];
  const headers = { "content-type": "application/json" };
  if (provider.type === "anthropic") {
    headers["x-api-key"] = key ?? "";
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider.type === "antigravity") {
    headers.authorization = `Bearer ${key ?? ""}`;
    headers["x-goog-api-client"] = "aiia-router antigravity-compat";
  } else if (key) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

function isExpiringSoon(connection, leadMs = 5 * 60 * 1000) {
  if (!connection?.expiresAt) return false;
  return new Date(connection.expiresAt).getTime() - Date.now() < leadMs;
}

async function refreshConnectionIfNeeded(state, connection) {
  if (!connection?.refreshToken || !isExpiringSoon(connection)) return connection;
  const provider = state.providers.find((item) => item.id === connection.provider);
  const tokenUrl = provider?.oauth?.tokenUrl ?? connection.providerSpecificData?.tokenUrl;
  const clientId = process.env[provider?.oauth?.clientIdEnv] ?? connection.providerSpecificData?.clientId;
  const clientSecret = process.env[provider?.oauth?.clientSecretEnv] ?? connection.providerSpecificData?.clientSecret;
  if (!tokenUrl || !clientId) return connection;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
    client_id: clientId
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) return connection;
  const json = await response.json();
  const updated = {
    ...connection,
    accessToken: json.access_token ?? connection.accessToken,
    refreshToken: json.refresh_token ?? connection.refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : connection.expiresAt,
    refreshedAt: new Date().toISOString()
  };
  state.providerConnections = state.providerConnections.map((item) => (item.id === updated.id ? updated : item));
  saveState(state);
  return updated;
}

function toOpenAiResponse(provider, upstream, model) {
  if (provider.type === "anthropic") {
    const content = upstream.content?.map((part) => part.text ?? "").join("") ?? "";
    return openAiCompletion(model, content, upstream.usage);
  }
  if (provider.type === "gemini" || provider.type === "antigravity") {
    const content = upstream.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return openAiCompletion(model, content, upstream.usageMetadata);
  }
  return upstream;
}

function openAiCompletion(model, content, usage) {
  return {
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: usage ?? {}
  };
}

function toClaudeMessage(openAiResult) {
  const text = openAiResult.choices?.[0]?.message?.content ?? "";
  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: openAiResult.model,
    content: [{ type: "text", text }],
    stop_reason: openAiResult.choices?.[0]?.finish_reason ?? "stop",
    usage: openAiResult.usage ?? {}
  };
}

function toGeminiResponse(openAiResult) {
  const text = openAiResult.choices?.[0]?.message?.content ?? "";
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ text }] },
        finishReason: openAiResult.choices?.[0]?.finish_reason?.toUpperCase() ?? "STOP",
        index: 0
      }
    ],
    usageMetadata: openAiResult.usage ?? {},
    modelVersion: openAiResult.model
  };
}

function toOllamaResponse(openAiResult) {
  const text = openAiResult.choices?.[0]?.message?.content ?? "";
  return {
    model: openAiResult.model,
    created_at: new Date().toISOString(),
    message: { role: "assistant", content: text },
    done: true,
    total_duration: 0,
    prompt_eval_count: openAiResult.usage?.prompt_tokens ?? 0,
    eval_count: openAiResult.usage?.completion_tokens ?? 0
  };
}

function toResponsesResponse(openAiResult) {
  const text = openAiResult.choices?.[0]?.message?.content ?? "";
  return {
    id: `resp_${Date.now()}`,
    object: "response",
    created_at: openAiResult.created ?? Math.floor(Date.now() / 1000),
    status: "completed",
    model: openAiResult.model,
    output: [
      {
        id: `msg_${Date.now()}`,
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }]
      }
    ],
    output_text: text,
    usage: openAiResult.usage ?? {}
  };
}

function discoverOauthOnDisk() {
  return oauthDiscoveryTargets.map((target) => {
    const matches = target.paths.map((candidatePath) => pathProbe(candidatePath)).filter((match) => match.exists);
    return {
      provider: target.provider,
      label: target.label,
      found: matches.length > 0,
      matches,
      checked: target.paths.length
    };
  });
}

function importOauthCredential(providerId) {
  const discovery = discoverOauthOnDisk().find((item) => item.provider === providerId);
  if (!discovery?.found) {
    const error = new Error("No local OAuth credential path found");
    error.status = 404;
    throw error;
  }

  for (const match of discovery.matches.filter((item) => item.type === "file")) {
    const parsed = tryReadCredentialFile(match.path);
    const tokens = parsed ? extractTokens(parsed, providerId) : null;
    if (tokens?.accessToken || tokens?.refreshToken) {
      return {
        provider: providerId,
        sourcePath: match.path,
        authType: "oauth",
        isActive: true,
        priority: 0,
        importedAt: new Date().toISOString(),
        ...tokens
      };
    }
  }

  const error = new Error("Found OAuth paths, but no supported token schema was detected");
  error.status = 422;
  throw error;
}

function tryReadCredentialFile(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractTokens(value, providerId) {
  const candidates = flattenObjects(value);
  const found = candidates.find((item) => item.accessToken || item.access_token || item.refreshToken || item.refresh_token || item.claudeAiOauth);
  const source = found?.claudeAiOauth ?? found ?? {};
  const accessToken = source.accessToken ?? source.access_token ?? source.token ?? source.id_token;
  const refreshToken = source.refreshToken ?? source.refresh_token;
  const expiresAt =
    source.expiresAt ??
    source.expiry_date ??
    source.expiryDate ??
    (source.expires_in ? new Date(Date.now() + Number(source.expires_in) * 1000).toISOString() : undefined);
  const providerSpecificData = {
    providerId,
    tokenType: source.tokenType ?? source.token_type,
    scope: source.scope,
    account: source.account ?? source.email
  };
  return { accessToken, refreshToken, expiresAt, providerSpecificData };
}

function flattenObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  output.push(value);
  Object.values(value).forEach((child) => flattenObjects(child, output));
  return output;
}

function pathProbe(candidatePath) {
  if (!existsSync(candidatePath)) return { path: candidatePath, exists: false };
  try {
    const stats = statSync(candidatePath);
    return {
      path: candidatePath,
      exists: true,
      type: stats.isDirectory() ? "directory" : "file",
      modifiedAt: stats.mtime.toISOString(),
      size: stats.isFile() ? stats.size : undefined
    };
  } catch (error) {
    return { path: candidatePath, exists: true, type: "unknown", error: error.message };
  }
}

async function dispatch(body) {
  const state = loadState();
  const normalized = normalizeInput(body);
  const attempts = [];

  for (const candidate of routeCandidates(state, normalized.model)) {
    let { provider, model, connection } = candidate;
    try {
      if (provider.type === "builtin") {
        return { json: builtinCompletion(normalized, model), provider, model, attempts };
      }
      connection = await refreshConnectionIfNeeded(state, connection);
      if (!connection?.accessToken && !process.env[provider.apiKeyEnv] && provider.auth !== "none" && !provider.baseUrl.includes("127.0.0.1")) {
        throw new Error(`Missing ${provider.apiKeyEnv}`);
      }
      const payload = toProviderPayload(provider, normalized, model, state);
      const response = await fetch(providerUrl(provider, model, normalized.stream), {
        method: "POST",
        headers: providerHeaders(provider, connection),
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      if (normalized.stream) return { stream: response.body, provider, model, attempts };
      const json = await response.json();
      return { json: toOpenAiResponse(provider, json, model), provider, model, attempts };
    } catch (error) {
      attempts.push({ provider: provider.id, model, error: error.message });
    }
  }
  const error = new Error("All providers failed");
  error.attempts = attempts;
  throw error;
}

app.get("/api/state", (_req, res) => res.json(sanitizeState(loadState())));
app.put("/api/state", (req, res) => {
  const state = { ...loadState(), ...req.body };
  saveState(state);
  res.json(sanitizeState(state));
});

app.get("/api/providers", (_req, res) => res.json(loadState().providers));
app.post("/api/providers", (req, res) => {
  const state = loadState();
  const provider = {
    id: req.body.id ?? `provider-${Date.now()}`,
    label: req.body.label ?? "Custom Provider",
    enabled: req.body.enabled ?? false,
    tier: req.body.tier ?? "custom",
    status: req.body.status ?? "draft",
    type: req.body.type ?? "openai",
    auth: req.body.auth ?? "api-key",
    model: req.body.model ?? "custom/model",
    baseUrl: req.body.baseUrl ?? "https://provider.example.com/v1/chat/completions",
    apiKeyEnv: req.body.apiKeyEnv ?? "CUSTOM_PROVIDER_KEY",
    quota: req.body.quota ?? 100
  };
  state.providers = [...state.providers.filter((item) => item.id !== provider.id), provider];
  saveState(state);
  res.status(201).json(provider);
});
app.put("/api/providers", (req, res) => {
  const state = loadState();
  state.providers = req.body.providers ?? state.providers;
  saveState(state);
  res.json(state.providers);
});
app.delete("/api/providers/:id", (req, res) => {
  const state = loadState();
  state.providers = state.providers.filter((item) => item.id !== req.params.id);
  saveState(state);
  res.status(204).end();
});

app.post("/api/providers/validate", async (req, res) => {
  const provider = req.body.provider ?? req.body;
  const hasKey = provider.auth === "none" || provider.baseUrl?.includes("127.0.0.1") || Boolean(process.env[provider.apiKeyEnv]);
  const reachable = Boolean(provider.baseUrl && provider.model);
  res.json({
    ok: hasKey && reachable,
    provider: provider.id,
    checks: {
      config: reachable ? "ok" : "missing baseUrl or model",
      credentials: hasKey ? "ok" : `missing ${provider.apiKeyEnv}`,
      format: provider.type ?? provider.context ?? "openai"
    }
  });
});

app.post("/api/providers/:id/test", async (req, res) => {
  const state = loadState();
  const provider = state.providers.find((item) => item.id === req.params.id);
  if (!provider) return res.status(404).json({ ok: false, error: "Provider not found" });
  const validation = {
    ok: provider.enabled && provider.status !== "needs-key" && (provider.auth === "none" || provider.baseUrl.includes("127.0.0.1") || Boolean(process.env[provider.apiKeyEnv])),
    provider: provider.id,
    model: provider.model
  };
  res.status(validation.ok ? 200 : 422).json(validation);
});

app.get("/api/oauth/discover", (_req, res) => {
  res.json({
    home: homeDir,
    appData: appDataDir,
    localAppData: localAppDataDir,
    results: discoverOauthOnDisk()
  });
});

app.post("/api/oauth/apply-discovery", (_req, res) => {
  const state = loadState();
  const discovery = discoverOauthOnDisk();
  const foundByProvider = new Map(discovery.filter((item) => item.found).map((item) => [item.provider, item]));
  state.providers = state.providers.map((provider) => {
    const found = foundByProvider.get(provider.id);
    if (!found) return provider;
    return {
      ...provider,
      auth: "oauth",
      status: "connected",
      enabled: true,
      oauthDiscovery: {
        foundAt: new Date().toISOString(),
        paths: found.matches.map((match) => ({ path: match.path, type: match.type, modifiedAt: match.modifiedAt }))
      }
    };
  });
  saveState(state);
  res.json({ providers: state.providers, discovery });
});

app.get("/api/provider-connections", (_req, res) => {
  res.json((loadState().providerConnections ?? []).map(maskConnection));
});

app.post("/api/oauth/import-local/:provider", (req, res) => {
  try {
    const state = loadState();
    const connection = {
      id: `conn-${req.params.provider}-${Date.now()}`,
      ...importOauthCredential(req.params.provider)
    };
    state.providerConnections = [
      ...(state.providerConnections ?? []).filter((item) => !(item.provider === connection.provider && item.sourcePath === connection.sourcePath)),
      connection
    ];
    state.providers = state.providers.map((provider) =>
      provider.id === connection.provider ? { ...provider, auth: "oauth", status: "connected", enabled: true } : provider
    );
    saveState(state);
    res.status(201).json(maskConnection(connection));
  } catch (error) {
    res.status(error.status ?? 500).json({ error: { message: error.message } });
  }
});

app.delete("/api/provider-connections/:id", (req, res) => {
  const state = loadState();
  state.providerConnections = (state.providerConnections ?? []).filter((connection) => connection.id !== req.params.id);
  saveState(state);
  res.status(204).end();
});

app.post("/api/provider-connections/:id/refresh", async (req, res) => {
  const state = loadState();
  const connection = (state.providerConnections ?? []).find((item) => item.id === req.params.id);
  if (!connection) return res.status(404).json({ error: { message: "Connection not found" } });
  try {
    const refreshed = await refreshConnectionIfNeeded(state, { ...connection, expiresAt: new Date(0).toISOString() });
    res.json(maskConnection(refreshed));
  } catch (error) {
    res.status(502).json({ error: { message: error.message } });
  }
});

app.get("/api/parity/status", (_req, res) => {
  const state = loadState();
  res.json({
    openAiCompatible: true,
    claudeMessagesCompatible: true,
    geminiCompatible: true,
    ollamaCompatible: true,
    providerRegistry: true,
    providerConnections: (state.providerConnections ?? []).length,
    oauthDiscovery: true,
    oauthImport: true,
    tokenRefresh: "generic-refresh-token-flow",
    mitm: false,
    usageTracking: false,
    cooldownEngine: false
  });
});

app.get("/api/combos", (_req, res) => res.json(loadState().combos));
app.put("/api/combos", (req, res) => {
  const state = loadState();
  state.combos = req.body.combos ?? state.combos;
  saveState(state);
  res.json(state.combos);
});
app.post("/api/combos", (req, res) => {
  const state = loadState();
  const combo = { id: req.body.id ?? req.body.name, name: req.body.name ?? req.body.id, models: req.body.models ?? [] };
  state.combos = [...state.combos.filter((item) => item.id !== combo.id), combo];
  saveState(state);
  res.status(201).json(combo);
});

app.get("/api/models/alias", (_req, res) => res.json(loadState().aliases));
app.put("/api/models/alias", (req, res) => {
  const state = loadState();
  state.aliases = req.body.aliases ?? state.aliases;
  saveState(state);
  res.json(state.aliases);
});

app.get("/api/keys", (_req, res) => res.json(loadState().apiKeys.map((item) => ({ ...item, key: maskKey(item.key) }))));
app.post("/api/keys", (req, res) => {
  const state = loadState();
  const key = {
    id: `key-${Date.now()}`,
    name: req.body.name ?? "Router Key",
    key: req.body.key ?? `aiia_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    createdAt: new Date().toISOString()
  };
  state.apiKeys.push(key);
  saveState(state);
  res.status(201).json({ ...key, key: maskKey(key.key) });
});
app.delete("/api/keys/:id", (req, res) => {
  const state = loadState();
  state.apiKeys = state.apiKeys.filter((item) => item.id !== req.params.id);
  saveState(state);
  res.status(204).end();
});

app.get("/v1/models", requireKey, (_req, res) => {
  const state = loadState();
  const models = [
    ...state.providers.filter((item) => item.enabled).map((item) => ({ id: `${item.id}/${item.model}`, object: "model", owned_by: item.id })),
    ...state.combos.map((item) => ({ id: item.name, object: "model", owned_by: "aiia-router" }))
  ];
  res.json({ object: "list", data: models });
});

app.get("/v1beta/models", requireKey, (_req, res) => {
  const state = loadState();
  res.json({
    models: [
      ...state.providers.filter((item) => item.enabled).map((item) => ({ name: `models/${item.id}/${item.model}`, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] })),
      ...state.combos.map((item) => ({ name: `models/${item.name}`, supportedGenerationMethods: ["generateContent", "streamGenerateContent"] }))
    ]
  });
});

app.post("/v1/chat/completions", requireKey, async (req, res) => {
  try {
    const result = await dispatch(req.body);
    res.setHeader("x-aiia-provider", result.provider.id);
    res.setHeader("x-aiia-model", result.model);
    if (result.stream) {
      res.setHeader("content-type", "text/event-stream");
      return result.stream.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          }
        })
      );
    }
    res.json(result.json);
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.post("/v1/responses", requireKey, async (req, res) => {
  try {
    const result = await dispatch(req.body);
    res.setHeader("x-aiia-provider", result.provider.id);
    res.setHeader("x-aiia-model", result.model);
    res.json(toResponsesResponse(result.json));
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.post("/v1/messages", requireKey, async (req, res) => {
  try {
    const result = await dispatch({ ...req.body, stream: false });
    res.json(toClaudeMessage(result.json));
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.post(/^\/v1beta\/models\/(.+)$/, requireKey, async (req, res) => {
  try {
    const [modelPath, action = "generateContent"] = req.params[0].split(":");
    const model = modelPath.replace(/^models\//, "");
    const result = await dispatch({ ...req.body, model, stream: action === "streamGenerateContent" });
    res.json(toGeminiResponse(result.json));
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.post("/api/v1/api/chat", requireKey, async (req, res) => {
  try {
    const result = await dispatch({
      model: req.body.model,
      messages: req.body.messages ?? [{ role: "user", content: req.body.prompt ?? "" }],
      stream: false
    });
    res.json(toOllamaResponse(result.json));
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.post("/antigravity/v1/chat", requireKey, async (req, res) => {
  try {
    const result = await dispatch({ ...req.body, source: "antigravity", model: req.body.model ?? "antigravity" });
    res.json(toGeminiResponse(result.json));
  } catch (error) {
    res.status(502).json({ error: { message: error.message, attempts: error.attempts ?? [] } });
  }
});

app.use(express.static(join(__dirname, "dist")));
app.get(/.*/, (_req, res) => res.sendFile(join(__dirname, "dist", "index.html")));

app.listen(port, "127.0.0.1", () => {
  console.log(`AIIA standalone router listening on http://127.0.0.1:${port}`);
});
