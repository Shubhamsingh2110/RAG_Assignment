import pg from 'pg';
const pool = new pg.Pool({connectionString: 'postgresql://postgres:Shubham2004%40@127.0.0.1:5434/berkshire_pgvector'});

async function checkContent() {
  try {
    const acqResult = await pool.query("SELECT COUNT(*) as cnt FROM chunks WHERE text ILIKE '%acquisition%' OR text ILIKE '%acquisitions%'");
    console.log('✓ Chunks with "acquisition":', acqResult.rows[0].cnt);
    
    const divResult = await pool.query("SELECT COUNT(*) as cnt FROM chunks WHERE text ILIKE '%diversif%'");
    console.log('✓ Chunks with "diversif":', divResult.rows[0].cnt);
    
    // Try searching for actual acquisition chunks
    const samples = await pool.query("SELECT text, source_file FROM chunks WHERE text ILIKE '%acquisition%' LIMIT 2");
    if (samples.rows.length > 0) {
      console.log('\n📄 Sample acquisition chunks:');
      samples.rows.forEach((row, i) => {
        console.log(`[${i+1}] ${row.source_file}: ${row.text.substring(0, 100)}...`);
      });
    }
    
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

checkContent();
