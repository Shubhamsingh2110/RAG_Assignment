import dotenv from "dotenv";
dotenv.config();
import { createServer } from "http";
import runIngest from "./ingest.js";
import { berkshireAgent, buildBerkshirePrompt } from "./agents/berkshire.js";
import { tools, vectorSearchTool } from "./tools/retrieval.js";
import { validateConfig, config } from "./lib/config.js";
import {
  initDb,
  clearChatMessages,
  getChatMessages,
  getChunkCount,
  storeChatMessage,
} from "./lib/db.js";
import { listAvailableDocuments } from "./tools/retrieval.js";



async function main() {
  console.log("🚀 Berkshire Hathaway RAG Agent Starting...\n");

  function errorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }

 const errors = validateConfig();

if (errors.length > 0) {
  console.error("Environment configuration errors:");
  errors.forEach((error) => console.error(" - ", error));
  console.error("\nPlease update your .env file (see IMPLEMENTATION.md and .env.example)\n");
  process.exit(1);
}

// Log the DB URL (masked) and server info to ensure we're connecting to the intended Postgres
const rawDbUrl = config.databaseUrl || process.env.DATABASE_URL || "";
const maskedDbUrl = rawDbUrl.replace(/(:\/\/)(.*@)/, (m, p1, p2) => p1 + "<REDACTED>@");
console.log(`  Database URL: ${maskedDbUrl || "(not set)"}`);
try {
  const serverInfo = await (await import("./lib/db.js")).getServerInfo();
  if (serverInfo) {
    console.log(`  Connected Postgres address: ${serverInfo.addr}, port: ${serverInfo.port}`);
    console.log(`  Postgres version: ${serverInfo.version}`);
  }
} catch (err) {
  console.error("  Could not fetch Postgres server info:", errorMessage(err));
}

// Initialize PostgreSQL tables before querying them
try {
  await initDb();
  console.log("✅ Database initialized");
} catch (err) {
  console.error("Fatal DB initialization error:", errorMessage(err));
  console.error("Check that DATABASE_URL points to the Docker Postgres (port 5434) or install pgvector in the connected server.");
  process.exit(1);
}

