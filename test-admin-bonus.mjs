// Script para testar e corrigir bônus no admin
// Execute: node test-admin-bonus.mjs

import pg from 'pg';
const { Pool } = pg;

async function testAdminBonus() {
  const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false
  });

  try {
    console.log('🔧 TESTANDO ENDPOINT /api/admin/settings...\n');

    // 1. Verificar dados diretos do banco
    const { rows } = await pool.query('SELECT * FROM system_settings LIMIT 1');
    
    if (rows.length > 0) {
      const dbSettings = rows[0];
      
      console.log('📋 DADOS DIRETOS DO BANCO:');
      console.log('signup_bonus_enabled:', dbSettings.signup_bonus_enabled);
      console.log('first_deposit_bonus_enabled:', dbSettings.first_deposit_bonus_enabled);
      console.log('signup_bonus_amount:', dbSettings.signup_bonus_amount);
      console.log('first_deposit_bonus_percentage:', dbSettings.first_deposit_bonus_percentage);
      
      // 2. Simular resposta que o admin deveria receber
      const adminResponse = {
        signupBonusEnabled: Boolean(dbSettings.signup_bonus_enabled),
        signupBonusAmount: Number(dbSettings.signup_bonus_amount || 10),
        firstDepositBonusEnabled: Boolean(dbSettings.first_deposit_bonus_enabled),
        firstDepositBonusPercentage: Number(dbSettings.first_deposit_bonus_percentage || 100),
        firstDepositBonusMaxAmount: Number(dbSettings.first_deposit_bonus_max_amount || 200)
      };
      
      console.log('\n🎯 RESPOSTA QUE O ADMIN DEVERIA VER:');
      console.log(JSON.stringify(adminResponse, null, 2));
      
      // 3. Verificar se há inconsistências
      if (dbSettings.signup_bonus_enabled === true && dbSettings.first_deposit_bonus_enabled === true) {
        console.log('\n✅ BÔNUS ESTÃO ATIVADOS NO BANCO!');
        console.log('💡 Se não aparecem no painel, é problema de cache do frontend');
      } else {
        console.log('\n❌ BÔNUS DESATIVADOS NO BANCO');
        console.log('🔄 Ativando agora...');
        
        await pool.query(`
          UPDATE system_settings 
          SET 
            signup_bonus_enabled = true,
            first_deposit_bonus_enabled = true
          WHERE id = 1
        `);
        
        console.log('✅ BÔNUS ATIVADOS!');
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

testAdminBonus();