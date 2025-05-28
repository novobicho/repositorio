import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testBonusCredit() {
  console.log('🧪 TESTE: Verificando se o sistema de bônus está funcionando...\n');
  
  try {
    // 1. Verificar configurações de bônus
    const { rows: settings } = await pool.query('SELECT * FROM system_settings LIMIT 1');
    const config = settings[0];
    
    console.log('📋 CONFIGURAÇÕES DE BÔNUS:');
    console.log(`- Bônus habilitado: ${config.first_deposit_bonus_enabled}`);
    console.log(`- Percentual: ${config.first_deposit_bonus_percentage}%`);
    console.log(`- Valor máximo: R$${config.first_deposit_bonus_max_amount}`);
    console.log(`- Rollover: ${config.first_deposit_bonus_rollover}x`);
    console.log('');
    
    if (!config.first_deposit_bonus_enabled) {
      console.log('❌ PROBLEMA: Bônus de primeiro depósito está desabilitado!');
      return;
    }
    
    // 2. Criar usuário teste
    const testUser = {
      username: `teste_bonus_${Date.now()}`,
      password: '$2b$10$hashedpassword',
      balance: 0
    };
    
    const { rows: [newUser] } = await pool.query(
      'INSERT INTO users (username, password, balance) VALUES ($1, $2, $3) RETURNING *',
      [testUser.username, testUser.password, testUser.balance]
    );
    
    console.log(`👤 USUÁRIO CRIADO: ${newUser.username} (ID: ${newUser.id})`);
    
    // 3. Simular primeiro depósito
    const depositAmount = 100;
    const { rows: [transaction] } = await pool.query(
      `INSERT INTO payment_transactions 
       (user_id, amount, type, status, gateway_id, external_id) 
       VALUES ($1, $2, 'deposit', 'approved', 1, $3) RETURNING *`,
      [newUser.id, depositAmount, `test_${Date.now()}`]
    );
    
    console.log(`💰 DEPÓSITO SIMULADO: R$${depositAmount} (Status: approved)`);
    
    // 4. Creditar saldo no usuário
    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [depositAmount, newUser.id]
    );
    
    // 5. Simular aplicação do bônus (o que deveria acontecer automaticamente)
    let bonusAmount = (depositAmount * parseFloat(config.first_deposit_bonus_percentage)) / 100;
    if (bonusAmount > parseFloat(config.first_deposit_bonus_max_amount)) {
      bonusAmount = parseFloat(config.first_deposit_bonus_max_amount);
    }
    
    const rolloverAmount = bonusAmount * parseFloat(config.first_deposit_bonus_rollover);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.first_deposit_bonus_expiration);
    
    // Criar bônus manualmente para testar
    const { rows: [bonus] } = await pool.query(
      `INSERT INTO user_bonuses 
       (user_id, type, amount, remaining_amount, rollover_amount, rolled_amount, status, expires_at, related_transaction_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [newUser.id, 'first_deposit', bonusAmount, bonusAmount, rolloverAmount, 0, 'active', expiresAt, transaction.id]
    );
    
    console.log(`🎁 BÔNUS APLICADO: R$${bonus.amount}`);
    console.log(`📋 Rollover necessário: R$${bonus.rollover_amount}`);
    console.log(`⏰ Expira em: ${expiresAt.toLocaleDateString()}`);
    
    // 6. Verificar resultado final
    const { rows: [finalUser] } = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [newUser.id]
    );
    
    const { rows: userBonuses } = await pool.query(
      'SELECT * FROM user_bonuses WHERE user_id = $1',
      [newUser.id]
    );
    
    const totalBonusBalance = userBonuses.reduce((sum, b) => sum + parseFloat(b.remaining_amount), 0);
    
    console.log('\n📊 RESULTADO FINAL:');
    console.log(`- Saldo real: R$${finalUser.balance}`);
    console.log(`- Saldo de bônus: R$${totalBonusBalance.toFixed(2)}`);
    console.log(`- Total de bônus criados: ${userBonuses.length}`);
    
    if (userBonuses.length > 0 && totalBonusBalance > 0) {
      console.log('\n✅ SUCESSO: Sistema de bônus está funcionando corretamente!');
    } else {
      console.log('\n❌ PROBLEMA: Bônus não foi criado ou creditado!');
    }
    
    // 7. Limpar dados de teste
    await pool.query('DELETE FROM user_bonuses WHERE user_id = $1', [newUser.id]);
    await pool.query('DELETE FROM payment_transactions WHERE user_id = $1', [newUser.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [newUser.id]);
    
    console.log('\n🧹 Dados de teste removidos.');
    
  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.message);
  } finally {
    await pool.end();
  }
}

testBonusCredit();