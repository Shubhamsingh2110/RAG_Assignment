// Main application entry point
// Starts the chat server

import dotenv from "dotenv";
import { createServer } from "http";
import OpenAI from "openai";
import { berkshireAgent } from "./agents/berkshire.js";
import { tools, vectorSearchTool } from "./tools/retrieval.js";
import { validateConfig, config } from "./lib/config.js";

dotenv.config();

async function main() {
  console.log("🚀 Berkshire Hathaway RAG Agent Starting...\n");

  const errors = validateConfig();
  if (errors.length > 0) {
    console.error("Environment configuration errors:");
    errors.forEach((e) => console.error(" - ", e));
    console.error("\nPlease update your .env file (see IMPLEMENTATION.md and .env.example)\n");
    process.exit(1);
  }

  const agent = await berkshireAgent;
  console.log(`✅ Agent initialized: ${agent.name}`);
  console.log(`📖 Model: ${agent.model}`);
  console.log(`📊 Max tokens: ${agent.maxTokens}\n`);

  console.log("Available tools:");
  Object.entries(tools).forEach(([key, tool]) => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });

  console.log("\n🔧 Configuration:");
  console.log(`  OpenAI API Key: ${config.openaiApiKey ? "✅ Set" : "❌ Missing"}`);
  console.log(`  Database URL: ${config.databaseUrl ? "✅ Set" : "❌ Missing"}`);
  console.log(`  Mastra provider: ${config.mastraProvider}`);
  console.log(`  Mastra model: ${config.mastraModel}`);
  console.log(`  Mastra playground: http://localhost:${config.mastraPlaygroundPort}`);
  console.log(`  Environment: ${config.nodeEnv}\n`);

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  async function answerQuestion(message: string) {
    const query = message.trim();
    const sources = await vectorSearchTool(query, 4);
    const context =
      sources.length > 0
        ? sources
            .map((source, index) => `[${index + 1}] ${source.year} ${source.source}\n${source.text}`)
            .join("\n\n")
        : "No matching shareholder letter context was found.";

    const completion = await openai.chat.completions.create({
      model: agent.model,
      temperature: 0.2,
      max_tokens: agent.maxTokens,
      messages: [
        { role: "system", content: agent.prompt },
        {
          role: "system",
          content:
            `Use the following retrieved Berkshire Hathaway shareholder letter excerpts as grounding context. Cite the relevant excerpt numbers in your answer when possible.\n\n${context}`,
        },
        { role: "user", content: query },
      ],
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "No answer generated.";
    return { answer, sources };
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
        --bg: #08111f;
        --panel: rgba(11, 19, 34, 0.9);
        --panel-soft: rgba(15, 23, 42, 0.72);
        --border: rgba(148, 163, 184, 0.2);
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #f59e0b;
        --accent-2: #60a5fa;
        --user: #1d4ed8;
        --assistant: #0f172a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 20% 0%, rgba(245, 158, 11, 0.18), transparent 26%),
          radial-gradient(circle at 80% 10%, rgba(96, 165, 250, 0.12), transparent 28%),
          linear-gradient(180deg, #0b1220 0%, var(--bg) 100%);
      }
      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 24px 0 32px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.35fr 0.65fr;
        gap: 18px;
        align-items: stretch;
      }
      .card {
        border: 1px solid var(--border);
        border-radius: 22px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(18px);
      }
      .hero-main { padding: 28px; }
      .eyebrow { color: var(--accent); text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; }
      h1 { margin: 12px 0 10px; font-size: clamp(34px, 5vw, 60px); line-height: 0.98; }
      .lede { margin: 0; color: var(--muted); line-height: 1.65; max-width: 62ch; }
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
        background: rgba(15, 23, 42, 0.7);
        color: var(--muted);
        font-size: 13px;
      }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12); }
      .chat {
        margin-top: 18px;
        padding: 20px;
      }
      .chat-grid {
        display: grid;
        grid-template-columns: 1.35fr 0.65fr;
        gap: 18px;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(15, 23, 42, 0.7);
      }
      .chat-log {
        min-height: 520px;
        max-height: 72vh;
        overflow: auto;
        padding: 18px;
      }
      .message {
        margin-bottom: 14px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--border);
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .message.user { background: rgba(29, 78, 216, 0.24); }
      .message.assistant { background: rgba(15, 23, 42, 0.88); }
      .message.system { background: rgba(245, 158, 11, 0.12); }
      .composer {
        display: grid;
        gap: 10px;
        padding: 16px;
        border-top: 1px solid var(--border);
      }
      textarea {
        width: 100%;
        min-height: 92px;
        resize: vertical;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: rgba(2, 6, 23, 0.55);
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
        background: rgba(15, 23, 42, 0.68);
        font-size: 14px;
        line-height: 1.5;
      }
      .source-item strong { color: #f8fafc; }
      a { color: #93c5fd; }
      @media (max-width: 900px) {
        .hero, .chat-grid { grid-template-columns: 1fr; }
        .chat-log { max-height: none; }
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
          <div class="muted">Open <a href="/health">/health</a> to verify the app is up. Use the chat below to test retrieval-grounded answers.</div>
        </aside>
      </section>

      <section class="card chat">
        <div class="chat-grid">
          <div class="panel">
            <div id="chatLog" class="chat-log"></div>
            <div class="composer">
              <textarea id="message" placeholder="Ask about Buffett's investment philosophy, capital allocation, acquisitions, or a specific year..."></textarea>
              <div class="actions">
                <button id="sendBtn" class="primary">Send</button>
                <button id="exampleBtn" class="secondary">Load example</button>
                <button id="clearBtn" class="secondary">Clear</button>
              </div>
            </div>
          </div>
          <aside class="panel side-box">
            <h2>How it works</h2>
            <p class="muted">Each question is embedded with OpenAI, matched against the pgvector database, and then answered with the Berkshire agent prompt plus retrieved excerpts.</p>
            <div class="sources">
              <div class="source-item"><strong>1.</strong> Add annual letters to <code>data/source/</code></div>
              <div class="source-item"><strong>2.</strong> Run <code>npm run ingest</code></div>
              <div class="source-item"><strong>3.</strong> Ask a question here</div>
            </div>
          </aside>
        </div>
      </section>
    </main>

    <script>
      const chatLog = document.getElementById('chatLog');
      const messageInput = document.getElementById('message');
      const sendBtn = document.getElementById('sendBtn');
      const exampleBtn = document.getElementById('exampleBtn');
      const clearBtn = document.getElementById('clearBtn');

      const history = [];

      function addMessage(role, text) {
        const el = document.createElement('div');
        el.className = 'message ' + role;
        el.textContent = text;
        chatLog.appendChild(el);
        chatLog.scrollTop = chatLog.scrollHeight;
        return el;
      }

      function setBusy(isBusy) {
        sendBtn.disabled = isBusy;
        sendBtn.textContent = isBusy ? 'Thinking...' : 'Send';
      }

      async function sendMessage(customText) {
        const text = (customText ?? messageInput.value).trim();
        if (!text) return;

        history.push({ role: 'user', content: text });
        addMessage('user', text);
        messageInput.value = '';
        setBusy(true);

        const assistantBubble = addMessage('assistant', '');

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history })
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Request failed');
          }

          assistantBubble.textContent = data.answer;

          if (Array.isArray(data.sources) && data.sources.length > 0) {
            const sourcesText = data.sources.map((source, index) => '[' + (index + 1) + '] ' + source.year + ' ' + source.source).join('\n');
            addMessage('system', 'Sources used:\n' + sourcesText);
          }

          history.push({ role: 'assistant', content: data.answer });
        } catch (error) {
          assistantBubble.textContent = 'Error: ' + error.message;
        } finally {
          setBusy(false);
        }
      }

      sendBtn.addEventListener('click', () => sendMessage());
      clearBtn.addEventListener('click', () => {
        chatLog.innerHTML = '';
        history.length = 0;
        addMessage('assistant', 'Ask a question to start the Berkshire Hathaway playground.');
      });
      exampleBtn.addEventListener('click', () => {
        messageInput.value = 'What did Buffett emphasize about capital allocation?';
        messageInput.focus();
      });
      messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          sendMessage();
        }
      });

      addMessage('assistant', 'Ask a question to start the Berkshire Hathaway playground.');
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

          if (!message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "message is required" }));
            return;
          }

          const result = await answerQuestion(message);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            })
          );
        }
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

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHomePage());
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
