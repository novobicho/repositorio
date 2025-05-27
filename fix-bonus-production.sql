-- Script para corrigir sistema de bônus em produção
-- Execute este script no banco de dados de produção

-- 1. Adicionar colunas de bônus se não existirem
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
ADD COLUMN IF NOT EXISTS signup_bonus_banner_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS first_deposit_bonus_banner_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_bonus_bets BOOLEAN NOT NULL DEFAULT false;

-- 2. Verificar se existe registro na tabela system_settings
INSERT INTO system_settings (
  max_bet_amount, 
  max_payout, 
  main_color, 
  secondary_color, 
  accent_color,
  allow_user_registration,
  allow_deposits,
  allow_withdrawals,
  maintenance_mode,
  min_bet_amount,
  default_bet_amount,
  auto_approve_withdrawals,
  auto_approve_withdrawal_limit,
  site_name,
  site_description,
  logo_url,
  favicon_url,
  signup_bonus_enabled,
  signup_bonus_amount,
  signup_bonus_rollover,
  signup_bonus_expiration,
  first_deposit_bonus_enabled,
  first_deposit_bonus_amount,
  first_deposit_bonus_percentage,
  first_deposit_bonus_max_amount,
  first_deposit_bonus_rollover,
  first_deposit_bonus_expiration,
  promotional_banners_enabled,
  allow_bonus_bets
) 
SELECT 
  50, 500, '#4f46e5', '#6366f1', '#f97316',
  true, true, true, false,
  0.5, 2, false, 30,
  'Jogo do Bicho', 'A melhor plataforma de apostas online',
  '/img/logo.png', '/img/favicon.png',
  true, 10, 3, 7,
  true, 100, 100, 200, 3, 7,
  false, false
WHERE NOT EXISTS (SELECT 1 FROM system_settings LIMIT 1);

-- 3. Atualizar valores padrão para bônus (caso já existam registros)
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
WHERE id = (SELECT id FROM system_settings LIMIT 1);

-- 4. Verificar se a tabela user_bonuses existe, se não criar
CREATE TABLE IF NOT EXISTS user_bonuses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bonus_type VARCHAR(50) NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  rollover_requirement NUMERIC(15,2) NOT NULL DEFAULT 0,
  rollover_progress NUMERIC(15,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_id ON user_bonuses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_status ON user_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_type ON user_bonuses(bonus_type);

-- 6. Mostrar estrutura final
SELECT 
  'Colunas da tabela system_settings:' as info,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'system_settings' 
  AND column_name LIKE '%bonus%'
ORDER BY ordinal_position;

-- 7. Mostrar configurações atuais
SELECT 
  'Configurações atuais de bônus:' as info,
  signup_bonus_enabled,
  signup_bonus_amount,
  first_deposit_bonus_enabled,
  first_deposit_bonus_percentage,
  first_deposit_bonus_max_amount
FROM system_settings 
LIMIT 1;