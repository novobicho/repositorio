#!/usr/bin/env node

/**
 * CORREÇÃO FINAL DO SISTEMA DE BÔNUS - PRODUÇÃO
 * 
 * Execute este script no servidor de produção para:
 * 1. Verificar configurações de bônus
 * 2. Aplicar bônus retroativos para usuários que fizeram primeiro depósito
 * 3. Corrigir qualquer problema de configuração
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function fixBonusSystemProduction() {
  console.log('🚀 INICIANDO CORREÇÃO FINAL DO SISTEMA DE BÔNUS DE PRODUÇÃO');
  
  try {
    // 1. VERIFICAR CONFIGURAÇÕES ATUAIS
    console.log('\n📋 1. VERIFICANDO CONFIGURAÇÕES ATUAIS...');
    const settings = await sql`
      SELECT 
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount,
        first_deposit_bonus_rollover
      FROM system_settings 
      LIMIT 1
    `;
    
    if (settings.length === 0) {
      console.log('❌ Nenhuma configuração encontrada. Criando configurações padrão...');
      await sql`
        INSERT INTO system_settings (
          first_deposit_bonus_enabled,
          first_deposit_bonus_percentage,
          first_deposit_bonus_max_amount,
          first_deposit_bonus_rollover,
          allow_bonus_bets
        ) VALUES (true, 100, 250, 3, true)
      `;
      console.log('✅ Configurações padrão criadas!');
    } else {
      const config = settings[0];
      console.log('✅ Configurações encontradas:');
      console.log(`   • Bônus ativado: ${config.first_deposit_bonus_enabled}`);
      console.log(`   • Porcentagem: ${config.first_deposit_bonus_percentage}%`);
      console.log(`   • Valor máximo: R$ ${config.first_deposit_bonus_max_amount}`);
      console.log(`   • Rollover: ${config.first_deposit_bonus_rollover}x`);
      
      // Garantir que está ativado
      if (!config.first_deposit_bonus_enabled) {
        console.log('🔧 Ativando bônus de primeiro depósito...');
        await sql`
          UPDATE system_settings 
          SET first_deposit_bonus_enabled = true
        `;
        console.log('✅ Bônus ativado!');
      }
    }
    
    // 2. BUSCAR USUÁRIOS QUE FIZERAM PRIMEIRO DEPÓSITO SEM BÔNUS
    console.log('\n🔍 2. BUSCANDO USUÁRIOS QUE FIZERAM PRIMEIRO DEPÓSITO SEM BÔNUS...');
    
    const usersWithoutBonus = await sql`
      WITH first_deposits AS (
        SELECT 
          pt.user_id,
          pt.amount as deposit_amount,
          pt.created_at,
          ROW_NUMBER() OVER (PARTITION BY pt.user_id ORDER BY pt.created_at) as deposit_rank
        FROM payment_transactions pt
        WHERE pt.type = 'deposit' 
        AND pt.status IN ('completed', 'approved', 'paid')
      ),
      users_with_first_deposit AS (
        SELECT 
          fd.user_id,
          fd.deposit_amount,
          fd.created_at,
          u.username
        FROM first_deposits fd
        JOIN users u ON fd.user_id = u.id
        WHERE fd.deposit_rank = 1
      ),
      users_with_bonus AS (
        SELECT DISTINCT ub.user_id
        FROM user_bonuses ub
        WHERE ub.type = 'first_deposit'
      )
      SELECT 
        uwfd.user_id,
        uwfd.username,
        uwfd.deposit_amount,
        uwfd.created_at
      FROM users_with_first_deposit uwfd
      LEFT JOIN users_with_bonus uwb ON uwfd.user_id = uwb.user_id
      WHERE uwb.user_id IS NULL
      ORDER BY uwfd.created_at DESC
    `;
    
    console.log(`📊 Encontrados ${usersWithoutBonus.length} usuários sem bônus de primeiro depósito`);
    
    if (usersWithoutBonus.length === 0) {
      console.log('✅ Todos os usuários já têm seus bônus aplicados!');
      return;
    }
    
    // 3. APLICAR BÔNUS RETROATIVO
    console.log('\n💰 3. APLICANDO BÔNUS RETROATIVO...');
    
    let appliedCount = 0;
    const bonusPercentage = 100; // 100%
    const maxBonusAmount = 250; // R$ 250
    const rollover = 3; // 3x
    
    for (const user of usersWithoutBonus) {
      try {
        // Calcular bônus
        const bonusAmount = Math.min(
          (user.deposit_amount * bonusPercentage) / 100,
          maxBonusAmount
        );
        
        if (bonusAmount > 0) {
          // Criar bônus
          const bonusResult = await sql`
            INSERT INTO user_bonuses (
              user_id,
              type,
              amount,
              remaining_amount,
              rollover_requirement,
              rollover_progress,
              status,
              expires_at,
              created_at
            ) VALUES (
              ${user.user_id},
              'first_deposit',
              ${bonusAmount},
              ${bonusAmount},
              ${bonusAmount * rollover},
              0,
              'active',
              NOW() + INTERVAL '30 days',
              NOW()
            )
            RETURNING id
          `;
          
          console.log(`✅ Bônus aplicado para ${user.username}: R$ ${bonusAmount.toFixed(2)}`);
          appliedCount++;
        }
      } catch (error) {
        console.error(`❌ Erro ao aplicar bônus para ${user.username}:`, error.message);
      }
    }
    
    console.log(`\n🎉 CORREÇÃO CONCLUÍDA!`);
    console.log(`📊 Total de bônus aplicados: ${appliedCount}`);
    
    // 4. VERIFICAÇÃO FINAL
    console.log('\n🔍 4. VERIFICAÇÃO FINAL...');
    const finalCheck = await sql`
      SELECT 
        COUNT(DISTINCT ub.user_id) as users_with_bonus,
        SUM(ub.remaining_amount) as total_bonus_available
      FROM user_bonuses ub
      WHERE ub.type = 'first_deposit' 
      AND ub.status = 'active'
    `;
    
    console.log(`✅ Total de usuários com bônus ativo: ${finalCheck[0].users_with_bonus}`);
    console.log(`💰 Total de bônus disponível: R$ ${finalCheck[0].total_bonus_available || 0}`);
    
  } catch (error) {
    console.error('❌ ERRO:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  fixBonusSystemProduction();
}

export default fixBonusSystemProduction;