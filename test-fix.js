import 'dotenv/config';
import OpenAI from 'openai';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testFix() {
  try {
    const queries = [
      "How has Berkshire's acquisition strategy evolved over time?",
      "What is Warren Buffett's investment philosophy?",
      "Can you elaborate on his views about diversification?"
    ];
    
    for (const query of queries) {
      console.log(`\n🔍 Query: "${query}"`);
      
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query
      });
      
      const vector = embedding.data[0]?.embedding;
      const embeddingText = '[' + vector.join(',') + ']';
      
      // Use the FIXED query with <-> operator
      const result = await pool.query(
        `SELECT id, text, source_year, source_file, embedding <=> $1::vector AS distance FROM chunks ORDER BY embedding <-> $1::vector ASC LIMIT 5`,
        [embeddingText]
      );
      
      console.log(`  Found ${result.rows.length} results:`);
      result.rows.slice(0, 2).forEach((row, i) => {
        console.log(`    [${i+1}] distance=${row.distance?.toFixed(4)} | ${row.source_file}: ${row.text.substring(0, 60)}...`);
      });
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testFix();
