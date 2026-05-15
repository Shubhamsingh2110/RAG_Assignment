# Berkshire Hathaway Intelligence - Mastra RAG Application

A production-ready RAG (Retrieval-Augmented Generation) application built with Mastra that intelligently answers questions about Warren Buffett's investment philosophy using Berkshire Hathaway shareholder letters (2019-2024).

## ⚡ Quick Start

```bash
npm install
# Set up .env file (see IMPLEMENTATION.md)
npm run dev
```

## 📍 Where to Add Shareholder PDFs

Place all Berkshire Hathaway letters in this folder:

```
provue/data/source/
├── 2019-shareholder-letter.pdf
├── 2020-shareholder-letter.pdf
├── 2021-shareholder-letter.pdf
├── 2022-shareholder-letter.pdf
├── 2023-shareholder-letter.pdf
└── 2024-shareholder-letter.pdf
```

Download the Berkshire Hathaway shareholder letters from the assignment's Google Drive link and place the PDFs in `data/source/`.

## 📚 Documentation

- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** — Complete step-by-step setup guide (START HERE)
- **[CODEBASE_WORKFLOW.md](CODEBASE_WORKFLOW.md)** — Architecture and frozen tech stack
- **[docs/SETUP.md](docs/SETUP.md)** — Environment and PostgreSQL setup

## 🏗️ Tech Stack

- **Framework**: Mastra (RAG, Agents, Workflows, Memory)
- **Language**: TypeScript
- **LLM**: OpenAI GPT-4o
- **Embeddings**: OpenAI text-embedding model
- **Vector Store**: PostgreSQL + pgvector
- **Frontend**: React + Vite (optional, can use Mastra UI)

## 🚀 What This App Does

1. **Ingests** Berkshire Hathaway shareholder letters as chunks
2. **Stores** embeddings in PostgreSQL for fast retrieval
3. **Answers** questions about Buffett's investment philosophy using RAG
4. **Cites** sources with exact letter references
5. **Remembers** conversation context across multiple questions
