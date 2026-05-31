import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Braces, Check, Clipboard, FileJson, FileText, GitBranch, Network, Plus, RefreshCcw, Save, Search, Settings } from "lucide-react";
import "../styles.css";

const apiBase = "http://127.0.0.1:20128";
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
      const [providerRes, comboRes, connectionRes, parityRes] = await Promise.all([
        fetch(`${apiBase}/api/providers`),
        fetch(`${apiBase}/api/combos`),
        fetch(`${apiBase}/api/provider-connections`),
        fetch(`${apiBase}/api/parity/status`)
      ]);
      if (!providerRes.ok || !comboRes.ok || !parityRes.ok) throw new Error("backend unavailable");
      setProviders(await providerRes.json());
      setCombos(await comboRes.json());
      setConnections(connectionRes.ok ? await connectionRes.json() : []);
      setBackendStatus("online");
      setOutput((current) => [`Backend online: ${apiBase}`, ...current].slice(0, 12));
    } catch (error) {
      setBackendStatus("offline");
      setOutput((current) => [`Backend check failed: ${error.message}`, ...current].slice(0, 12));
    }
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
        onBack={() => setPage("editor")}
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
        <button title="Providers"><Network size={20} /></button>
        <button title="Settings" onClick={() => setPage("providers")}><Settings size={20} /></button>
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
          <BottomPanel tab={bottomTab} output={output} problems={problems} backendStatus={backendStatus} selectedModel={selectedModel} activeProvider={activeProvider} dirtyFiles={dirtyFiles} />
        </section>

        <footer className="status-bar">
          <span><GitBranch size={13} /> master</span>
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
          <button onClick={() => setPage("providers")}>Manage providers</button>
        </section>
      </aside>
    </main>
  );
}

function ProvidersPage({ providers, connections, backendStatus, onBack, onRefresh, onOutput }) {
  const [scan, setScan] = useState(null);
  const [claudeCodeAuthUrl, setClaudeCodeAuthUrl] = useState("");
  const [selected, setSelected] = useState(providers[0]?.id ?? "openai");
  const current = providers.find((provider) => provider.id === selected) ?? providers[0];

  async function startClaudeCodeOAuth() {
    try {
      const response = await fetch(`${apiBase}/api/oauth/claude-code/authorize`);
      const payload = await response.json();
      if (!response.ok) {
        onOutput(`Claude Code OAuth failed: ${payload.error?.message ?? "unknown error"}`);
        return;
      }
      setClaudeCodeAuthUrl(payload.url);
      setSelected("anthropic");
      onOutput("Opened Claude Code OAuth — complete sign-in in your browser");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      onOutput(`Claude Code OAuth failed: ${error.message}`);
    }
  }

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

  return (
    <main className="providers-page">
      <header className="providers-header">
        <div className="brand">
          <div className="mark">AI</div>
          <div>
            <h1>Provider Settings</h1>
            <p>Connect local OAuth providers and verify the backend router.</p>
          </div>
        </div>
        <div className="providers-actions">
          <span className={`status-pill ${backendStatus}`}>{backendStatus}</span>
          <button className="claude-code-add-btn" onClick={startClaudeCodeOAuth} title="Connect Claude Code via OAuth">
            <Plus size={15} />
            Claude Code
          </button>
          <button onClick={scanOauth}>Scan local OAuth</button>
          <button onClick={onRefresh}>Refresh</button>
          <button onClick={onBack}>Back to editor</button>
        </div>
      </header>
      {claudeCodeAuthUrl ? (
        <section className="claude-code-oauth-panel">
          <div className="section-head">
            <h2>Claude Code sign-in</h2>
            <button onClick={() => setClaudeCodeAuthUrl("")}>Dismiss</button>
          </div>
          <p className="muted-text">Complete sign-in in the browser tab, or open this URL manually:</p>
          <a className="oauth-link" href={claudeCodeAuthUrl} target="_blank" rel="noreferrer">
            {claudeCodeAuthUrl}
          </a>
        </section>
      ) : null}
      <section className="providers-layout">
        <aside className="provider-catalog">
          <div className="section-head">
            <h2>Providers</h2>
            <span className="status-pill">{providers.length}</span>
          </div>
          <div className="provider-list">
            {providers.map((provider) => (
              <button className={`provider-list-card ${provider.id === current?.id ? "active" : ""}`} key={provider.id} onClick={() => setSelected(provider.id)}>
                <div>
                  <strong>{provider.label}</strong>
                  <small>{provider.type} · {provider.auth ?? "api-key"}</small>
                </div>
                <span>{provider.status}</span>
              </button>
            ))}
          </div>
        </aside>
        <section className="provider-detail">
          {current ? (
            <>
              <div className="detail-head">
                <div>
                  <h2>{current.label}</h2>
                  <p>{current.baseUrl}</p>
                </div>
                <span className="status-pill">{current.enabled ? "enabled" : "disabled"}</span>
              </div>
              <div className="provider-form">
                <label className="field"><span>Model</span><input readOnly value={current.model} /></label>
                <label className="field"><span>API key env</span><input readOnly value={current.apiKeyEnv} /></label>
                <label className="field"><span>Type</span><input readOnly value={current.type} /></label>
              </div>
              <section className="connections-panel">
                <div className="section-head"><h2>Connections</h2></div>
                {connections.filter((connection) => connection.provider === current.id).map((connection) => (
                  <article className="connection-row imported" key={connection.id}>
                    <span>oauth</span>
                    <strong>{connection.hasAccessToken ? "access token" : "refresh only"}</strong>
                    <code>{connection.sourcePath ?? connection.importedAt}</code>
                    <small>{connection.expiresAt ? `expires ${new Date(connection.expiresAt).toLocaleDateString()}` : "no expiry"}</small>
                  </article>
                ))}
                {!connections.some((connection) => connection.provider === current.id) ? <p className="muted-text">No imported connection for this provider.</p> : null}
              </section>
              {scan ? (
                <section className="connections-panel">
                  <div className="section-head"><h2>Local OAuth Scan</h2></div>
                  <div className="discovery-list">
                    {scan.results.map((item) => (
                      <article className={`discovery-row ${item.found ? "found" : ""}`} key={item.provider}>
                        <div><strong>{item.label}</strong><small>{item.found ? `${item.matches.length} match` : `${item.checked} paths checked`}</small></div>
                        {item.found ? <button onClick={() => importOauth(item.provider)}>Import</button> : <span>none</span>}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function BottomPanel({ tab, output, problems, backendStatus, selectedModel, activeProvider, dirtyFiles }) {
  if (tab === "problems") {
    return <div className="bottom-content problems-list">{(problems.length ? problems : ["No problems detected."]).map((problem) => <div className="problem-row" key={problem}>{problem}</div>)}</div>;
  }
  if (tab === "output") {
    return <div className="bottom-content output-list">{output.map((line, index) => <pre key={`${index}-${line}`}>{line}</pre>)}</div>;
  }
  return <pre>{`Backend: ${backendStatus}\nEndpoint: ${apiBase}/v1\nModel: ${selectedModel}\nProvider: ${activeProvider?.label ?? "none"}\nUnsaved files: ${dirtyFiles.length ? dirtyFiles.join(", ") : "none"}`}</pre>;
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
