import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Braces, Check, Clipboard, Copy, FileJson, FileText, GitBranch, Github, Loader2, Network, Plus, RefreshCcw, Save, Search, Settings, X } from "lucide-react";
import "../styles.css";

const apiBase = "http://127.0.0.1:20128";
const oauthCallbackUri = "http://localhost:20128/callback";
const storageKey = "aiia-code-workspace:v1";

const initialFiles = {
  "src/main.ts": `type Provider = "openai" | "anthropic" | "gemini" | "local";

export async function askRouter(prompt: string) {
  const response = await fetch("http://127.0.0.1:20128/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "always-on-coding",
      messages: [{ role: "user", content: prompt }]
    })
  });

  return response.json();
}`,
  "README.md": `# AIIA Code Workspace

Local code editor backed by a standalone AI router.

- Edit files in the center editor
- Pick a router model/provider on the right
- Send prompts from the composer
- Inspect router output in the bottom panel`,
  "router.config.json": JSON.stringify(
    {
      baseUrl: "http://127.0.0.1:20128/v1",
      model: "always-on-coding"
    },
    null,
    2
  )
};

function loadWorkspace() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) ?? { activeFile: "src/main.ts", files: initialFiles };
  } catch {
    return { activeFile: "src/main.ts", files: initialFiles };
  }
}

