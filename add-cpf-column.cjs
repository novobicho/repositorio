const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

async function addCpfColumn() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔧 Verificando se a coluna CPF existe na tabela users...');
    
    // Verificar se a coluna CPF já existe
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'cpf'
    `;
    
    const checkResult = await pool.query(checkColumnQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('✅ Coluna CPF já existe na tabela users.');
    } else {
      console.log('📝 Adicionando coluna CPF à tabela users...');
      await pool.query('ALTER TABLE users ADD COLUMN cpf TEXT UNIQUE');
      console.log('✅ Coluna CPF adicionada com sucesso!');
    }
    
    // Verificar se as colunas de PIX padrão existem
    console.log('🔧 Verificando colunas de PIX padrão...');
    
    const checkPixColumns = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('default_pix_key', 'default_pix_key_type')
    `;
    
    const pixResult = await pool.query(checkPixColumns);
    
    if (pixResult.rows.length < 2) {
      console.log('📝 Adicionando colunas de PIX padrão...');
      
      const hasPixKey = pixResult.rows.some(row => row.column_name === 'default_pix_key');
      const hasPixKeyType = pixResult.rows.some(row => row.column_name === 'default_pix_key_type');
      
      if (!hasPixKey) {
        await pool.query('ALTER TABLE users ADD COLUMN default_pix_key TEXT');
        console.log('✅ Coluna default_pix_key adicionada!');
      }
      
      if (!hasPixKeyType) {
        await pool.query('ALTER TABLE users ADD COLUMN default_pix_key_type TEXT');
        console.log('✅ Coluna default_pix_key_type adicionada!');
      }
    } else {
      console.log('✅ Colunas de PIX padrão já existem.');
    }
    
    // Atualizar usuários existentes para definir CPF como chave PIX padrão quando disponível
    console.log('🔄 Atualizando chaves PIX padrão para usuários com CPF...');
    
    const updateQuery = `
      UPDATE users 
      SET default_pix_key = cpf, default_pix_key_type = 'cpf'
      WHERE cpf IS NOT NULL 
      AND cpf != '' 
      AND (default_pix_key IS NULL OR default_pix_key = '')
    `;
    
    const updateResult = await pool.query(updateQuery);
    console.log(`✅ ${updateResult.rowCount} usuários atualizados com chave PIX padrão.`);
    
    console.log('🎉 Migração do CPF concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Executar apenas se for chamado diretamente
if (require.main === module) {
  addCpfColumn().catch(console.error);
}

module.exports = { addCpfColumn };