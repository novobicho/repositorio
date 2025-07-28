#!/usr/bin/env tsx

/**
 * Script para inicializar o banco de dados em produção
 * Este script cria todas as tabelas necessárias e dados iniciais
 * 
 * Uso:
 * npm run init-db-production
 * 
 * Ou diretamente:
 * NODE_ENV=production DATABASE_URL=sua_url tsx init-production-db.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema';
import { eq, sql } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Hash da senha para o admin
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

async function initProductionDatabase() {
  console.log('======== INICIALIZAÇÃO DO BANCO DE PRODUÇÃO ========');
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não encontrada nas variáveis de ambiente');
  }

  console.log('🔌 Conectando ao banco de produção...');
  
  // Configuração para produção com SSL
  const client = postgres(databaseUrl, {
    ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  try {
    console.log('📋 Verificando e criando tabelas...');

    // Executar CREATE TABLE IF NOT EXISTS para todas as tabelas
    await db.execute(sql`
      -- Tabela de usuários
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        balance REAL DEFAULT 0,
        bonus_balance REAL DEFAULT 0,
        cpf VARCHAR(14) UNIQUE,
        phone VARCHAR(20),
        "isAdmin" BOOLEAN DEFAULT FALSE,
        blocked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        allow_bonus_bets BOOLEAN DEFAULT TRUE,
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        default_pix_key VARCHAR(255),
        default_pix_key_type VARCHAR(50) DEFAULT 'cpf'
      );

      -- Tabela de animais
      CREATE TABLE IF NOT EXISTS animals (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        numbers INTEGER[] NOT NULL,
        icon VARCHAR(255),
        color VARCHAR(7) DEFAULT '#000000'
      );

      -- Tabela de modalidades de jogo
      CREATE TABLE IF NOT EXISTS game_modes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        quota REAL NOT NULL,
        description TEXT
      );

      -- Tabela de sorteios
      CREATE TABLE IF NOT EXISTS draws (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP NOT NULL,
        time VARCHAR(10) NOT NULL,
        result INTEGER,
        animal_id INTEGER REFERENCES animals(id),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Tabela de apostas
      CREATE TABLE IF NOT EXISTS bets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        draw_id INTEGER REFERENCES draws(id) NOT NULL,
        game_mode_id INTEGER REFERENCES game_modes(id) NOT NULL,
        animal_id INTEGER REFERENCES animals(id),
        numbers INTEGER[],
        amount REAL NOT NULL,
        potential_win REAL NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        used_bonus_balance BOOLEAN DEFAULT FALSE
      );

      -- Tabela de transações de pagamento
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        amount REAL NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        gateway_transaction_id VARCHAR(255),
        gateway_type VARCHAR(50),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Tabela de configurações do sistema
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        maintenance_mode BOOLEAN DEFAULT FALSE,
        site_name VARCHAR(255) DEFAULT 'Jogo do Bicho',
        site_description TEXT,
        logo_url VARCHAR(255),
        primary_color VARCHAR(7) DEFAULT '#059669',
        secondary_color VARCHAR(7) DEFAULT '#10b981',
        accent_color VARCHAR(7) DEFAULT '#f59e0b',
        min_bet_amount REAL DEFAULT 1,
        max_bet_amount REAL DEFAULT 1000,
        min_withdrawal_amount REAL DEFAULT 10,
        max_withdrawal_amount REAL DEFAULT 5000,
        signup_bonus_enabled BOOLEAN DEFAULT TRUE,
        signup_bonus_amount REAL DEFAULT 10,
        first_deposit_bonus_enabled BOOLEAN DEFAULT TRUE,
        first_deposit_bonus_percentage REAL DEFAULT 50,
        first_deposit_bonus_max REAL DEFAULT 100,
        withdrawal_fee_percentage REAL DEFAULT 0,
        withdrawal_fee_fixed REAL DEFAULT 0
      );

      -- Tabela de bônus de usuários
      CREATE TABLE IF NOT EXISTS user_bonuses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        type VARCHAR(50) NOT NULL,
        amount REAL NOT NULL,
        rollover_requirement REAL DEFAULT 0,
        rollover_completed REAL DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
      CREATE INDEX IF NOT EXISTS idx_bets_draw_id ON bets(draw_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_bonuses_user_id ON user_bonuses(user_id);
    `);

    console.log('✅ Tabelas criadas com sucesso');

    // Verificar se já existem dados básicos
    console.log('🔍 Verificando dados básicos...');

    // 1. Animais
    const existingAnimals = await db.select().from(schema.animals).limit(1);
    if (existingAnimals.length === 0) {
      console.log('📝 Inserindo dados dos animais...');
      const animalsData = [
        { name: 'Avestruz', numbers: [1, 2, 3, 4], icon: '🦢', color: '#e11d48' },
        { name: 'Águia', numbers: [5, 6, 7, 8], icon: '🦅', color: '#dc2626' },
        { name: 'Burro', numbers: [9, 10, 11, 12], icon: '🫏', color: '#ea580c' },
        { name: 'Borboleta', numbers: [13, 14, 15, 16], icon: '🦋', color: '#d97706' },
        { name: 'Cachorro', numbers: [17, 18, 19, 20], icon: '🐕', color: '#ca8a04' },
        { name: 'Cabra', numbers: [21, 22, 23, 24], icon: '🐐', color: '#a3a3a3' },
        { name: 'Carneiro', numbers: [25, 26, 27, 28], icon: '🐑', color: '#84cc16' },
        { name: 'Camelo', numbers: [29, 30, 31, 32], icon: '🐪', color: '#65a30d' },
        { name: 'Cobra', numbers: [33, 34, 35, 36], icon: '🐍', color: '#16a34a' },
        { name: 'Coelho', numbers: [37, 38, 39, 40], icon: '🐰', color: '#059669' },
        { name: 'Cavalo', numbers: [41, 42, 43, 44], icon: '🐴', color: '#0891b2' },
        { name: 'Elefante', numbers: [45, 46, 47, 48], icon: '🐘', color: '#0284c7' },
        { name: 'Galo', numbers: [49, 50, 51, 52], icon: '🐓', color: '#2563eb' },
        { name: 'Gato', numbers: [53, 54, 55, 56], icon: '🐱', color: '#4f46e5' },
        { name: 'Jacaré', numbers: [57, 58, 59, 60], icon: '🐊', color: '#7c3aed' },
        { name: 'Leão', numbers: [61, 62, 63, 64], icon: '🦁', color: '#9333ea' },
        { name: 'Macaco', numbers: [65, 66, 67, 68], icon: '🐵', color: '#a855f7' },
        { name: 'Porco', numbers: [69, 70, 71, 72], icon: '🐷', color: '#c084fc' },
        { name: 'Pavão', numbers: [73, 74, 75, 76], icon: '🦚', color: '#e879f9' },
        { name: 'Peru', numbers: [77, 78, 79, 80], icon: '🦃', color: '#f472b6' },
        { name: 'Touro', numbers: [81, 82, 83, 84], icon: '🐂', color: '#fb7185' },
        { name: 'Tigre', numbers: [85, 86, 87, 88], icon: '🐅', color: '#f87171' },
        { name: 'Urso', numbers: [89, 90, 91, 92], icon: '🐻', color: '#fbbf24' },
        { name: 'Veado', numbers: [93, 94, 95, 96], icon: '🦌', color: '#facc15' },
        { name: 'Vaca', numbers: [97, 98, 99, 0], icon: '🐄', color: '#eab308' }
      ];

      await db.insert(schema.animals).values(animalsData);
      console.log('✅ Animais inseridos com sucesso');
    } else {
      console.log('✅ Animais já existem no banco');
    }

    // 2. Modalidades de jogo
    const existingGameModes = await db.select().from(schema.gameModes).limit(1);
    if (existingGameModes.length === 0) {
      console.log('📝 Inserindo modalidades de jogo...');
      const gameModesData = [
        { name: 'Grupo', quota: 18, description: 'Apostar no grupo do animal' },
        { name: 'Dezena', quota: 60, description: 'Apostar em uma dezena específica' },
        { name: 'Centena', quota: 600, description: 'Apostar em uma centena específica' },
        { name: 'Milhar', quota: 4000, description: 'Apostar no milhar completo' }
      ];

      await db.insert(schema.gameModes).values(gameModesData);
      console.log('✅ Modalidades de jogo inseridas com sucesso');
    } else {
      console.log('✅ Modalidades de jogo já existem no banco');
    }

    // 3. Configurações do sistema
    const existingSettings = await db.select().from(schema.systemSettings).limit(1);
    if (existingSettings.length === 0) {
      console.log('📝 Inserindo configurações do sistema...');
      await db.insert(schema.systemSettings).values({
        maintenanceMode: false,
        siteName: 'PixBet Bicho',
        siteDescription: 'O melhor site de Jogo do Bicho online',
        logoUrl: '/img/logo.png',
        primaryColor: '#059669',
        secondaryColor: '#10b981',
        accentColor: '#f59e0b',
        minBetAmount: 1,
        maxBetAmount: 1000,
        minWithdrawalAmount: 10,
        maxWithdrawalAmount: 5000,
        signupBonusEnabled: true,
        signupBonusAmount: 10,
        firstDepositBonusEnabled: true,
        firstDepositBonusPercentage: 50,
        firstDepositBonusMax: 100,
        withdrawalFeePercentage: 0,
        withdrawalFeeFixed: 0
      });
      console.log('✅ Configurações do sistema inseridas com sucesso');
    } else {
      console.log('✅ Configurações do sistema já existem no banco');
    }

    // 4. Usuário admin
    const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.username, 'admin')).limit(1);
    if (existingAdmin.length === 0) {
      console.log('👤 Criando usuário administrador...');
      const hashedPassword = await hashPassword('admin123');
      
      await db.insert(schema.users).values({
        username: 'admin',
        email: 'admin@pixbetbicho.com',
        password: hashedPassword,
        balance: 1000,
        bonusBalance: 0,
        isAdmin: true,
        blocked: false
      });
      console.log('✅ Usuário admin criado com sucesso');
      console.log('📧 Email: admin@pixbetbicho.com');
      console.log('🔑 Senha: admin123');
    } else {
      console.log('✅ Usuário admin já existe no banco');
    }

    // 5. Sorteios de exemplo
    const existingDraws = await db.select().from(schema.draws).limit(1);
    if (existingDraws.length === 0) {
      console.log('🎲 Criando sorteios de exemplo...');
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      await db.insert(schema.draws).values([
        {
          date: tomorrow,
          time: '14:00',
          result: null,
          animalId: null,
          status: 'pending'
        },
        {
          date: tomorrow,
          time: '18:00',
          result: null,
          animalId: null,
          status: 'pending'
        },
        {
          date: tomorrow,
          time: '21:00',
          result: null,
          animalId: null,
          status: 'pending'
        }
      ]);
      console.log('✅ Sorteios de exemplo criados com sucesso');
    } else {
      console.log('✅ Sorteios já existem no banco');
    }

    console.log('======== BANCO DE PRODUÇÃO INICIALIZADO COM SUCESSO ========');
    console.log('🎉 Todas as tabelas e dados iniciais foram criados');
    console.log('🔗 Acesse o painel admin em: /admin-dashboard');
    console.log('👤 Login: admin@pixbetbicho.com | Senha: admin123');

  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar apenas se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  initProductionDatabase()
    .then(() => {
      console.log('🏁 Processo concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Falha na inicialização:', error);
      process.exit(1);
    });
}