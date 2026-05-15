# Environment Configuration (Task 1.2)

This file documents how to configure the environment for the Berkshire Hathaway Mastra RAG project.

## Required environment variables
Copy `.env.example` to `.env` and fill the values.

- `OPENAI_API_KEY` — OpenAI API key with access to GPT-4o and embeddings.
- `DATABASE_URL` — PostgreSQL connection string. Example for Docker:

```
DATABASE_URL=postgresql://postgres:YourPassword%40@127.0.0.1:5434/berkshire_pgvector
```
- `NODE_ENV` — `development` or `production`.
- `MASTRA_PROVIDER` — `openai` (default)
- `MASTRA_MODEL` — `gpt-4o` (default)
- `MASTRA_PLAYGROUND_PORT` — `4111` (Mastra playground port)

## How to configure OpenAI API key
1. Create an API key at https://platform.openai.com/account/api-keys
2. Put it in `.env`:
```
OPENAI_API_KEY=sk-...
```

## How to configure PostgreSQL + pgvector (Docker)
1. Run pgvector image (example using Docker Desktop or CLI):

```powershell
docker run --name berkshire-pg -e POSTGRES_PASSWORD=YourPassword@ -p 5434:5432 -d pgvector/pgvector:latest
```

2. Create database and extension:

```powershell
docker exec berkshire-pg psql -U postgres -c "CREATE DATABASE berkshire_pgvector;"
docker exec berkshire-pg psql -U postgres -d berkshire_pgvector -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

3. Update `.env` with encoded password (encode `@` as `%40`):

```
DATABASE_URL=postgresql://postgres:YourPassword%40@127.0.0.1:5434/berkshire_pgvector
```

## Start development server and Mastra playground
- If you used `npx create-mastra@latest` to scaffold Mastra, run the Mastra playground (default):

```bash
npm run dev
# Open http://localhost:4111
```

- If you used this repository scaffold, run the local app entrypoint to validate env:

```bash
npm install
npm run dev
```

`src/index.ts` validates environment variables on startup and prints the expected Mastra playground URL.

## Troubleshooting
- If `vector` extension creation fails in pgAdmin, ensure you are connected to the Docker container (port 5434) and not the system PostgreSQL instance.
- If your password contains special characters (like `@`), URL-encode them in `DATABASE_URL` (e.g., `@` -> `%40`).


## Verification
After configuring `.env` and starting the app with `npm run dev`, you should see a message containing:

```
Mastra playground: http://localhost:4111
OpenAI API Key: ✅ Set
Database URL: ✅ Set
```

If any are missing, edit your `.env` and re-run `npm run dev`.
