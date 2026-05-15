import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});

async function test() {
  try {
    const emb = '[' + Array(1536).fill(0.1).join(',') + ']';
    
    console.log('Test 1: SELECT with ORDER BY distance');
    const r1 = await pool.query('SELECT id, embedding <=> $1::vector as dist FROM chunks ORDER BY embedding <=> $1::vector ASC LIMIT 3', [emb]);
    console.log(`  Got ${r1.rows.length} rows`);
    
    console.log('\nTest 2: SELECT all WITHOUT ORDER BY');
    const r2 = await pool.query('SELECT id, embedding <=> $1::vector as dist FROM chunks LIMIT 3', [emb]);
    console.log(`  Got ${r2.rows.length} rows`);
    
    console.log('\nTest 3: Use subquery to order');
    const r3 = await pool.query(`
      SELECT * FROM (
        SELECT id, embedding <=> $1::vector as dist FROM chunks
      ) subq ORDER BY dist ASC LIMIT 3
    `, [emb]);
    console.log(`  Got ${r3.rows.length} rows`);
    
    console.log('\nTest 4: Check if operator is supported');
    const r4 = await pool.query(`SELECT '<>'::text`);
    console.log(`  Operator check: ${r4.rows[0]}`);
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

test();
