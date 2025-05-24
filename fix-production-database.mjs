import { Client } from 'pg';

// Script para corrigir banco de dados em produção
async function fixProductionDatabase() {
  console.log('🔧 CORRIGINDO BANCO DE DADOS EM PRODUÇÃO');
  console.log('='.repeat(50));
  
  // Configuração do banco (substitua pela sua connection string)
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.log('❌ ERRO: DATABASE_URL não encontrada!');
    console.log('Configure a variável de ambiente DATABASE_URL');
    return;
  }
  
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    console.log('🔌 Conectando ao banco de dados...');
    await client.connect();
    console.log('✅ Conectado ao banco!');
    console.log('');
    
    // 1. Verificar se a coluna use_bonus_balance existe
    console.log('🔍 1. VERIFICANDO COLUNA use_bonus_balance...');
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bets' 
      AND column_name = 'use_bonus_balance'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('❌ Coluna use_bonus_balance NÃO existe - criando...');
      
      await client.query(`
        ALTER TABLE bets 
        ADD COLUMN use_bonus_balance BOOLEAN DEFAULT false
      `);
      
      console.log('✅ Coluna use_bonus_balance criada com sucesso!');
    } else {
      console.log('✅ Coluna use_bonus_balance já existe');
    }
    console.log('');
    
    // 2. Verificar estrutura da tabela bets
    console.log('📋 2. VERIFICANDO ESTRUTURA DA TABELA bets...');
    const tableStructure = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'bets'
      ORDER BY ordinal_position
    `);
    
    console.log('Colunas encontradas na tabela bets:');
    tableStructure.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    console.log('');
    
    // 3. Verificar outras colunas que podem estar faltando
    console.log('🔍 3. VERIFICANDO OUTRAS COLUNAS...');
    
    const columnsToCheck = [
      { name: 'premio_type', type: 'VARCHAR(10)', default: 'DEFAULT \'1\'' },
      { name: 'potential_win_amount', type: 'REAL', default: 'DEFAULT 0' },
      { name: 'game_mode_id', type: 'INTEGER', default: null }
    ];
    
    for (const col of columnsToCheck) {
      const checkCol = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'bets' 
        AND column_name = '${col.name}'
      `);
      
      if (checkCol.rows.length === 0) {
        console.log(`❌ Coluna ${col.name} não existe - criando...`);
        
        const alterQuery = `ALTER TABLE bets ADD COLUMN ${col.name} ${col.type} ${col.default || ''}`;
        await client.query(alterQuery);
        
        console.log(`✅ Coluna ${col.name} criada!`);
      } else {
        console.log(`✅ Coluna ${col.name} já existe`);
      }
    }
    console.log('');
    
    // 4. Atualizar registros existentes
    console.log('🔄 4. ATUALIZANDO REGISTROS EXISTENTES...');
    await client.query(`
      UPDATE bets 
      SET use_bonus_balance = false 
      WHERE use_bonus_balance IS NULL
    `);
    console.log('✅ Registros atualizados!');
    console.log('');
    
    // 5. Resumo final
    console.log('🎉 CORREÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('='.repeat(50));
    console.log('✅ Coluna use_bonus_balance: OK');
    console.log('✅ Outras colunas: OK');
    console.log('✅ Registros atualizados: OK');
    console.log('');
    console.log('🚀 BANCO DE DADOS PRONTO PARA APOSTAS!');
    
  } catch (error) {
    console.log('❌ ERRO NA CORREÇÃO:');
    console.log('Erro:', error.message);
    console.log('');
    console.log('🔍 POSSÍVEIS CAUSAS:');
    console.log('1. Erro de conexão com o banco');
    console.log('2. Permissões insuficientes');
    console.log('3. Tabela não existe');
  } finally {
    await client.end();
    console.log('🔌 Conexão fechada');
  }
}

// Executar correção
fixProductionDatabase();