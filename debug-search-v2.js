import 'dotenv/config';
import OpenAI from 'openai';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testSearch() {
  try {
    console.log('🔍 Testing vector search with actual embeddings\n');
    
    const query = "How has Berkshire's acquisition strategy evolved over time?";
    console.log(`Query: "${query}"`);
    
    // Create embedding
    console.log('⏳ Creating embedding...');
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });
    
    const vector = embedding.data[0]?.embedding;
    console.log(`✅ Created embedding (${vector.length} dims)\n`);

    const embeddingText = '[' + vector.join(',') + ']';
    
    // Test 1: COUNT first
    console.log('Test 1: Check total chunks');
    const countRes = await pool.query('SELECT COUNT(*) as cnt FROM chunks');
    console.log(`  Total chunks: ${countRes.rows[0].cnt}`);
    
    // Test 2: Try distance with explicit logging
    console.log('\nTest 2: Try vector distance search with logging');
    try {
      const searchQuery = `
        WITH results AS (
          SELECT id, source_file, text, embedding <=> $1::vector AS distance
          FROM chunks 
          ORDER BY embedding <=> $1::vector ASC 
          LIMIT 10
        )
        SELECT COUNT(*) as cnt FROM results;
      `;
      
      const countResult = await pool.query(searchQuery, [embeddingText]);
      console.log(`  Search returned ${countResult.rows[0].cnt} rows`);
      
      // Now get the actual rows
      const fullQuery = `
        SELECT id, source_file, text, embedding <=> $1::vector AS distance
        FROM chunks 
        ORDER BY embedding <=> $1::vector ASC 
        LIMIT 5
      `;
      
      const fullResult = await pool.query(fullQuery, [embeddingText]);
      console.log(`  Got ${fullResult.rows.length} results`);
      
      if (fullResult.rows.length > 0) {
        fullResult.rows.forEach((row, i) => {
          console.log(`  [${i+1}] distance=${row.distance?.toFixed(4) || 'NULL'} | ${row.source_file}: ${row.text.substring(0, 60)}...`);
        });
      }
    } catch (e) {
      console.log(`  ❌ Query error: ${e.message}`);
      console.log(e);
    }
    
    // Test 3: Simple distance check
    console.log('\nTest 3: Test with simpler embedding');
    try {
      const simpleEmbed = '[' + Array(1536).fill(0.1).join(',') + ']';
      const simpleResult = await pool.query(`
        SELECT COUNT(*) as cnt FROM chunks 
        WHERE embedding <=> $1::vector < 2.0
      `, [simpleEmbed]);
      console.log(`  Chunks with distance < 2.0: ${simpleResult.rows[0].cnt}`);
    } catch (e) {
      console.log(`  ❌ Simple test error: ${e.message}`);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

testSearch();
