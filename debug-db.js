import 'dotenv/config';
import OpenAI from 'openai';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function diagnose() {
  try {
    console.log('🔍 Diagnostic Check\n');
    
    // Step 1: Check if chunks have embeddings
    console.log('Step 1: Check chunks with embeddings...');
    const checkRows = await pool.query('SELECT COUNT(*) as total, COUNT(embedding) as with_embedding FROM chunks');
    console.log(`  Total chunks: ${checkRows.rows[0].total}`);
    console.log(`  Chunks with embeddings: ${checkRows.rows[0].with_embedding}`);
    
    // Step 2: Check embedding vector type
    console.log('\nStep 2: Check first embedding vector...');
    const vecSample = await pool.query('SELECT id, embedding FROM chunks LIMIT 1');
    if (vecSample.rows.length > 0) {
      const emb = vecSample.rows[0].embedding;
      console.log(`  Embedding type: ${typeof emb}`);
      console.log(`  Embedding length: ${emb ? emb.length : 'null'}`);
      console.log(`  First 5 values: ${emb ? emb.slice(0, 5) : 'null'}`);
    }
    
    // Step 3: Test vector operator with a real chunk embedding
    console.log('\nStep 3: Test vector operator with real embedding...');
    const result = await pool.query(`
      SELECT COUNT(*) as total, 
             COUNT(embedding) as with_emb,
             COUNT(CASE WHEN embedding IS NOT NULL AND embedding != '0' THEN 1 END) as nonzero
      FROM chunks
    `);
    console.log(`  Results: ${JSON.stringify(result.rows[0])}`);
    
    // Step 4: Test distance calculation
    console.log('\nStep 4: Test distance from first chunk to itself...');
    const selfDist = await pool.query(`
      SELECT id, (embedding <=> embedding) as distance FROM chunks LIMIT 1
    `);
    if (selfDist.rows.length > 0) {
      console.log(`  Self-distance: ${selfDist.rows[0].distance}`);
    }
    
    // Step 5: Get the failing query embedding
    console.log('\nStep 5: Test failing query embedding...');
    const query = "How has Berkshire's acquisition strategy evolved over time?";
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    });
    const vector = embedding.data[0]?.embedding;
    console.log(`  Query embedding length: ${vector.length}`);
    console.log(`  First 5 values: ${vector.slice(0, 5)}`);
    console.log(`  All zeros? ${vector.every(v => v === 0)}`);
    
    // Step 6: Try simpler distance query
    console.log('\nStep 6: Try distance with raw vector array...');
    const embeddingText = '[' + vector.join(',') + ']';
    const simpleTest = await pool.query(`
      SELECT COUNT(*) as count FROM chunks 
      LIMIT 1
    `);
    console.log(`  Basic query works: ${simpleTest.rows[0].count > 0}`);
    
    // Try with explicit cast
    console.log('\nStep 7: Try distance with explicit casting...');
    try {
      const typedQuery = await pool.query(`
        SELECT id, source_file, embedding <=> $1::vector AS distance
        FROM chunks 
        ORDER BY embedding <=> $1::vector ASC 
        LIMIT 3
      `, [embeddingText]);
      console.log(`  Typed query results: ${typedQuery.rows.length}`);
    } catch (e) {
      console.log(`  ❌ Typed query error: ${e.message}`);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  }
}

diagnose();
