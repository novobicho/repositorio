// Script para FORÇAR ativação dos bônus em produção
// Execute: node force-enable-bonus.mjs

import pg from 'pg';
const { Pool } = pg;

async function forceEnableBonus() {
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL || DATABASE_URL === 'sua_url_do_banco_aqui') {
    console.error('❌ Configure a DATABASE_URL primeiro');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🚀 FORÇANDO ATIVAÇÃO DOS BÔNUS...\n');

    // 1. Mostrar valores atuais
    console.log('📊 Valores ANTES da alteração:');
    const beforeSettings = await pool.query(`
      SELECT 
        signup_bonus_enabled,
        signup_bonus_amount,
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount
      FROM system_settings 
      LIMIT 1
    `);
    
    if (beforeSettings.rows.length > 0) {
      const settings = beforeSettings.rows[0];
      console.log(`  - Bônus cadastro: ${settings.signup_bonus_enabled ? 'ATIVADO' : 'DESATIVADO'}`);
      console.log(`  - Valor cadastro: R$ ${settings.signup_bonus_amount}`);
      console.log(`  - Bônus depósito: ${settings.first_deposit_bonus_enabled ? 'ATIVADO' : 'DESATIVADO'}`);
      console.log(`  - Percentual depósito: ${settings.first_deposit_bonus_percentage}%`);
      console.log(`  - Valor máximo: R$ ${settings.first_deposit_bonus_max_amount}`);
    }

    // 2. FORÇAR ativação dos bônus
    console.log('\n⚡ ATIVANDO BÔNUS FORÇADAMENTE...');
    await pool.query(`
      UPDATE system_settings 
      SET 
        signup_bonus_enabled = true,
        signup_bonus_amount = 10.00,
        signup_bonus_rollover = 3.00,
        signup_bonus_expiration = 7,
        first_deposit_bonus_enabled = true,
        first_deposit_bonus_amount = 100.00,
        first_deposit_bonus_percentage = 100.00,
        first_deposit_bonus_max_amount = 200.00,
        first_deposit_bonus_rollover = 3.00,
        first_deposit_bonus_expiration = 7,
        allow_bonus_bets = true
      WHERE id = (SELECT id FROM system_settings LIMIT 1)
    `);

    // 3. Verificar se a alteração funcionou
    console.log('✅ Verificando valores APÓS a alteração:');
    const afterSettings = await pool.query(`
      SELECT 
        signup_bonus_enabled,
        signup_bonus_amount,
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount,
        allow_bonus_bets
      FROM system_settings 
      LIMIT 1
    `);
    
    if (afterSettings.rows.length > 0) {
      const settings = afterSettings.rows[0];
      console.log(`  - Bônus cadastro: ${settings.signup_bonus_enabled ? '✅ ATIVADO' : '❌ DESATIVADO'}`);
      console.log(`  - Valor cadastro: R$ ${settings.signup_bonus_amount}`);
      console.log(`  - Bônus depósito: ${settings.first_deposit_bonus_enabled ? '✅ ATIVADO' : '❌ DESATIVADO'}`);
      console.log(`  - Percentual depósito: ${settings.first_deposit_bonus_percentage}%`);
      console.log(`  - Valor máximo: R$ ${settings.first_deposit_bonus_max_amount}`);
      console.log(`  - Permitir apostas com bônus: ${settings.allow_bonus_bets ? '✅ SIM' : '❌ NÃO'}`);
    }

    // 4. Mostrar JSON que a API vai retornar
    console.log('\n🌐 A API agora retornará:');
    const apiResponse = await pool.query(`
      SELECT 
        max_bet_amount,
        max_payout,
        signup_bonus_enabled,
        signup_bonus_amount,
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount,
        allow_bonus_bets
      FROM system_settings 
      LIMIT 1
    `);
    
    if (apiResponse.rows.length > 0) {
      console.log(JSON.stringify(apiResponse.rows[0], null, 2));
    }

    console.log('\n🎉 BÔNUS ATIVADOS COM SUCESSO!');
    console.log('🔄 Agora reinicie o servidor da aplicação');
    console.log('✅ Teste o painel admin - os bônus devem aparecer como ATIVADOS');

  } catch (error) {
    console.error('❌ Erro ao ativar bônus:', error);
    console.error('📝 Detalhes:', error.message);
  } finally {
    await pool.end();
  }
}

forceEnableBonus();