import { Pool } from "pg";
import { config } from "./config.js";

const EMBED_DIM = 1536;

const pool = new Pool({ connectionString: config.databaseUrl });

export type Chunk = {
  id?: number;
  text: string;
  embedding: number[];
  source_year?: number | null;
  source_file?: string | null;
  chunk_index?: number | null;
};

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        embedding vector(${EMBED_DIM}),
        source_year INT,
        source_file TEXT,
        chunk_index INT
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);
  } finally {
    client.release();
  }
}

export async function storeChunk(chunk: Chunk) {
  const client = await pool.connect();
  try {
    const embeddingText = '[' + chunk.embedding.join(',') + ']';
    const q = `INSERT INTO chunks (text, embedding, source_year, source_file, chunk_index) VALUES ($1, $2::vector, $3, $4, $5) RETURNING id`;
    const res = await client.query(q, [chunk.text, embeddingText, chunk.source_year ?? null, chunk.source_file ?? null, chunk.chunk_index ?? null]);
    return res.rows[0]?.id;
  } finally {
    client.release();
  }
}

export async function searchSimilar(embedding: number[], topK = 5) {
  const client = await pool.connect();
  try {
    const embeddingText = '[' + embedding.join(',') + ']';
    const q = `SELECT id, text, source_year, source_file, chunk_index, embedding <=> $1::vector AS distance FROM chunks ORDER BY embedding <=> $1::vector ASC LIMIT $2`;
    const res = await client.query(q, [embeddingText, topK]);
    return res.rows;
  } finally {
    client.release();
  }
}

export async function getChunksByYear(year: number, limit = 20) {
  const client = await pool.connect();
  try {
    const q = `SELECT id, text, source_year, source_file, chunk_index FROM chunks WHERE source_year = $1 ORDER BY chunk_index ASC LIMIT $2`;
    const res = await client.query(q, [year, limit]);
    return res.rows;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  await pool.end();
}

export default { initDb, storeChunk, searchSimilar, closeDb };
