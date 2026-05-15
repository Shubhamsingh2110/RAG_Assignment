import fs from "fs/promises";
import path from "path";
// pdfjs-dist doesn't ship types; ignore TypeScript for this import.
// If this import fails in your environment consider installing pdf-parse instead.
// @ts-ignore
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import OpenAI from "openai";
import { config } from "./lib/config.js";
import { initDb, storeChunk } from "./lib/db.js";

const SOURCE_DIR = path.resolve(process.cwd(), "data", "source");
const CHUNK_SIZE = 1000; // characters
const CHUNK_OVERLAP = 200;
const EMBEDDING_MODEL = "text-embedding-3-small";

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end === text.length) break;
    start = end - overlap; // overlap
  }
  return chunks;
}

async function extractTextFromPdf(filePath: string) {
  const data = await fs.readFile(filePath);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it: any) => it.str).join(" ");
    fullText += `\n\n${pageText}`;
  }
  return fullText;
}

async function embedTexts(client: OpenAI, texts: string[]) {
  // OpenAI supports batching multiple inputs
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  // result.data is array matching inputs
  return res.data.map((r: any) => r.embedding as number[]);
}

async function run() {
  console.log("Starting ingestion...");
  await initDb();

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const pdfFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(SOURCE_DIR, e.name));

  if (pdfFiles.length === 0) {
    console.log("No PDFs found in data/source/. Please add Berkshire shareholder letters (2019-2024).\n");
    return;
  }

  for (const filePath of pdfFiles) {
    console.log(`Processing: ${path.basename(filePath)}`);
    try {
      const text = await extractTextFromPdf(filePath);
      const chunks = chunkText(text);
      console.log(`  -> extracted ${chunks.length} chunks`);

      // Batch embeddings in groups of 32
      const batchSize = 32;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const embeddings = await embedTexts(openai, slice);
        for (let j = 0; j < slice.length; j++) {
          const chunkTextStr = slice[j];
          const embedding = embeddings[j];
          const record = {
            text: chunkTextStr,
            embedding,
            source_year: inferYearFromFilename(path.basename(filePath)),
            source_file: path.basename(filePath),
            chunk_index: i + j,
          };
          // storeChunk returns the inserted id; ignore here
          await storeChunk(record as any);
        }
        console.log(`  -> stored chunks ${i}..${Math.min(i + batchSize, chunks.length) - 1}`);
      }
    } catch (err) {
      console.error(`Failed to process ${filePath}:`, err);
    }
  }

  console.log("Ingestion complete.");
}

function inferYearFromFilename(name: string) {
  const m = name.match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

// Run when invoked directly (heuristic: script path contains 'ingest')
const shouldRun = process.argv.some((a) => a && a.includes("ingest"));
if (shouldRun) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export default run;
