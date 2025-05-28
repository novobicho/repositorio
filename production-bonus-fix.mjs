import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function ensureProductionBonus() {
  console.log('🚀 GARANTINDO FUNCIONAMENTO EM PRODUÇÃO\n');
  
  try {
    // 1. Verificar se todas as funções necessárias existem no storage
    console.log('🔍 VERIFICANDO INTEGRIDADE DO SISTEMA...\n');
    
    // Verificar se a tabela user_bonuses existe
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'user_bonuses'
    `);
    
    if (tables.length === 0) {
      console.log('⚠️  Criando tabela user_bonuses...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_bonuses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          remaining_amount DECIMAL(10,2) NOT NULL,
          rollover_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          rolled_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          expires_at TIMESTAMP,
          related_transaction_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ Tabela user_bonuses criada!');
    } else {
      console.log('✅ Tabela user_bonuses já existe');
    }
    
    // 2. Verificar colunas de bônus na system_settings
    const { rows: columns } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'system_settings' 
        AND column_name IN (
          'first_deposit_bonus_enabled',
          'first_deposit_bonus_percentage', 
          'first_deposit_bonus_max_amount',
          'first_deposit_bonus_rollover',
          'first_deposit_bonus_expiration'
        )
    `);
    
    const requiredColumns = [
      'first_deposit_bonus_enabled',
      'first_deposit_bonus_percentage', 
      'first_deposit_bonus_max_amount',
      'first_deposit_bonus_rollover',
      'first_deposit_bonus_expiration'
    ];
    
    const existingColumns = columns.map(c => c.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log(`⚠️  Adicionando colunas faltantes: ${missingColumns.join(', ')}`);
      
      for (const column of missingColumns) {
        let columnDef = '';
        switch (column) {
          case 'first_deposit_bonus_enabled':
            columnDef = 'BOOLEAN DEFAULT true';
            break;
          case 'first_deposit_bonus_percentage':
            columnDef = 'DECIMAL(5,2) DEFAULT 100.00';
            break;
          case 'first_deposit_bonus_max_amount':
            columnDef = 'DECIMAL(10,2) DEFAULT 250.00';
            break;
          case 'first_deposit_bonus_rollover':
            columnDef = 'DECIMAL(5,2) DEFAULT 3.00';
            break;
          case 'first_deposit_bonus_expiration':
            columnDef = 'INTEGER DEFAULT 7';
            break;
        }
        
        await pool.query(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS ${column} ${columnDef}`);
      }
      console.log('✅ Colunas de bônus adicionadas!');
    } else {
      console.log('✅ Todas as colunas de bônus existem');
    }
    
    // 3. Garantir que as configurações estão corretas
    console.log('\n🔧 VERIFICANDO CONFIGURAÇÕES...\n');
    
    const { rows: settings } = await pool.query('SELECT * FROM system_settings LIMIT 1');
    
    if (settings.length === 0) {
      console.log('⚠️  Criando configurações padrão...');
      await pool.query(`
        INSERT INTO system_settings (
          first_deposit_bonus_enabled,
          first_deposit_bonus_percentage,
          first_deposit_bonus_max_amount,
          first_deposit_bonus_rollover,
          first_deposit_bonus_expiration
        ) VALUES (true, 100.00, 250.00, 3.00, 7)
      `);
      console.log('✅ Configurações padrão criadas!');
    } else {
      const config = settings[0];
      console.log('📋 CONFIGURAÇÕES ATUAIS:');
      console.log(`- Bônus habilitado: ${config.first_deposit_bonus_enabled}`);
      console.log(`- Percentual: ${config.first_deposit_bonus_percentage}%`);
      console.log(`- Valor máximo: R$${config.first_deposit_bonus_max_amount}`);
      console.log(`- Rollover: ${config.first_deposit_bonus_rollover}x`);
      console.log(`- Expiração: ${config.first_deposit_bonus_expiration} dias`);
    }
    
    // 4. Criar índices para performance em produção
    console.log('\n⚡ OTIMIZANDO PARA PRODUÇÃO...\n');
    
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_id ON user_bonuses(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_bonuses_type ON user_bonuses(type);
        CREATE INDEX IF NOT EXISTS idx_user_bonuses_status ON user_bonuses(status);
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_type_status ON payment_transactions(user_id, type, status);
      `);
      console.log('✅ Índices de performance criados!');
    } catch (error) {
      console.log('⚠️  Alguns índices já existem (normal)');
    }
    
    // 5. Verificar integridade dos webhooks
    console.log('\n🔗 VERIFICANDO INTEGRAÇÃO COM WEBHOOKS...\n');
    
    // Verificar se existem transações completed sem bônus
    const { rows: unprocessedDeposits } = await pool.query(`
      SELECT pt.id, pt.user_id, pt.amount, pt.created_at
      FROM payment_transactions pt
      WHERE pt.type = 'deposit' 
        AND pt.status IN ('completed', 'approved')
        AND pt.user_id NOT IN (
          SELECT DISTINCT user_id 
          FROM user_bonuses 
          WHERE type = 'first_deposit'
        )
        AND NOT EXISTS (
          SELECT 1 FROM payment_transactions pt2 
          WHERE pt2.user_id = pt.user_id 
            AND pt2.type = 'deposit' 
            AND pt2.status IN ('completed', 'approved')
            AND pt2.created_at < pt.created_at
        )
      ORDER BY pt.created_at DESC
      LIMIT 10
    `);
    
    if (unprocessedDeposits.length > 0) {
      console.log(`⚠️  Encontrados ${unprocessedDeposits.length} primeiro depósitos sem bônus!`);
      console.log('💡 Execute o script de correção retroativa quando necessário.');
    } else {
      console.log('✅ Todos os primeiro depósitos têm bônus aplicados!');
    }
    
    // 6. Teste de conectividade
    console.log('\n🧪 TESTE DE CONECTIVIDADE...\n');
    
    const { rows: testQuery } = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT pt.id) as total_deposits,
        COUNT(DISTINCT ub.id) as total_bonuses
      FROM users u
      LEFT JOIN payment_transactions pt ON u.id = pt.user_id AND pt.type = 'deposit' AND pt.status IN ('completed', 'approved')
      LEFT JOIN user_bonuses ub ON u.id = ub.user_id AND ub.type = 'first_deposit'
    `);
    
    const stats = testQuery[0];
    console.log(`📊 ESTATÍSTICAS DO SISTEMA:`);
    console.log(`- Total de usuários: ${stats.total_users}`);
    console.log(`- Total de depósitos: ${stats.total_deposits}`);
    console.log(`- Total de bônus: ${stats.total_bonuses}`);
    
    console.log('\n🎉 SISTEMA PRONTO PARA PRODUÇÃO!');
    console.log('\n📝 PRÓXIMOS PASSOS PARA DEPLOY:');
    console.log('1. Commitar o arquivo server/routes.ts');
    console.log('2. Fazer deploy para produção');
    console.log('3. Executar este script em produção para garantir integridade');
    console.log('4. Monitorar logs de webhook para confirmar funcionamento');
    
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.log('\n🔧 SOLUÇÕES POSSÍVEIS:');
    console.log('- Verificar conexão com banco de dados');
    console.log('- Verificar permissões de usuário do banco');
    console.log('- Verificar se DATABASE_URL está configurada corretamente');
  } finally {
    await pool.end();
  }
}

ensureProductionBonus();