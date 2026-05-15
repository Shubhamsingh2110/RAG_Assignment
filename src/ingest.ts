import fs from "fs/promises";
import path from "path";
// pdfjs-dist doesn't ship types; ignore TypeScript for this import.
// If this import fails in your environment consider installing pdf-parse instead.
// @ts-ignore
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import OpenAI from "openai";
import { MDocument } from "@mastra/rag";
import { config } from "./lib/config.js";
import { getChunkCount, initDb, searchSimilar, storeChunk } from "./lib/db.js";

const SOURCE_DIR = path.resolve(process.cwd(), "data", "source");
const CHUNK_SIZE = 640;
const CHUNK_OVERLAP = 100;
const EMBEDDING_MODEL = "text-embedding-3-small";

async function extractTextFromPdf(filePath: string) {
  const data = await fs.readFile(filePath);
  const bytes = new Uint8Array(data);
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
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

function buildFinancialDocument(text: string, filePath: string) {
  const fileName = path.basename(filePath);
  const sourceYear = inferYearFromFilename(fileName);

  return MDocument.fromText(text, {
    source_file: fileName,
    source_year: sourceYear,
    document_type: "pdf",
  });
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
      const document = buildFinancialDocument(text, filePath);
      const chunks = await document.chunk({
        strategy: "recursive",
        maxSize: CHUNK_SIZE,
        overlap: CHUNK_OVERLAP,
        separators: ["\n\n", "\n", " "],
      });
      console.log(`  -> extracted ${chunks.length} chunks using recursive chunking`);

      // Batch embeddings in groups of 32
      const batchSize = 32;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const sliceTexts = slice.map((chunk) => chunk.text);
        const embeddings = await embedTexts(openai, sliceTexts);
        for (let j = 0; j < slice.length; j++) {
          const chunkNode = slice[j];
          const embedding = embeddings[j];
          const chunkMetadata = chunkNode.metadata ?? {};
          const record = {
            text: chunkNode.text,
            embedding,
            source_year: chunkMetadata.source_year ?? inferYearFromFilename(path.basename(filePath)),
            source_file: chunkMetadata.source_file ?? path.basename(filePath),
            chunk_index: i + j,
          };
          // storeChunk returns the inserted id; ignore here
          await storeChunk(record as any);
        }
        console.log(`  -> stored chunks ${i}..${Math.min(i + batchSize, chunks.length) - 1}`);
      }

      if (chunks.length > 0) {
        const firstChunk = chunks[0];
        const firstEmbedding = await embedTexts(openai, [firstChunk.text]);
        const nearest = await searchSimilar(firstEmbedding[0], 1);
        const topMatch = nearest[0];
        if (topMatch) {
          console.log(
            `  -> smoke test passed: nearest chunk ${topMatch.id} from ${topMatch.source_file ?? "unknown"}`
          );
        }
      }
    } catch (err) {
      console.error(`Failed to process ${filePath}:`, err);
    }
  }

  const totalChunks = await getChunkCount();
  console.log(`Vector database now contains ${totalChunks} stored chunks.`);
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