await ensureIndexedDocuments();

  const agent = await berkshireAgent;
  console.log(`✅ Agent initialized: ${agent.name}`);
  console.log(`📖 Model: ${agent.model}`);
  console.log(`📊 Max retries: ${agent.maxRetries ?? 0}\n`);

  console.log("Available tools:");
  Object.values(tools).forEach((tool) => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });

  console.log("\n🔧 Configuration:");
  console.log(`  OpenAI API Key: ${config.openaiApiKey ? "✅ Set" : "❌ Missing"}`);
  console.log(`  Database URL: ${config.databaseUrl ? "✅ Set" : "❌ Missing"}`);
  console.log(`  Mastra provider: ${config.mastraProvider}`);
  console.log(`  Mastra model: ${config.mastraModel}`);
  console.log(`  Mastra playground: http://localhost:${config.mastraPlaygroundPort}`);
  console.log(`  Environment: ${config.nodeEnv}\n`);

  type ClientMessage = {
    role: "user" | "assistant";
    content: string;
  };

  type SourceItem = {
    id: string;
    title: string;
    filename?: string;
    year?: number;
    url?: string;
  };

  type SessionState = {
    sessionId: string;
    messages: Array<{ role: string; content: string; created_at?: string }>;
    sources: SourceItem[];
    documents: Array<{ year: number; path: string }>;
    chunkCount: number;
  };

  function normalizeSessionId(input: unknown) {
    const value = typeof input === "string" ? input.trim() : "";
    return value || `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function summarizeConversation(messages: ClientMessage[]) {
    if (messages.length === 0) {
      return "No prior conversation context.";
    }

    return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  }

  function toSourceItem(source: { year?: number | null; source?: string | null }, index: number): SourceItem {
    const year = source.year ?? undefined;
    const filename = source.source ?? undefined;
    const title = `${year ?? "Unknown year"} - ${filename ?? "Shareholder letter"}`;

    return {
      id: `${filename ?? "source"}-${year ?? "unknown"}-${index}`,
      title,
      filename,
      year,
    };
  }

  async function buildAppState(sessionId: string): Promise<SessionState> {
    const [messages, documents, chunkCount] = await Promise.all([
      getChatMessages(sessionId, 50),
      listAvailableDocuments(),
      getChunkCount(),
    ]);

    return {
      sessionId,
      messages,
      sources: [],
      documents,
      chunkCount,
    };
  }

  async function ensureIndexedDocuments() {
    const documents = await listAvailableDocuments();
    const chunkCount = await getChunkCount();

    if (chunkCount === 0 && documents.length > 0) {
      console.log(`📚 Found ${documents.length} PDF documents but no chunks. Running ingest automatically...`);
      await runIngest();
      const updatedCount = await getChunkCount();
      console.log(`✅ Auto-ingest complete. Indexed ${updatedCount} chunks.`);
    }
  }

  async function answerQuestion(message: string, sessionId: string, priorMessages: ClientMessage[] = []) {
    const query = message.trim();
    const sources = await vectorSearchTool(query, 10);
    const context =
      sources.length > 0
        ? sources
            .map((source, index) => `[${index + 1}] ${source.year} ${source.source}\n${source.text}`)
            .join("\n\n")
        : "No matching shareholder letter context was found."

    const systemPrompt = buildBerkshirePrompt({
      retrievedContext: context,
      conversationContext: summarizeConversation(priorMessages.slice(-12)),
    });

    await storeChatMessage({ session_id: sessionId, role: "user", content: query });

    const completion = await agent.generate([
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ]);

    const answer = completion.text?.trim() || "No answer generated.";
    await storeChatMessage({ session_id: sessionId, role: "assistant", content: answer });

    return { answer, sources: sources.map(toSourceItem) };
  }

  function sseWrite(res: any, event: string, data: unknown) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  async function streamAnswer(message: string, sessionId: string, res: any, priorMessages: ClientMessage[] = []) {
    const query = message.trim();
    const sources = await vectorSearchTool(query, 10);
    const context =
      sources.length > 0
        ? sources
            .map((source, index) => `[${index + 1}] ${source.year} ${source.source}\n${source.text}`)
            .join("\n\n")
        : "No matching shareholder letter context was found.";

    const systemPrompt = buildBerkshirePrompt({
      retrievedContext: context,
      conversationContext: summarizeConversation(priorMessages.slice(-12)),
    });

    await storeChatMessage({ session_id: sessionId, role: "user", content: query });

    const stream = await agent.stream([
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ]);

    let text = "";
    const sourceItems: SourceItem[] = [];

    sseWrite(res, "start", { sessionId });

    for await (const chunk of stream.fullStream) {
      if (chunk.type === "text-delta" && chunk.payload?.text) {
        text += chunk.payload.text;
        sseWrite(res, "delta", { text: chunk.payload.text });
      }

      if (chunk.type === "source" && chunk.payload) {
        sourceItems.push({
          id: chunk.payload.id,
          title: chunk.payload.title,
          filename: chunk.payload.filename,
          year: Number.parseInt(chunk.payload.title.match(/(19|20)\d{2}/)?.[0] ?? "0", 10) || undefined,
          url: chunk.payload.url,
        });
      }
    }

    const finalAnswer = text.trim() || (await stream.text).trim() || "No answer generated.";
    const finalSources = sourceItems.length > 0 ? sourceItems : sources.map(toSourceItem);

    await storeChatMessage({ session_id: sessionId, role: "assistant", content: finalAnswer });
    sseWrite(res, "done", { answer: finalAnswer, sources: finalSources, sessionId });
    res.end();
  }

  function renderHomePage() {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Berkshire Hathaway Mastra RAG</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111f;
        --bg-alt: #0b172a;
        --panel: rgba(10, 19, 34, 0.9);
        --panel-soft: rgba(15, 23, 42, 0.72);
        --border: rgba(148, 163, 184, 0.18);
        --text: #e5eefb;
        --muted: #97a6ba;
        --accent: #f59e0b;
        --accent-2: #60a5fa;
        --accent-3: #22c55e;
        --user: #2563eb;
        --assistant: #0f172a;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 12% 0%, rgba(245, 158, 11, 0.18), transparent 24%),
          radial-gradient(circle at 88% 4%, rgba(96, 165, 250, 0.18), transparent 25%),
          radial-gradient(circle at 50% 100%, rgba(34, 197, 94, 0.08), transparent 18%),
          linear-gradient(180deg, #09111e 0%, var(--bg) 55%, var(--bg-alt) 100%);
      }
      .shell {
        width: min(1280px, calc(100vw - 24px));
        margin: 0 auto;
        padding: 18px 0 28px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.25fr 0.75fr;
        gap: 16px;
      }
      .card {
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(18px);
      }
      .hero-main { padding: 26px; position: relative; overflow: hidden; }
      .hero-main::after {
        content: '';
        position: absolute;
        inset: auto -10% -50% auto;
        width: 280px;
        height: 280px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(245, 158, 11, 0.14), transparent 68%);
        pointer-events: none;
      }
      .eyebrow { color: var(--accent); text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; }
      h1 { margin: 12px 0 10px; font-size: clamp(34px, 5vw, 60px); line-height: 0.98; }
      .lede { margin: 0; color: var(--muted); line-height: 1.65; max-width: 62ch; }
      .subtle { color: var(--muted); font-size: 13px; margin-top: 8px; }
      .stat-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 22px;
      }
      .stat {
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--panel-soft);
      }
      .label { color: var(--muted); font-size: 12px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.12em; }
      .value { font-size: 15px; line-height: 1.5; }
      .hero-side {
        padding: 20px;
        display: grid;
        gap: 12px;
        align-content: start;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.8);
        color: var(--muted);
        font-size: 13px;
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-3); box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12); }
      .chat { margin-top: 18px; padding: 20px; }
      .chat-grid { display: grid; grid-template-columns: 1.45fr 0.55fr; gap: 18px; }
      .panel { border: 1px solid var(--border); border-radius: 18px; background: rgba(8, 14, 27, 0.75); }
      .chat-panel { display: grid; grid-template-rows: auto 1fr auto; min-height: 680px; }
      .status-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        color: var(--muted);
      }
      .chat-log {
        min-height: 480px;
        max-height: 74vh;
        overflow: auto;
        padding: 18px;
      }
      .message-wrap { display: grid; gap: 8px; margin-bottom: 16px; }
      .message {
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--border);
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .message.user { background: rgba(37, 99, 235, 0.24); }
      .message.assistant { background: rgba(15, 23, 42, 0.92); }
      .message.system { background: rgba(245, 158, 11, 0.12); }
      .message-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        padding: 0 2px;
      }
      .citation-list { display: flex; flex-wrap: wrap; gap: 8px; }
      .citation-pill {
        border: 1px solid rgba(96, 165, 250, 0.35);
        background: rgba(96, 165, 250, 0.12);
        color: #dbeafe;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .citation-pill:hover { border-color: var(--accent-2); }
      .composer {
        display: grid;
        gap: 10px;
        padding: 16px;
        border-top: 1px solid var(--border);
        background: rgba(2, 6, 23, 0.4);
      }
      textarea {
        width: 100%;
        min-height: 108px;
        resize: vertical;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(2, 6, 23, 0.7);
        color: var(--text);
        padding: 14px 14px;
        font: inherit;
        outline: none;
      }
      textarea:focus { border-color: rgba(96, 165, 250, 0.65); box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12); }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .primary { background: linear-gradient(135deg, #f59e0b, #fb7185); color: #111827; }
      .secondary { background: rgba(148, 163, 184, 0.12); color: var(--text); border: 1px solid var(--border); }
      .side-box { padding: 16px; }
      .side-box h2 { margin: 0 0 10px; font-size: 16px; }
      .muted { color: var(--muted); line-height: 1.6; font-size: 14px; }
      .sources { margin-top: 10px; display: grid; gap: 10px; }
      .source-item {
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.7);
        font-size: 14px;
        line-height: 1.5;
        cursor: pointer;
        text-align: left;
      }
      .source-item:hover { border-color: var(--accent-2); }
      .sidebar-block { display: grid; gap: 10px; margin-top: 12px; }
      .conversation-log {
        max-height: 300px;
        overflow: auto;
        display: grid;
        gap: 10px;
        padding-right: 4px;
      }
      .history-item {
        padding: 10px 12px;
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.35);
        border: 1px solid var(--border);
      }
      .history-role { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px; }
      .history-text { font-size: 14px; line-height: 1.5; color: var(--text); }
      .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .toolbar button { padding: 9px 12px; font-size: 13px; }
      .doc-grid { display: grid; gap: 10px; }
      .doc-item {
        padding: 12px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.62);
        display: grid;
        gap: 4px;
      }
      .doc-year { font-size: 12px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.12em; }
      .doc-path { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
      .doc-count { color: var(--muted); font-size: 12px; }
      a { color: #93c5fd; }
      @media (max-width: 900px) {
        .hero, .chat-grid { grid-template-columns: 1fr; }
        .chat-log { max-height: none; }
        .chat-panel { min-height: 0; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="card hero-main">
          <div class="eyebrow">Local playground</div>
          <h1>Berkshire Hathaway Mastra RAG</h1>
          <p class="lede">Ask questions about Warren Buffett and Berkshire Hathaway. This playground uses the existing OpenAI API key, pgvector database, and retrieved shareholder-letter excerpts to answer in context.</p>
          <div class="subtle">Streaming responses, source citations, memory timeline, and conversation controls are built in below.</div>
          <div class="stat-grid">
            <div class="stat">
              <div class="label">Agent</div>
              <div class="value">${agent.name}</div>
            </div>
            <div class="stat">
              <div class="label">Model</div>
              <div class="value">${agent.model}</div>
            </div>
            <div class="stat">
              <div class="label">API</div>
              <div class="value"><a href="/health">/health</a></div>
            </div>
            <div class="stat">
              <div class="label">Ingest</div>
              <div class="value">npm run ingest</div>
            </div>
          </div>
        </div>
        <aside class="card hero-side">
          <div class="pill"><span class="dot"></span> Running on port ${config.mastraPlaygroundPort}</div>
          <div class="pill">OpenAI API key ${config.openaiApiKey ? "configured" : "missing"}</div>
          <div class="pill">Database ${config.databaseUrl ? "connected via env" : "missing"}</div>
          <div class="pill" id="indexStatus">Index: loading...</div>
          <div class="muted">Open <a href="/health">/health</a> to verify the app is up. Use the chat below to test retrieval-grounded answers.</div>
        </aside>
      </section>

      <section class="card chat">
        <div class="chat-grid">
          <div class="panel chat-panel">
            <div class="status-line" style="padding: 14px 18px; border-bottom: 1px solid var(--border);">
              <div id="chatStatus">Ready</div>
              <div id="streamState">Idle</div>
            </div>
            <div id="chatLog" class="chat-log"></div>
            <div class="composer">
              <textarea id="message" placeholder="Ask about Buffett's investment philosophy, capital allocation, acquisitions, or a specific year..."></textarea>
              <div class="actions">
                <button id="sendBtn" class="primary">Send</button>
                <button id="exampleBtn" class="secondary">Load example</button>
                <button id="clearBtn" class="secondary">Clear</button>
                <button id="reloadBtn" class="secondary">Refresh memory</button>
              </div>
            </div>
          </div>
          <aside class="panel side-box">
            <h2>Conversation memory</h2>
            <p class="muted">This shows the persisted conversation for the current browser session, plus source cards you can click to jump to citations below.</p>
            <div class="toolbar">
              <button id="newChatBtn" class="secondary">New session</button>
              <button id="scrollSourcesBtn" class="secondary">Jump to sources</button>
            </div>
            <div class="sidebar-block">
              <div>
                <div class="label">Memory timeline</div>
                <div id="conversationLog" class="conversation-log"></div>
              </div>
              <div>
                <div class="label">Sources from last answer</div>
                <div id="sourceList" class="sources"></div>
              </div>
              <div>
                <div class="label">Loaded documents</div>
                <div id="documentList" class="doc-grid"></div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <script>
      const chatLog = document.getElementById('chatLog');
      const conversationLog = document.getElementById('conversationLog');
      const sourceList = document.getElementById('sourceList');
      const documentList = document.getElementById('documentList');
      const messageInput = document.getElementById('message');
      const sendBtn = document.getElementById('sendBtn');
      const exampleBtn = document.getElementById('exampleBtn');
      const clearBtn = document.getElementById('clearBtn');
      const reloadBtn = document.getElementById('reloadBtn');
      const newChatBtn = document.getElementById('newChatBtn');
      const chatStatus = document.getElementById('chatStatus');
      const streamState = document.getElementById('streamState');
      const scrollSourcesBtn = document.getElementById('scrollSourcesBtn');
      const indexStatus = document.getElementById('indexStatus');

      const sessionStorageKey = 'berkshire_session_id';
      let sessionId = localStorage.getItem(sessionStorageKey);
      if (!sessionId) {
        sessionId = 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(sessionStorageKey, sessionId);
      }

      const history = [];
      let activeSources = [];

      function sourceLabel(source) {
        return source.title || (source.year ? String(source.year) : 'Unknown source');
      }

      function addMessage(role, text, options = {}) {
        const wrap = document.createElement('div');
        wrap.className = 'message-wrap';

        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = '<span>' + role + '</span>' + (options.meta ? '<span>' + options.meta + '</span>' : '');

        const bubble = document.createElement('div');
        bubble.className = 'message ' + role;
        bubble.textContent = text;

        wrap.appendChild(header);
        wrap.appendChild(bubble);
        chatLog.appendChild(wrap);
        chatLog.scrollTop = chatLog.scrollHeight;
        return bubble;
      }

      function renderConversation(messages) {
        conversationLog.innerHTML = '';

        messages.slice(-20).forEach((message) => {
          const item = document.createElement('div');
          item.className = 'history-item';
          item.innerHTML = '<div class="history-role">' + message.role + '</div><div class="history-text"></div>';
          item.querySelector('.history-text').textContent = message.content;
          conversationLog.appendChild(item);
        });
      }

      function renderSources(sources) {
        if (Array.isArray(sources)) {
          activeSources = sources;
        }

        sourceList.innerHTML = '';

        if (activeSources.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'source-item';
          empty.textContent = 'No sources yet. Ask a question to populate citations.';
          sourceList.appendChild(empty);
          return;
        }

        activeSources.forEach((source, index) => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'source-item';
          card.setAttribute('data-source-id', source.id);
          card.innerHTML = '<strong>' + (index + 1) + '.</strong> ' + sourceLabel(source) + '<div class="subtle">' + (source.filename || '') + '</div>';
          card.addEventListener('click', () => {
            const target = document.querySelector('[data-source-id="' + source.id + '"]');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          sourceList.appendChild(card);
        });
      }

      function renderDocuments(documents, chunkCount) {
        documentList.innerHTML = '';
        const list = Array.isArray(documents) ? documents : [];

        if (list.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'doc-item';
          empty.innerHTML = '<div class="doc-year">No PDFs found</div><div class="doc-path">Add Berkshire Hathaway annual letters to data/source/</div>';
          documentList.appendChild(empty);
          indexStatus.textContent = 'Index: 0 chunks';
          return;
        }

        indexStatus.textContent = 'Index: ' + (chunkCount || 0) + ' chunks from ' + list.length + ' PDFs';

        list.forEach((doc) => {
          const item = document.createElement('div');
          item.className = 'doc-item';
          item.innerHTML = '<div class="doc-year">' + doc.year + '</div><div class="doc-path">' + doc.path + '</div>';
          documentList.appendChild(item);
        });
      }

      function setBusy(isBusy) {
        sendBtn.disabled = isBusy;
        sendBtn.textContent = isBusy ? 'Thinking...' : 'Send';
        streamState.textContent = isBusy ? 'Streaming...' : 'Idle';
      }

      function attachCitationChips(assistantWrap, sources) {
        if (!assistantWrap) {
          return;
        }

        let chips = assistantWrap.querySelector('.citation-list');
        if (!chips) {
          chips = document.createElement('div');
          chips.className = 'citation-list';
          assistantWrap.appendChild(chips);
        }

        chips.innerHTML = '';
        sources.forEach((source) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'citation-pill';
          chip.textContent = sourceLabel(source);
          chip.addEventListener('click', () => {
            const target = document.querySelector('[data-source-id="' + source.id + '"]');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          chips.appendChild(chip);
        });
      }

      async function refreshMemory() {
        try {
          const response = await fetch('/api/app-state?sessionId=' + encodeURIComponent(sessionId));
          const data = await response.json();
          renderConversation(Array.isArray(data.messages) ? data.messages : []);
          renderDocuments(data.documents, data.chunkCount);
          if (Array.isArray(data.sources) && data.sources.length > 0) {
            renderSources(data.sources);
          }
        } catch (error) {
          chatStatus.textContent = 'Unable to load memory';
        }
      }

      async function sendMessage(customText) {
        const text = (customText ?? messageInput.value).trim();
        if (!text) {
          return;
        }

        history.push({ role: 'user', content: text });
        addMessage('user', text, { meta: 'session ' + sessionId.slice(-6) });
        renderConversation(history);
        messageInput.value = '';
        setBusy(true);

        const assistantBubble = addMessage('assistant', '', { meta: 'live stream' });
        const assistantWrap = assistantBubble.parentElement;

        try {
          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history, sessionId }),
          });

          if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Request failed');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let answerText = '';

          while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }

            buffer += decoder.decode(chunk.value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';

            for (const block of blocks) {
              const lines = block.split('\n').filter(Boolean);
              const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7) || 'message';
              const dataLine = lines.find((line) => line.startsWith('data: '))?.slice(6) || '{}';
              const payload = JSON.parse(dataLine);

              if (eventName === 'delta' && payload.text) {
                answerText += payload.text;
                assistantBubble.textContent = answerText;
              }

              if (eventName === 'done') {
                const finalAnswer = payload.answer || answerText;
                assistantBubble.textContent = finalAnswer;
                history.push({ role: 'assistant', content: finalAnswer });
                renderConversation(history);
                renderSources(payload.sources || []);
                attachCitationChips(assistantWrap, payload.sources || []);
                chatStatus.textContent = 'Response complete';
              }

              if (eventName === 'error') {
                throw new Error(payload.error || 'Stream failed');
              }
            }
          }

          if (history.length === 0 || history[history.length - 1].role !== 'assistant') {
            const fallback = answerText || assistantBubble.textContent || '';
            history.push({ role: 'assistant', content: fallback });
            renderConversation(history);
          }
        } catch (error) {
          assistantBubble.textContent = 'Error: ' + error.message;
          chatStatus.textContent = 'Error';
        } finally {
          setBusy(false);
          await refreshMemory();
        }
      }

      sendBtn.addEventListener('click', () => sendMessage());
      clearBtn.addEventListener('click', () => {
        chatLog.innerHTML = '';
        history.length = 0;
        activeSources = [];
        fetch('/api/session/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        }).catch(() => {});
        addMessage('assistant', 'Ask a question to start the Berkshire Hathaway playground.');
        renderConversation([]);
        renderSources([]);
      });
      reloadBtn.addEventListener('click', refreshMemory);
      newChatBtn.addEventListener('click', async () => {
        sessionId = 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(sessionStorageKey, sessionId);
        history.length = 0;
        activeSources = [];
        chatLog.innerHTML = '';
        sourceList.innerHTML = '';
        conversationLog.innerHTML = '';
        chatStatus.textContent = 'New session created';
        addMessage('assistant', 'New conversation started. Ask a Berkshire Hathaway question.');
        await refreshMemory();
      });
      scrollSourcesBtn.addEventListener('click', () => {
        sourceList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      exampleBtn.addEventListener('click', () => {
        messageInput.value = 'What did Buffett emphasize about capital allocation?';
        messageInput.focus();
      });
      messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      addMessage('assistant', 'Ask a question to start the Berkshire Hathaway playground.');
      renderSources([]);
      refreshMemory();
    </script>
  </body>
</html>`;
  }

  const server = createServer((req, res) => {
    const url = req.url || "/";

    if (req.method === "POST" && url === "/api/chat") {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) {
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const message = String(payload.message || "").trim();
          const sessionId = normalizeSessionId(payload.sessionId);

          if (!message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "message is required" }));
            return;
          }

          const priorMessages = await getChatMessages(sessionId, 20);
          const result = await answerQuestion(
            message,
            sessionId,
            priorMessages.map((entry) => ({ role: entry.role as "user" | "assistant", content: entry.content }))
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        }
      });

      return;
    }

    if (req.method === "POST" && url === "/api/chat/stream") {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) {
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const message = String(payload.message || "").trim();
          const sessionId = normalizeSessionId(payload.sessionId);

          if (!message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "message is required" }));
            return;
          }

          const priorMessages = await getChatMessages(sessionId, 20);

          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.write("retry: 1000\n\n");

          await streamAnswer(
            message,
            sessionId,
            res,
            priorMessages.map((entry) => ({ role: entry.role as "user" | "assistant", content: entry.content }))
          );
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
          }
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        }
      });

      return;
    }

    if (req.method === "POST" && url === "/api/session/clear") {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) {
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const sessionId = normalizeSessionId(payload.sessionId);
          await clearChatMessages(sessionId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        }
      });

      return;
    }

    if (req.method === "GET" && url.startsWith("/api/session/messages")) {
      const fullUrl = new URL(url, `http://${req.headers.host || "localhost"}`);
      const sessionId = normalizeSessionId(fullUrl.searchParams.get("sessionId"));

      buildAppState(sessionId)
        .then((payload) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
        })
        .catch((error) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        });

      return;
    }

    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          agent: agent.name,
          model: agent.model,
          playground: `http://localhost:${config.mastraPlaygroundPort}`,
        })
      );
      return;
    }

    if (req.method === "GET" && url === "/api/app-state") {
      const fullUrl = new URL(url, `http://${req.headers.host || "localhost"}`);
      const sessionId = normalizeSessionId(fullUrl.searchParams.get("sessionId"));

      buildAppState(sessionId)
        .then((payload) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
        })
        .catch((error) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }));
        });

      return;
    }

    // Serve static frontend if present, otherwise fall back to server-rendered playground.
    // Avoid top-level `await` inside the request handler for compatibility with the bundler.
    import("fs/promises")
      .then(async (fs) => {
        try {
          const html = await fs.readFile(new URL("../public/index.html", import.meta.url), { encoding: "utf8" });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
        } catch (e) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderHomePage());
        }
      })
      .catch(() => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderHomePage());
      });

    return;
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(`Failed to start playground server on port ${config.mastraPlaygroundPort}:`, error.message);
    process.exit(1);
  });

  server.listen(config.mastraPlaygroundPort, () => {
    console.log(`\n✅ Local playground available at http://localhost:${config.mastraPlaygroundPort}`);
    console.log("Next steps:");
    console.log("  1. Add shareholder PDFs to data/source/");
    console.log("  2. Run: npm run ingest");
    console.log("  3. Open http://localhost:4111 in your browser");
  });
}

main().catch(console.error);