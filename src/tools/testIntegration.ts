import dotenv from "dotenv";
dotenv.config();

import { berkshireAgent } from "../agents/berkshire.js";
import { vectorSearchWithFilters, retrieveLetterByYear } from "./retrieval.js";
import { config } from "../lib/config.js";

async function run() {
  if (!config.openaiApiKey) {
    console.error("OPENAI_API_KEY missing; test requires an API key in env.");
    process.exit(1);
  }

  const agent = await berkshireAgent;
  console.log("Using agent:", agent.name);

  // 1) Quick vector search with metadata filtering
  const query = "Berkshire investment thesis insurance float";
  const results = await vectorSearchWithFilters(query, 5, { source: /shareholder/i, year: { min: 1990 } });
  console.log("Vector search results:", results.slice(0, 3));

  // 2) Retrieve a letter by year with metadata filter
  const letter = await retrieveLetterByYear(1996, { source: /berkshire/i });
  console.log("Retrieved letter excerpt:", letter.text.slice(0, 400));

  // 3) Compose a short prompt including retrieved context and ask the agent
  const retrievedContext = results.map((r) => r.text).slice(0, 3).join('\n\n');
  const conversationContext = `Recent query: ${query}`;

  const response = await agent.generate([
    { role: "system", content: `Use the provided retrieved context when answering.` },
    { role: "user", content: `Given the context below, summarize Berkshire's insurance float importance:\n\n${retrievedContext}` },
  ]);

  console.log("Agent answer:\n", response.text);
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