function App() {
  const [page, setPage] = useState("editor");
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [savedFiles, setSavedFiles] = useState(workspace.files);
  const [providers, setProviders] = useState([]);
  const [combos, setCombos] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedModel, setSelectedModel] = useState("always-on-coding");
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [backendStatus, setBackendStatus] = useState("checking");
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [bottomTab, setBottomTab] = useState("terminal");
  const [output, setOutput] = useState(["AIIA workspace ready"]);
  const [problems, setProblems] = useState([]);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [cursor, setCursor] = useState({ line: 1, column: 1, selection: 0 });
  const [githubStatus, setGithubStatus] = useState(null);
  const [providerFocusId, setProviderFocusId] = useState(null);
  const editorRef = useRef(null);

  const activeText = workspace.files[workspace.activeFile] ?? "";
  const dirtyFiles = useMemo(() => Object.keys(workspace.files).filter((file) => workspace.files[file] !== savedFiles[file]), [savedFiles, workspace.files]);
  const findMatches = useMemo(() => (findQuery ? activeText.match(new RegExp(escapeRegExp(findQuery), "gi"))?.length ?? 0 : 0), [activeText, findQuery]);
  const activeProvider = providers.find((provider) => provider.id === selectedProvider) ?? providers[0];

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    refreshBackend();
  }, []);

  useEffect(() => {
    const nextProblems = [];
    if (backendStatus !== "online") nextProblems.push("Backend router is offline or not reachable.");
    if (dirtyFiles.length) nextProblems.push(`${dirtyFiles.length} file(s) have unsaved changes.`);
    if (!providers.length) nextProblems.push("No providers loaded from backend.");
    setProblems(nextProblems);
  }, [backendStatus, dirtyFiles.length, providers.length]);

  async function refreshBackend() {
    try {
      const [providerRes, comboRes, connectionRes, parityRes, githubRes] = await Promise.all([
        fetch(`${apiBase}/api/providers`),
        fetch(`${apiBase}/api/combos`),
        fetch(`${apiBase}/api/provider-connections`),
        fetch(`${apiBase}/api/parity/status`),
        fetch(`${apiBase}/api/github/status`)
      ]);
      if (!providerRes.ok || !comboRes.ok || !parityRes.ok) throw new Error("backend unavailable");
      setProviders(await providerRes.json());
      setCombos(await comboRes.json());
      setConnections(connectionRes.ok ? await connectionRes.json() : []);
      setGithubStatus(githubRes.ok ? await githubRes.json() : null);
      setBackendStatus("online");
      setOutput((current) => [`Backend online: ${apiBase}`, ...current].slice(0, 12));
    } catch (error) {
      setBackendStatus("offline");
      setOutput((current) => [`Backend check failed: ${error.message}`, ...current].slice(0, 12));
    }
  }

  function openProviders(detailId = null) {
    setProviderFocusId(detailId);
    setPage("providers");
  }

  function updateActiveFile(value) {
    setWorkspace((current) => ({
      ...current,
      files: { ...current.files, [current.activeFile]: value }
    }));
  }

  function saveActiveFile() {
    setSavedFiles((current) => ({ ...current, [workspace.activeFile]: activeText }));
    setOutput((current) => [`Saved ${workspace.activeFile}`, ...current].slice(0, 12));
  }

  function addFile() {
    const name = `src/new-file-${Object.keys(workspace.files).length + 1}.ts`;
    setWorkspace((current) => ({ activeFile: name, files: { ...current.files, [name]: "" } }));
  }

  function updateCursor(target) {
    const before = target.value.slice(0, target.selectionStart);
    const lines = before.split("\n");
    setCursor({ line: lines.length, column: lines.at(-1).length + 1, selection: Math.abs(target.selectionEnd - target.selectionStart) });
  }

  async function sendPrompt(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setIsSending(true);
    setBottomTab("output");
    const context = `Active file: ${workspace.activeFile}\n\n${activeText}`;
    try {
      const response = await fetch(`${apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: "You are helping edit code. Return concise, actionable guidance or a patch description." },
            { role: "user", content: `${prompt}\n\n${context}` }
          ]
        })
      });
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2);
      setOutput((current) => [`> ${prompt}`, text, ...current].slice(0, 12));
      setPrompt("");
    } catch (error) {
      setOutput((current) => [`Router request failed: ${error.message}`, ...current].slice(0, 12));
    } finally {
      setIsSending(false);
    }
  }

  if (page === "providers") {
    return (
      <ProvidersPage
        providers={providers}
        connections={connections}
        backendStatus={backendStatus}
        initialDetailId={providerFocusId}
        onBack={() => {
          setProviderFocusId(null);
          setPage("editor");
        }}
        onRefresh={refreshBackend}
        onOutput={(line) => setOutput((current) => [line, ...current].slice(0, 12))}
      />
    );
  }

  return (
    <main className="code-app">
      <aside className="activity-bar">
        <button className="active" title="Explorer"><FileText size={20} /></button>
        <button title="Search" onClick={() => setFindOpen((value) => !value)}><Search size={20} /></button>
        <button title="Providers" onClick={() => openProviders()}><Network size={20} /></button>
        <button title="Settings" onClick={() => openProviders()}><Settings size={20} /></button>
      </aside>

      <aside className="explorer-pane">
        <div className="pane-head">
          <strong>Explorer</strong>
          <button onClick={addFile} title="New file"><Plus size={16} /></button>
        </div>
        <div className="file-tree">
          {Object.keys(workspace.files).map((file) => (
            <button className={`file-row ${workspace.activeFile === file ? "active" : ""}`} key={file} onClick={() => setWorkspace((current) => ({ ...current, activeFile: file }))}>
              {file.endsWith(".json") ? <FileJson size={15} /> : file.endsWith(".md") ? <FileText size={15} /> : <Braces size={15} />}
              <span>{dirtyFiles.includes(file) ? `${file} *` : file}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="editor-pane">
        <header className="editor-titlebar">
          <div className="tabs">
            <button className="tab active">{workspace.activeFile}</button>
          </div>
          <div className="toolbar">
            <button onClick={() => setFindOpen((value) => !value)}><Search size={15} />Find</button>
            <button onClick={saveActiveFile}><Save size={15} />Save</button>
            <button onClick={() => openProviders("github-copilot")} title="Connect GitHub Copilot"><Github size={15} />GitHub</button>
            <button onClick={refreshBackend}><RefreshCcw size={15} />Router</button>
          </div>
        </header>

        {findOpen ? (
          <div className="find-bar">
            <input value={findQuery} onChange={(event) => setFindQuery(event.target.value)} placeholder="Find in current file" autoFocus />
            <span>{findMatches} matches</span>
            <button onClick={() => setFindOpen(false)}>Close</button>
          </div>
        ) : null}

        <div className="editor-wrap">
          <pre className="gutter">{lineNumbers(activeText)}</pre>
          <textarea
            ref={editorRef}
            className="code-editor"
            spellCheck="false"
            value={activeText}
            onChange={(event) => {
              updateActiveFile(event.target.value);
              updateCursor(event.currentTarget);
            }}
            onClick={(event) => updateCursor(event.currentTarget)}
            onKeyUp={(event) => updateCursor(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                const target = event.currentTarget;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                updateActiveFile(`${target.value.slice(0, start)}  ${target.value.slice(end)}`);
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 2;
                  updateCursor(target);
                });
              }
            }}
          />
        </div>

        <form className="prompt-composer" onSubmit={sendPrompt}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask the router to explain, refactor, or patch the current file" />
          <div className="composer-actions">
            <span>{selectedModel}</span>
            <button disabled={isSending || backendStatus !== "online"} type="submit">{isSending ? "Sending..." : "Send"}</button>
          </div>
        </form>

        <section className="bottom-panel">
          <div className="bottom-tabs">
            {["terminal", "problems", "output"].map((tab) => (
              <button className={bottomTab === tab ? "active" : ""} key={tab} onClick={() => setBottomTab(tab)}>{capitalize(tab)}</button>
            ))}
          </div>
          <BottomPanel tab={bottomTab} output={output} problems={problems} backendStatus={backendStatus} selectedModel={selectedModel} activeProvider={activeProvider} dirtyFiles={dirtyFiles} githubStatus={githubStatus} />
        </section>

        <footer className="status-bar">
          <button className="status-link" type="button" onClick={() => openProviders("github-copilot")} title="GitHub Copilot connection">
            <Github size={13} />
            {githubStatus?.connected ? githubStatus.accounts?.[0] ?? "GitHub connected" : "Connect GitHub"}
          </button>
          <span><GitBranch size={13} /> {githubStatus?.repository?.branch ?? "no-git"}</span>
          <span>{githubStatus?.repository?.remote ? githubStatus.repository.remote.replace(/^https?:\/\/github\.com\//, "") : "local workspace"}</span>
          <span>{dirtyFiles.length ? `${dirtyFiles.length} unsaved` : "saved"}</span>
          <span>Ln {cursor.line}, Col {cursor.column}{cursor.selection ? ` (${cursor.selection} selected)` : ""}</span>
          <span>{languageFor(workspace.activeFile)}</span>
          <span>{backendStatus}</span>
        </footer>
      </section>

      <aside className="router-pane">
        <div className="pane-head">
          <strong>Router</strong>
          <span className={`status-pill ${backendStatus}`}>{backendStatus}</span>
        </div>
        <label className="field">
          <span>Model / Combo</span>
          <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
            {combos.map((combo) => <option value={combo.name} key={combo.id}>{combo.name}</option>)}
            {providers.map((provider) => <option value={`${provider.id}/${provider.model}`} key={provider.id}>{provider.id}/{provider.model}</option>)}
          </select>
        </label>
        <div className="ai-list">
          {providers.map((provider) => (
            <button className={`ai-row ${selectedProvider === provider.id ? "active" : ""}`} key={provider.id} onClick={() => setSelectedProvider(provider.id)}>
              <div>
                <strong>{provider.label}</strong>
                <small>{provider.model}</small>
              </div>
              <span>{provider.status}</span>
            </button>
          ))}
        </div>
        <section className="router-summary">
          <strong>Connections</strong>
          <span>{connections.length} imported OAuth connection(s)</span>
          <button onClick={() => openProviders("github-copilot")}>Manage providers</button>
        </section>
      </aside>
    </main>
  );
}

const PROVIDER_SECTIONS = [
  {
    id: "custom",
    title: "Custom Providers (OpenAI/Anthropic Compatible)",
    description: "No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints.",
    entries: [
      { catalogId: "local", providerId: "local", label: "Local OpenAI-compatible", icon: "LO", tone: "slate" },
      { catalogId: "openrouter", providerId: "openrouter", label: "OpenRouter", icon: "OR", tone: "gray" },
      { catalogId: "builtin", providerId: "builtin", label: "Built-in Assistant", icon: "BI", tone: "green" }
    ]
  },
  {
    id: "oauth",
    title: "OAuth Providers",
    description: "Connect subscription and IDE OAuth sessions.",
    entries: [
      { catalogId: "claude-code", providerId: "anthropic", label: "Claude Code", icon: "CC", tone: "orange", oauthFlow: "claude-code" },
      { catalogId: "antigravity", providerId: "antigravity", label: "Antigravity", icon: "AG", tone: "violet", discoveryId: "antigravity", oauthFlow: "antigravity" },
      { catalogId: "openai-codex", providerId: "openai", label: "OpenAI Codex", icon: "OX", tone: "dark", discoveryId: "openai" },
      { catalogId: "github-copilot", providerId: "github-copilot", label: "GitHub Copilot", icon: "GH", tone: "blue", discoveryId: "github-copilot", oauthFlow: "github-copilot" },
      { catalogId: "cursor", providerId: "cursor", label: "Cursor IDE", icon: "CU", tone: "dark", discoveryId: "cursor" },
      { catalogId: "xai", providerId: "xai", label: "xAI (Grok)", icon: "XA", tone: "dark" },
      { catalogId: "kilo", providerId: "kilo", label: "Kilo Code", icon: "KL", tone: "orange" },
      { catalogId: "cline", providerId: "cline", label: "Cline", icon: "CL", tone: "purple" },
      { catalogId: "qwen", providerId: "qwen", label: "Qwen CLI", icon: "QW", tone: "purple", discoveryId: "qwen" }
    ]
  },
  {
    id: "free",
    title: "Free Tier Providers",
    description: "Free or low-cost model endpoints.",
    entries: [
      { catalogId: "kiro", providerId: "kiro", label: "Kiro AI", icon: "KI", tone: "purple", discoveryId: "kiro" },
      { catalogId: "gemini-cli", providerId: "gemini", label: "Gemini CLI", icon: "GC", tone: "gray", discoveryId: "gemini" },
      { catalogId: "gemini", providerId: "gemini", label: "Gemini", icon: "GM", tone: "blue", discoveryId: "gemini" },
      { catalogId: "openrouter-free", providerId: "openrouter", label: "OpenRouter", icon: "OR", tone: "gray" },
      { catalogId: "opencode", providerId: "opencode", label: "OpenCode Free", icon: "OC", tone: "dark" }
    ]
  }
];

const OAUTH_FLOW_CONFIG = {
  "claude-code": {
    providerId: "anthropic",
    title: "Claude Code",
    authorizePath: "/api/oauth/claude/authorize",
    exchangePath: "/api/oauth/claude/exchange"
  },
  antigravity: {
    providerId: "antigravity",
    title: "Antigravity",
    authorizePath: "/api/oauth/antigravity/authorize",
    exchangePath: "/api/oauth/antigravity/exchange"
  },
  "github-copilot": {
    providerId: "github-copilot",
    title: "GitHub Copilot",
    flowType: "device",
    authorizePath: "/api/oauth/github-copilot/authorize",
    pollPath: "/api/oauth/github-copilot/poll"
  }
};

const CLAUDE_CODE_MODELS = [
  { id: "cc/claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "cc/claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { id: "cc/claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "cc/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }
];

function connectionCount(connections, providerId) {
  return connections.filter((connection) => connection.provider === providerId).length;
}

function connectionStatusLabel(count, provider) {
  if (count > 0) return `${count} Connected`;
  if (provider?.status === "ready" || provider?.status === "connected") return "Ready";
  if (provider?.enabled === false) return "Disabled";
  return "No connections";
}

function ProvidersPage({ providers, connections, backendStatus, initialDetailId, onBack, onRefresh, onOutput }) {
  const [scan, setScan] = useState(null);
  const [detailId, setDetailId] = useState(initialDetailId);
  const [oauthModalFlow, setOauthModalFlow] = useState(null);
  const [search, setSearch] = useState("");
  const [connectionSettings, setConnectionSettings] = useState({});
  const oauthPopupRef = useRef(null);

  useEffect(() => {
    if (initialDetailId) setDetailId(initialDetailId);
  }, [initialDetailId]);

  useEffect(() => {
    fetch(`${apiBase}/api/provider-connections/settings`)
      .then((response) => (response.ok ? response.json() : {}))
      .then((payload) => setConnectionSettings(payload))
      .catch(() => setConnectionSettings({}));
  }, [connections.length, detailId]);

  const detailEntry = PROVIDER_SECTIONS.flatMap((section) => section.entries).find((entry) => entry.catalogId === detailId);
  const detailProvider = providers.find((provider) => provider.id === detailEntry?.providerId);
  const detailConnections = connections.filter((connection) => connection.provider === detailEntry?.providerId);

  async function scanOauth() {
    const response = await fetch(`${apiBase}/api/oauth/discover`);
    const payload = await response.json();
    setScan(payload);
    onOutput("Scanned local OAuth paths");
  }

  async function importOauth(providerId) {
    const response = await fetch(`${apiBase}/api/oauth/import-local/${providerId}`, { method: "POST" });
    const payload = await response.json();
    onOutput(response.ok ? `Imported OAuth for ${providerId}` : `Import failed: ${payload.error?.message ?? "unknown error"}`);
    await onRefresh();
  }

  function openDetail(entry) {
    setDetailId(entry.catalogId);
    if (entry.oauthFlow) setOauthModalFlow(null);
  }

  async function updateConnectionSettings(providerId, patch) {
    const next = {
      ...connectionSettings,
      [providerId]: { ...(connectionSettings[providerId] ?? {}), ...patch }
    };
    const response = await fetch(`${apiBase}/api/provider-connections/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next)
    });
    if (response.ok) {
      setConnectionSettings(await response.json());
      onOutput(`Updated routing settings for ${providerId}`);
    }
  }

  if (detailEntry) {
    return (
      <main className="providers-page providers-page-detail">
        <ProviderDetailView
          entry={detailEntry}
          provider={detailProvider}
          connections={detailConnections}
          connectionSettings={connectionSettings[detailEntry.providerId] ?? {}}
          scan={scan}
          backendStatus={backendStatus}
          onBack={() => setDetailId(null)}
          onRefresh={onRefresh}
          onScan={scanOauth}
          onImport={importOauth}
          onUpdateConnectionSettings={(patch) => updateConnectionSettings(detailEntry.providerId, patch)}
          onOpenOAuthModal={() => {
            if (OAUTH_FLOW_CONFIG[detailEntry.oauthFlow]?.flowType !== "device") {
              oauthPopupRef.current = window.open("about:blank", "_blank");
            }
            setOauthModalFlow(detailEntry.oauthFlow);
          }}
        />
        {oauthModalFlow && OAUTH_FLOW_CONFIG[oauthModalFlow] ? (
          OAUTH_FLOW_CONFIG[oauthModalFlow].flowType === "device" ? (
            <ConnectDeviceOAuthModal
              flow={OAUTH_FLOW_CONFIG[oauthModalFlow]}
              connections={connections}
              onClose={() => setOauthModalFlow(null)}
              onConnected={async () => {
                await onRefresh();
                onOutput(`${OAUTH_FLOW_CONFIG[oauthModalFlow].title} connected`);
                setOauthModalFlow(null);
              }}
              onOutput={onOutput}
            />
          ) : (
            <ConnectOAuthModal
              flow={OAUTH_FLOW_CONFIG[oauthModalFlow]}
              oauthPopupRef={oauthPopupRef}
              connections={connections}
              onClose={() => {
                oauthPopupRef.current = null;
                setOauthModalFlow(null);
              }}
              onConnected={async () => {
                await onRefresh();
                onOutput(`${OAUTH_FLOW_CONFIG[oauthModalFlow].title} connected`);
                oauthPopupRef.current = null;
                setOauthModalFlow(null);
              }}
              onOutput={onOutput}
            />
          )
        ) : null}
      </main>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredSections = PROVIDER_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => !query || entry.label.toLowerCase().includes(query) || entry.providerId.includes(query))
  })).filter((section) => section.entries.length > 0);

  return (
    <main className="providers-page providers-board">
      <header className="providers-header providers-topbar">
        <div className="brand">
          <div className="mark">AI</div>
          <div>
            <h1>Providers</h1>
            <p>Manage your AI provider connections.</p>
          </div>
        </div>
        <div className="providers-toolbar">
          <label className="providers-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search providers..." />
          </label>
          <span className={`status-pill ${backendStatus}`}>{backendStatus}</span>
          <button onClick={scanOauth}>Scan local OAuth</button>
          <button onClick={onRefresh}>Refresh</button>
          <button onClick={onBack}>Back to editor</button>
        </div>
      </header>

      <div className="providers-catalog-scroll">
        {filteredSections.map((section) => (
          <section className="provider-category" key={section.id}>
            <div className="category-head">
              <div>
                <h2>{section.title}</h2>
                {section.id === "custom" ? <p className="category-hint">{section.description}</p> : null}
              </div>
              <div className="category-actions">
                {section.id === "custom" ? (
                  <>
                    <button className="add-provider-btn anthropic" onClick={() => onOutput("Custom Anthropic-compatible providers: coming soon")}>+ Add Anthropic Compatible</button>
                    <button className="add-provider-btn" onClick={() => onOutput("Custom OpenAI-compatible providers: coming soon")}>+ Add OpenAI Compatible</button>
                  </>
                ) : null}
                {section.id === "oauth" || section.id === "free" ? <button className="ghost-btn light" onClick={scanOauth}>Test All</button> : null}
              </div>
            </div>
            <div className="provider-grid">
              {section.entries.map((entry) => {
                const provider = providers.find((item) => item.id === entry.providerId);
                const count = connectionCount(connections, entry.providerId);
                const discovery = scan?.results?.find((item) => item.provider === entry.discoveryId);
                const status = count > 0 ? `${count} Connected` : discovery?.found ? "Local OAuth found" : connectionStatusLabel(count, provider);
                return (
                  <button className={`provider-card tone-${entry.tone}`} key={entry.catalogId} onClick={() => openDetail(entry)}>
                    <span className="provider-card-icon">{entry.icon}</span>
                    <span className="provider-card-body">
                      <strong>{entry.label}</strong>
                      <small className={count > 0 ? "status-connected" : status === "Disabled" ? "status-disabled" : ""}>{status}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {!filteredSections.length ? <p className="category-empty">No providers match your search.</p> : null}
      </div>
    </main>
  );
}

function ProviderDetailView({ entry, provider, connections, connectionSettings, scan, backendStatus, onBack, onRefresh, onScan, onImport, onUpdateConnectionSettings, onOpenOAuthModal }) {
  const discovery = scan?.results?.find((item) => item.provider === entry.discoveryId);
  const models = entry.catalogId === "claude-code" ? CLAUDE_CODE_MODELS : provider ? [{ id: `${provider.id}/${provider.model}`, label: provider.model }] : [];
  const supportsRoundRobin = entry.oauthFlow === "antigravity" || entry.oauthFlow === "claude-code" || entry.oauthFlow === "github-copilot";
  const roundRobinEnabled = connectionSettings.roundRobin ?? true;

  return (
    <>
      <header className="providers-header provider-detail-header">
        <div className="detail-nav">
          <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Providers</button>
          <div className="detail-title-row">
            <span className={`provider-card-icon large tone-${entry.tone}`}>{entry.icon}</span>
            <div>
              <p className="detail-breadcrumb">Providers &gt; {entry.label}</p>
              <h1>{entry.label}</h1>
              <p className="muted-text">
                {connections.length ? `${connections.length} connection${connections.length > 1 ? "s" : ""}` : "No connections"}
                {entry.oauthFlow === "claude-code" ? <> · <a href="https://claude.ai" target="_blank" rel="noreferrer">Sign up / Learn more</a></> : null}
                {entry.oauthFlow === "github-copilot" ? <> · <a href="https://github.com/features/copilot" target="_blank" rel="noreferrer">Copilot subscription</a></> : null}
              </p>
            </div>
          </div>
        </div>
        <div className="providers-actions">
          <span className={`status-pill ${backendStatus}`}>{backendStatus}</span>
          <button onClick={onRefresh}>Refresh</button>
        </div>
      </header>

      {entry.oauthFlow ? (
        <div className="risk-banner">Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.</div>
      ) : null}

      <section className="provider-detail-panel">
        <div className="section-head">
          <h2>Connections</h2>
          <button className="ghost-btn" onClick={onScan}>Scan local OAuth</button>
        </div>
        {supportsRoundRobin ? (
          <label className="round-robin-toggle">
            <input
              type="checkbox"
              checked={roundRobinEnabled}
              onChange={(event) => onUpdateConnectionSettings({ roundRobin: event.target.checked })}
            />
            <span>Round Robin — rotate across {connections.length || "multiple"} account(s) on each request</span>
          </label>
        ) : null}
        {connections.map((connection, index) => (
          <article className="connection-account-row" key={connection.id}>
            <div className="connection-account-main">
              <strong>Account {index + 1}</strong>
              <span className={`status-pill ${connection.inCooldown ? "cooldown" : "connected"}`}>
                {connection.inCooldown ? "cooldown" : connection.hasAccessToken ? "active" : "refresh only"}
              </span>
              <span className="oauth-tag">OAuth</span>
            </div>
            <code>{connection.sourcePath ?? connection.importedAt}</code>
            <small>
              {connection.inCooldown && connection.cooldownUntil
                ? `cooldown until ${new Date(connection.cooldownUntil).toLocaleString()}`
                : connection.expiresAt
                  ? `expires ${new Date(connection.expiresAt).toLocaleDateString()}`
                  : "no expiry"}
            </small>
            {connection.inCooldown && connection.lastError ? <small className="cooldown-error">{connection.lastError}</small> : null}
          </article>
        ))}
        {!connections.length ? <p className="muted-text">No connections yet.</p> : null}
        {discovery?.found ? (
          <button className="secondary-btn" onClick={() => onImport(entry.discoveryId)}>Import local OAuth</button>
        ) : null}
        {entry.oauthFlow ? (
          <button className="primary-btn" onClick={onOpenOAuthModal}><Plus size={16} /> Add</button>
        ) : discovery?.found ? null : (
          <button className="primary-btn" onClick={onScan}><Plus size={16} /> Scan &amp; import</button>
        )}
      </section>

      {provider ? (
        <section className="provider-detail-panel">
          <div className="section-head"><h2>Endpoint</h2></div>
          <div className="provider-form">
            <label className="field"><span>Model</span><input readOnly value={provider.model} /></label>
            <label className="field"><span>API key env</span><input readOnly value={provider.apiKeyEnv || "—"} /></label>
            <label className="field"><span>Status</span><input readOnly value={provider.status} /></label>
          </div>
        </section>
      ) : null}

      <section className="provider-detail-panel">
        <div className="section-head"><h2>Available Models</h2></div>
        <div className="model-grid">
          {models.map((model) => (
            <article className="model-card" key={model.id}>
              <span className="model-card-icon">🤖</span>
              <div>
                <code>{model.id}</code>
                <strong>{model.label}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function openOAuthAuthorizeUrl(authUrl, oauthPopupRef) {
  const popup = oauthPopupRef?.current;
  if (popup && !popup.closed) {
    popup.location.replace(authUrl);
    return true;
  }
  return Boolean(window.open(authUrl, "_blank"));
}

function ConnectDeviceOAuthModal({ flow, connections, onClose, onConnected, onOutput }) {
  const [deviceSession, setDeviceSession] = useState(null);
  const [waiting, setWaiting] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const initialCount = useRef(connectionCount(connections, flow.providerId));

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch(`${apiBase}${flow.authorizePath}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Failed to start device OAuth");
        if (cancelled) return;
        setDeviceSession(payload);
        if (payload.verificationUriComplete) window.open(payload.verificationUriComplete, "_blank");
      } catch (error) {
        onOutput(`${flow.title} OAuth failed: ${error.message}`);
        setWaiting(false);
      }
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [flow.authorizePath, flow.title, onOutput]);

  useEffect(() => {
    if (!waiting || !deviceSession?.state) return undefined;
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const response = await fetch(`${apiBase}${flow.pollPath}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: deviceSession.state })
        });
        const payload = await response.json();
        if (cancelled) return;
        if (response.ok && payload.status === "connected") {
          setWaiting(false);
          await onConnected();
          return;
        }
        if (!response.ok) throw new Error(payload.error?.message ?? "Device OAuth poll failed");
        timer = setTimeout(poll, (payload.interval ?? deviceSession.interval ?? 5) * 1000);
      } catch (error) {
        if (!cancelled) {
          onOutput(`${flow.title} connect failed: ${error.message}`);
          setWaiting(false);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [waiting, deviceSession, flow.pollPath, flow.title, onConnected, onOutput]);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/api/provider-connections`);
        if (!response.ok) return;
        const payload = await response.json();
        if (connectionCount(payload, flow.providerId) > initialCount.current) {
          setWaiting(false);
          await onConnected();
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [waiting, onConnected, flow.providerId]);

  async function copyValue(value, setter) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setter(true);
    setTimeout(() => setter(false), 1500);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="oauth-modal" onClick={(event) => event.stopPropagation()}>
        <header className="oauth-modal-head">
          <div className="window-dots"><span /><span /><span /></div>
          <h2>Connect {flow.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="oauth-waiting">
          {waiting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          <span>{waiting ? "Waiting for GitHub authorization..." : "Authorization received"}</span>
        </div>

        <p className="oauth-step-note">Sign in at GitHub and approve access for GitHub Copilot (VS Code app).</p>

        <label className="oauth-step">
          <span>Step 1: Open GitHub device login</span>
          <div className="oauth-copy-row">
            <input readOnly value={deviceSession?.verificationUri ?? "https://github.com/login/device"} />
            <button type="button" disabled={!deviceSession?.verificationUri} onClick={() => copyValue(deviceSession?.verificationUri, setCopiedUrl)}>
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
              Copy
            </button>
            <button type="button" disabled={!deviceSession?.verificationUriComplete} onClick={() => window.open(deviceSession?.verificationUriComplete ?? deviceSession?.verificationUri, "_blank")}>
              Open
            </button>
          </div>
        </label>

        <label className="oauth-step">
          <span>Step 2: Enter this code on GitHub</span>
          <div className="oauth-copy-row device-code-row">
            <input readOnly className="device-user-code" value={deviceSession?.userCode ?? "Loading..."} />
            <button type="button" disabled={!deviceSession?.userCode} onClick={() => copyValue(deviceSession?.userCode, setCopiedCode)}>
              {copiedCode ? <Check size={14} /> : <Copy size={14} />}
              Copy code
            </button>
          </div>
        </label>

        <footer className="oauth-modal-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}

function ConnectOAuthModal({ flow, oauthPopupRef, connections, onClose, onConnected, onOutput }) {
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState(oauthCallbackUri);
  const [oauthSession, setOauthSession] = useState(null);
  const [callbackInput, setCallbackInput] = useState("");
  const [waiting, setWaiting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const initialCount = useRef(connectionCount(connections, flow.providerId));

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch(`${apiBase}${flow.authorizePath}?redirect_uri=${encodeURIComponent(oauthCallbackUri)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "Failed to start OAuth");
        if (cancelled) return;
        const authUrl = payload.authUrl ?? payload.url;
        if (!authUrl) throw new Error("Authorize endpoint did not return authUrl");
        setAuthorizeUrl(authUrl);
        setRedirectUri(payload.redirectUri ?? oauthCallbackUri);
        setOauthSession({
          codeVerifier: payload.codeVerifier,
          state: payload.state,
          redirectUri: payload.redirectUri ?? oauthCallbackUri
        });
        const opened = openOAuthAuthorizeUrl(authUrl, oauthPopupRef);
        setPopupBlocked(!opened);
        if (!opened) onOutput(`${flow.title} OAuth: popup blocked — use Open in browser below`);
      } catch (error) {
        onOutput(`${flow.title} OAuth failed: ${error.message}`);
        setWaiting(false);
      }
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [flow.authorizePath, flow.title, oauthPopupRef, onOutput]);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/api/provider-connections`);
        if (!response.ok) return;
        const payload = await response.json();
        const count = connectionCount(payload, flow.providerId);
        if (count > initialCount.current) {
          setWaiting(false);
          await onConnected();
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [waiting, onConnected, flow.providerId]);

  async function copyAuthorizeUrl() {
    if (!authorizeUrl) return;
    await navigator.clipboard.writeText(authorizeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function submitCallback() {
    setSubmitting(true);
    try {
      const trimmed = callbackInput.trim();
      const redirect = oauthSession?.redirectUri ?? redirectUri;
      let body;
      if (trimmed.includes("://")) {
        body = { callbackUrl: trimmed, redirectUri: redirect };
      } else if (flow.providerId === "antigravity") {
        body = { code: trimmed, redirectUri: redirect };
      } else {
        body = {
          code: trimmed,
          state: oauthSession?.state,
          redirectUri: redirect,
          codeVerifier: oauthSession?.codeVerifier
        };
      }
      const response = await fetch(`${apiBase}${flow.exchangePath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Connect failed");
      setWaiting(false);
      await onConnected();
    } catch (error) {
      onOutput(`${flow.title} connect failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="oauth-modal" onClick={(event) => event.stopPropagation()}>
        <header className="oauth-modal-head">
          <div className="window-dots"><span /><span /><span /></div>
          <h2>Connect {flow.title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="oauth-waiting">
          {waiting ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          <span>
            {waiting
              ? popupBlocked
                ? "Popup blocked — open the authorize URL below"
                : "Waiting for popup authorization..."
              : "Authorization received"}
          </span>
        </div>

        <div className="oauth-divider"><span>OR PASTE CALLBACK URL MANUALLY</span></div>

        <label className="oauth-step">
          <span>Step 1: Open this URL in your browser</span>
          <div className="oauth-copy-row">
            <input readOnly value={authorizeUrl} placeholder="Loading authorize URL..." />
            <button type="button" onClick={copyAuthorizeUrl} disabled={!authorizeUrl}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              Copy
            </button>
            <button
              type="button"
              disabled={!authorizeUrl}
              onClick={() => setPopupBlocked(!openOAuthAuthorizeUrl(authorizeUrl, oauthPopupRef))}
            >
              Open in browser
            </button>
          </div>
        </label>

        <label className="oauth-step">
          <span>Step 2: Paste the callback URL here</span>
          <small>After authorization, copy the full URL from your browser.</small>
          <input
            value={callbackInput}
            onChange={(event) => setCallbackInput(event.target.value)}
            placeholder={`${redirectUri}?code=...&state=...`}
          />
        </label>

        <footer className="oauth-modal-actions">
          <button className="primary-btn" disabled={!callbackInput.trim() || submitting} onClick={submitCallback}>
            {submitting ? "Connecting..." : "Connect"}
          </button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}

function BottomPanel({ tab, output, problems, backendStatus, selectedModel, activeProvider, dirtyFiles, githubStatus }) {
  if (tab === "problems") {
    return <div className="bottom-content problems-list">{(problems.length ? problems : ["No problems detected."]).map((problem) => <div className="problem-row" key={problem}>{problem}</div>)}</div>;
  }
  if (tab === "output") {
    return <div className="bottom-content output-list">{output.map((line, index) => <pre key={`${index}-${line}`}>{line}</pre>)}</div>;
  }
  const githubLine = githubStatus?.connected
    ? `GitHub: connected (${githubStatus.accounts?.join(", ") ?? "account"})`
    : githubStatus?.ghCli?.authenticated
      ? `GitHub CLI: ${githubStatus.ghCli.account ?? "authenticated"}`
      : "GitHub: not connected — use toolbar GitHub or Provider Settings";
  const repoLine = githubStatus?.repository?.isGitRepo
    ? `Repo: ${githubStatus.repository.branch ?? "?"} @ ${githubStatus.repository.remote ?? "no remote"}`
    : "Repo: editor uses localStorage workspace (not disk git)";
  return <pre>{`Backend: ${backendStatus}\nEndpoint: ${apiBase}/v1\nModel: ${selectedModel}\nProvider: ${activeProvider?.label ?? "none"}\n${githubLine}\n${repoLine}\nUnsaved files: ${dirtyFiles.length ? dirtyFiles.join(", ") : "none"}`}</pre>;
}

function lineNumbers(text) {
  return Array.from({ length: Math.max(1, text.split("\n").length) }, (_, index) => index + 1).join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function languageFor(file) {
  if (file.endsWith(".json")) return "JSON";
  if (file.endsWith(".md")) return "Markdown";
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) return "React";
  if (file.endsWith(".ts")) return "TypeScript";
  return "Plain Text";
}

createRoot(document.getElementById("root")).render(<App />);
