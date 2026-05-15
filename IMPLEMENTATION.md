# Implementation Guide - Step by Step

## ✅ GOOD NEWS: Scaffold is Ready!

I've created a complete Mastra-compatible scaffold manually (the CLI was blocking). You can now start implementing immediately.

## Where to Add Your PDF Files

**Add all Berkshire Hathaway shareholder letters (2019-2024) here:**

```
provue/
└── data/
    └── source/
        ├── 2019-shareholder-letter.pdf
        ├── 2020-shareholder-letter.pdf
        ├── 2021-shareholder-letter.pdf
        ├── 2022-shareholder-letter.pdf
        ├── 2023-shareholder-letter.pdf
        └── 2024-shareholder-letter.pdf
```

Download these PDFs from the Google Drive link in your assignment, then place them in the `data/source/` folder with the naming convention above (year first).

---

## Quick Setup (5 minutes)

### Step 1: Install Dependencies
```powershell
npm install
```

### Step 2: Configure Environment Variables
```powershell
copy .env.example .env
```

Edit `.env`:
```
OPENAI_API_KEY=sk-... (from https://platform.openai.com/api-keys)
DATABASE_URL=postgresql://user:password@localhost:5432/berkshire_pgvector
NODE_ENV=development
```

### Step 3: Start Development
```powershell
npm run dev
```

Expected output:
```
🚀 Berkshire Hathaway RAG Agent Starting...
✅ Agent initialized: berkshire-analyst
📖 Model: gpt-4o
📊 Max tokens: 2000

Available tools:
  - vector_search: Search through Berkshire Hathaway shareholder letters using semantic similarity
  - retrieve_letter_by_year: Get a specific shareholder letter by year
  - list_available_documents: List all available shareholder letters

🔧 Configuration:
  OpenAI API Key: ✅ Set
  Database URL: ✅ Set
  Environment: development

Next steps:
  1. Add shareholder PDFs to data/source/
  2. Run: npm run ingest
  3. Build chat endpoint to call the agent
```

---

## Project Structure (Ready to Use)

```
provue/
├── data/
│   ├── source/          👈 PUT YOUR PDFs HERE
│   └── processed/       (Generated during ingest)
│
├── src/
│   ├── agents/
│   │   └── berkshire.ts       ✅ Berkshire analyst agent (configured)
│   ├── tools/
│   │   └── retrieval.ts       ✅ Vector search tools (placeholder)
│   ├── lib/
│   │   ├── config.ts          ✅ Configuration (ready)
│   │   └── db.ts              ✅ Database layer (placeholder)
│   ├── workflows/             (Ingest pipeline - to build)
│   ├── rag/                   (Chunking, embeddings - to build)
│   ├── ingest.ts              ✅ Ingest entry point (ready)
│   └── index.ts               ✅ Main app entry (ready)
│
├── docs/                  (Documentation)
├── .env.example          (Copy to .env)
├── package.json          ✅ Updated with correct dependencies
├── tsconfig.json         ✅ TypeScript configured
└── README.md
```

---

## What's Already Done

- ✅ TypeScript project structure
- ✅ Agent configuration (berkshire-analyst)
- ✅ Tool definitions (vector search, retrieval, list documents)
- ✅ Configuration loading (.env)
- ✅ Entry points (npm run dev, npm run ingest)
- ✅ Database placeholder (ready for implementation)

---

## What You Need to Implement (Next Steps)

### Phase 1: PDF Ingestion (Priority)
**File**: `src/workflows/ingest.ts` or expand `src/ingest.ts`

```typescript
// TODO:
// 1. Read PDFs from data/source/ using pdfjs-dist
// 2. Extract text from each PDF
// 3. Chunk text (1000 tokens, 200 token overlap)
// 4. Generate embeddings using OpenAI API
// 5. Store in PostgreSQL with pgvector
// 6. Save metadata (year, source file, chunk index)
```

### Phase 2: Vector Storage
**File**: `src/lib/db.ts`

```typescript
// TODO:
// 1. Connect to PostgreSQL
// 2. Create chunks table with embedding column
// 3. Enable pgvector extension
// 4. Implement storeChunk() and searchSimilar()
```

### Phase 3: Chat API
**File**: `src/api/chat.ts` (create new)

```typescript
// TODO:
// 1. Create Express/Hono server
// 2. POST /chat endpoint
// 3. Call berkshire agent with user question
// 4. Pass vector search results to agent
// 5. Support streaming responses
// 6. Keep conversation memory
```

### Phase 4: Frontend (Optional)
**Option A**: Use a React chat component with the `/chat` API
**Option B**: Use Mastra's built-in UI

---

## Database Setup (PostgreSQL + pgvector)

### Using Docker (Recommended)
```powershell
docker run --name berkshire-pg -e POSTGRES_PASSWORD=password -p 5434:5432 pgvector/pgvector:latest
```

Set `.env`:
```
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5434/postgres
```

### Or Local PostgreSQL
1. Install: https://www.postgresql.org/download/
2. Enable pgvector:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

---

## Commands Reference

```powershell
# Install dependencies
npm install

# Start dev server (shows agent initialization)
npm run dev

# Run ingestion workflow (after adding PDFs)
npm run ingest

# Build for production
npm build

# Start production
npm start
```

---

## Troubleshooting

**Q: npm install fails?**  
A: Delete `node_modules` and `package-lock.json`, then retry.

**Q: "Cannot find module" error?**  
A: Make sure TypeScript is configured: `npm install`

**Q: Where do PDFs go?**  
A: `data/source/` folder. Name: `2019-shareholder-letter.pdf` etc.

**Q: Database connection error?**  
A: Start PostgreSQL and check `DATABASE_URL` in `.env`

---

## Next Action

1. ✅ Scaffold ready
2. 👉 Download PDFs to `data/source/`
3. 👉 Fill `.env` with OpenAI key + DB URL
4. 👉 Run `npm install`
5. 👉 Run `npm run dev` to test agent
6. 👉 Implement Phase 1 (PDF ingestion)

