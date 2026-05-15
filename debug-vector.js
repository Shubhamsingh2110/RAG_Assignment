import 'dotenv/config';
import OpenAI from 'openai';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testVectorSearch() {
  try {
    const query = "How has Berkshire's acquisition strategy evolved over time?";
    console.log(`\n🔍 Testing query: "${query}"`);
    
    console.log('⏳ Creating embedding...');
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });
    
    const vector = embedding.data[0]?.embedding;
    console.log(`✅ Embedding created (${vector.length} dimensions)`);

    const embeddingText = '[' + vector.join(',') + ']';
    
    console.log('⏳ Querying database...');
    const startTime = Date.now();
    const result = await pool.query(
      `SELECT text, source_file, embedding <=> $1::vector AS distance 
       FROM chunks ORDER BY embedding <=> $1::vector ASC LIMIT 10`,
      [embeddingText]
    );
    const queryTime = Date.now() - startTime;
    
    console.log(`✅ Database query completed in ${queryTime}ms`);
    console.log(`📊 Results found: ${result.rows.length}`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No results returned!');
    } else {
      console.log('\n📄 Top 3 results:');
      result.rows.slice(0, 3).forEach((row, i) => {
        console.log(`[${i+1}] distance=${row.distance.toFixed(4)} | ${row.source_file}: ${row.text.substring(0, 70)}...`);
      });
    }




    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testVectorSearch();
