import pg from 'pg';
const { Pool } = pg;

async function addBlockedColumn() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Verificando se a coluna "blocked" existe...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='blocked'
    `);

    if (checkColumn.rows.length === 0) {
      console.log('➕ Adicionando coluna "blocked" na tabela users...');
      
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN blocked BOOLEAN DEFAULT false
      `);
      
      console.log('✅ Coluna "blocked" adicionada com sucesso!');
    } else {
      console.log('ℹ️ Coluna "blocked" já existe.');
    }

    // Verificar se a coluna block_reason existe
    const checkReasonColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='block_reason'
    `);

    if (checkReasonColumn.rows.length === 0) {
      console.log('➕ Adicionando coluna "block_reason" na tabela users...');
      
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN block_reason TEXT
      `);
      
      console.log('✅ Coluna "block_reason" adicionada com sucesso!');
    } else {
      console.log('ℹ️ Coluna "block_reason" já existe.');
    }

    console.log('🎉 Todas as colunas necessárias estão disponíveis!');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar colunas:', error);
  } finally {
    await pool.end();
  }
}

addBlockedColumn();