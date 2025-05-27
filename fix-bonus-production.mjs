// Script para corrigir sistema de bônus em produção
// Execute: node fix-bonus-production.mjs

import pg from 'pg';
const { Pool } = pg;

async function fixBonusSystem() {
  // Configure sua string de conexão do banco de produção aqui
  const DATABASE_URL = process.env.DATABASE_URL || 'sua_url_do_banco_aqui';
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Iniciando correção do sistema de bônus...');

    // 1. Adicionar colunas de bônus se não existirem
    console.log('📋 Adicionando colunas de bônus...');
    await pool.query(`
      ALTER TABLE system_settings 
      ADD COLUMN IF NOT EXISTS signup_bonus_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS signup_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS signup_bonus_rollover NUMERIC(15,2) NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS signup_bonus_expiration INTEGER NOT NULL DEFAULT 7,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_percentage NUMERIC(15,2) NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_max_amount NUMERIC(15,2) NOT NULL DEFAULT 200,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_rollover NUMERIC(15,2) NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS first_deposit_bonus_expiration INTEGER NOT NULL DEFAULT 7,
      ADD COLUMN IF NOT EXISTS promotional_banners_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS allow_bonus_bets BOOLEAN NOT NULL DEFAULT false
    `);

    // 2. Verificar se existe registro na tabela system_settings
    console.log('🔍 Verificando registros existentes...');
    const existingSettings = await pool.query('SELECT COUNT(*) as count FROM system_settings');
    
    if (existingSettings.rows[0].count === '0') {
      console.log('➕ Criando registro inicial...');
      await pool.query(`
        INSERT INTO system_settings (
          max_bet_amount, max_payout, main_color, secondary_color, accent_color,
          allow_user_registration, allow_deposits, allow_withdrawals, maintenance_mode,
          min_bet_amount, default_bet_amount, auto_approve_withdrawals, auto_approve_withdrawal_limit,
          site_name, site_description, logo_url, favicon_url,
          signup_bonus_enabled, signup_bonus_amount, signup_bonus_rollover, signup_bonus_expiration,
          first_deposit_bonus_enabled, first_deposit_bonus_amount, first_deposit_bonus_percentage,
          first_deposit_bonus_max_amount, first_deposit_bonus_rollover, first_deposit_bonus_expiration,
          promotional_banners_enabled, allow_bonus_bets
        ) VALUES (
          50, 500, '#4f46e5', '#6366f1', '#f97316',
          true, true, true, false,
          0.5, 2, false, 30,
          'Jogo do Bicho', 'A melhor plataforma de apostas online',
          '/img/logo.png', '/img/favicon.png',
          true, 10, 3, 7,
          true, 100, 100, 200, 3, 7,
          false, false
        )
      `);
    } else {
      console.log('🔄 Atualizando registro existente...');
      await pool.query(`
        UPDATE system_settings SET 
          signup_bonus_enabled = COALESCE(signup_bonus_enabled, true),
          signup_bonus_amount = COALESCE(signup_bonus_amount, 10),
          signup_bonus_rollover = COALESCE(signup_bonus_rollover, 3),
          signup_bonus_expiration = COALESCE(signup_bonus_expiration, 7),
          first_deposit_bonus_enabled = COALESCE(first_deposit_bonus_enabled, true),
          first_deposit_bonus_amount = COALESCE(first_deposit_bonus_amount, 100),
          first_deposit_bonus_percentage = COALESCE(first_deposit_bonus_percentage, 100),
          first_deposit_bonus_max_amount = COALESCE(first_deposit_bonus_max_amount, 200),
          first_deposit_bonus_rollover = COALESCE(first_deposit_bonus_rollover, 3),
          first_deposit_bonus_expiration = COALESCE(first_deposit_bonus_expiration, 7),
          promotional_banners_enabled = COALESCE(promotional_banners_enabled, false),
          allow_bonus_bets = COALESCE(allow_bonus_bets, false)
        WHERE id = (SELECT id FROM system_settings LIMIT 1)
      `);
    }

    // 3. Verificar se a tabela user_bonuses existe e criar se necessário
    console.log('🏗️ Verificando tabela user_bonuses...');
    
    // Primeiro verificar se a tabela existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_bonuses'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('➕ Criando tabela user_bonuses...');
      await pool.query(`
        CREATE TABLE user_bonuses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          amount NUMERIC(15,2) NOT NULL,
          rollover_requirement NUMERIC(15,2) NOT NULL DEFAULT 0,
          rollover_progress NUMERIC(15,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          expires_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      console.log('✅ Tabela user_bonuses já existe');
    }

    // 4. Criar índices se a tabela existe
    if (tableExists.rows[0].exists || !tableExists.rows[0].exists) {
      console.log('📊 Criando índices...');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_id ON user_bonuses(user_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_user_bonuses_status ON user_bonuses(status)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_user_bonuses_type ON user_bonuses(type)');
    }

    // 5. Verificar configurações finais
    console.log('✅ Verificando configurações finais...');
    const finalSettings = await pool.query(`
      SELECT 
        signup_bonus_enabled,
        signup_bonus_amount,
        first_deposit_bonus_enabled,
        first_deposit_bonus_percentage,
        first_deposit_bonus_max_amount
      FROM system_settings 
      LIMIT 1
    `);

    if (finalSettings.rows.length > 0) {
      console.log('🎯 Configurações atuais de bônus:');
      console.log('  - Bônus de cadastro:', finalSettings.rows[0].signup_bonus_enabled ? 'ATIVADO' : 'DESATIVADO');
      console.log('  - Valor do cadastro: R$', finalSettings.rows[0].signup_bonus_amount);
      console.log('  - Bônus primeiro depósito:', finalSettings.rows[0].first_deposit_bonus_enabled ? 'ATIVADO' : 'DESATIVADO');
      console.log('  - Percentual depósito:', finalSettings.rows[0].first_deposit_bonus_percentage + '%');
      console.log('  - Valor máximo: R$', finalSettings.rows[0].first_deposit_bonus_max_amount);
    }

    console.log('✅ Sistema de bônus corrigido com sucesso!');
    console.log('🚀 Agora você pode usar o painel admin para modificar as configurações.');

  } catch (error) {
    console.error('❌ Erro ao corrigir sistema de bônus:', error);
    console.error('📝 Detalhes:', error.message);
    
    // Mostrar mais detalhes do erro se for erro de conexão
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('🔗 Erro de conexão: Verifique se a DATABASE_URL está correta');
      console.error('💡 Exemplo: postgres://usuario:senha@host:5432/database');
    }
  } finally {
    await pool.end();
  }
}

// Verificar se DATABASE_URL foi fornecida
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === 'sua_url_do_banco_aqui') {
  console.error('❌ Erro: Configure a variável DATABASE_URL');
  console.error('💡 Exemplo: export DATABASE_URL="postgres://usuario:senha@host:5432/database"');
  console.error('💡 Ou execute: DATABASE_URL="sua_url" node fix-bonus-production.mjs');
  process.exit(1);
}

// Executar script
fixBonusSystem();
