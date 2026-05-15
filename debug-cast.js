import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});

async function testCast() {
  try {
    console.log('Testing vector cast...\n');
    
    // Test 1: Try casting a string to vector directly
    console.log('Test 1: Direct cast in SELECT');
    try {
      const result = await pool.query(`SELECT '[1.0, 2.0, 3.0]'::vector as vec`);
      console.log(`✅ Direct cast works: ${JSON.stringify(result.rows[0])}`);
    } catch (e) {
      console.log(`❌ Direct cast failed: ${e.message}`);
    }
    
    // Test 2: Check column type
    console.log('\nTest 2: Check chunks.embedding column type');
    const colInfo = await pool.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'chunks' AND column_name = 'embedding'
    `);
    console.log(`Column info:`, colInfo.rows[0]);
    
    // Test 3: Check actual stored values
    console.log('\nTest 3: Check actual stored embedding (raw)');
    const sample = await pool.query(`SELECT embedding, pg_typeof(embedding)::text as type FROM chunks LIMIT 1`);
    if (sample.rows.length > 0) {
      const emb = sample.rows[0].embedding;
      console.log(`Type: ${sample.rows[0].type}`);
      console.log(`Value (first 50 chars): ${String(emb).substring(0, 50)}`);
    }
    
    // Test 4: Try distance with explicit conversion
    console.log('\nTest 4: Try distance calculation with conversion');
    try {
      const testVec = '[0.1,0.2,0.3,' + Array(1533).fill('0.0').join(',') + ']';
      const result = await pool.query(`
        SELECT id, embedding::text, embedding <=> $1::vector as distance
        FROM chunks LIMIT 1
      `, [testVec]);
      console.log(`✅ Distance calculation works`);
      console.log(`First result distance:`, result.rows[0]);
    } catch (e) {
      console.log(`❌ Distance calc failed: ${e.message}`);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

testCast();
