import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Braces,
  Check,
  Clipboard,
  Download,
  FileJson,
  FileText,
  GitBranch,
  Import,
  Network,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2
} from "lucide-react";
import "../styles.css";

const storageKey = "aiia-context-editor:v4";

const providers = [
  {
    id: "antigravity",
    name: "Antigravity",
    model: "gemini-2.5-pro",
    context: "ide subscription",
    note: "OAuth/MITM-style provider for Antigravity-compatible coding traffic."
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    model: "router auto",
    context: "multi-provider",
    note: "Default abstraction layer when models can be routed dynamically."
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "GPT family",
    context: "tool aware",
    note: "Strong fit for coding agents, tool execution, and structured output."
  },
  {
    id: "anthropic",
    name: "Anthropic",
    model: "Claude family",
    context: "long reasoning",
    note: "Useful for review, planning, and careful refactor continuity."
  },
  {
    id: "gemini",
    name: "Gemini",
    model: "Gemini family",
    context: "large context",
    note: "Good for wide repo scans, docs, and multimodal notes."
  },
  {
    id: "local",
    name: "Local LLM",
    model: "Ollama / LM Studio",
    context: "private",
    note: "Best when privacy, offline work, or local routing matters."
  }
];

const aiProviderCards = [
  { id: "antigravity", name: "Antigravity", model: "gemini-2.5-pro", status: "ready", tier: "subscription" },
  { id: "openai", name: "OpenAI", model: "gpt-4.1-mini", status: "ready", tier: "subscription" },
  { id: "anthropic", name: "Anthropic", model: "claude-sonnet-4-5", status: "ready", tier: "subscription" },
  { id: "gemini", name: "Gemini", model: "gemini-2.5-flash", status: "ready", tier: "free" },
  { id: "local", name: "Local", model: "llama3.1", status: "ready", tier: "custom" },
  { id: "openrouter", name: "OpenRouter", model: "openrouter/auto", status: "needs key", tier: "cheap" }
];

const taskPhases = ["prompt", "plan", "implement", "verify", "handoff"];

