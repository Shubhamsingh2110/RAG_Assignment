# Setup Instructions

1. Install Node.js 18+ and Git.
2. Install dependencies:

```bash
npm install
```

3. Initialize Mastra scaffold (this will interactively create files):

```bash
npm run mastra:init
```

4. Copy environment variables and fill values:

```bash
copy .env.example .env
# edit .env and set OPENAI_API_KEY and DATABASE_URL
```

5. Start development server (after Mastra scaffold is created):

```bash
npm run dev
```

Notes:
- The next step is to place Berkshire Hathaway PDF letters in `data/source/`.
- Configure PostgreSQL with `pgvector` extension enabled for vector storage.
