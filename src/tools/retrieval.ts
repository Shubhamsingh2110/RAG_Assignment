import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

import { config } from "../lib/config.js";
import { getChunksByYear, searchSimilar } from "../lib/db.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

function formatResults(rows: Array<{ text: string; source_year?: number | null; source_file?: string | null }>) {
  return rows.map((row) => ({
    text: row.text,
    source: row.source_file ?? "unknown",
    year: row.source_year ?? 0,
  }));
}

// Tool: Vector search through documents
export async function vectorSearchTool(
  query: string,
  topK: number = 5
): Promise<Array<{ text: string; source: string; year: number }>> {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for vector search");
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  const embedding = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: query });
  const vector = embedding.data[0]?.embedding;

  if (!vector) {
    return [];
  }

  const rows = await searchSimilar(vector, topK);
  return formatResults(rows);
}

// Tool: Retrieve document by year
export async function retrieveLetterByYear(
  year: number
): Promise<{ text: string; year: number }> {
  const rows = await getChunksByYear(year, 50);
  const text = rows.map((row) => row.text).join("\n\n");

  if (text) {
    return { text, year };
  }

  return {
    text: `No stored Berkshire Hathaway shareholder letter chunks were found for ${year}.`,
    year,
  };
}

// Tool: List available documents
export async function listAvailableDocuments(): Promise<
  Array<{ year: number; path: string }>
> {
  const sourceDir = path.join(process.cwd(), "data", "source");
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith(".pdf"));
  return files.map((f) => ({
    year: parseInt(f.substring(0, 4)),
    path: path.join(sourceDir, f),
  }));
}

export const tools = {
  vectorSearch: {
    name: "vector_search",
    description:
      "Search through Berkshire Hathaway shareholder letters using semantic similarity",
    fn: vectorSearchTool,
  },
  retrieveLetter: {
    name: "retrieve_letter_by_year",
    description: "Get a specific shareholder letter by year",
    fn: retrieveLetterByYear,
  },
  listDocuments: {
    name: "list_available_documents",
    description: "List all available shareholder letters",
    fn: listAvailableDocuments,
  },
};
