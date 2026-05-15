import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});

async function test() {
  try {
    const emb = '[' + Array(1536).fill(0.1).join(',') + ']';
    
    console.log('Testing distance operators for ORDER BY...\n');
    
    // Test <-> operator
    console.log('Test 1: ORDER BY embedding <-> vector');
    try {
      const r1 = await pool.query('SELECT id FROM chunks ORDER BY embedding <-> $1::vector LIMIT 3', [emb]);
      console.log(`  ✅ Got ${r1.rows.length} rows`);
    } catch (e) {
      console.log(`  ❌ Error: ${e.message.split('\n')[0]}`);
    }
    
    // Test <=> with different order
    console.log('\nTest 2: ORDER BY embedding <=> vector (no ASC)');
    try {
      const r2 = await pool.query('SELECT id FROM chunks ORDER BY embedding <=> $1::vector LIMIT 3', [emb]);
      console.log(`  ✅ Got ${r2.rows.length} rows`);
    } catch (e) {
      console.log(`  ❌ Error: ${e.message.split('\n')[0]}`);
    }
    
    // Test with column calculation
    console.log('\nTest 3: Calculate distance, then order');
    try {
      const r3 = await pool.query(`
        SELECT id, embedding <-> $1::vector as dist FROM chunks 
        ORDER BY dist LIMIT 3
      `, [emb]);
      console.log(`  ✅ Got ${r3.rows.length} rows`);
    } catch (e) {
      console.log(`  ❌ Error: ${e.message.split('\n')[0]}`);
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

test();