const defaultState = {
  sessionName: "AIIA portable session",
  activeFile: "main",
  activeProvider: "openrouter",
  policy: "balanced",
  options: {
    includeCode: true,
    includeMemory: true,
    includeDiff: true
  },
  activeTask: {
    prompt: "แก้ไขโค้ดตามคำสั่งผู้ใช้ โดยต้องทำงานต่อหลังสลับ provider ได้ทันที",
    phase: "plan",
    plan: [
      { id: "understand", text: "Understand user request and preserve durable constraints.", done: true },
      { id: "edit", text: "Edit code while recording decisions and current file state.", done: false },
      { id: "verify", text: "Run checks and append results to the continuity packet.", done: false }
    ],
    implementation: "No code change started yet. Next provider should continue from the current editor files and plan state.",
    currentStep: "edit",
    resumeInstruction:
      "Continue the active task without asking the user to restate context. Use task.prompt, task.plan, task.implementation, memory, turns, and files as the source of truth.",
    switchEvents: []
  },
  router: {
    mode: "standalone",
    endpoint: "standalone://aiia-router/v1",
    gatewayPath: "/v1/chat/completions",
    apiKey: "local-dev-key",
    selectedCombo: "always-on-coding",
    fallbackStrategy: "subscription-cheap-free",
    tokenSaver: true,
    formatTranslation: true,
    requestLogging: false,
    quotaTracking: true,
    providers: [
      {
        id: "antigravity",
        label: "Antigravity",
        auth: "oauth",
        tier: "subscription",
        status: "ready",
        enabled: true,
        model: "gemini-2.5-pro",
        baseUrl: "https://antigravity.googleapis.com/v1/chat",
        apiKeyEnv: "ANTIGRAVITY_TOKEN",
        quota: 100,
        context: "antigravity",
        type: "antigravity",
        mitm: { enabled: false, hostnames: ["antigravity.googleapis.com"], riskAccepted: false }
      },
      {
        id: "cc",
        label: "Claude Code",
        auth: "oauth",
        tier: "subscription",
        status: "connected",
        enabled: true,
        model: "cc/claude-sonnet-4.5",
        baseUrl: "https://api.anthropic.com/v1/messages",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        quota: 76
      },
      {
        id: "cx",
        label: "Codex",
        auth: "oauth",
        tier: "subscription",
        status: "ready",
        enabled: true,
        model: "cx/gpt-5.2-codex",
        baseUrl: "https://api.openai.com/v1/chat/completions",
        apiKeyEnv: "OPENAI_API_KEY",
        quota: 64
      },
      {
        id: "glm",
        label: "GLM",
        auth: "api-key",
        tier: "cheap",
        status: "needs-key",
        enabled: true,
        model: "glm/glm-5.1",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        apiKeyEnv: "GLM_API_KEY",
        quota: 100
      },
      {
        id: "minimax",
        label: "MiniMax",
        auth: "api-key",
        tier: "cheap",
        status: "needs-key",
        enabled: true,
        model: "minimax/MiniMax-M2.7",
        baseUrl: "https://api.minimax.io/v1/text/chatcompletion_v2",
        apiKeyEnv: "MINIMAX_API_KEY",
        quota: 100
      },
      {
        id: "kr",
        label: "Kiro AI",
        auth: "oauth",
        tier: "free",
        status: "connected",
        enabled: true,
        model: "kr/claude-sonnet-4.5",
        baseUrl: "https://kiro.local/oauth-proxy/chat",
        apiKeyEnv: "KIRO_TOKEN",
        quota: 42
      },
      {
        id: "oc",
        label: "OpenCode Free",
        auth: "none",
        tier: "free",
        status: "connected",
        enabled: true,
        model: "oc/auto",
        baseUrl: "https://opencode.local/free/chat",
        apiKeyEnv: "OPENCODE_TOKEN",
        quota: 35
      },
      {
        id: "custom",
        label: "Custom endpoint",
        auth: "api-key",
        tier: "custom",
        status: "draft",
        enabled: false,
        model: "custom/model",
        baseUrl: "https://provider.example.com/v1/chat/completions",
        apiKeyEnv: "CUSTOM_PROVIDER_KEY",
        quota: 100
      }
    ],
    combos: [
      {
        id: "always-on-coding",
        name: "always-on-coding",
        models: ["antigravity/gemini-2.5-pro", "cc/claude-sonnet-4.5", "cx/gpt-5.2-codex", "glm/glm-5.1", "minimax/MiniMax-M2.7", "kr/claude-sonnet-4.5", "oc/auto"]
      },
      {
        id: "free-first",
        name: "free-first",
        models: ["kr/claude-sonnet-4.5", "kr/glm-5", "oc/auto"]
      },
      {
        id: "subscription-first",
        name: "subscription-first",
        models: ["cc/claude-sonnet-4.5", "cx/gpt-5.2-codex", "glm/glm-5.1"]
      }
    ]
  },
  files: {
    main: `type Provider = "openrouter" | "openai" | "anthropic" | "gemini" | "local";

interface ContextCapsule {
  sessionId: string;
  provider: Provider;
  objective: string;
  pinnedMemory: string[];
  recentTurns: string[];
  workingFiles: Record<string, string>;
}

export function buildPortablePrompt(capsule: ContextCapsule) {
  return [
    "# Continue this coding session",
    \`Provider: \${capsule.provider}\`,
    \`Objective: \${capsule.objective}\`,
    "## Pinned memory",
    capsule.pinnedMemory.join("\\n"),
    "## Recent turns",
    capsule.recentTurns.join("\\n"),
    "## Working files",
    JSON.stringify(capsule.workingFiles, null, 2)
  ].join("\\n\\n");
}`,
    notes: `# Agent continuity notes

- Store decisions as memory blocks, not hidden chat history.
- Before switching providers, create a normalized handoff package.
- Keep provider-specific prompts thin; keep product state in the capsule.
- Import a previous handoff to resume with a different model.`,
    handoff: ""
  },
  memory: [
    {
      title: "Objective",
      body: "Build a React code editor that keeps AI agent context portable when switching between OpenRouter-like providers.",
      pinned: true
    },
    {
      title: "Architecture",
      body: "Use a provider-agnostic Context Capsule containing session goal, pinned memory, recent turns, active files, and switch policy.",
      pinned: true
    }
  ],
  turns: [
    {
      at: new Date().toISOString(),
      text: "Initial session created. User needs cross-provider AI agent continuity."
    }
  ]
};

const files = [
  { id: "main", label: "main.ts", icon: Braces },
  { id: "notes", label: "agent-notes.md", icon: FileText },
  { id: "handoff", label: "handoff.json", icon: FileJson }
];

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return structuredClone(defaultState);
  try {
    return mergeState(structuredClone(defaultState), JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    options: { ...base.options, ...(saved.options ?? {}) },
    files: { ...base.files, ...(saved.files ?? {}) },
    activeTask: {
      ...base.activeTask,
      ...(saved.activeTask ?? {}),
      plan: saved.activeTask?.plan ?? base.activeTask.plan,
      switchEvents: saved.activeTask?.switchEvents ?? base.activeTask.switchEvents
    },
    router: {
      ...base.router,
      ...(saved.router ?? {}),
      providers: mergeProviders(base.router.providers, saved.router?.providers),
      combos: saved.router?.combos ?? base.router.combos
    }
  };
}

function mergeProviders(baseProviders, savedProviders) {
  if (!savedProviders) return baseProviders;
  return baseProviders.map((baseProvider) => ({
    ...baseProvider,
    ...(savedProviders.find((item) => item.id === baseProvider.id) ?? {})
  }));
}

function toUiProvider(provider) {
  return {
    auth: provider.auth ?? (provider.type === "openai" ? "api-key" : "api-key"),
    ...provider,
    context: provider.type ?? "openai"
  };
}

function toBackendProvider(provider) {
  const { context: _context, ...rest } = provider;
  return rest;
}

