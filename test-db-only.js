import pg from 'pg';

const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});

async function test() {
  try {
    console.log('Testing fixed query...\n');
    
    // Use a simple embedding vector
    const vector = Array(1536).fill(0.1);
    const embeddingText = '[' + vector.join(',') + ']';
    
    console.log('Running query with <-> operator...');
    const result = await pool.query(
      `SELECT id, text, source_year, source_file, embedding <=> $1::vector AS distance FROM chunks ORDER BY embedding <-> $1::vector ASC LIMIT 3`,
      [embeddingText]
    );
    
    console.log(`✅ Got ${result.rows.length} results!\n`);
    result.rows.forEach((row, i) => {
      console.log(`[${i+1}] distance=${row.distance?.toFixed(4)} | ${row.source_file}`);
      console.log(`    Text: ${row.text.substring(0, 70)}...\n`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

test();
