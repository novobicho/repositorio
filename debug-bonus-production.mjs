// Script para diagnosticar problema dos bônus em produção
// Execute: node debug-bonus-production.mjs

import pg from 'pg';
const { Pool } = pg;

async function debugBonusSystem() {
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
    console.log('🔍 DIAGNÓSTICO DO SISTEMA DE BÔNUS\n');

    // 1. Verificar estrutura da tabela system_settings
    console.log('📋 Verificando estrutura da tabela system_settings...');
    const columns = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'system_settings' 
      ORDER BY ordinal_position
    `);
    
    console.log('Colunas encontradas:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (default: ${col.column_default})`);
    });

    // 2. Verificar se existem registros na tabela
    console.log('\n📊 Verificando registros na system_settings...');
    const settingsCount = await pool.query('SELECT COUNT(*) as count FROM system_settings');
    console.log(`Total de registros: ${settingsCount.rows[0].count}`);

    if (settingsCount.rows[0].count === '0') {
      console.log('⚠️  PROBLEMA: Nenhum registro encontrado na system_settings!');
      return;
    }

    // 3. Verificar valores atuais dos bônus
    console.log('\n🎯 Verificando configurações atuais de bônus...');
    const bonusSettings = await pool.query(`
      SELECT 
        id,
        signup_bonus_enabled,
        signup_bonus_amount,
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount,
        allow_bonus_bets
      FROM system_settings 
      LIMIT 1
    `);

    if (bonusSettings.rows.length > 0) {
      const settings = bonusSettings.rows[0];
      console.log('Configurações encontradas:');
      console.log(`  - ID do registro: ${settings.id}`);
      console.log(`  - Bônus cadastro: ${settings.signup_bonus_enabled ? 'ATIVADO' : 'DESATIVADO'}`);
      console.log(`  - Valor cadastro: R$ ${settings.signup_bonus_amount}`);
      console.log(`  - Bônus depósito: ${settings.first_deposit_bonus_enabled ? 'ATIVADO' : 'DESATIVADO'}`);
      console.log(`  - Percentual depósito: ${settings.first_deposit_bonus_percentage}%`);
      console.log(`  - Valor máximo: R$ ${settings.first_deposit_bonus_max_amount}`);
      console.log(`  - Permitir apostas com bônus: ${settings.allow_bonus_bets ? 'SIM' : 'NÃO'}`);
    }

    // 4. Testar API endpoint
    console.log('\n🌐 Verificando se os valores estão sendo retornados pela API...');
    try {
      // Simular uma requisição GET para /api/settings
      const apiSettings = await pool.query(`
        SELECT 
          max_bet_amount,
          max_payout,
          signup_bonus_enabled,
          signup_bonus_amount,
          first_deposit_bonus_enabled,
          first_deposit_bonus_percentage,
          first_deposit_bonus_max_amount
        FROM system_settings 
        LIMIT 1
      `);

      if (apiSettings.rows.length > 0) {
        console.log('✅ API retornaria:');
        console.log(JSON.stringify(apiSettings.rows[0], null, 2));
      }
    } catch (error) {
      console.log('❌ Erro ao simular API:', error.message);
    }

    // 5. Verificar tabela user_bonuses
    console.log('\n🏗️ Verificando tabela user_bonuses...');
    const userBonusesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_bonuses'
      )
    `);
    
    if (userBonusesExists.rows[0].exists) {
      const bonusCount = await pool.query('SELECT COUNT(*) as count FROM user_bonuses');
      console.log(`✅ Tabela user_bonuses existe com ${bonusCount.rows[0].count} registros`);
    } else {
      console.log('❌ Tabela user_bonuses NÃO existe');
    }

    // 6. Verificar possíveis problemas de cache
    console.log('\n🔄 Verificando timestamp da última atualização...');
    const lastUpdate = await pool.query(`
      SELECT 
        EXTRACT(EPOCH FROM NOW()) as current_time,
        'Configurações carregadas em: ' || NOW() as timestamp
    `);
    console.log(lastUpdate.rows[0].timestamp);

    // 7. Sugestões de solução
    console.log('\n💡 POSSÍVEIS SOLUÇÕES:');
    console.log('1. Reinicie o servidor da aplicação');
    console.log('2. Verifique se há cache em Redis/Memcached');
    console.log('3. Verifique se a aplicação está conectada no banco correto');
    console.log('4. Teste fazer uma requisição POST para /api/settings para forçar atualização');

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
    console.error('📝 Detalhes:', error.message);
  } finally {
    await pool.end();
  }
}

debugBonusSystem();