function App() {
  const [state, setState] = useState(loadState);
  const [copied, setCopied] = useState(false);
  const [backendStatus, setBackendStatus] = useState("local");
  const [page, setPage] = useState("editor");

  const provider = useMemo(
    () => providers.find((item) => item.id === state.activeProvider) ?? providers[0],
    [state.activeProvider]
  );

  const handoff = useMemo(() => buildHandoff(state, provider), [state, provider]);
  const activeText = state.activeFile === "handoff" ? JSON.stringify(handoff, null, 2) : state.files[state.activeFile] ?? "";

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, activeText.split("\n").length);
    return Array.from({ length: count }, (_, index) => index + 1).join("\n");
  }, [activeText]);

  const contextScore = useMemo(() => {
    const pinned = state.memory.filter((item) => item.pinned).length;
    return Math.min(100, 25 + pinned * 20 + Math.min(state.turns.length, 5) * 7 + (state.options.includeCode ? 10 : 0));
  }, [state.memory, state.options.includeCode, state.turns.length]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    loadBackendRouter();
  }, []);

  function patchState(patch) {
    setState((current) => ({ ...current, ...patch }));
  }

  function addTurn(text) {
    setState((current) => ({
      ...current,
      turns: [...current.turns, { at: new Date().toISOString(), text }]
    }));
  }

  function switchProvider(nextProvider, mode = "manual") {
    setState((current) => ({
      ...current,
      activeProvider: nextProvider.id,
      activeTask: {
        ...current.activeTask,
        switchEvents: [
          ...current.activeTask.switchEvents,
          {
            at: new Date().toISOString(),
            mode,
            from: current.activeProvider,
            to: nextProvider.id,
            phase: current.activeTask.phase,
            currentStep: current.activeTask.currentStep,
            reason: mode === "auto" ? "Provider limit reached; continuity packet routed to fallback provider." : "Manual provider switch."
          }
        ]
      },
      turns: [
        ...current.turns,
        {
          at: new Date().toISOString(),
          text: `${mode === "auto" ? "Auto" : "Manual"} switched active provider to ${nextProvider.name} with ${current.policy} policy. Active task phase preserved: ${current.activeTask.phase}.`
        }
      ]
    }));
  }

  function updateActiveTask(patch) {
    setState((current) => ({
      ...current,
      activeTask: { ...current.activeTask, ...patch }
    }));
  }

  function updatePlanItem(index, patch) {
    setState((current) => ({
      ...current,
      activeTask: {
        ...current.activeTask,
        plan: current.activeTask.plan.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
      }
    }));
  }

  function addPlanItem() {
    setState((current) => ({
      ...current,
      activeTask: {
        ...current.activeTask,
        plan: [...current.activeTask.plan, { id: `step-${current.activeTask.plan.length + 1}`, text: "Describe the next implementation step.", done: false }]
      }
    }));
  }

  function autoSwitchProvider() {
    const currentIndex = providers.findIndex((item) => item.id === state.activeProvider);
    const nextProvider = providers[(currentIndex + 1) % providers.length];
    switchProvider(nextProvider, "auto");
  }

  function updateMemory(index, patch) {
    setState((current) => ({
      ...current,
      memory: current.memory.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    }));
  }

  function removeMemory(index) {
    setState((current) => ({
      ...current,
      memory: current.memory.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function copyHandoff() {
    await navigator.clipboard.writeText(JSON.stringify(handoff, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function exportHandoff() {
    const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.sessionName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "aiia"}-handoff.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importHandoff(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    setState((current) => ({
      ...current,
      sessionName: imported.sessionName ?? current.sessionName,
      activeProvider: imported.route?.provider ?? current.activeProvider,
      policy: imported.route?.policy ?? current.policy,
      router: imported.router ?? current.router,
      activeTask: imported.task ?? imported.activeTask ?? current.activeTask,
      memory: imported.continuity?.pinnedMemory ?? current.memory,
      turns: imported.continuity?.recentTurns ?? current.turns,
      files: { ...current.files, ...(imported.files ?? {}) }
    }));
    event.target.value = "";
  }

  function updateRouter(patch) {
    setState((current) => ({
      ...current,
      router: { ...current.router, ...patch }
    }));
  }

  function updateRouterProvider(index, patch) {
    setState((current) => ({
      ...current,
      router: {
        ...current.router,
        providers: current.router.providers.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
      }
    }));
  }

  async function loadBackendRouter() {
    try {
      const [providersResponse, combosResponse] = await Promise.all([
        fetch("http://127.0.0.1:20128/api/providers"),
        fetch("http://127.0.0.1:20128/api/combos")
      ]);
      if (!providersResponse.ok || !combosResponse.ok) throw new Error("backend unavailable");
      const [backendProviders, backendCombos] = await Promise.all([providersResponse.json(), combosResponse.json()]);
      setState((current) => ({
        ...current,
        router: {
          ...current.router,
          endpoint: "http://127.0.0.1:20128/v1",
          gatewayPath: "/v1/chat/completions",
          providers: mergeProviders(defaultState.router.providers, backendProviders.map(toUiProvider)),
          combos: backendCombos
        }
      }));
      setBackendStatus("synced");
    } catch {
      setBackendStatus("local");
    }
  }

  async function saveBackendProviders() {
    try {
      const response = await fetch("http://127.0.0.1:20128/api/providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providers: state.router.providers.map(toBackendProvider) })
      });
      if (!response.ok) throw new Error("save failed");
      setBackendStatus("saved");
      window.setTimeout(() => setBackendStatus("synced"), 1200);
    } catch {
      setBackendStatus("local");
    }
  }

  if (page === "providers") {
    return (
      <ProvidersPage
        router={state.router}
        backendStatus={backendStatus}
        onBack={() => setPage("editor")}
        onUpdate={updateRouter}
        onUpdateProvider={updateRouterProvider}
        onLoadBackend={loadBackendRouter}
        onSaveBackend={saveBackendProviders}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="rail explorer-rail" aria-label="Code explorer">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            AI
          </div>
          <div>
            <h1>AIIA Code Workspace</h1>
            <p>AI-assisted code editing with portable task context</p>
          </div>
        </div>
        <nav className="app-nav" aria-label="Application views">
          <button className="active" onClick={() => setPage("editor")}>Editor</button>
          <button onClick={() => setPage("providers")}>Providers</button>
        </nav>

        <section className="panel explorer-panel">
          <div className="section-head">
            <h2>Explorer</h2>
            <button className="icon-button" title="New file" aria-label="New file">
              <Plus size={17} />
            </button>
          </div>
          <div className="file-tree">
            <div className="folder-row">AIIA / src</div>
            {files.map((file) => {
              const Icon = file.icon;
              return (
                <button
                  className={`file-row ${state.activeFile === file.id ? "active" : ""}`}
                  key={file.id}
                  onClick={() => patchState({ activeFile: file.id })}
                >
                  <Icon size={15} />
                  <span>{file.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel session-panel compact-panel">
          <div className="section-head">
            <h2>Session Ledger</h2>
            <button
              className="icon-button"
              title="New session"
              aria-label="New session"
              onClick={() => setState({ ...structuredClone(defaultState), sessionName: `AIIA session ${new Date().toLocaleDateString()}` })}
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <label className="field">
            <span>Session name</span>
            <input value={state.sessionName} onChange={(event) => patchState({ sessionName: event.target.value })} />
          </label>
          <div className="metrics">
            <Metric value={state.turns.length} label="turns" />
            <Metric value={state.memory.length} label="memory" />
            <Metric value={`${contextScore}%`} label="ready" />
          </div>
        </section>

        <section className="panel compact-panel">
          <div className="section-head">
            <h2>Memory Blocks</h2>
            <button
              className="icon-button"
              title="Add memory block"
              aria-label="Add memory block"
              onClick={() =>
                patchState({
                  memory: [...state.memory, { title: "New memory", body: "Describe a durable decision or constraint.", pinned: true }]
                })
              }
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="memory-list">
            {state.memory.map((item, index) => (
              <article className="memory-card" key={`${item.title}-${index}`}>
                <input className="memory-title" value={item.title} onChange={(event) => updateMemory(index, { title: event.target.value })} />
                <textarea className="memory-body" value={item.body} onChange={(event) => updateMemory(index, { body: event.target.value })} />
                <div className="card-actions">
                  <label>
                    <input type="checkbox" checked={item.pinned} onChange={(event) => updateMemory(index, { pinned: event.target.checked })} />
                    pinned
                  </label>
                  <button type="button" className="remove-memory" onClick={() => removeMemory(index)}>
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace" aria-label="Code workspace">
        <TaskContinuityPanel
          task={state.activeTask}
          onUpdate={updateActiveTask}
          onUpdatePlanItem={updatePlanItem}
          onAddPlanItem={addPlanItem}
          onAutoSwitch={autoSwitchProvider}
        />

        <div className="topbar">
          <div className="tabs" role="tablist" aria-label="Editor files">
            {files.map((file) => {
              const Icon = file.icon;
              return (
                <button
                  className={`tab ${state.activeFile === file.id ? "active" : ""}`}
                  key={file.id}
                  onClick={() => patchState({ activeFile: file.id })}
                >
                  <Icon size={15} />
                  {file.label}
                </button>
              );
            })}
          </div>
          <div className="toolbar">
            <button onClick={copyHandoff}>
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
              {copied ? "Copied" : "Copy handoff"}
            </button>
            <button onClick={exportHandoff}>
              <Download size={15} />
              Export
            </button>
            <label className="import-button">
              <Import size={15} />
              Import
              <input type="file" accept="application/json,.json" onChange={importHandoff} />
            </label>
          </div>
        </div>

        <div className="editor-wrap">
          <div className="gutter" aria-hidden="true">
            {lineNumbers}
          </div>
          <textarea
            className="code-editor"
            spellCheck="false"
            value={activeText}
            onKeyDown={(event) => {
              if (event.key !== "Tab" || state.activeFile === "handoff") return;
              event.preventDefault();
              const target = event.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const value = `${target.value.slice(0, start)}  ${target.value.slice(end)}`;
              patchState({ files: { ...state.files, [state.activeFile]: value } });
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 2;
              });
            }}
            onChange={(event) => {
              if (state.activeFile === "handoff") return;
              patchState({ files: { ...state.files, [state.activeFile]: event.target.value } });
            }}
          />
        </div>

        <section className="context-strip" aria-label="Active context">
          <div>
            <h2>Active Context Capsule</h2>
            <p>
              {provider.name} receives {handoff.continuity.pinnedMemory.length} pinned memory blocks, {handoff.continuity.recentTurns.length} recent
              turns, and {Object.keys(handoff.files).length} files.
            </p>
          </div>
          <div className="capsule-tags">
            {[state.policy, provider.context, state.options.includeCode ? "code attached" : "memory only"].map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </section>
        <PromptComposer
          task={state.activeTask}
          onUpdate={updateActiveTask}
          onSubmit={(prompt) => {
            updateActiveTask({ prompt, phase: "plan" });
            addTurn(`User prompt queued: ${prompt}`);
          }}
        />
      </section>

      <aside className="side ai-rail" aria-label="AI provider selection">
        <section className="panel ai-provider-panel">
          <div className="section-head">
            <h2>AI Providers</h2>
            <span className="status-pill">{provider.name}</span>
          </div>
          <div className="ai-list">
            {aiProviderCards.map((item) => (
              <button
                className={`ai-row ${item.id === state.activeProvider ? "active" : ""}`}
                type="button"
                key={item.id}
                onClick={() => switchProvider(providers.find((providerItem) => providerItem.id === item.id) ?? providers[0])}
              >
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.model}</small>
                </div>
                <span>{item.status}</span>
              </button>
            ))}
          </div>
          <button className="wide-button" onClick={() => setPage("providers")}>Configure OAuth providers</button>
        </section>

        <section className="panel">
          <h2>Switch Policy</h2>
          <div className="segmented" role="group" aria-label="Switch policy">
            {[
              ["balanced", "Balanced"],
              ["cheap", "Cost"],
              ["long", "Long context"]
            ].map(([id, label]) => (
              <button className={state.policy === id ? "active" : ""} key={id} onClick={() => patchState({ policy: id })}>
                {label}
              </button>
            ))}
          </div>
          <CheckRow
            checked={state.options.includeCode}
            label="Attach current code"
            onChange={(checked) => patchState({ options: { ...state.options, includeCode: checked } })}
          />
          <CheckRow
            checked={state.options.includeMemory}
            label="Attach pinned memory"
            onChange={(checked) => patchState({ options: { ...state.options, includeMemory: checked } })}
          />
          <CheckRow
            checked={state.options.includeDiff}
            label="Attach working diff summary"
            onChange={(checked) => patchState({ options: { ...state.options, includeDiff: checked } })}
          />
        </section>

        <section className="panel handoff-panel">
          <div className="section-head">
            <h2>Handoff Preview</h2>
            <button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={() => patchState({ files: { ...state.files } })}>
              <RefreshCcw size={16} />
            </button>
          </div>
          <pre>{JSON.stringify(handoff, null, 2)}</pre>
        </section>

        <ConversationPanel turns={state.turns} onAddTurn={addTurn} />
      </aside>
    </main>
  );
}

function TaskContinuityPanel({ task, onUpdate, onUpdatePlanItem, onAddPlanItem, onAutoSwitch }) {
  return (
    <section className="task-continuity" aria-label="Active task continuity">
      <div className="task-main">
        <div className="section-head">
          <h2>Active Task Continuity</h2>
          <div className="phase-pills" role="group" aria-label="Task phase">
            {taskPhases.map((phase) => (
              <button className={task.phase === phase ? "active" : ""} key={phase} onClick={() => onUpdate({ phase })}>
                {phase}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Implementation state</span>
          <textarea value={task.implementation} onChange={(event) => onUpdate({ implementation: event.target.value })} />
        </label>
      </div>

      <div className="task-plan">
        <div className="section-head">
          <h2>Plan Snapshot</h2>
          <button className="icon-button" title="Add plan step" aria-label="Add plan step" onClick={onAddPlanItem}>
            <Plus size={16} />
          </button>
        </div>
        <div className="plan-list">
          {task.plan.map((item, index) => (
            <label className="plan-row" key={item.id}>
              <input type="checkbox" checked={item.done} onChange={(event) => onUpdatePlanItem(index, { done: event.target.checked })} />
              <input value={item.text} onChange={(event) => onUpdatePlanItem(index, { text: event.target.value })} />
            </label>
          ))}
        </div>
        <label className="field">
          <span>Resume instruction</span>
          <textarea value={task.resumeInstruction} onChange={(event) => onUpdate({ resumeInstruction: event.target.value })} />
        </label>
        <button className="limit-button" onClick={onAutoSwitch}>
          Simulate provider limit and auto switch
        </button>
      </div>
    </section>
  );
}

function PromptComposer({ task, onUpdate, onSubmit }) {
  const [draft, setDraft] = useState(task.prompt);

  useEffect(() => {
    setDraft(task.prompt);
  }, [task.prompt]);

  return (
    <form
      className="prompt-composer"
      onSubmit={(event) => {
        event.preventDefault();
        const prompt = draft.trim();
        if (!prompt) return;
        onSubmit(prompt);
      }}
    >
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onUpdate({ prompt: event.target.value });
        }}
        placeholder="พิมพ์ prompt เพื่อแก้ไขโค้ด แล้ว context จะถูกเก็บต่อเนื่องแม้ provider ถูกสลับ"
      />
      <div className="composer-actions">
        <span>{task.phase}</span>
        <button type="submit">Send prompt</button>
      </div>
    </form>
  );
}

function ProvidersPage({ router, backendStatus, onBack, onUpdate, onUpdateProvider, onLoadBackend, onSaveBackend }) {
  const oauthProviders = router.providers.filter((item) => item.auth === "oauth" || item.id === "antigravity" || ["openai", "anthropic", "gemini", "local"].includes(item.id));
  const [selectedId, setSelectedId] = useState(oauthProviders[0]?.id);
  const selectedIndex = Math.max(0, router.providers.findIndex((item) => item.id === selectedId));
  const selected = router.providers[selectedIndex] ?? router.providers[0];

  return (
    <main className="providers-page">
      <header className="providers-header">
        <div className="brand">
          <div className="mark" aria-hidden="true">AI</div>
          <div>
            <h1>OAuth Providers</h1>
            <p>Connect local AI providers first, then route coding agents through the standalone gateway</p>
          </div>
        </div>
        <div className="providers-actions">
          <span className="status-pill">{backendStatus}</span>
          <button onClick={onLoadBackend}>Refresh</button>
          <button onClick={onSaveBackend}>Save providers</button>
          <button onClick={onBack}>Back to editor</button>
        </div>
      </header>

      <section className="providers-layout">
        <aside className="provider-catalog">
          <section className="provider-group">
            <div className="section-head">
              <h2>OAuth Providers</h2>
              <span className="status-pill">{oauthProviders.length}</span>
            </div>
            <div className="provider-list">
              {oauthProviders.map((item) => (
                <button className={`provider-list-card ${item.id === selected?.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.model}</small>
                  </div>
                  <span>{item.status}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="provider-detail">
          {selected ? (
            <>
              <div className="detail-head">
                <div>
                  <h2>{selected.label}</h2>
                  <p>{selected.tier} provider · {selected.auth} · {selected.context ?? selected.type ?? "openai"}</p>
                </div>
                <label className="switch-row">
                  <input type="checkbox" checked={selected.enabled} onChange={(event) => onUpdateProvider(selectedIndex, { enabled: event.target.checked })} />
                  Enabled
                </label>
              </div>

              <div className="connection-flow">
                <button className={selected.auth === "oauth" ? "active" : ""}>1 OAuth / Login</button>
                <button className={selected.auth === "api-key" ? "active" : ""}>2 API Key</button>
                <button className={selected.tier === "custom" ? "active" : ""}>3 Compatible Node</button>
                <button>4 Test</button>
              </div>

              <div className="provider-form">
                <label className="field">
                  <span>Provider name</span>
                  <input value={selected.label} onChange={(event) => onUpdateProvider(selectedIndex, { label: event.target.value })} />
                </label>
                <label className="field">
                  <span>Routing alias</span>
                  <input value={selected.id} readOnly />
                </label>
                <label className="field">
                  <span>Model</span>
                  <input value={selected.model} onChange={(event) => onUpdateProvider(selectedIndex, { model: event.target.value })} />
                </label>
                <label className="field">
                  <span>Base URL</span>
                  <input value={selected.baseUrl} onChange={(event) => onUpdateProvider(selectedIndex, { baseUrl: event.target.value })} />
                </label>
                <label className="field">
                  <span>API key env</span>
                  <input value={selected.apiKeyEnv} onChange={(event) => onUpdateProvider(selectedIndex, { apiKeyEnv: event.target.value })} />
                </label>
                <label className="field">
                  <span>Auth</span>
                  <select value={selected.auth} onChange={(event) => onUpdateProvider(selectedIndex, { auth: event.target.value })}>
                    <option value="oauth">OAuth</option>
                    <option value="api-key">API key</option>
                    <option value="none">No auth</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tier</span>
                  <select value={selected.tier} onChange={(event) => onUpdateProvider(selectedIndex, { tier: event.target.value })}>
                    <option value="subscription">Subscription</option>
                    <option value="cheap">Cheap</option>
                    <option value="free">Free</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={selected.status} onChange={(event) => onUpdateProvider(selectedIndex, { status: event.target.value })}>
                    <option value="connected">connected</option>
                    <option value="ready">ready</option>
                    <option value="needs-key">needs key</option>
                    <option value="draft">draft</option>
                  </select>
                </label>
                <label className="field">
                  <span>Quota</span>
                  <input type="number" min="0" max="100" value={selected.quota} onChange={(event) => onUpdateProvider(selectedIndex, { quota: Number(event.target.value) })} />
                </label>
              </div>

              <section className="connections-panel">
                <div className="section-head">
                  <h2>Connections</h2>
                  <button><Plus size={15} /> Add connection</button>
                </div>
                <article className="connection-row">
                  <span>{selected.enabled ? "active" : "disabled"}</span>
                  <strong>{selected.label}</strong>
                  <code>{selected.apiKeyEnv}</code>
                  <small>{selected.quota}% quota</small>
                </article>
              </section>

              <RouterSetupPanel
                router={router}
                backendStatus={backendStatus}
                onUpdate={onUpdate}
                onUpdateProvider={onUpdateProvider}
                onLoadBackend={onLoadBackend}
                onSaveBackend={onSaveBackend}
              />
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function RouterSetupPanel({ router, backendStatus, onUpdate, onUpdateProvider, onLoadBackend, onSaveBackend }) {
  const selectedCombo = router.combos.find((combo) => combo.id === router.selectedCombo) ?? router.combos[0];
  const cliConfig = buildCliConfig(router, selectedCombo);
  const routePlan = buildStandaloneRoutePlan(router, selectedCombo);

  return (
    <section className="panel router-setup">
      <div className="section-head">
        <h2>Standalone Router</h2>
        <span className="status-pill">{backendStatus}</span>
      </div>
      <div className="backend-actions">
        <button onClick={onLoadBackend}>Load backend providers</button>
        <button onClick={onSaveBackend}>Save providers</button>
      </div>

      <div className="router-fields">
        <label className="field">
          <span>Internal OpenAI-compatible endpoint</span>
          <input value={router.endpoint} onChange={(event) => onUpdate({ endpoint: event.target.value })} />
        </label>
        <label className="field">
          <span>Gateway path</span>
          <input value={router.gatewayPath} onChange={(event) => onUpdate({ gatewayPath: event.target.value })} />
        </label>
        <label className="field">
          <span>Local router API key</span>
          <input value={router.apiKey} onChange={(event) => onUpdate({ apiKey: event.target.value })} />
        </label>
        <label className="field">
          <span>Model combo</span>
          <select value={router.selectedCombo} onChange={(event) => onUpdate({ selectedCombo: event.target.value })}>
            {router.combos.map((combo) => (
              <option value={combo.id} key={combo.id}>
                {combo.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fallback strategy</span>
          <select value={router.fallbackStrategy} onChange={(event) => onUpdate({ fallbackStrategy: event.target.value })}>
            <option value="subscription-cheap-free">Subscription to cheap to free</option>
            <option value="free-first">Free to cheap to subscription</option>
            <option value="manual-order">Combo order only</option>
          </select>
        </label>
      </div>

      <div className="feature-grid">
        <CheckRow checked={router.tokenSaver} label="RTK token saver" onChange={(checked) => onUpdate({ tokenSaver: checked })} />
        <CheckRow checked={router.formatTranslation} label="Format translation" onChange={(checked) => onUpdate({ formatTranslation: checked })} />
        <CheckRow checked={router.quotaTracking} label="Quota tracking" onChange={(checked) => onUpdate({ quotaTracking: checked })} />
        <CheckRow checked={router.requestLogging} label="Request logging" onChange={(checked) => onUpdate({ requestLogging: checked })} />
      </div>

      <div className="tier-stack">
        {router.providers.map((item, index) => (
          <article className="tier-row" key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.tier} - {item.auth}</span>
            </div>
            <label className="mini-check">
              <input type="checkbox" checked={item.enabled} onChange={(event) => onUpdateProvider(index, { enabled: event.target.checked })} />
              enabled
            </label>
            <input value={item.model} onChange={(event) => onUpdateProvider(index, { model: event.target.value })} />
            <input value={item.baseUrl} onChange={(event) => onUpdateProvider(index, { baseUrl: event.target.value })} />
            <input value={item.apiKeyEnv} onChange={(event) => onUpdateProvider(index, { apiKeyEnv: event.target.value })} />
            <input
              type="number"
              min="0"
              max="100"
              value={item.quota}
              onChange={(event) => onUpdateProvider(index, { quota: Number(event.target.value) })}
            />
            <select value={item.status} onChange={(event) => onUpdateProvider(index, { status: event.target.value })}>
              <option value="connected">connected</option>
              <option value="ready">ready</option>
              <option value="needs-key">needs key</option>
              <option value="draft">draft</option>
            </select>
          </article>
        ))}
      </div>

      <div className="route-preview">
        <h3>Route preview</h3>
        {routePlan.map((route, index) => (
          <div className="route-hop" key={`${route.provider.id}-${index}`}>
            <span>{index + 1}</span>
            <strong>{route.provider.label}</strong>
            <code>{route.model}</code>
            <small>{route.provider.quota}% quota</small>
          </div>
        ))}
      </div>

      <pre className="cli-snippet">{cliConfig}</pre>
    </section>
  );
}

function buildCliConfig(router, combo) {
  const endpointNoV1 = router.endpoint.replace(/\/v1\/?$/, "");
  const model = combo?.name ?? router.selectedCombo;
  return [
    "# AIIA standalone router config",
    `AIIA_ROUTER_MODE="${router.mode}"`,
    `AIIA_ROUTER_BASE_URL="${endpointNoV1}"`,
    `AIIA_ROUTER_GATEWAY_PATH="${router.gatewayPath}"`,
    `AIIA_ROUTER_API_KEY="${router.apiKey}"`,
    `MODEL="${model}"`,
    "",
    "# Provider keys stay local to this app/runtime",
    ...router.providers.map((provider) => `${provider.apiKeyEnv}="${provider.status === "needs-key" ? "paste-key-here" : "local-token-or-oauth"}"`),
    "",
    "# Embedded router behavior",
    JSON.stringify(
      {
        mode: router.mode,
        fallbackStrategy: router.fallbackStrategy,
        tokenSaver: router.tokenSaver,
        formatTranslation: router.formatTranslation,
        combo: combo?.models ?? []
      },
      null,
      2
    )
  ].join("\n");
}

function buildStandaloneRoutePlan(router, combo) {
  const tierOrder =
    router.fallbackStrategy === "free-first"
      ? ["free", "cheap", "subscription", "custom"]
      : router.fallbackStrategy === "manual-order"
        ? []
        : ["subscription", "cheap", "free", "custom"];
  const comboModels = combo?.models ?? [];
  const routes = comboModels
    .map((model) => {
      const providerId = model.split("/")[0];
      const provider = router.providers.find((item) => item.id === providerId);
      return provider ? { provider, model } : null;
    })
    .filter(Boolean)
    .filter(({ provider }) => provider.enabled && provider.status !== "needs-key" && provider.quota > 0);

  if (router.fallbackStrategy === "manual-order") return routes;
  return routes.sort((a, b) => tierOrder.indexOf(a.provider.tier) - tierOrder.indexOf(b.provider.tier));
}

function buildHandoff(state, provider) {
  const pinnedMemory = state.options.includeMemory ? state.memory.filter((item) => item.pinned) : [];
  const recentTurns = state.turns.slice(-6);
  const { handoff: _handoff, ...workingFiles } = state.files;
  const selectedCombo = state.router.combos.find((combo) => combo.id === state.router.selectedCombo) ?? state.router.combos[0];
  return {
    schema: "aiia.context-capsule.v1",
    sessionName: state.sessionName,
    generatedAt: new Date().toISOString(),
    route: {
      provider: provider.id,
      model: provider.model,
      policy: state.policy
    },
    router: {
      mode: state.router.mode,
      endpoint: state.router.endpoint,
      gatewayPath: state.router.gatewayPath,
      selectedCombo: selectedCombo?.name ?? state.router.selectedCombo,
      comboModels: selectedCombo?.models ?? [],
      fallbackStrategy: state.router.fallbackStrategy,
      tokenSaver: state.router.tokenSaver,
      formatTranslation: state.router.formatTranslation,
      requestLogging: state.router.requestLogging,
      quotaTracking: state.router.quotaTracking,
      providers: state.router.providers.map(({ id, label, auth, tier, status, enabled, model, baseUrl, apiKeyEnv, quota }) => ({
        id,
        label,
        auth,
        tier,
        status,
        enabled,
        model,
        baseUrl,
        apiKeyEnv,
        quota
      })),
      routePlan: buildStandaloneRoutePlan(state.router, selectedCombo).map(({ provider, model }) => ({
        providerId: provider.id,
        provider: provider.label,
        model,
        tier: provider.tier,
        baseUrl: provider.baseUrl,
        apiKeyEnv: provider.apiKeyEnv
      })),
      standaloneRule: "Route locally from this config. Do not require a running 9Router service."
    },
    task: {
      prompt: state.activeTask.prompt,
      phase: state.activeTask.phase,
      plan: state.activeTask.plan,
      implementation: state.activeTask.implementation,
      currentStep: state.activeTask.currentStep,
      resumeInstruction: state.activeTask.resumeInstruction,
      switchEvents: state.activeTask.switchEvents,
      continuityRule:
        "When provider changes because of quota limit or manual routing, continue from this task object and files without asking for a new prompt/context."
    },
    continuity: {
      objective: pinnedMemory[0]?.body ?? "",
      pinnedMemory,
      recentTurns,
      includeCode: state.options.includeCode,
      includeMemory: state.options.includeMemory,
      includeDiff: state.options.includeDiff
    },
    files: state.options.includeCode ? workingFiles : {},
    diffSummary: state.options.includeDiff ? "Working changes are represented by active editor content and recent turns." : "",
    resumePrompt:
      "Continue this session from the Context Capsule. Preserve user decisions, active files, and pinned memory. If provider-specific context is missing, infer from capsule fields before asking."
  };
}

function Metric({ value, label }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CheckRow({ checked, label, onChange }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ConversationPanel({ turns, onAddTurn }) {
  const [text, setText] = useState("");
  return (
    <section className="panel">
      <div className="section-head">
        <h2>Conversation Turns</h2>
        <GitBranch size={16} aria-hidden="true" />
      </div>
      <form
        className="turn-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = text.trim();
          if (!trimmed) return;
          onAddTurn(trimmed);
          setText("");
        }}
      >
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="บันทึกสิ่งที่ user/agent ตัดสินใจล่าสุด" />
        <button type="submit">
          <Network size={15} />
          Add turn
        </button>
      </form>
      <div className="turn-list">
        {turns
          .slice(-5)
          .reverse()
          .map((turn) => (
            <article className="turn-item" key={`${turn.at}-${turn.text}`}>
              <time>{new Date(turn.at).toLocaleString()}</time>
              {turn.text}
            </article>
          ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
