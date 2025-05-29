import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, comparePasswords, hashPassword } from "./auth";
import { pool, db } from "./db";
import { createEzzebankService } from "./services/ezzebank";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import { 
  insertBetSchema, 
  insertDrawSchema, 
  insertUserSchema, 
  insertGameModeSchema, 
  insertPaymentGatewaySchema, 
  insertPaymentTransactionSchema,
  insertWithdrawalSchema,
  insertTransactionSchema,
  insertUserBonusSchema,
  insertPromotionalBannerSchema,
  bets, 
  paymentTransactions, 
  BetWithDetails, 
  Draw,
  WithdrawalStatus,
  UserBonus,
  PromotionalBanner,
  BonusType,
  systemSettings,
  userBonuses
} from "@shared/schema";
import { eq, desc, asc, sql, and } from "drizzle-orm";

// ======== Middleware Definitions ========
// Protected route middleware
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Admin route middleware
const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated() || !req.user.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Criar a tabela user_bonuses se ela não existir
  try {
    console.log('Verificando se a tabela user_bonuses existe...');
    
    // Verificar se a tabela existe
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'user_bonuses'
      );
    `);
    
    const tableExists = checkResult.rows[0].exists;
    
    if (!tableExists) {
      console.log('Tabela user_bonuses não existe. Criando...');
      
      // Criar a tabela user_bonuses
      await pool.query(`
        CREATE TABLE user_bonuses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          remaining_amount DECIMAL(10, 2) NOT NULL,
          rollover_amount DECIMAL(10, 2) NOT NULL,
          rolled_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          expires_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          related_transaction_id INTEGER
        );
      `);
      
      console.log('Tabela user_bonuses criada com sucesso!');
    } else {
      console.log('Tabela user_bonuses já existe.');
    }
  } catch (error) {
    console.error('Erro ao verificar/criar tabela user_bonuses:', error);
  }

  // Health check simples para o DigitalOcean
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      server: {
        version: process.version,
        uptime: process.uptime()
      }
    });
  });
  
  // Rota de diagnóstico para configurações de bônus
  app.get('/api/debug/bonus-config', async (req, res) => {
    try {
      // Buscar configurações do sistema
      const [settings] = await db.select().from(systemSettings);
      
      res.json({
        success: true,
        bonusConfig: {
          firstDepositEnabled: settings?.firstDepositBonusEnabled,
          firstDepositPercentage: settings?.firstDepositBonusPercentage,
          firstDepositMaxAmount: settings?.firstDepositBonusMaxAmount,
          firstDepositRollover: settings?.firstDepositBonusRollover,
          firstDepositExpiration: settings?.firstDepositBonusExpiration,
          registrationBonusEnabled: settings?.signupBonusEnabled,
          registrationBonusAmount: settings?.signupBonusAmount,
          registrationBonusRollover: settings?.signupBonusRollover,
          registrationBonusExpiration: settings?.signupBonusExpiration
        }
      });
    } catch (error) {
      console.error("Erro ao verificar configurações de bônus:", error);
      res.status(500).json({ 
        success: false, 
        message: "Erro ao verificar configurações de bônus",
        error: String(error)
      });
    }
  });

  // Rota para ativar as configurações de bônus
  app.post('/api/debug/fix-bonus-settings', async (req, res) => {
    try {
      console.log("Iniciando atualização das configurações de bônus...");
      
      // Usar query direta SQL para maior confiabilidade
      const updateResult = await pool.query(`
        UPDATE system_settings 
        SET 
          first_deposit_bonus_enabled = TRUE,
          first_deposit_bonus_percentage = 150,
          first_deposit_bonus_max_amount = 300,
          first_deposit_bonus_rollover = 2
        WHERE id = 1
      `);
      
      console.log("Atualização SQL executada:", updateResult);
      
      // Buscar configurações atualizadas
      const { rows } = await pool.query(`
        SELECT 
          first_deposit_bonus_enabled,
          first_deposit_bonus_percentage,
          first_deposit_bonus_max_amount,
          first_deposit_bonus_rollover
        FROM system_settings 
        LIMIT 1
      `);
      
      const updated = rows[0];
      console.log("Configurações atualizadas:", updated);
      
      res.json({
        success: true,
        message: "Configurações de bônus atualizadas com sucesso",
        config: {
          firstDepositEnabled: updated?.first_deposit_bonus_enabled,
          firstDepositPercentage: updated?.first_deposit_bonus_percentage,
          firstDepositMaxAmount: updated?.first_deposit_bonus_max_amount,
          firstDepositRollover: updated?.first_deposit_bonus_rollover
        }
      });
    } catch (error) {
      console.error("Erro ao atualizar configurações de bônus:", error);
      res.status(500).json({ 
        success: false, 
        message: "Erro ao atualizar configurações de bônus",
        error: String(error)
      });
    }
  });
  
  // Endpoint para atualizar o esquema do banco de dados para suportar branding
  app.get('/api/update-branding-schema', async (req, res) => {
    try {
      console.log('Atualizando esquema do banco de dados para suportar branding...');
      
      // Executar alteração direta (versão simplificada)
      const query = `
        ALTER TABLE system_settings 
        ADD COLUMN IF NOT EXISTS site_name TEXT NOT NULL DEFAULT 'Jogo do Bicho',
        ADD COLUMN IF NOT EXISTS site_description TEXT NOT NULL DEFAULT 'A melhor plataforma de apostas online',
        ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '/img/logo.png',
        ADD COLUMN IF NOT EXISTS favicon_url TEXT NOT NULL DEFAULT '/img/favicon.png';
      `;
      
      await pool.query(query);
      console.log('✅ Esquema atualizado com sucesso!');
      
      // Verificar se as colunas foram adicionadas
      const { rows } = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'system_settings'
        ORDER BY ordinal_position
      `);
      
      console.log('Estrutura atual da tabela:');
      rows.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      });
      
      res.json({ 
        success: true, 
        message: 'Esquema atualizado com sucesso!',
        columns: rows.map(col => `${col.column_name} (${col.data_type})`)
      });
    } catch (error) {
      console.error('❌ ERRO ao atualizar esquema:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar o esquema do banco de dados',
        error: String(error)
      });
    }
  });
  
  // ENDPOINT PARA ADICIONAR COLUNAS BLOCKED E BLOCK_REASON
  app.get('/api/fix-user-columns', async (req, res) => {
    try {
      console.log('🔧 Adicionando colunas blocked e block_reason à tabela users...');
      
      // Adicionar colunas blocked e block_reason se não existirem
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS block_reason TEXT
      `);
      
      console.log('✅ Colunas adicionadas com sucesso!');
      res.json({ 
        success: true, 
        message: 'Colunas blocked e block_reason adicionadas com sucesso!' 
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar colunas:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao adicionar colunas',
        error: String(error)
      });
    }
  });

  // ENDPOINT TEMPORÁRIO PARA REINICIALIZAR O BANCO DE DADOS
  // IMPORTANTE: Remover este endpoint após o uso!
  app.get('/api/reset-database', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      console.log("🔄 Iniciando reinicialização do banco de dados de produção...");
      
      try {
        // Lista de tabelas em ordem de dependência (as dependentes primeiro)
        const tables = [
          'session',
          'transactions',
          'withdrawals',
          'payment_transactions',
          'payment_gateways',
          'bets',
          'draws',
          'game_modes',
          'animals',
          'system_settings',
          'users'
        ];
        
        // 1. Dropar todas as tabelas
        for (const table of tables) {
          try {
            await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
            console.log(`✅ Tabela ${table} dropada com sucesso`);
          } catch (error) {
            console.error(`❌ Erro ao dropar tabela ${table}:`, error);
          }
        }
        
        // 2. Criar todas as tabelas
        // 2.1 Tabela de usuários
        await pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            name TEXT,
            balance REAL NOT NULL DEFAULT 0,
            cpf TEXT UNIQUE,
            pix_key TEXT,
            is_admin BOOLEAN NOT NULL DEFAULT false,
            blocked BOOLEAN NOT NULL DEFAULT false,
            block_reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);
        
        // Adicionar colunas blocked e block_reason se não existirem
        try {
          await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS block_reason TEXT
          `);
        } catch (error) {
          console.log('Colunas blocked já existem ou erro ao adicionar:', error);
        }
        
        // 2.2 Tabela de animais
        await pool.query(`
          CREATE TABLE IF NOT EXISTS animals (
            id SERIAL PRIMARY KEY,
            group INTEGER NOT NULL,
            name TEXT NOT NULL,
            numbers TEXT NOT NULL
          )
        `);
        
        // 2.3 Tabela de modos de jogo
        await pool.query(`
          CREATE TABLE IF NOT EXISTS game_modes (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            quotation REAL NOT NULL,
            active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER
          )
        `);
        
        // 2.4 Tabela de sorteios
        await pool.query(`
          CREATE TABLE IF NOT EXISTS draws (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            date DATE NOT NULL,
            time TEXT NOT NULL,
            result_animal_id INTEGER,
            result_animal_id2 INTEGER,
            result_animal_id3 INTEGER,
            result_animal_id4 INTEGER,
            result_animal_id5 INTEGER,
            result_number TEXT,
            result_number2 TEXT,
            result_number3 TEXT,
            result_number4 TEXT,
            result_number5 TEXT
          )
        `);
        
        // 2.5 Tabela de apostas
        await pool.query(`
          CREATE TABLE IF NOT EXISTS bets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            draw_id INTEGER NOT NULL,
            game_mode_id INTEGER NOT NULL,
            animal_id INTEGER,
            animal_id2 INTEGER,
            animal_id3 INTEGER,
            animal_id4 INTEGER,
            animal_id5 INTEGER,
            number TEXT,
            amount REAL NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            status TEXT NOT NULL DEFAULT 'pending',
            win_amount REAL,
            potential_win_amount REAL NOT NULL,
            premio_type TEXT
          )
        `);
        
        // 2.6 Tabela de configurações do sistema
        await pool.query(`
          CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            max_bet_amount REAL NOT NULL DEFAULT 10000,
            max_payout REAL NOT NULL DEFAULT 1000000,
            min_bet_amount REAL NOT NULL DEFAULT 5,
            default_bet_amount REAL NOT NULL DEFAULT 20,
            main_color TEXT NOT NULL DEFAULT '#4f46e5',
            secondary_color TEXT NOT NULL DEFAULT '#6366f1',
            accent_color TEXT NOT NULL DEFAULT '#f97316',
            allow_user_registration BOOLEAN NOT NULL DEFAULT true,
            allow_deposits BOOLEAN NOT NULL DEFAULT true,
            allow_withdrawals BOOLEAN NOT NULL DEFAULT true,
            maintenance_mode BOOLEAN NOT NULL DEFAULT false,
            auto_approve_withdrawals BOOLEAN NOT NULL DEFAULT true,
            auto_approve_withdrawal_limit REAL NOT NULL DEFAULT 30,
            site_name TEXT NOT NULL DEFAULT 'Jogo do Bicho',
            site_description TEXT NOT NULL DEFAULT 'A melhor plataforma de apostas online',
            logo_url TEXT NOT NULL DEFAULT '/img/logo.png',
            favicon_url TEXT NOT NULL DEFAULT '/img/favicon.png'
          )
        `);
        
        // 2.7 Tabela de gateways de pagamento
        await pool.query(`
          CREATE TABLE IF NOT EXISTS payment_gateways (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config JSONB,
            active BOOLEAN NOT NULL DEFAULT true
          )
        `);
        
        // 2.8 Tabela de transações de pagamento
        await pool.query(`
          CREATE TABLE IF NOT EXISTS payment_transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            gateway_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            type TEXT NOT NULL DEFAULT 'deposit',
            external_id TEXT,
            external_url TEXT,
            response JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);
        
        // 2.9 Tabela de saques
        await pool.query(`
          CREATE TABLE IF NOT EXISTS withdrawals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            pix_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            processed_by INTEGER,
            rejection_reason TEXT,
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            processed_at TIMESTAMP WITH TIME ZONE
          )
        `);
        
        // 2.10 Tabela de transações gerais
        await pool.query(`
          CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            reference_id INTEGER,
            reference_type TEXT,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);
        
        // 2.11 Tabela de sessões
        await pool.query(`
          CREATE TABLE IF NOT EXISTS session (
            sid varchar NOT NULL,
            sess json NOT NULL,
            expire timestamp(6) NOT NULL,
            CONSTRAINT session_pkey PRIMARY KEY (sid)
          )
        `);
        
        // 3. Inserir dados iniciais
        // 3.1 Configurações do sistema
        await pool.query(`
          INSERT INTO system_settings (
            id, max_bet_amount, max_payout, min_bet_amount, default_bet_amount,
            main_color, secondary_color, accent_color,
            allow_user_registration, allow_deposits, allow_withdrawals,
            maintenance_mode, auto_approve_withdrawals, auto_approve_withdrawal_limit
          ) VALUES (
            1, 10000, 1000000, 5, 20, 
            '#4f46e5', '#6366f1', '#f97316',
            true, true, true, 
            false, true, 30
          )
        `);
        
        // 3.2 Usuário admin
        const hashedPassword = await hashPassword("admin");
        await pool.query(`
          INSERT INTO users (username, password, email, name, balance, is_admin, created_at)
          VALUES ('admin', $1, 'admin@bichomania.com', 'Administrator', 0, true, NOW())
        `, [hashedPassword]);
        
        // 3.3 Animais
        const animals = [
          { group: 1, name: 'Avestruz', numbers: "01,02,03,04" },
          { group: 2, name: 'Águia', numbers: "05,06,07,08" },
          { group: 3, name: 'Burro', numbers: "09,10,11,12" },
          { group: 4, name: 'Borboleta', numbers: "13,14,15,16" },
          { group: 5, name: 'Cachorro', numbers: "17,18,19,20" },
          { group: 6, name: 'Cabra', numbers: "21,22,23,24" },
          { group: 7, name: 'Carneiro', numbers: "25,26,27,28" },
          { group: 8, name: 'Camelo', numbers: "29,30,31,32" },
          { group: 9, name: 'Cobra', numbers: "33,34,35,36" },
          { group: 10, name: 'Coelho', numbers: "37,38,39,40" },
          { group: 11, name: 'Cavalo', numbers: "41,42,43,44" },
          { group: 12, name: 'Elefante', numbers: "45,46,47,48" },
          { group: 13, name: 'Galo', numbers: "49,50,51,52" },
          { group: 14, name: 'Gato', numbers: "53,54,55,56" },
          { group: 15, name: 'Jacaré', numbers: "57,58,59,60" },
          { group: 16, name: 'Leão', numbers: "61,62,63,64" },
          { group: 17, name: 'Macaco', numbers: "65,66,67,68" },
          { group: 18, name: 'Porco', numbers: "69,70,71,72" },
          { group: 19, name: 'Pavão', numbers: "73,74,75,76" },
          { group: 20, name: 'Peru', numbers: "77,78,79,80" },
          { group: 21, name: 'Touro', numbers: "81,82,83,84" },
          { group: 22, name: 'Tigre', numbers: "85,86,87,88" },
          { group: 23, name: 'Urso', numbers: "89,90,91,92" },
          { group: 24, name: 'Veado', numbers: "93,94,95,96" },
          { group: 25, name: 'Vaca', numbers: "97,98,99,00" }
        ];
        
        for (const animal of animals) {
          await pool.query(`
            INSERT INTO animals (group, name, numbers)
            VALUES ($1, $2, $3)
          `, [animal.group, animal.name, animal.numbers]);
        }
        
        // 3.4 Modos de jogo
        const gameModes = [
          {
            id: 1,
            name: "Grupo",
            description: "Jogue no grupo do animal",
            quotation: 18,
            active: true,
            sortOrder: 1
          },
          {
            id: 2,
            name: "Centena",
            description: "Jogue nos três últimos números (dezena + unidade)",
            quotation: 900,
            active: true,
            sortOrder: 2
          },
          {
            id: 3,
            name: "Dezena",
            description: "Jogue nos dois últimos números (dezena + unidade)",
            quotation: 90,
            active: true,
            sortOrder: 3
          },
          {
            id: 4,
            name: "Milhar",
            description: "Jogue nos quatro números (milhar completa)",
            quotation: 9000,
            active: true,
            sortOrder: 4
          }
        ];
        
        for (const mode of gameModes) {
          await pool.query(`
            INSERT INTO game_modes (id, name, description, quotation, active, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [mode.id, mode.name, mode.description, mode.quotation, mode.active, mode.sortOrder]);
        }
        
        // 3.5 Sorteios
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const formatDate = (date) => {
          return date.toISOString().split('T')[0];
        };
        
        const drawTimes = ["10:00", "13:00", "16:00", "19:00", "21:00"];
        
        for (const time of drawTimes) {
          // Sorteio para hoje
          await pool.query(`
            INSERT INTO draws (name, date, time)
            VALUES ($1, $2, $3)
          `, [`Sorteio ${time}`, formatDate(today), time]);
          
          // Sorteio para amanhã
          await pool.query(`
            INSERT INTO draws (name, date, time)
            VALUES ($1, $2, $3)
          `, [`Sorteio ${time}`, formatDate(tomorrow), time]);
        }
        
        res.status(200).json({ 
          status: 'success', 
          message: 'Banco de dados reinicializado com sucesso',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("❌ Erro durante reinicialização do banco de dados:", error);
        res.status(500).json({ 
          status: 'error', 
          message: 'Erro durante reinicialização do banco de dados',
          error: error.message || error.toString()
        });
      }
    } else {
      res.status(403).json({ 
        status: 'error', 
        message: 'Este endpoint só está disponível em ambiente de produção'
      });
    }
  });
  
  // Endpoint sem prefixo /api - para compatibilidade com DigitalOcean
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  
  // Set up authentication routes
  setupAuth(app);
  
  // Rotas para o sistema de bônus
  // Endpoint para atualizar o esquema do banco de dados para bônus
  app.get('/api/update-bonus-schema', async (req, res) => {
    try {
      console.log('Atualizando esquema do banco de dados para suportar sistema de bônus...');
      
      // Criar tabela de configurações de bônus
      const bonusConfigQuery = `
        CREATE TABLE IF NOT EXISTS bonus_configurations (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT false,
          amount REAL NOT NULL DEFAULT 0,
          rollover_multiplier REAL NOT NULL DEFAULT 3,
          expiration_days INTEGER NOT NULL DEFAULT 7,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `;
      await pool.query(bonusConfigQuery);
      
      // Criar tabela de bônus de usuários
      const userBonusQuery = `
        CREATE TABLE IF NOT EXISTS user_bonuses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          remaining_amount REAL NOT NULL,
          rollover_amount REAL NOT NULL,
          rolled_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          expires_at TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          related_transaction_id INTEGER
        );
      `;
      await pool.query(userBonusQuery);
      
      // Criar tabela de banners promocionais
      const bannersQuery = `
        CREATE TABLE IF NOT EXISTS promotional_banners (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          image_url TEXT NOT NULL,
          link_url TEXT,
          enabled BOOLEAN NOT NULL DEFAULT false,
          show_on_login BOOLEAN NOT NULL DEFAULT false,
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `;
      await pool.query(bannersQuery);
      
      // Adicionar configurações de bônus às configurações do sistema
      const systemSettingsQuery = `
        ALTER TABLE system_settings 
        ADD COLUMN IF NOT EXISTS signup_bonus_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS signup_bonus_amount REAL NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS signup_bonus_rollover REAL NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS signup_bonus_expiration INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_amount REAL NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_rollover REAL NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_expiration INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_percentage REAL NOT NULL DEFAULT 100,
        ADD COLUMN IF NOT EXISTS first_deposit_bonus_max_amount REAL NOT NULL DEFAULT 200,
        ADD COLUMN IF NOT EXISTS promotional_banners_enabled BOOLEAN NOT NULL DEFAULT false;
      `;
      await pool.query(systemSettingsQuery);
      
      console.log('✅ Esquema de bônus atualizado com sucesso!');
      
      res.json({ 
        success: true, 
        message: 'Esquema de bônus atualizado com sucesso!'
      });
    } catch (error) {
      console.error('❌ ERRO ao atualizar esquema de bônus:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao atualizar o esquema de bônus',
        error: String(error)
      });
    }
  });
  
  // Rotas para gerenciamento de bônus (admin)
  

  
  // Rota para atualizar as configurações de bônus
  app.post('/api/admin/bonus-settings', requireAdmin, async (req, res) => {
    try {
      const updates = req.body;
      console.log("Recebendo atualização de configurações de bônus:", JSON.stringify(updates));
      
      // Validar estrutura dos dados recebidos
      if (!updates.signupBonus || !updates.firstDepositBonus) {
        return res.status(400).json({ 
          message: "Estrutura de dados inválida. É necessário incluir signupBonus e firstDepositBonus" 
        });
      }
      
      // Extrair dados dos bônus
      const { signupBonus, firstDepositBonus } = updates;
      
      // Preparar dados para atualização no banco de dados
      const updateData = {
        // Bônus de cadastro
        signupBonusEnabled: Boolean(signupBonus.enabled),
        signupBonusAmount: Number(signupBonus.amount) || 10,
        signupBonusRollover: Number(signupBonus.rollover) || 3,
        signupBonusExpiration: Number(signupBonus.expiration) || 7,
        
        // Bônus de primeiro depósito
        firstDepositBonusEnabled: Boolean(firstDepositBonus.enabled),
        firstDepositBonusAmount: Number(firstDepositBonus.amount) || 100,
        firstDepositBonusPercentage: Number(firstDepositBonus.percentage) || 100,
        firstDepositBonusMaxAmount: Number(firstDepositBonus.maxAmount) || 200,
        firstDepositBonusRollover: Number(firstDepositBonus.rollover) || 3,
        firstDepositBonusExpiration: Number(firstDepositBonus.expiration) || 7,
        
        // Banners promocionais
        promotionalBannersEnabled: Boolean(updates.promotionalBanners?.enabled || false)
      };
      
      console.log("Dados preparados para salvar no banco:", updateData);
      
      // Buscar configurações atuais para mesclar
      const currentSettings = await storage.getSystemSettings();
      if (!currentSettings) {
        return res.status(404).json({ message: "Configurações do sistema não encontradas" });
      }
      
      // Mesclar com configurações existentes
      const mergedSettings = {
        ...currentSettings,
        ...updateData
      };
      
      // Salvar no banco de dados
      const savedSettings = await storage.saveSystemSettings(mergedSettings);
      
      console.log("✅ Configurações de bônus salvas com sucesso no banco de dados");
      
      // Retornar resposta de sucesso
      res.json({
        success: true,
        message: "Configurações de bônus atualizadas com sucesso",
        settings: {
          signupBonus: {
            enabled: savedSettings.signupBonusEnabled,
            amount: savedSettings.signupBonusAmount,
            rollover: savedSettings.signupBonusRollover,
            expiration: savedSettings.signupBonusExpiration
          },
          firstDepositBonus: {
            enabled: savedSettings.firstDepositBonusEnabled,
            amount: savedSettings.firstDepositBonusAmount,
            percentage: savedSettings.firstDepositBonusPercentage,
            maxAmount: savedSettings.firstDepositBonusMaxAmount,
            rollover: savedSettings.firstDepositBonusRollover,
            expiration: savedSettings.firstDepositBonusExpiration
          },
          promotionalBanners: {
            enabled: savedSettings.promotionalBannersEnabled
          }
        }
      });
      
    } catch (error) {
      console.error("Erro ao salvar configurações de bônus:", error);
      res.status(500).json({ 
        message: "Erro ao salvar configurações de bônus",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get('/api/admin/bonus-settings', requireAdmin, async (req, res) => {
    try {
      console.log('Buscando configurações de bônus...');
      
      const settings = await storage.getSystemSettings();
      
      if (!settings) {
        console.log('Configurações não encontradas, retornando padrões');
        return res.status(404).json({ message: "System settings not found" });
      }
      
      const defaultConfig = {
        signupBonus: {
          enabled: false,
          amount: 15,
          rollover: 2,
          expiration: 7
        },
        firstDepositBonus: {
          enabled: false,
          amount: 100,
          percentage: 100,
          maxAmount: 300,
          rollover: 2,
          expiration: 14
        },
        promotionalBanners: {
          enabled: false
        }
      };
      
      const response = {
        signupBonus: {
          enabled: settings?.signupBonusEnabled ?? defaultConfig.signupBonus.enabled,
          amount: Number(settings?.signupBonusAmount ?? defaultConfig.signupBonus.amount),
          rollover: Number(settings?.signupBonusRollover ?? defaultConfig.signupBonus.rollover),
          expiration: Number(settings?.signupBonusExpiration ?? defaultConfig.signupBonus.expiration)
        },
        firstDepositBonus: {
          enabled: settings?.firstDepositBonusEnabled ?? defaultConfig.firstDepositBonus.enabled,
          amount: Number(settings?.firstDepositBonusAmount ?? defaultConfig.firstDepositBonus.amount),
          percentage: Number(settings?.firstDepositBonusPercentage ?? defaultConfig.firstDepositBonus.percentage),
          maxAmount: Number(settings?.firstDepositBonusMaxAmount ?? defaultConfig.firstDepositBonus.maxAmount),
          rollover: Number(settings?.firstDepositBonusRollover ?? defaultConfig.firstDepositBonus.rollover),
          expiration: Number(settings?.firstDepositBonusExpiration ?? defaultConfig.firstDepositBonus.expiration)
        },
        promotionalBanners: {
          enabled: settings?.promotionalBannersEnabled ?? defaultConfig.promotionalBanners.enabled
        }
      };
      
      console.log('Enviando resposta de configurações de bônus:', JSON.stringify(response));
      res.json(response);
    } catch (error) {
      console.error("Erro ao buscar configurações de bônus:", error);
      res.status(500).json({ 
        message: "Erro ao buscar configurações de bônus",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Rotas para gerenciar banners promocionais
  app.get('/api/admin/promotional-banners', requireAdmin, async (req, res) => {
    try {
      const banners = await storage.getPromotionalBanners();
      res.json(banners);
    } catch (error) {
      console.error("Erro ao buscar banners promocionais:", error);
      res.status(500).json({ message: "Erro ao buscar banners promocionais" });
    }
  });
  
  app.post('/api/admin/promotional-banners', requireAdmin, async (req, res) => {
    try {
      const bannerData = req.body;
      
      // Validar dados do banner
      if (!bannerData.title || !bannerData.imageUrl) {
        return res.status(400).json({ message: "Título e URL da imagem são obrigatórios" });
      }
      
      const banner = await storage.createPromotionalBanner({
        title: bannerData.title,
        imageUrl: bannerData.imageUrl,
        linkUrl: bannerData.linkUrl,
        enabled: bannerData.enabled || false,
        showOnLogin: bannerData.showOnLogin || false,
        startDate: bannerData.startDate ? new Date(bannerData.startDate) : undefined,
        endDate: bannerData.endDate ? new Date(bannerData.endDate) : undefined
      });
      
      res.status(201).json(banner);
    } catch (error) {
      console.error("Erro ao criar banner promocional:", error);
      res.status(500).json({ message: "Erro ao criar banner promocional" });
    }
  });
  
  app.put('/api/admin/promotional-banners/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const bannerData = req.body;
      
      // Validar ID
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      // Validar dados do banner
      if (!bannerData.title || !bannerData.imageUrl) {
        return res.status(400).json({ message: "Título e URL da imagem são obrigatórios" });
      }
      
      const updatedBanner = await storage.updatePromotionalBanner(id, {
        title: bannerData.title,
        imageUrl: bannerData.imageUrl,
        linkUrl: bannerData.linkUrl,
        enabled: bannerData.enabled,
        showOnLogin: bannerData.showOnLogin,
        startDate: bannerData.startDate ? new Date(bannerData.startDate) : undefined,
        endDate: bannerData.endDate ? new Date(bannerData.endDate) : undefined
      });
      
      if (!updatedBanner) {
        return res.status(404).json({ message: "Banner não encontrado" });
      }
      
      res.json(updatedBanner);
    } catch (error) {
      console.error("Erro ao atualizar banner promocional:", error);
      res.status(500).json({ message: "Erro ao atualizar banner promocional" });
    }
  });
  
  app.delete('/api/admin/promotional-banners/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validar ID
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const success = await storage.deletePromotionalBanner(id);
      
      if (!success) {
        return res.status(404).json({ message: "Banner não encontrado" });
      }
      
      res.json({ success: true, message: "Banner excluído com sucesso" });
    } catch (error) {
      console.error("Erro ao excluir banner promocional:", error);
      res.status(500).json({ message: "Erro ao excluir banner promocional" });
    }
  });
  
  // Rotas para usuários (cliente)
  // Rota para obter bônus ativos do usuário está no final do arquivo
  
  // Rota para obter banners promocionais ativos
  app.get('/api/promotional-banners', async (req, res) => {
    try {
      const banners = await storage.getPromotionalBanners(true);
      res.json(banners);
    } catch (error) {
      console.error("Erro ao buscar banners promocionais:", error);
      res.status(500).json({ message: "Erro ao buscar banners promocionais" });
    }
  });
  
  // Rota para obter banners de login
  app.get('/api/login-banners', async (req, res) => {
    try {
      const banners = await storage.getLoginBanners();
      res.json(banners);
    } catch (error) {
      console.error("Erro ao buscar banners de login:", error);
      res.status(500).json({ message: "Erro ao buscar banners de login" });
    }
  });
  
  // Middlewares movidos para o início do arquivo
  
  // Middleware para verificar se o recurso pertence ao usuário
  /**
   * Middleware para verificar se o usuário é dono do recurso antes de permitir acesso
   * Implementa verificações múltiplas de segurança para prevenir vazamento de dados
   */
  const requireOwnership = (resourceType: string) => {
    return async (req: Request, res: Response, next: Function) => {
      // Verificação de autenticação
      if (!req.isAuthenticated()) {
        console.log(`ACESSO NEGADO: Tentativa de acesso sem autenticação a ${resourceType}`);
        return res.status(401).json({ message: "Não autorizado" });
      }
      
      const userId = req.user.id;
      const username = req.user.username;
      const resourceId = parseInt(req.params.id);
      
      // Validação do ID
      if (isNaN(resourceId)) {
        console.log(`ERRO DE VALIDAÇÃO: ID inválido fornecido por ${username} (${userId}) para ${resourceType}`);
        return res.status(400).json({ message: "ID inválido" });
      }
      
      // Verificação de admin (apenas administradores podem acessar recursos de outros usuários)
      if (req.user.isAdmin) {
        console.log(`ACESSO ADMIN: ${username} (${userId}) acessando ${resourceType} ${resourceId} como administrador`);
        
        // Para os administradores ainda precisamos carregar o recurso para disponibilizar no req
        let adminResource: any;
        
        try {
          switch (resourceType) {
            case 'bet':
              adminResource = await storage.getBet(resourceId);
              break;
            case 'transaction':
              adminResource = await storage.getPaymentTransaction(resourceId);
              break;
            default:
              throw new Error(`Tipo de recurso desconhecido: ${resourceType}`);
          }
          
          if (!adminResource) {
            return res.status(404).json({ message: `${resourceType} não encontrado` });
          }
          
          // Adicionar log para auditoria de acesso de administradores a dados de outros usuários
          if (adminResource.userId !== userId) {
            console.log(`AUDITORIA: Admin ${username} (${userId}) acessando ${resourceType} ${resourceId} do usuário ${adminResource.userId}`);
          }
          
          // Armazenar no request
          (req as any).resource = adminResource;
          return next();
        } catch (error) {
          console.error(`ERRO: Admin ${username} falhou ao acessar ${resourceType} ${resourceId}`, error);
          return res.status(500).json({ message: "Erro ao buscar recurso" });
        }
      }
      
      try {
        let resource: any;
        let ownerUserId: number;
        
        // Verificação dupla de propriedade:
        // 1. Primeiro verificamos se o ID do recurso pertence ao usuário (sem carregar o objeto completo)
        switch (resourceType) {
          case 'bet':
            // Verificação preliminar de propriedade - consulta leve apenas para verificar o dono
            const betOwner = await db
              .select({ userId: bets.userId })
              .from(bets)
              .where(eq(bets.id, resourceId))
              .limit(1);
            
            if (betOwner.length === 0) {
              console.log(`RECURSO NÃO ENCONTRADO: Aposta ${resourceId} não existe`);
              return res.status(404).json({ message: "Aposta não encontrada" });
            }
            
            ownerUserId = betOwner[0].userId;
            if (ownerUserId !== userId) {
              console.log(`ACESSO NEGADO: Usuário ${username} (${userId}) tentando acessar aposta ${resourceId} do usuário ${ownerUserId}`);
              return res.status(403).json({ message: "Acesso negado: esse recurso não pertence a você" });
            }
            
            // Se passou na verificação preliminar, carregamos o objeto completo
            resource = await storage.getBet(resourceId);
            break;
            
          case 'transaction':
            // Verificação preliminar de propriedade para transações
            const txOwner = await db
              .select({ userId: paymentTransactions.userId })
              .from(paymentTransactions)
              .where(eq(paymentTransactions.id, resourceId))
              .limit(1);
              
            if (txOwner.length === 0) {
              console.log(`RECURSO NÃO ENCONTRADO: Transação ${resourceId} não existe`);
              return res.status(404).json({ message: "Transação não encontrada" });
            }
            
            ownerUserId = txOwner[0].userId;
            if (ownerUserId !== userId) {
              console.log(`ACESSO NEGADO: Usuário ${username} (${userId}) tentando acessar transação ${resourceId} do usuário ${ownerUserId}`);
              return res.status(403).json({ message: "Acesso negado: esse recurso não pertence a você" });
            }
            
            // Se passou na verificação preliminar, carregamos o objeto completo
            resource = await storage.getPaymentTransaction(resourceId);
            break;
            
          default:
            console.error(`ERRO DE CONFIGURAÇÃO: Tipo de recurso desconhecido: ${resourceType}`);
            throw new Error(`Tipo de recurso desconhecido: ${resourceType}`);
        }
        
        // Verificação secundária: garantir que o recurso foi carregado
        if (!resource) {
          console.log(`ERRO DE CONSISTÊNCIA: Recurso ${resourceType} ${resourceId} não encontrado após verificação preliminar`);
          return res.status(404).json({ message: `${resourceType} não encontrado` });
        }
        
        // 2. Verificação final de propriedade no objeto carregado (tripla validação)
        if (resource.userId !== userId) {
          // Este log é crítico pois indica potencial vulnerabilidade na verificação preliminar
          console.error(`ALERTA DE SEGURANÇA: Falha na verificação preliminar para ${resourceType} ${resourceId}. 
            Verificação preliminar: pertence a ${ownerUserId}
            Verificação final: pertence a ${resource.userId}
            Usuário solicitante: ${userId}`);
          return res.status(403).json({ message: "Acesso negado: inconsistência de propriedade" });
        }
        
        // Registrar acesso bem-sucedido para auditoria
        console.log(`ACESSO AUTORIZADO: Usuário ${username} (${userId}) acessando seu próprio ${resourceType} ${resourceId}`);
        
        // Salva o recurso no request para uso posterior
        (req as any).resource = resource;
        next();
      } catch (error) {
        console.error(`ERRO NO MIDDLEWARE: Falha na verificação de propriedade para ${resourceType} ${resourceId} solicitado por ${username} (${userId})`, error);
        res.status(500).json({ message: "Erro ao verificar permissões" });
      }
    };
  };

  // Get all animals
  app.get("/api/animals", async (req, res) => {
    try {
      const animals = await storage.getAllAnimals();
      res.json(animals);
    } catch (error) {
      res.status(500).json({ message: "Error fetching animals" });
    }
  });

  // Get upcoming draws
  app.get("/api/draws/upcoming", async (req, res) => {
    try {
      const draws = await storage.getUpcomingDraws();
      res.json(draws);
    } catch (error) {
      res.status(500).json({ message: "Error fetching upcoming draws" });
    }
  });
  
  // Get public system settings (accessible without authentication)
  app.get("/api/settings", async (req, res) => {
    try {
      // Fetch settings but only return public-facing ones
      const settings = await storage.getSystemSettings();
      
      if (settings) {
        // Apenas retorna as configurações que afetam funcionalidades do cliente
        const publicSettings = {
          maxBetAmount: settings.maxBetAmount,
          maxPayout: settings.maxPayout,
          mainColor: settings.mainColor,
          secondaryColor: settings.secondaryColor,
          accentColor: settings.accentColor,
          allowUserRegistration: settings.allowUserRegistration,
          allowDeposits: settings.allowDeposits,
          allowWithdrawals: settings.allowWithdrawals,
          maintenanceMode: settings.maintenanceMode,
          // Informações sobre aprovação automática de saques
          autoApproveWithdrawals: settings.autoApproveWithdrawals,
          autoApproveWithdrawalLimit: settings.autoApproveWithdrawalLimit,
          // Informações de branding do site
          siteName: settings.siteName,
          siteDescription: settings.siteDescription,
          logoUrl: settings.logoUrl,
          faviconUrl: settings.faviconUrl,
          // Configurações de bônus
          signupBonusEnabled: settings.signupBonusEnabled || false,
          signupBonusAmount: settings.signupBonusAmount || 0,
          signupBonusRollover: settings.signupBonusRollover || 0,
          signupBonusExpiration: settings.signupBonusExpiration || 0,
          firstDepositBonusEnabled: settings.firstDepositBonusEnabled || false,
          firstDepositBonusAmount: settings.firstDepositBonusAmount || 0,
          firstDepositBonusPercentage: settings.firstDepositBonusPercentage || 0,
          firstDepositBonusMaxAmount: settings.firstDepositBonusMaxAmount || 0,
          firstDepositBonusRollover: settings.firstDepositBonusRollover || 0,
          firstDepositBonusExpiration: settings.firstDepositBonusExpiration || 0,
          promotionalBannersEnabled: settings.promotionalBannersEnabled || false
        };
        
        res.json(publicSettings);
      } else {
        // Default values para configurações públicas
        const defaultSettings = {
          maxBetAmount: 5000,
          maxPayout: 50000,
          mainColor: "#4f46e5",
          secondaryColor: "#6366f1",
          accentColor: "#f97316",
          allowUserRegistration: true,
          allowDeposits: true,
          allowWithdrawals: true,
          maintenanceMode: false,
          autoApproveWithdrawals: false,
          autoApproveWithdrawalLimit: 0,
          // Informações de branding padrão
          siteName: "Jogo do Bicho",
          siteDescription: "A melhor plataforma de apostas online",
          logoUrl: "/img/logo.png",
          faviconUrl: "/favicon.ico",
          // Configurações de bônus padrão
          signupBonusEnabled: false,
          signupBonusAmount: 0,
          signupBonusRollover: 0,
          signupBonusExpiration: 0,
          firstDepositBonusEnabled: true, // Forçando a habilitação do bônus de primeiro depósito
          firstDepositBonusAmount: 100,
          firstDepositBonusPercentage: 100,
          firstDepositBonusMaxAmount: 200,
          firstDepositBonusRollover: 3,
          firstDepositBonusExpiration: 7,
          promotionalBannersEnabled: false,
          siteName: "Jogo do Bicho",
          siteDescription: "A melhor plataforma de apostas online", 
          logoUrl: "/img/logo.png",
          faviconUrl: "/favicon.ico"
        };
        
        res.json(defaultSettings);
      }
    } catch (error) {
      console.error("Error fetching public system settings:", error);
      res.status(500).json({ message: "Error fetching system settings" });
    }
  });

  // Get all draws
  app.get("/api/draws", requireAuth, async (req, res) => {
    try {
      const draws = await storage.getAllDraws();
      res.json(draws);
    } catch (error) {
      res.status(500).json({ message: "Error fetching draws" });
    }
  });

  // Create new draw (admin only)
  app.post("/api/draws", requireAdmin, async (req, res) => {
    try {
      console.log("Dados recebidos para criação de sorteio:", req.body);
      
      // Validar os dados básicos
      const validatedData = insertDrawSchema.parse(req.body);
      
      // Garantir que a data está no formato correto antes de salvar
      // Se for string, convertemos para Date, se for Date, mantemos como está
      let formattedData = {
        ...validatedData,
        date: typeof validatedData.date === 'string' 
          ? new Date(validatedData.date) 
          : validatedData.date
      };
      
      console.log("Dados formatados para criação de sorteio:", formattedData);
      
      // Criar o sorteio no banco de dados
      const draw = await storage.createDraw(formattedData);
      
      console.log("Sorteio criado com sucesso:", draw);
      res.status(201).json(draw);
    } catch (error) {
      console.error("Erro ao criar sorteio:", error);
      
      if (error instanceof z.ZodError) {
        console.error("Erros de validação:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid draw data", errors: error.errors });
      }
      
      res.status(500).json({ 
        message: "Error creating draw", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update draw (admin only)
  app.put("/api/draws/:id", requireAdmin, async (req, res) => {
    try {
      const drawId = parseInt(req.params.id);
      console.log("Dados recebidos para atualização de sorteio:", req.body);
      
      // Processar os dados da requisição
      let drawData = req.body;
      
      // Garantir que a data está no formato correto antes de salvar
      if (drawData.date && typeof drawData.date === 'string') {
        drawData = {
          ...drawData,
          date: new Date(drawData.date)
        };
      }
      
      console.log("Dados formatados para atualização de sorteio:", drawData);
      
      // Atualizar sorteio
      const updatedDraw = await storage.updateDraw(drawId, drawData);
      
      if (!updatedDraw) {
        return res.status(404).json({ message: "Sorteio não encontrado" });
      }
      
      console.log("Sorteio atualizado com sucesso:", updatedDraw);
      res.json(updatedDraw);
    } catch (error) {
      console.error("Error updating draw:", error);
      res.status(500).json({ 
        message: "Erro ao atualizar sorteio", 
        error: String(error) 
      });
    }
  });
  
  // Delete draw (admin only)
  app.delete("/api/draws/:id", requireAdmin, async (req, res) => {
    try {
      const drawId = parseInt(req.params.id);
      
      // Excluir sorteio
      await storage.deleteDraw(drawId);
      
      res.status(200).json({ message: "Sorteio excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting draw:", error);
      res.status(500).json({ 
        message: "Erro ao excluir sorteio", 
        error: String(error) 
      });
    }
  });

  // Update draw result (admin only)
  app.put("/api/draws/:id/result", requireAdmin, async (req, res) => {
    try {
      const drawId = Number(req.params.id);
      const { 
        animalId, // 1º prêmio (obrigatório) 
        animalId2, // 2º prêmio (opcional)
        animalId3, // 3º prêmio (opcional)
        animalId4, // 4º prêmio (opcional)
        animalId5, // 5º prêmio (opcional)
        resultNumber1, // Número do 1º prêmio (obrigatório para Milhar/Centena/Dezena)
        resultNumber2, // Número do 2º prêmio (opcional)
        resultNumber3, // Número do 3º prêmio (opcional)
        resultNumber4, // Número do 4º prêmio (opcional)
        resultNumber5  // Número do 5º prêmio (opcional)
      } = req.body;
      
      console.log(`Processing draw result: Draw ID: ${drawId}
        1º prêmio: Animal ${animalId}, Número ${resultNumber1 || 'não definido'}
        2º prêmio: Animal ${animalId2 || 'não definido'}, Número ${resultNumber2 || 'não definido'}
        3º prêmio: Animal ${animalId3 || 'não definido'}, Número ${resultNumber3 || 'não definido'}
        4º prêmio: Animal ${animalId4 || 'não definido'}, Número ${resultNumber4 || 'não definido'}
        5º prêmio: Animal ${animalId5 || 'não definido'}, Número ${resultNumber5 || 'não definido'}
      `);
      
      // Validar o animal do 1º prêmio (obrigatório)
      if (!animalId || typeof animalId !== 'number') {
        console.error(`Invalid animal ID for 1st prize: ${animalId}`);
        return res.status(400).json({ message: "ID de animal inválido para o 1º prêmio" });
      }

      // Validar o número do 1º prêmio (obrigatório)
      if (!resultNumber1) {
        console.error(`Missing number for 1st prize`);
        return res.status(400).json({ message: "Número para o 1º prêmio é obrigatório" });
      }

      const draw = await storage.getDraw(drawId);
      if (!draw) {
        console.error(`Draw not found: ${drawId}`);
        return res.status(404).json({ message: "Sorteio não encontrado" });
      }

      // Validar todos os animais informados
      const animalIds = [animalId];
      if (animalId2) animalIds.push(animalId2);
      if (animalId3) animalIds.push(animalId3);
      if (animalId4) animalIds.push(animalId4);
      if (animalId5) animalIds.push(animalId5);
      
      for (const id of animalIds) {
        const animal = await storage.getAnimal(id);
        if (!animal) {
          console.error(`Animal not found: ${id}`);
          return res.status(404).json({ message: `Animal com ID ${id} não encontrado` });
        }
      }

      // Processar os números para garantir o formato correto (4 dígitos)
      const formattedNumber1 = resultNumber1.padStart(4, '0');
      const formattedNumber2 = resultNumber2 ? resultNumber2.padStart(4, '0') : undefined;
      const formattedNumber3 = resultNumber3 ? resultNumber3.padStart(4, '0') : undefined;
      const formattedNumber4 = resultNumber4 ? resultNumber4.padStart(4, '0') : undefined;
      const formattedNumber5 = resultNumber5 ? resultNumber5.padStart(4, '0') : undefined;

      console.log(`Processing draw ${drawId} with multiple prize animals and numbers`);
      const updatedDraw = await storage.updateDrawResult(
        drawId, 
        animalId, 
        animalId2, 
        animalId3, 
        animalId4, 
        animalId5,
        formattedNumber1,
        formattedNumber2,
        formattedNumber3,
        formattedNumber4,
        formattedNumber5
      );
      
      if (!updatedDraw) {
        console.error(`Failed to update draw result for draw ${drawId}`);
        return res.status(500).json({ message: "Erro ao atualizar resultado do sorteio" });
      }
      
      console.log(`Draw result processed successfully, invalidating caches`);
      
      // Add cache invalidation for various endpoints that should be refreshed after updating a draw
      // This signals clients to reload user data, bets data, and draws data
      req.app.emit('draw:result', { 
        drawId, 
        animalId,
        animalId2,
        animalId3,
        animalId4,
        animalId5,
        resultNumber1: formattedNumber1,
        resultNumber2: formattedNumber2,
        resultNumber3: formattedNumber3,
        resultNumber4: formattedNumber4,
        resultNumber5: formattedNumber5
      });
      
      // Respond with the updated draw
      res.json(updatedDraw);
    } catch (error) {
      console.error(`Error processing draw result: ${error}`);
      res.status(500).json({ message: "Erro ao processar resultado do sorteio" });
    }
  });

  // Create bet
  app.post("/api/bets", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      console.log(`Creating bet for user ID: ${userId}`);
      console.log("Bet request data:", req.body);
      console.log("DEBUG - Bet request useBonusBalance:", req.body.useBonusBalance, typeof req.body.useBonusBalance);
      
      // Usar o valor real diretamente, sem conversão para centavos
      const requestData = {
        ...req.body,
        userId,
        useBonusBalance: req.body.useBonusBalance === true || req.body.useBonusBalance === 'true'
      };
      
      // Validate the bet data
      const validatedData = insertBetSchema.parse(requestData);
      
      console.log("Validated bet data:", validatedData);
      console.log("DEBUG - Validated useBonusBalance:", validatedData.useBonusBalance, typeof validatedData.useBonusBalance);
      
      // Verificar configurações do sistema para limites de apostas
      const systemSettings = await storage.getSystemSettings();
      console.log("System settings for bet limits:", {
        maxBetAmount: systemSettings?.maxBetAmount,
        maxPayout: systemSettings?.maxPayout,
        allowBonusBets: systemSettings?.allowBonusBets
      });
      
      // Verificar se está tentando usar saldo de bônus quando essa opção não está habilitada
      console.log("[DEBUG] Sistema permite apostas com bônus:", systemSettings?.allowBonusBets);
      console.log("[DEBUG] Corpo da requisição:", req.body);
      console.log("[DEBUG] useBonusBalance no corpo:", req.body.useBonusBalance);
      
      if (req.body.useBonusBalance && (!systemSettings || !systemSettings.allowBonusBets)) {
        console.log("User attempted to use bonus balance when bonus bets are disabled");
        return res.status(400).json({ 
          message: "Apostas com saldo de bônus não estão habilitadas no momento" 
        });
      }
      
      // Verificar limite de aposta mínima
      if (systemSettings && systemSettings.minBetAmount && validatedData.amount < systemSettings.minBetAmount) {
        console.log(`Bet amount below minimum allowed: ${validatedData.amount} < ${systemSettings.minBetAmount}`);
        return res.status(400).json({ 
          message: `O valor mínimo de aposta é de R$ ${systemSettings.minBetAmount.toFixed(2).replace(".", ",")}`,
          currentAmount: validatedData.amount,
          minAllowed: systemSettings.minBetAmount
        });
      }
      
      // Verificar limite de aposta máxima
      if (systemSettings && systemSettings.maxBetAmount && validatedData.amount > systemSettings.maxBetAmount) {
        console.log(`Bet amount exceeds maximum allowed: ${validatedData.amount} > ${systemSettings.maxBetAmount}`);
        return res.status(400).json({ 
          message: `A aposta máxima permitida é de R$ ${systemSettings.maxBetAmount.toFixed(2).replace(".", ",")}`,
          currentAmount: validatedData.amount,
          maxAllowed: systemSettings.maxBetAmount
        });
      }
      
      // Verify the user has enough balance
      const user = await storage.getUser(userId);
      if (!user) {
        console.log(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verificar se o usuário quer usar saldo de bônus
      if (req.body.useBonusBalance) {
        console.log("[DEBUG] User is attempting to use bonus balance for this bet");
        
        // Verificar bônus ativos
        const activeBonus = await storage.getUserActiveBonus(userId);
        console.log("[DEBUG] Bônus ativo encontrado:", activeBonus);
        
        // Verificar saldo de bônus disponível
        const bonusBalance = await storage.getUserBonusBalance(userId);
        console.log(`[DEBUG] User bonus balance: ${bonusBalance}, Bet amount: ${validatedData.amount}`);
        
        if (bonusBalance < validatedData.amount) {
          console.log(`[DEBUG] Insufficient bonus balance: ${bonusBalance} < ${validatedData.amount}`);
          return res.status(400).json({ 
            message: "Saldo de bônus insuficiente para realizar esta aposta", 
            currentBonusBalance: bonusBalance,
            requiredAmount: validatedData.amount 
          });
        }
        
        console.log("[DEBUG] Usuário tem saldo de bônus suficiente, apostando com saldo de bônus");
        // Salvar a informação de que esta aposta usará saldo de bônus
        validatedData.useBonusBalance = true;
      } else {
        // Verificação normal de saldo para apostas com saldo real
        console.log(`User balance: ${user.balance}, Bet amount: ${validatedData.amount}`);
        if (user.balance < validatedData.amount) {
          console.log(`Insufficient balance: ${user.balance} < ${validatedData.amount}`);
          
          // Verificar se podemos usar saldo de bônus automaticamente quando o saldo real é insuficiente
          if (systemSettings?.allowBonusBets) {
            // Verificar saldo de bônus disponível
            const bonusBalance = await storage.getUserBonusBalance(userId);
            console.log(`[DEBUG] Verificando saldo de bônus automaticamente: ${bonusBalance}`);
            
            if (bonusBalance >= validatedData.amount) {
              console.log(`[DEBUG] Usuário tem saldo de bônus suficiente, utilizando automaticamente`);
              // Usar saldo de bônus automaticamente
              validatedData.useBonusBalance = true;
            } else {
              // Sem saldo suficiente nem em bônus
              return res.status(400).json({ 
                message: "Saldo insuficiente para realizar esta aposta", 
                currentBalance: user.balance,
                currentBonusBalance: bonusBalance,
                requiredAmount: validatedData.amount 
              });
            }
          } else {
            // Sistema não permite apostas com bônus
            return res.status(400).json({ 
              message: "Saldo insuficiente para realizar esta aposta", 
              currentBalance: user.balance,
              requiredAmount: validatedData.amount 
            });
          }
        } else {
          // Definir explicitamente que não usará saldo de bônus
          validatedData.useBonusBalance = false;
        }
      }
      
      // Verify the draw exists and is pending
      const draw = await storage.getDraw(validatedData.drawId);
      if (!draw) {
        console.log(`Draw not found: ${validatedData.drawId}`);
        return res.status(404).json({ message: "Sorteio não encontrado" });
      }
      
      if (draw.status !== "pending") {
        console.log(`Draw not pending: ${draw.status}`);
        return res.status(400).json({ message: "Este sorteio não está mais aceitando apostas" });
      }
      
      const now = new Date();
      if (new Date(draw.date) < now) {
        console.log(`Draw already started: ${draw.date} < ${now}`);
        return res.status(400).json({ message: "Este sorteio já começou" });
      }
      
      // Verify animals exist based on bet type
      console.log(`Validating animals for bet type: ${validatedData.type}`);
      
      // Verificando tipos de apostas por grupo (animal)
      if (["group"].includes(validatedData.type)) {
        // Grupo (1 animal)
        console.log("Validando aposta por grupo com body:", req.body);
        
        // Verificar todos os possíveis campos onde o número pode estar
        if (req.body.numbers) {
          console.log(`Encontrado 'numbers' no corpo: ${req.body.numbers}`);
          // Converter para betNumbers para processamento
          if (!validatedData.betNumbers) validatedData.betNumbers = [];
          validatedData.betNumbers.push(req.body.numbers);
        }
        
        // Verificar se temos animalId ou betNumbers (apostas numéricas interpretadas como animais)
        if (!validatedData.animalId && (!validatedData.betNumbers || !validatedData.betNumbers.length)) {
          return res.status(400).json({ message: "Animal ou número é obrigatório para apostas de grupo" });
        }
        
        // Se temos animalId, validar que o animal existe
        if (validatedData.animalId) {
          const animal = await storage.getAnimal(validatedData.animalId);
          if (!animal) {
            console.log(`Animal not found: ${validatedData.animalId}`);
            return res.status(404).json({ message: "Animal não encontrado" });
          }
          console.log(`Animal found for GROUP bet: ${animal.name} (${animal.group})`);
        }
        // Se temos betNumbers, vamos usar esses números para representar o grupo
        else if (validatedData.betNumbers && validatedData.betNumbers.length > 0) {
          console.log(`Using numeric input for GROUP bet: ${validatedData.betNumbers.join(', ')}`);
          // Não precisamos validar mais nada aqui, os números serão processados posteriormente
        }
      } 
      // Verificando tipos que requerem 2 animais
      else if (["duque_grupo", "passe_ida", "passe_ida_volta"].includes(validatedData.type)) {
        // Requer 2 animais (principal + secundário)
        if (!validatedData.animalId || !validatedData.animalId2) {
          return res.status(400).json({ message: "Dois animais são obrigatórios para este tipo de aposta" });
        }
        
        // Verificar primeiro animal
        const animal1 = await storage.getAnimal(validatedData.animalId);
        if (!animal1) {
          console.log(`First animal not found: ${validatedData.animalId}`);
          return res.status(404).json({ message: "Primeiro animal não encontrado" });
        }
        
        // Verificar segundo animal
        const animal2 = await storage.getAnimal(validatedData.animalId2);
        if (!animal2) {
          console.log(`Second animal not found: ${validatedData.animalId2}`);
          return res.status(404).json({ message: "Segundo animal não encontrado" });
        }
        
        console.log(`2 animals found for ${validatedData.type} bet: ${animal1.name} and ${animal2.name}`);
      }
      // Verificando tipos que requerem 3 animais
      else if (["terno_grupo"].includes(validatedData.type)) {
        // Requer 3 animais
        if (!validatedData.animalId || !validatedData.animalId2 || !validatedData.animalId3) {
          return res.status(400).json({ message: "Três animais são obrigatórios para este tipo de aposta" });
        }
        
        // Verificar todos os animais
        const animalIds = [validatedData.animalId, validatedData.animalId2, validatedData.animalId3];
        for (const id of animalIds) {
          const animal = await storage.getAnimal(id);
          if (!animal) {
            console.log(`Animal not found: ${id}`);
            return res.status(404).json({ message: `Animal com ID ${id} não encontrado` });
          }
        }
        
        console.log(`3 animals validated for terno_grupo bet`);
      }
      // Verificando tipos que requerem 4 animais
      else if (["quadra_duque"].includes(validatedData.type)) {
        // Requer 4 animais
        if (!validatedData.animalId || !validatedData.animalId2 || 
            !validatedData.animalId3 || !validatedData.animalId4) {
          return res.status(400).json({ message: "Quatro animais são obrigatórios para este tipo de aposta" });
        }
        
        // Verificar todos os animais
        const animalIds = [
          validatedData.animalId, 
          validatedData.animalId2, 
          validatedData.animalId3,
          validatedData.animalId4
        ];
        
        for (const id of animalIds) {
          const animal = await storage.getAnimal(id);
          if (!animal) {
            console.log(`Animal not found: ${id}`);
            return res.status(404).json({ message: `Animal com ID ${id} não encontrado` });
          }
        }
        
        console.log(`4 animals validated for quadra_duque bet`);
      }
      // Verificando tipos que requerem 5 animais
      else if (["quina_grupo"].includes(validatedData.type)) {
        // Requer 5 animais
        if (!validatedData.animalId || !validatedData.animalId2 || 
            !validatedData.animalId3 || !validatedData.animalId4 || 
            !validatedData.animalId5) {
          return res.status(400).json({ message: "Cinco animais são obrigatórios para este tipo de aposta" });
        }
        
        // Verificar todos os animais
        const animalIds = [
          validatedData.animalId, 
          validatedData.animalId2, 
          validatedData.animalId3,
          validatedData.animalId4,
          validatedData.animalId5
        ];
        
        for (const id of animalIds) {
          const animal = await storage.getAnimal(id);
          if (!animal) {
            console.log(`Animal not found: ${id}`);
            return res.status(404).json({ message: `Animal com ID ${id} não encontrado` });
          }
        }
        
        console.log(`5 animals validated for quina_grupo bet`);
      }
      // Verificando apostas baseadas em números (dezena, centena, milhar)
      else if (["dozen", "hundred", "thousand"].includes(validatedData.type)) {
        // Para apostas baseadas em números, verificar se os números existem
        console.log("Validando aposta numérica com body:", req.body);
        
        // Verificar todos os possíveis campos onde o número pode estar
        if (req.body.betNumber) {
          console.log(`Encontrado betNumber no corpo da requisição: ${req.body.betNumber}`);
          if (!validatedData.betNumbers) validatedData.betNumbers = [];
          validatedData.betNumbers.push(String(req.body.betNumber));
        }
        
        if (req.body.numbers) {
          console.log(`Encontrado campo numbers no corpo da requisição: ${req.body.numbers}`);
          if (!validatedData.betNumbers) validatedData.betNumbers = [];
          validatedData.betNumbers.push(String(req.body.numbers));
        }
        
        // Verificação final de betNumbers
        if (!validatedData.betNumbers || !validatedData.betNumbers.length) {
          return res.status(400).json({ message: "Números da aposta são obrigatórios para este tipo de aposta" });
        }
        
        // FORÇAR o ID correto da modalidade baseado no tipo independente do que foi enviado
        let expectedLength = 0;
        
        if (validatedData.type === "dozen") {
          expectedLength = 2;
          validatedData.gameModeId = 4; // Força para Dezena
          console.log("FORÇANDO gameModeId para 4 (Dezena)");
        }
        else if (validatedData.type === "hundred") {
          expectedLength = 3;
          validatedData.gameModeId = 2; // Força para Centena
          console.log("FORÇANDO gameModeId para 2 (Centena)");
        }
        else if (validatedData.type === "thousand") {
          expectedLength = 4;
          validatedData.gameModeId = 1; // Força para Milhar
          console.log("FORÇANDO gameModeId para 1 (Milhar)");
        }
        
        // Apenas garantimos que sejam valores numéricos sem adicionar zeros ou truncar
        validatedData.betNumbers = validatedData.betNumbers.map(num => {
          // Garantir que é uma string e remover espaços
          let cleanNum = String(num).trim();
          
          // Remover caracteres não numéricos
          cleanNum = cleanNum.replace(/\D/g, '');
          
          return cleanNum;
        });
        
        console.log(`Números formatados após processamento: ${validatedData.betNumbers.join(', ')}`);
        
        // Verificação rigorosa do formato dos números com base no tipo de aposta
        // Em vez de ajustar automaticamente, exigimos que o formato seja exatamente o esperado
        
        // Verificar se cada número têm exatamente o tamanho correto para o tipo de aposta
        for (const num of validatedData.betNumbers) {
          // Definições específicas de cada tipo
          const tipoAposta = validatedData.type === 'dozen' ? 'dezena' : 
                            validatedData.type === 'hundred' ? 'centena' : 'milhar';
          
          // Validação rigorosa: o número DEVE ter exatamente o tamanho esperado
          if (num.length !== expectedLength) {
            // Mensagem mais amigável para o usuário
            return res.status(400).json({
              message: `Para apostar na ${tipoAposta}, você deve digitar exatamente ${expectedLength} números. Por favor, tente novamente.`,
              expectedLength: expectedLength,
              receivedLength: num.length,
              receivedValue: num
            });
          }
          
          // Verificar se contém apenas dígitos numéricos
          if (!/^\d+$/.test(num)) {
            return res.status(400).json({
              message: `O número da aposta deve conter apenas dígitos (0-9). Valor recebido: "${num}"`
            });
          }
        }
        
        // Se chegou aqui, todos os números estão corretos e não precisam de ajustes
        console.log(`Números formatados corretamente: ${validatedData.betNumbers.join(', ')}`);
        
        // Log do tipo de aposta e números
        console.log(`Number-based bet: ${validatedData.type} - ${validatedData.betNumbers.join(', ')}`);
      }
      // Verificar outros tipos de apostas (dezena duque, dezena terno)
      else if (["duque_dezena"].includes(validatedData.type)) {
        console.log("Validando aposta de duque dezena com body:", req.body);
        
        // Verificar todos os possíveis campos onde os números podem estar
        if (req.body.numbers) {
          // Tentar extrair múltiplas dezenas de uma string separada por vírgula, traço ou espaço
          const extractedNumbers = req.body.numbers.split(/[,\s\-]+/).filter((n: string) => n.trim().length > 0);
          console.log(`Extraídos números de 'numbers': ${extractedNumbers.join(', ')}`);
          
          if (extractedNumbers.length > 0) {
            if (!validatedData.betNumbers) validatedData.betNumbers = [];
            validatedData.betNumbers = validatedData.betNumbers.concat(extractedNumbers);
          }
        }
        
        // Requer 2 dezenas
        if (!validatedData.betNumbers || validatedData.betNumbers.length !== 2) {
          return res.status(400).json({ message: "Duas dezenas são obrigatórias para apostas de duque de dezena" });
        }
        
        // Formatar e validar cada dezena (2 dígitos) sem preenchimento automático
        validatedData.betNumbers = validatedData.betNumbers.map(num => {
          let cleaned = num.replace(/\D/g, '');
          // Não adicionamos mais zeros à esquerda, exigimos digitação completa
          if (cleaned.length !== 2) {
            console.log(`Dezena inválida para duque: ${cleaned} (deve ter exatamente 2 dígitos)`);
            // A validação acontecerá logo em seguida
          }
          return cleaned;
        });
        
        console.log(`Dezenas para duque: ${validatedData.betNumbers.join(', ')}`);
        
        // Validação final
        if (validatedData.betNumbers.some(n => n.length !== 2)) {
          return res.status(400).json({ message: "Apostas de duque de dezena devem ter dezenas com 2 dígitos" });
        }
        
        console.log(`Duque dezena bet: ${validatedData.betNumbers.join(', ')}`);
      }
      else if (["terno_dezena"].includes(validatedData.type)) {
        console.log("Validando aposta de terno dezena com body:", req.body);
        
        // Verificar todos os possíveis campos onde os números podem estar
        if (req.body.numbers) {
          // Tentar extrair múltiplas dezenas de uma string separada por vírgula, traço ou espaço
          const extractedNumbers = req.body.numbers.split(/[,\s\-]+/).filter((n: string) => n.trim().length > 0);
          console.log(`Extraídos números de 'numbers': ${extractedNumbers.join(', ')}`);
          
          if (extractedNumbers.length > 0) {
            if (!validatedData.betNumbers) validatedData.betNumbers = [];
            validatedData.betNumbers = validatedData.betNumbers.concat(extractedNumbers);
          }
        }
        
        // Requer 3 dezenas
        if (!validatedData.betNumbers || validatedData.betNumbers.length !== 3) {
          return res.status(400).json({ message: "Três dezenas são obrigatórias para apostas de terno de dezena" });
        }
        
        // Formatar e validar cada dezena (2 dígitos) sem preenchimento automático
        validatedData.betNumbers = validatedData.betNumbers.map(num => {
          let cleaned = num.replace(/\D/g, '');
          // Não adicionamos mais zeros à esquerda, exigimos digitação completa
          if (cleaned.length !== 2) {
            console.log(`Dezena inválida para terno: ${cleaned} (deve ter exatamente 2 dígitos)`);
            // A validação acontecerá logo em seguida
          }
          return cleaned;
        });
        
        console.log(`Dezenas para terno: ${validatedData.betNumbers.join(', ')}`);
        
        // Validação final
        if (validatedData.betNumbers.some(n => n.length !== 2)) {
          return res.status(400).json({ message: "Apostas de terno de dezena devem ter dezenas com 2 dígitos" });
        }
        
        console.log(`Terno dezena bet: ${validatedData.betNumbers.join(', ')}`);
      }
      else {
        return res.status(400).json({ message: `Tipo de aposta inválido: ${validatedData.type}` });
      }
      
      // Verify game mode if provided
      if (validatedData.gameModeId) {
        console.log(`========= VERIFICANDO MODALIDADE =========`);
        console.log(`Tipo de aposta: ${validatedData.type}`);
        console.log(`GameModeID: ${validatedData.gameModeId}`);
        console.log(`Números: ${validatedData.betNumbers?.join(', ') || 'nenhum'}`);
        console.log(`=========================================`);
        const gameMode = await storage.getGameMode(validatedData.gameModeId);
        if (!gameMode) {
          console.log(`Game mode not found: ${validatedData.gameModeId}`);
          return res.status(404).json({ message: "Modalidade de jogo não encontrada" });
        }
        
        console.log(`Game mode found: ${gameMode.name}, active: ${gameMode.active}`);
        if (!gameMode.active) {
          return res.status(400).json({ message: "Esta modalidade de jogo não está ativa no momento" });
        }
        
        // Verificação rigorosa para garantir que o modo de jogo é compatível com o tipo de aposta
        // Cria um mapeamento entre tipos de apostas e os IDs de game modes permitidos
        interface GameModeMap {
          thousand: number[];
          hundred: number[];
          dozen: number[];
          [key: string]: number[];
        }
        
        const allowedGameModes: GameModeMap = {
          "thousand": [1], // ID 1 = Milhar
          "hundred": [2],  // ID 2 = Centena
          "dozen": [4]     // ID 4 = Dezena
        };
        
        // Verifica se o tipo de aposta existe no mapeamento
        if (validatedData.type in allowedGameModes) {
          // Verifica se o gameMode.id está na lista de modos permitidos para este tipo
          if (!allowedGameModes[validatedData.type].includes(gameMode.id)) {
            console.log(`Invalid game mode for bet type. Type: ${validatedData.type}, GameMode ID: ${gameMode.id}, Allowed: ${allowedGameModes[validatedData.type].join(',')}`);
            
            // Determinar qual modalidade deveria ser usada
            let suggestedGameMode = "";
            if (validatedData.type === "thousand") suggestedGameMode = "Milhar";
            else if (validatedData.type === "hundred") suggestedGameMode = "Centena";
            else if (validatedData.type === "dozen") suggestedGameMode = "Dezena";
            
            return res.status(400).json({ 
              message: `Tipo de aposta "${validatedData.type}" é incompatível com a modalidade "${gameMode.name}". Use a modalidade "${suggestedGameMode}".`,
              gameModeSuggestion: suggestedGameMode,
              currentGameMode: gameMode.name
            });
          }
        }
        
        // Calcular o valor potencial de ganho usando a fórmula padrão
        // 1. Aplicar divisor caso seja aposta em todos os prêmios (1-5)
        const oddsDivisor = validatedData.premioType === "1-5" ? 5 : 1;
        const adjustedOdds = gameMode.odds / oddsDivisor;
        
        // 2. Calcular usando a fórmula padrão: multiplicar valor da aposta pelo multiplicador ajustado
        // Esta fórmula DEVE ser idêntica à usada nos componentes do cliente
        const calculatedWinAmount = Math.floor(validatedData.amount * adjustedOdds);
        
        console.log(`Cálculo de potencial de ganho no servidor:`, {
          gameMode: gameMode.name,
          originalOdds: gameMode.odds,
          premioType: validatedData.premioType,
          oddsDivisor,
          adjustedOdds,
          amount: validatedData.amount,
          calculatedWinAmount,
          providedWinAmount: validatedData.potentialWinAmount
        });
        
        // Verificar limite de premiação máxima
        if (systemSettings && systemSettings.maxPayout && calculatedWinAmount > systemSettings.maxPayout) {
          console.log(`Potential win amount exceeds maximum allowed: ${calculatedWinAmount} > ${systemSettings.maxPayout}`);
          // Calcular o valor máximo de aposta permitido com valores reais
          const maxBetAllowed = systemSettings.maxPayout / gameMode.odds;
          return res.status(400).json({ 
            message: `A premiação máxima permitida é de R$ ${systemSettings.maxPayout}`,
            calculatedPayout: calculatedWinAmount,
            maxAllowed: systemSettings.maxPayout,
            suggestion: `Reduza o valor da aposta para no máximo R$ ${maxBetAllowed.toFixed(2).replace('.', ',')}`
          });
        }
        
        // Verify the potential win amount if provided
        if (validatedData.potentialWinAmount) {
          // Allow a small difference due to floating point arithmetic
          if (Math.abs(calculatedWinAmount - validatedData.potentialWinAmount) > 1) {
            console.log(`Adjusting potential win amount from ${validatedData.potentialWinAmount} to ${calculatedWinAmount}`);
            validatedData.potentialWinAmount = calculatedWinAmount;
          }
        } else {
          // Calculate potential win amount if not provided
          console.log(`Setting potential win amount to ${calculatedWinAmount}`);
          validatedData.potentialWinAmount = calculatedWinAmount;
        }
      }
      
      console.log(`Deducting ${validatedData.amount} from user balance`);
      // Verificar se o usuário tem um bônus ativo
      const activeBonus = await storage.getUserActiveBonus(userId);
      
      if (activeBonus) {
        console.log(`Usuário ${userId} tem bônus ativo: ${activeBonus.type}, valor restante: ${activeBonus.remainingAmount}, progresso de rollover: ${activeBonus.rolledAmount}/${activeBonus.rolloverAmount}`);
        
        // Atualizar o progresso do rollover (sempre atualiza independente se está usando saldo de bônus ou não)
        await storage.updateUserBonusProgress(activeBonus.id, validatedData.amount);
        console.log(`Progresso de rollover atualizado para bônus ${activeBonus.id}`);
      }
      
      // Deduct the bet amount from the appropriate balance
      if (validatedData.useBonusBalance) {
        console.log(`Deduzindo ${validatedData.amount} do saldo de bônus`);
        // Debitar do saldo de bônus
        const bonusesUsed = await storage.deductFromBonusBalance(userId, validatedData.amount);
        console.log(`Saldo de bônus deduzido: ${bonusesUsed.map(b => `ID ${b.id}: ${b.amountUsed}`).join(', ')}`);
      } else {
        console.log(`Deduzindo ${validatedData.amount} do saldo real`);
        // Debitar do saldo normal
        await storage.updateUserBalance(userId, -validatedData.amount);
      }
      
      console.log("Creating bet in the database");
      // Create the bet
      const bet = await storage.createBet(validatedData);
      
      // Registrar a transação
      await storage.createTransaction({
        userId,
        type: "bet",
        amount: -validatedData.amount, // valor negativo para indicar saída
        description: `Aposta em ${bet.type} - ${bet.id}`,
        relatedId: bet.id
      });
      
      console.log("Bet created successfully:", bet);
      res.status(201).json(bet);
    } catch (error) {
      console.error("Error creating bet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados da aposta inválidos", errors: error.errors });
      }
      res.status(500).json({ message: "Erro ao criar aposta", error: String(error) });
    }
  });

  // Get user total winnings
  app.get("/api/user/winnings", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Buscar soma de todos os ganhos usando SQL
      const result = await db.execute(
        sql`SELECT COALESCE(SUM(win_amount), 0) as total_winnings 
            FROM bets 
            WHERE user_id = ${userId} AND status = 'won'`
      );
      
      // Obter o valor total dos ganhos da primeira linha do resultado
      const totalWinnings = parseFloat(result.rows[0]?.total_winnings || '0');
      
      console.log(`Total de ganhos do usuário ${userId}: R$ ${totalWinnings.toFixed(2)}`);
      
      res.json({ totalWinnings });
    } catch (error) {
      console.error("Erro ao calcular ganhos totais:", error);
      res.status(500).json({ message: "Erro ao calcular ganhos" });
    }
  });

  // Get user bets
  /**
   * Obter todas as apostas do usuário autenticado com isolamento completo de dados
   * Implementa múltiplas camadas de proteção contra vazamento de dados entre usuários
   */
  app.get("/api/bets", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const username = req.user!.username;
      console.log(`REQUISIÇÃO: Usuário ${username} (${userId}) solicitando suas apostas`);
      
      // Extrair parâmetros de paginação e ordenação
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc'; // default to desc (newest first)
      
      // MÉTODO 1: Buscar diretamente do banco de dados com filtro de userId
      // Isso garante que a consulta SQL já aplica filtro de dados no nível mais baixo
      console.log(`SEGURANÇA: Consultando apostas do usuário ${userId} diretamente no banco de dados com filtragem`);
      const userBetsFromDb = await db
        .select()
        .from(bets)
        .where(eq(bets.userId, userId))
        .orderBy(sortOrder === 'desc' ? desc(bets.createdAt) : asc(bets.createdAt));
      
      console.log(`BANCO: Consulta retornou ${userBetsFromDb.length} apostas para usuário ${userId}`);
      
      // MÉTODO 2: Usar o serviço de storage com verificações extras
      // Isso garante uma verificação redundante através de outra camada
      const betsFromStorage = await storage.getBetsByUserId(userId);
      console.log(`STORAGE: Serviço retornou ${betsFromStorage.length} apostas para usuário ${userId}`);
      
      // MÉTODO 3: Verificação cruzada entre os resultados para detectar inconsistências
      // Comparamos apenas os IDs para identificar possíveis discrepâncias entre as fontes
      const dbBetIds = new Set(userBetsFromDb.map(bet => bet.id));
      const storageBetIds = new Set(betsFromStorage.map(bet => bet.id));
      
      // Verificar inconsistências (apostas que estão em um método mas não no outro)
      const onlyInDb = Array.from(dbBetIds).filter(id => !storageBetIds.has(id));
      const onlyInStorage = Array.from(storageBetIds).filter(id => !dbBetIds.has(id));
      
      if (onlyInDb.length > 0 || onlyInStorage.length > 0) {
        console.error(`ALERTA DE SEGURANÇA: Inconsistência na recuperação de apostas para usuário ${userId}!
          Apostas apenas no banco: ${onlyInDb.join(', ')}
          Apostas apenas no storage: ${onlyInStorage.join(', ')}
        `);
      }
      
      // MÉTODO 4: Filtro final de segurança aplicado aos resultados do banco de dados
      // Garantimos que apenas as apostas do usuário são retornadas, mesmo que haja falha nas camadas anteriores
      const userBets = userBetsFromDb.filter(bet => bet.userId === userId);
      
      // Verificar se o filtro final removeu alguma aposta (indicando falha nas camadas anteriores)
      if (userBets.length !== userBetsFromDb.length) {
        console.error(`VIOLAÇÃO DE SEGURANÇA CRÍTICA: Encontradas ${userBetsFromDb.length - userBets.length} apostas 
          de outros usuários no resultado após filtragem por SQL! 
          Usuário: ${username} (${userId})
          Apostas removidas: ${userBetsFromDb
            .filter(bet => bet.userId !== userId)
            .map(bet => `ID ${bet.id} (user ${bet.userId})`)
            .join(', ')}
        `);
      } 
      else {
        console.log(`VERIFICAÇÃO FINAL: Todas as ${userBets.length} apostas pertencem ao usuário ${userId}`);
      }
      
      // OTIMIZAÇÃO: Agora que a nossa função storage.getBetsByUserId está otimizada e segura, 
      // vamos usá-la diretamente para obter os detalhes das apostas
      // Isso evita ter que fazer consultas individuais para cada aposta e melhora muito a performance
      const betsWithDetails = betsFromStorage;
      
      // Aplicar paginação manual aos resultados
      const totalItems = betsWithDetails.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, totalItems);
      
      // Pegar apenas os itens da página atual
      const paginatedItems = betsWithDetails.slice(startIndex, endIndex);
      
      console.log(`RESPOSTA: Enviando ${paginatedItems.length} apostas para usuário ${username} (${userId}), página ${page} de ${totalPages}`);
      
      // Resposta formatada com metadados de paginação
      res.json({
        data: paginatedItems,
        meta: {
          total: totalItems,
          page,
          pageSize,
          totalPages
        }
      });
    } catch (error) {
      console.error(`ERRO: Falha ao buscar apostas para usuário ${req.user!.id}:`, error);
      res.status(500).json({ message: "Erro ao buscar apostas" });
    }
  });
  
  // Get specific bet by ID
  app.get("/api/bets/:id", requireOwnership('bet'), async (req, res) => {
    try {
      // O middleware requireOwnership já verificou que a aposta existe
      // e pertence ao usuário autenticado, e a armazenou em req.resource
      res.json((req as any).resource);
    } catch (error) {
      console.error("Error fetching bet:", error);
      res.status(500).json({ message: "Error fetching bet" });
    }
  });
  
  // Change user password
  app.post("/api/user/change-password", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;
      
      // Verifica se a senha atual está correta
      const user = await storage.getUserByUsername(req.user!.username);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Verifica se o usuário está tentando alterar sua própria senha (segurança adicional)
      if (user.id !== userId) {
        console.log(`Security: User ${userId} attempted to change password for user ${user.id}`);
        return res.status(403).json({ message: "Acesso negado: você só pode alterar sua própria senha" });
      }
      
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }
      
      // Atualiza a senha
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      res.status(200).json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      res.status(500).json({ message: "Erro ao alterar senha" });
    }
  });

  // Atualizar a chave PIX padrão do usuário
  app.put("/api/user/pix-key", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { pixKey, pixKeyType } = req.body;
      
      // Validação básica
      if (!pixKey || !pixKeyType) {
        return res.status(400).json({ message: "Chave PIX e tipo são obrigatórios" });
      }
      
      // Validação do tipo de chave PIX
      const validTypes = ["cpf", "email", "phone", "random"];
      if (!validTypes.includes(pixKeyType)) {
        return res.status(400).json({ message: "Tipo de chave PIX inválido" });
      }
      
      // Validação específica para cada tipo de chave
      if (pixKeyType === "cpf" && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/.test(pixKey)) {
        return res.status(400).json({ message: "Formato de CPF inválido" });
      }
      
      if (pixKeyType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixKey)) {
        return res.status(400).json({ message: "Formato de e-mail inválido" });
      }
      
      if (pixKeyType === "phone" && !/^(\+\d{2})?\s*(\(\d{2}\))?\s*\d{4,5}-?\d{4}$/.test(pixKey)) {
        return res.status(400).json({ message: "Formato de telefone inválido" });
      }
      
      // Atualizar o email do usuário como chave PIX
      console.log(`Atualizando email do usuário ${userId} para uso como chave PIX: ${pixKey}`);
      const updatedUser = await storage.updateUser(userId, {
        email: pixKey
      });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Erro ao atualizar chave PIX" });
      }
      
      res.status(200).json({ 
        message: "Chave PIX atualizada com sucesso",
        pixKey,
        pixKeyType
      });
    } catch (error) {
      console.error("Erro ao atualizar chave PIX:", error);
      res.status(500).json({ message: "Erro ao atualizar chave PIX" });
    }
  });

  // Update user balance (for deposits and withdrawals)
  app.post("/api/users/balance", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { amount, type } = req.body;
      
      if (!amount || typeof amount !== 'number' || !['deposit', 'withdraw'].includes(type)) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      
      // Adicionar logs detalhados para depuração
      console.log(`Request for ${type} operation with amount ${amount}`);
      
      // Verificar configurações do sistema para depósitos e saques
      const systemSettings = await storage.getSystemSettings();
      console.log("System settings:", JSON.stringify(systemSettings, null, 2));
      
      // Verificar explicitamente o valor de allowWithdrawals
      if (type === 'withdraw') {
        console.log(`Withdraw operation attempted. allowWithdrawals = ${systemSettings?.allowWithdrawals}`);
        
        // Se for um saque e saques estão desativados
        if (systemSettings && systemSettings.allowWithdrawals === false) {
          console.log("Withdrawals are disabled in system settings. Blocking operation.");
          return res.status(403).json({ message: "Saques estão temporariamente desativados" });
        }
      }
      
      // Verificar explicitamente o valor de allowDeposits
      if (type === 'deposit') {
        console.log(`Deposit operation attempted. allowDeposits = ${systemSettings?.allowDeposits}`);
        
        // Se for um depósito e depósitos estão desativados
        if (systemSettings && systemSettings.allowDeposits === false) {
          console.log("Deposits are disabled in system settings. Blocking operation.");
          return res.status(403).json({ message: "Depósitos estão temporariamente desativados" });
        }
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (type === 'withdraw' && user.balance < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      
      const finalAmount = type === 'deposit' ? amount : -amount;
      console.log(`Proceeding with ${type} operation, updating balance by ${finalAmount}`);
      const updatedUser = await storage.updateUserBalance(userId, finalAmount);
      
      // Remover senha antes de retornar ao cliente
      if (updatedUser) {
        const { password, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
      } else {
        res.status(500).json({ message: "Error updating balance" });
      }
    } catch (error) {
      console.error("Error updating balance:", error);
      res.status(500).json({ message: "Error updating balance" });
    }
  });

  // Admin routes
  
  // Get all users (admin only)
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      // Buscar usuários com saldo de bônus incluído
      const usersQuery = await pool.query(`
        SELECT u.*, COALESCE(ub.bonus_balance, 0) as bonus_balance,
               COALESCE(u.blocked, false) as blocked,
               u.block_reason
        FROM users u
        LEFT JOIN (
          SELECT user_id, SUM(remaining_amount) as bonus_balance
          FROM user_bonuses 
          WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
          GROUP BY user_id
        ) ub ON u.id = ub.user_id
        ORDER BY u.created_at DESC
      `);
      
      // Remover informações sensíveis (senha) antes de retornar
      const sanitizedUsers = usersQuery.rows.map(user => {
        const { password, ...userWithoutPassword } = user;
        return {
          ...userWithoutPassword,
          bonusBalance: parseFloat(user.bonus_balance) || 0,
          blocked: user.blocked || false
        };
      });
      
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("Error fetching users with bonus balance:", error);
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // Get all bets (admin only) with pagination
  app.get("/api/admin/bets", requireAdmin, async (req, res) => {
    try {
      console.log("Admin fetching bets with pagination");
      
      // Extract pagination and filter parameters
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const status = (req.query.status as string) || null;
      const search = (req.query.search as string) || null;
      const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc'; // default to desc (newest first)
      
      // Calculate offset for SQL query
      const offset = (page - 1) * pageSize;
      
      // Get paginated bets with total count
      const { bets, total } = await storage.getPaginatedBets({
        page,
        pageSize,
        status,
        search,
        sortOrder,
      });
      
      console.log(`Found ${bets.length} bets for page ${page} (offset: ${offset}, pageSize: ${pageSize})`);
      console.log(`Total bets matching criteria: ${total}`);
      
      // Filtrando informações sensíveis antes de retornar
      const sanitizedBets = bets.map(bet => ({
        ...bet,
        // Removendo informações sensíveis do usuário
        userId: bet.userId, // Mantendo apenas o ID do usuário
        user: null // Removendo objeto de usuário, se houver
      }));
      
      // Return both the paginated bets and metadata
      res.json({
        data: sanitizedBets,
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (error) {
      console.error("Error in GET /api/admin/bets:", error);
      res.status(500).json({ message: "Error fetching bets", error: String(error) });
    }
  });

  // Get popular animals/groups (admin only)
  app.get("/api/admin/stats/popular", requireAdmin, async (req, res) => {
    try {
      const popularAnimals = await storage.getPopularAnimals();
      res.json(popularAnimals);
    } catch (error) {
      res.status(500).json({ message: "Error fetching popular animals" });
    }
  });

  // Create user (admin only)
  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validatedData);
      
      // Remover senha antes de retornar
      if (user) {
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      } else {
        res.status(500).json({ message: "Error creating user" });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating user" });
    }
  });

  // Update user (admin only)
  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update user
      const updatedUser = await storage.updateUser(userId, req.body);
      
      // Remover senha antes de retornar
      if (updatedUser) {
        const { password, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
      } else {
        res.status(500).json({ message: "Error updating user" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error updating user" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      
      // Validate user exists and is not admin
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.isAdmin) {
        return res.status(400).json({ message: "Cannot delete admin user" });
      }
      
      // Delete user
      await storage.deleteUser(userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  // Update user balance (admin only)
  app.post("/api/admin/users/:id/balance", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { amount } = req.body;
      
      if (typeof amount !== 'number') {
        return res.status(400).json({ message: "Invalid amount" });
      }
      
      // Validate user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update balance
      const updatedUser = await storage.updateUserBalance(userId, amount);
      
      // Remover senha antes de retornar
      if (updatedUser) {
        const { password, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
      } else {
        res.status(500).json({ message: "Error updating user balance" });
      }
    } catch (error) {
      res.status(500).json({ message: "Error updating user balance" });
    }
  });
  
  // API para obter o saldo de bônus de um usuário (admin)
  app.get("/api/admin/users/:id/bonus-balance", requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "ID de usuário inválido" });
      }

      const bonusBalance = await storage.getUserBonusBalance(userId);
      return res.status(200).json({ bonusBalance });
    } catch (error) {
      console.error("Erro ao obter saldo de bônus:", error);
      return res.status(500).json({ message: "Erro ao obter saldo de bônus" });
    }
  });
  
  // API para obter o saldo de bônus do usuário atual
  // ROTA DESATIVADA - USANDO A IMPLEMENTAÇÃO MAIS ABAIXO
  // app.get("/api/user/bonus-balance", requireAuth, async (req, res) => {
  //   try {
  //     if (!req.user) {
  //       return res.status(401).json({ message: "Usuário não autenticado" });
  //     }
  //     
  //     const bonusBalance = await storage.getUserBonusBalance(req.user.id);
  //     return res.status(200).json({ bonusBalance });
  //   } catch (error) {
  //     console.error("Erro ao obter saldo de bônus:", error);
  //     return res.status(500).json({ message: "Erro ao obter saldo de bônus" });
  //   }
  // });

  // Game Mode Routes

  // Get all game modes
  app.get("/api/game-modes", async (req, res) => {
    try {
      const gameModes = await storage.getAllGameModes();
      res.json(gameModes);
    } catch (error) {
      res.status(500).json({ message: "Error fetching game modes" });
    }
  });

  // Get game mode by ID
  app.get("/api/game-modes/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const gameMode = await storage.getGameMode(id);
      
      if (!gameMode) {
        return res.status(404).json({ message: "Game mode not found" });
      }
      
      res.json(gameMode);
    } catch (error) {
      res.status(500).json({ message: "Error fetching game mode" });
    }
  });

  // Create game mode (admin only)
  app.post("/api/game-modes", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertGameModeSchema.parse(req.body);
      
      // Check if a game mode with the same name already exists
      const existing = await storage.getGameModeByName(validatedData.name);
      if (existing) {
        return res.status(400).json({ message: "A game mode with this name already exists" });
      }
      
      const gameMode = await storage.createGameMode(validatedData);
      res.status(201).json(gameMode);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid game mode data", errors: error.errors });
      }
      res.status(500).json({ message: "Error creating game mode" });
    }
  });

  // Update game mode (admin only)
  app.put("/api/game-modes/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      // Validate game mode exists
      const gameMode = await storage.getGameMode(id);
      if (!gameMode) {
        return res.status(404).json({ message: "Game mode not found" });
      }
      
      // Check if name is being changed and if so, ensure no duplicates
      if (req.body.name && req.body.name !== gameMode.name) {
        const existing = await storage.getGameModeByName(req.body.name);
        if (existing) {
          return res.status(400).json({ message: "A game mode with this name already exists" });
        }
      }
      
      // Update game mode
      const updatedGameMode = await storage.updateGameMode(id, req.body);
      res.json(updatedGameMode);
    } catch (error) {
      res.status(500).json({ message: "Error updating game mode" });
    }
  });

  // Delete game mode (admin only)
  app.delete("/api/game-modes/:id", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      // Validate game mode exists
      const gameMode = await storage.getGameMode(id);
      if (!gameMode) {
        return res.status(404).json({ message: "Game mode not found" });
      }
      
      // Delete game mode
      await storage.deleteGameMode(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Error deleting game mode" });
    }
  });

  // System Settings Routes
  
  // Get system settings (admin only)
  // Endpoint PATCH para atualizar configurações do sistema (usado pelo bonus-settings.tsx)
  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      console.log("PATCH request to update system settings:", req.body);
      console.log("Valores de bônus recebidos:", {
        signupBonusEnabled: req.body.signupBonusEnabled,
        firstDepositBonusEnabled: req.body.firstDepositBonusEnabled
      });
      
      // Primeiro, buscar as configurações atuais
      const currentSettings = await storage.getSystemSettings();
      if (!currentSettings) {
        return res.status(404).json({ error: "System settings not found" });
      }
      
      // Mesclar as configurações atuais com as novas
      const mergedSettings = {
        ...currentSettings,
        ...req.body,
        // Garantir que os campos obrigatórios estejam presentes
        maxBetAmount: req.body.maxBetAmount || currentSettings.maxBetAmount,
        maxPayout: req.body.maxPayout || currentSettings.maxPayout,
        minBetAmount: req.body.minBetAmount || currentSettings.minBetAmount,
        defaultBetAmount: req.body.defaultBetAmount || currentSettings.defaultBetAmount,
        mainColor: req.body.mainColor || currentSettings.mainColor,
        secondaryColor: req.body.secondaryColor || currentSettings.secondaryColor,
        accentColor: req.body.accentColor || currentSettings.accentColor,
        
        // IMPORTANTE: Valores booleanos precisam ser verificados explicitamente como "!== undefined"
        // ou o valor false será substituído pelo valor padrão!
        
        // Adicionar explicitamente os campos de bônus com seus valores corretos da requisição
        // Configurações de bônus de cadastro
        signupBonusEnabled: req.body.signupBonusEnabled !== undefined ? Boolean(req.body.signupBonusEnabled) : Boolean(currentSettings.signupBonusEnabled),
        signupBonusAmount: req.body.signupBonusAmount !== undefined ? Number(req.body.signupBonusAmount) : Number(currentSettings.signupBonusAmount || 10),
        signupBonusRollover: req.body.signupBonusRollover !== undefined ? Number(req.body.signupBonusRollover) : Number(currentSettings.signupBonusRollover || 3),
        signupBonusExpiration: req.body.signupBonusExpiration !== undefined ? Number(req.body.signupBonusExpiration) : Number(currentSettings.signupBonusExpiration || 7),
        
        // Configurações de bônus de primeiro depósito
        firstDepositBonusEnabled: req.body.firstDepositBonusEnabled !== undefined ? Boolean(req.body.firstDepositBonusEnabled) : Boolean(currentSettings.firstDepositBonusEnabled),
        firstDepositBonusAmount: req.body.firstDepositBonusAmount !== undefined ? Number(req.body.firstDepositBonusAmount) : Number(currentSettings.firstDepositBonusAmount || 100),
        firstDepositBonusPercentage: req.body.firstDepositBonusPercentage !== undefined ? Number(req.body.firstDepositBonusPercentage) : Number(currentSettings.firstDepositBonusPercentage || 100),
        firstDepositBonusMaxAmount: req.body.firstDepositBonusMaxAmount !== undefined ? Number(req.body.firstDepositBonusMaxAmount) : Number(currentSettings.firstDepositBonusMaxAmount || 200),
        firstDepositBonusRollover: req.body.firstDepositBonusRollover !== undefined ? Number(req.body.firstDepositBonusRollover) : Number(currentSettings.firstDepositBonusRollover || 3),
        firstDepositBonusExpiration: req.body.firstDepositBonusExpiration !== undefined ? Number(req.body.firstDepositBonusExpiration) : Number(currentSettings.firstDepositBonusExpiration || 7),
        
        // Banners promocionais
        promotionalBannersEnabled: req.body.promotionalBannersEnabled !== undefined ? Boolean(req.body.promotionalBannersEnabled) : Boolean(currentSettings.promotionalBannersEnabled),
        signupBonusBannerEnabled: req.body.signupBonusBannerEnabled !== undefined ? Boolean(req.body.signupBonusBannerEnabled) : Boolean(currentSettings.signupBonusBannerEnabled),
        firstDepositBonusBannerEnabled: req.body.firstDepositBonusBannerEnabled !== undefined ? Boolean(req.body.firstDepositBonusBannerEnabled) : Boolean(currentSettings.firstDepositBonusBannerEnabled)
      };
      
      console.log("Merged settings to save:", mergedSettings);
      
      // Salvar as configurações mescladas
      const settings = await storage.saveSystemSettings(mergedSettings);
      return res.json(settings);
    } catch (error) {
      console.error("Error updating system settings:", error);
      return res.status(500).json({ error: "Failed to update system settings" });
    }
  });

  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      // Verificar se as colunas de branding e bônus existem
      try {
        const checkColumnsQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'system_settings' 
            AND column_name IN (
              'site_name', 'site_description', 'logo_url', 'favicon_url',
              'signup_bonus_enabled', 'signup_bonus_amount', 'signup_bonus_rollover', 'signup_bonus_expiration',
              'first_deposit_bonus_enabled', 'first_deposit_bonus_amount', 'first_deposit_bonus_percentage',
              'first_deposit_bonus_max_amount', 'first_deposit_bonus_rollover', 'first_deposit_bonus_expiration',
              'promotional_banners_enabled'
            )
        `;
        const columnResult = await pool.query(checkColumnsQuery);
        
        // Verificar quantas colunas devem existir
        const expectedColumns = 15; // 4 de branding + 11 de bônus
        
        // Se alguma coluna estiver faltando, adicione-as
        if (columnResult.rowCount < expectedColumns) {
          console.log('Atualizando esquema para adicionar colunas de branding e bônus...');
          
          // Primeiro adicionamos as colunas de branding se necessário
          const alterBrandingQuery = `
            ALTER TABLE system_settings 
            ADD COLUMN IF NOT EXISTS site_name TEXT NOT NULL DEFAULT 'Jogo do Bicho',
            ADD COLUMN IF NOT EXISTS site_description TEXT NOT NULL DEFAULT 'A melhor plataforma de apostas online',
            ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '/img/logo.png',
            ADD COLUMN IF NOT EXISTS favicon_url TEXT NOT NULL DEFAULT '/img/favicon.png'
          `;
          await pool.query(alterBrandingQuery);
          
          // Agora adicionamos as colunas de bônus
          const alterBonusQuery = `
            ALTER TABLE system_settings 
            ADD COLUMN IF NOT EXISTS signup_bonus_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS signup_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 10,
            ADD COLUMN IF NOT EXISTS signup_bonus_rollover NUMERIC(15,2) NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS signup_bonus_expiration INTEGER NOT NULL DEFAULT 7,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 100,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_percentage NUMERIC(15,2) NOT NULL DEFAULT 100,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_max_amount NUMERIC(15,2) NOT NULL DEFAULT 200,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_rollover NUMERIC(15,2) NOT NULL DEFAULT 3,
            ADD COLUMN IF NOT EXISTS first_deposit_bonus_expiration INTEGER NOT NULL DEFAULT 7,
            ADD COLUMN IF NOT EXISTS promotional_banners_enabled BOOLEAN NOT NULL DEFAULT false
          `;
          await pool.query(alterBonusQuery);
          
          console.log('✅ Esquema atualizado com sucesso com colunas de bônus!');
          
          // Exibir estrutura atualizada 
          const { rows } = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'system_settings'
            ORDER BY ordinal_position
          `);
          console.log('Estrutura atual da tabela:');
          rows.forEach(col => {
            console.log(`  - ${col.column_name} (${col.data_type})`);
          });
        }
      } catch (schemaError) {
        console.error('Erro ao verificar/atualizar schema:', schemaError);
      }
      
      // Check if settings exist in database, otherwise return defaults
      const settings = await storage.getSystemSettings();
      
      if (settings) {
        // Obter dados diretamente do banco para garantir que temos os novos campos
        const { rows } = await pool.query('SELECT * FROM system_settings WHERE id = 1');
        if (rows.length > 0) {
          const dbSettings = rows[0];
          
          // Adicionar os novos campos se existirem no banco
          if (dbSettings.site_name) settings.siteName = dbSettings.site_name;
          if (dbSettings.site_description) settings.siteDescription = dbSettings.site_description;
          if (dbSettings.logo_url) settings.logoUrl = dbSettings.logo_url;
          if (dbSettings.favicon_url) settings.faviconUrl = dbSettings.favicon_url;
        }
        
        // CORREÇÃO CRÍTICA: Garantir que as configurações de bônus sejam sempre retornadas
        console.log(`🔧 CORRIGINDO CONFIGURAÇÕES DE BÔNUS para /api/system-settings`);
        console.log(`✅ Bônus primeiro depósito habilitado: ${settings.firstDepositBonusEnabled}`);
        console.log(`✅ Percentual do bônus: ${settings.firstDepositBonusPercentage}%`);
        
        res.json(settings);
      } else {
        // Default values
        const defaultSettings = {
          maxBetAmount: 50,
          maxPayout: 500,
          minBetAmount: 0.5, // 0.50 reais (valor real)
          defaultBetAmount: 2, // 2.00 reais (valor real)
          mainColor: "#4f46e5",
          secondaryColor: "#6366f1",
          accentColor: "#f97316",
          allowUserRegistration: true,
          allowDeposits: true,
          allowWithdrawals: true,
          maintenanceMode: false,
          autoApproveWithdrawals: true, // Habilitar aprovação automática por padrão
          autoApproveWithdrawalLimit: 30, // Limite padrão de R$ 30,00
          siteName: "Jogo do Bicho",
          siteDescription: "A melhor plataforma de apostas online",
          logoUrl: "/img/logo.png",
          faviconUrl: "/img/favicon.png"
        };
        
        // Save default settings to database
        await storage.saveSystemSettings(defaultSettings);
        res.json(defaultSettings);
      }
    } catch (error) {
      console.error("Error fetching system settings:", error);
      res.status(500).json({ message: "Error fetching system settings" });
    }
  });
  
  // Endpoint para atualizar esquema do banco de dados (admin only)
  app.get("/api/admin/update-system-schema", requireAdmin, async (req, res) => {
    try {
      console.log("Atualizando esquema do sistema...");
      
      // Verificar quais colunas já existem
      const { rows } = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'system_settings' 
        AND column_name IN ('site_name', 'site_description', 'logo_url', 'favicon_url')
      `);
      
      const existingColumns = rows.map(row => row.column_name);
      console.log('Colunas existentes:', existingColumns);
      
      // Determinar quais colunas precisam ser adicionadas
      const columnsToAdd = [];
      if (!existingColumns.includes('site_name')) columnsToAdd.push("site_name TEXT NOT NULL DEFAULT 'Jogo do Bicho'");
      if (!existingColumns.includes('site_description')) columnsToAdd.push("site_description TEXT NOT NULL DEFAULT 'A melhor plataforma de apostas online'");
      if (!existingColumns.includes('logo_url')) columnsToAdd.push("logo_url TEXT NOT NULL DEFAULT '/img/logo.png'");
      if (!existingColumns.includes('favicon_url')) columnsToAdd.push("favicon_url TEXT NOT NULL DEFAULT '/img/favicon.png'");
      
      if (columnsToAdd.length > 0) {
        // Construir a query para adicionar as colunas
        const alterQuery = `
          ALTER TABLE system_settings 
          ${columnsToAdd.map(col => `ADD COLUMN IF NOT EXISTS ${col}`).join(', ')}
        `;
        
        console.log('Executando query:', alterQuery);
        
        // Executar a query
        await pool.query(alterQuery);
        
        console.log(`✅ Sucesso! Adicionadas ${columnsToAdd.length} novas colunas à tabela system_settings.`);
        res.json({
          success: true,
          message: `${columnsToAdd.length} colunas adicionadas com sucesso`,
          columns: columnsToAdd
        });
      } else {
        console.log('✅ Todos os campos já existem na tabela system_settings.');
        res.json({
          success: true,
          message: "Schema já está atualizado",
          columns: []
        });
      }
    } catch (error) {
      console.error("Erro ao atualizar esquema do sistema:", error);
      res.status(500).json({ 
        success: false,
        message: "Erro ao atualizar esquema do sistema",
        error: error.message
      });
    }
  });

  // Endpoint para upload de imagem (logo e favicon)
  app.post("/api/admin/upload-image", requireAdmin, async (req, res) => {
    try {
      console.log('Recebendo solicitação de upload de imagem');
      const { imageData, imageType } = req.body;
      
      if (!imageData || !imageType) {
        console.log('Erro: Dados de imagem incompletos');
        return res.status(400).json({ 
          success: false, 
          message: "Dados de imagem e tipo são obrigatórios" 
        });
      }
      
      console.log(`Tipo de imagem recebido: ${imageType}`);
      
      // Verificar se o tipo é válido (logo ou favicon)
      if (imageType !== 'logo' && imageType !== 'favicon') {
        console.log('Erro: Tipo de imagem inválido:', imageType);
        return res.status(400).json({ 
          success: false, 
          message: "Tipo de imagem deve ser 'logo' ou 'favicon'" 
        });
      }
      
      // Verificar se o imageData é uma string válida de base64
      if (!imageData.startsWith('data:image/')) {
        return res.status(400).json({ 
          success: false, 
          message: "Dados de imagem inválidos. Deve ser uma string base64 válida" 
        });
      }
      
      // Extrair o tipo de conteúdo e dados da string base64
      const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ 
          success: false, 
          message: "Formato de dados de imagem inválido" 
        });
      }
      
      // matches[1] contém o tipo de mídia, por exemplo, "image/png"
      // matches[2] contém os dados base64 da imagem
      const contentType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Determinar o formato do arquivo com base no tipo de conteúdo
      let extension = '';
      if (contentType === 'image/png') {
        extension = '.png';
      } else if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
        extension = '.jpg';
      } else if (contentType === 'image/svg+xml') {
        extension = '.svg';
      } else if (contentType === 'image/x-icon') {
        extension = '.ico';
      } else {
        return res.status(400).json({ 
          success: false, 
          message: "Tipo de imagem não suportado. Use PNG, JPEG, SVG ou ICO" 
        });
      }
      
      // Definir o nome do arquivo baseado no tipo de imagem
      const fileName = imageType === 'logo' ? 'logo' + extension : 'favicon' + extension;
      
      // Caminho para salvar a imagem no servidor
      let filePath;
      
      if (imageType === 'logo') {
        filePath = `./client/public/img/${fileName}`;
      } else {
        // O favicon deve ficar na raiz e no diretório de imagens para compatibilidade
        // Salvar em ambos os lugares para garantir
        const faviconRootPath = `./client/public/${fileName}`;
        // Salvar na raiz primeiro
        fs.ensureDirSync(path.dirname(faviconRootPath));
        fs.writeFileSync(faviconRootPath, buffer);
        
        // E também no diretório de imagens
        filePath = `./client/public/img/${fileName}`;
      }
      
      // Criar diretório se não existir
      const directory = path.dirname(filePath);
      
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      
      // Salvar a imagem no servidor
      fs.writeFileSync(filePath, buffer);
      
      // URL para acessar a imagem
      const imageUrl = `/img/${fileName}`;
      
      // Para favicons, sempre use o caminho dentro da pasta img para consistência
      // O arquivo também é salvo na raiz por compatibilidade, mas usamos o de /img para melhor gerenciamento
      
      // Atualizar a configuração do sistema com a nova URL da imagem
      let settings = await storage.getSystemSettings();
      
      if (!settings) {
        // Se as configurações não existirem, criar com valores padrão
        settings = {
          maxBetAmount: 50,
          maxPayout: 500,
          minBetAmount: 0.5,
          defaultBetAmount: 2,
          mainColor: "#4f46e5",
          secondaryColor: "#6366f1",
          accentColor: "#f97316",
          allowUserRegistration: true,
          allowDeposits: true,
          allowWithdrawals: true,
          maintenanceMode: false,
          autoApproveWithdrawals: true,
          autoApproveWithdrawalLimit: 30,
          siteName: "Jogo do Bicho",
          siteDescription: "A melhor plataforma de apostas online",
          logoUrl: "/img/logo.png",
          faviconUrl: "/img/favicon.png"
        };
      }
      
      // Atualizar a URL da imagem correspondente
      if (imageType === 'logo') {
        settings.logoUrl = imageUrl;
      } else {
        settings.faviconUrl = imageUrl;
      }
      
      // Salvar as configurações atualizadas
      await storage.saveSystemSettings(settings);
      
      res.json({
        success: true,
        message: `Imagem ${imageType} enviada com sucesso`,
        imageUrl
      });
      
    } catch (error) {
      console.error(`Erro ao enviar imagem ${req.body?.imageType}:`, error);
      let errorMessage = "Erro desconhecido";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = String(error);
      }
      
      res.status(500).json({ 
        success: false, 
        message: "Erro ao processar upload de imagem", 
        error: errorMessage
      });
    }
  });

  // Endpoint de teste para upload de imagem - sem autenticação para fins de depuração
  app.post("/api/test-image-upload", async (req, res) => {
    try {
      console.log('Recebendo solicitação de teste de upload de imagem');
      const { imageData, imageType } = req.body;
      
      if (!imageData || !imageType) {
        console.log('Erro: Dados de imagem incompletos no teste');
        return res.status(400).json({ 
          success: false, 
          message: "Dados de imagem e tipo são obrigatórios" 
        });
      }
      
      console.log(`Tipo de imagem recebido no teste: ${imageType}`);
      
      // Retornar sucesso sem fazer nada
      res.json({
        success: true,
        message: `Teste de upload de imagem ${imageType} recebido com sucesso`,
        imageUrl: `/img/test-${imageType}.png` // URL fictícia para teste
      });
      
    } catch (error) {
      console.error('Erro no endpoint de teste:', error);
      let errorMessage = "Erro desconhecido";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = String(error);
      }
      
      res.status(500).json({ 
        success: false, 
        message: "Erro ao processar upload de teste", 
        error: errorMessage
      });
    }
  });
  
  // Update system settings (admin only)
  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      console.log("Updating system settings:", req.body);
      
      // Validate settings
      const { maxBetAmount, maxPayout, minBetAmount, defaultBetAmount } = req.body;
      if (maxBetAmount <= 0 || maxPayout <= 0) {
        return res.status(400).json({ message: "Valores máximos devem ser positivos" });
      }
      
      // Validação de valores mínimos
      if (minBetAmount <= 0) {
        return res.status(400).json({ message: "O valor mínimo de aposta deve ser positivo" });
      }
      
      // Validação de valor padrão
      if (defaultBetAmount <= 0) {
        return res.status(400).json({ message: "O valor padrão de aposta deve ser positivo" });
      }
      
      // Validações de coerência entre os valores
      if (minBetAmount > maxBetAmount) {
        return res.status(400).json({ message: "O valor mínimo de aposta não pode ser maior que o valor máximo" });
      }
      
      if (defaultBetAmount < minBetAmount) {
        return res.status(400).json({ message: "O valor padrão de aposta não pode ser menor que o valor mínimo" });
      }
      
      if (defaultBetAmount > maxBetAmount) {
        return res.status(400).json({ message: "O valor padrão de aposta não pode ser maior que o valor máximo" });
      }
      
      // Validação para aprovação automática de saques
      const { autoApproveWithdrawals, autoApproveWithdrawalLimit } = req.body;
      
      if (autoApproveWithdrawals && (autoApproveWithdrawalLimit === undefined || autoApproveWithdrawalLimit <= 0)) {
        return res.status(400).json({ 
          message: "O limite para aprovação automática deve ser positivo quando a aprovação automática está ativada" 
        });
      }
      
      // Validar campos de branding
      const { siteName, siteDescription, logoUrl, faviconUrl } = req.body;
      
      if (siteName && siteName.length > 100) {
        return res.status(400).json({ message: "Nome do site muito longo (máximo 100 caracteres)" });
      }
      
      if (siteDescription && siteDescription.length > 500) {
        return res.status(400).json({ message: "Descrição do site muito longa (máximo 500 caracteres)" });
      }
      
      // Garantir que logoUrl e faviconUrl sejam strings
      const settingsToSave = {
        ...req.body,
        logoUrl: logoUrl || '/img/logo.png',
        faviconUrl: faviconUrl || '/img/favicon.png',
        siteName: siteName || 'Jogo do Bicho',
        siteDescription: siteDescription || 'A melhor plataforma de apostas online'
      };
      
      // Save settings to database
      const updatedSettings = await storage.saveSystemSettings(settingsToSave);
      
      // Return updated settings
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating system settings:", error);
      res.status(500).json({ message: "Error updating system settings" });
    }
  });
  
  // Bet discharge route (admin only)
  app.post("/api/admin/bets/discharge", requireAdmin, async (req, res) => {
    try {
      const { betId, drawId, note } = req.body;
      
      if (!betId || !drawId) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Validate bet exists and is pending
      const bet = await storage.getBet(betId);
      if (!bet) {
        return res.status(404).json({ message: "Bet not found" });
      }
      
      if (bet.status !== "pending") {
        return res.status(400).json({ message: "Only pending bets can be discharged" });
      }
      
      // Validate draw exists and is pending
      const draw = await storage.getDraw(drawId);
      if (!draw) {
        return res.status(404).json({ message: "Draw not found" });
      }
      
      if (draw.status !== "pending") {
        return res.status(400).json({ message: "Can only discharge to pending draws" });
      }
      
      // Update the bet with the new draw ID
      const updatedBet = await storage.updateBet(betId, { drawId });
      
      // Log the discharge action (in a real implementation, this would be saved to a log table)
      console.log(`Bet ${betId} discharged from draw ${bet.drawId} to draw ${drawId}. Note: ${note || 'N/A'}`);
      
      res.json(updatedBet);
    } catch (error) {
      console.error("Error discharging bet:", error);
      res.status(500).json({ message: "Error discharging bet" });
    }
  });

  // ==================== PAYMENT GATEWAY ROUTES ====================
  
  // Get all payment gateways (admin only)
  app.get("/api/admin/payment-gateways", requireAdmin, async (req, res) => {
    try {
      const gateways = await storage.getAllPaymentGateways();
      res.json(gateways);
    } catch (error) {
      console.error("Error fetching payment gateways:", error);
      res.status(500).json({ message: "Error fetching payment gateways" });
    }
  });

  // Get payment gateway by ID (admin only)
  app.get("/api/admin/payment-gateways/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const gateway = await storage.getPaymentGateway(id);
      
      if (!gateway) {
        return res.status(404).json({ message: "Payment gateway not found" });
      }
      
      res.json(gateway);
    } catch (error) {
      console.error("Error fetching payment gateway:", error);
      res.status(500).json({ message: "Error fetching payment gateway" });
    }
  });

  // Create payment gateway (admin only)
  app.post("/api/admin/payment-gateways", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertPaymentGatewaySchema.parse(req.body);
      
      // Check if a gateway with the same type already exists
      const existingGateway = await storage.getPaymentGatewayByType(validatedData.type);
      if (existingGateway) {
        return res.status(400).json({ 
          message: `A payment gateway with type '${validatedData.type}' already exists` 
        });
      }
      
      const gateway = await storage.createPaymentGateway(validatedData);
      res.status(201).json(gateway);
    } catch (error) {
      console.error("Error creating payment gateway:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid payment gateway data", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Error creating payment gateway" });
    }
  });

  // Update payment gateway (admin only)
  app.patch("/api/admin/payment-gateways/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const gateway = await storage.getPaymentGateway(id);
      
      if (!gateway) {
        return res.status(404).json({ message: "Payment gateway not found" });
      }
      
      const updatedGateway = await storage.updatePaymentGateway(id, req.body);
      res.json(updatedGateway);
    } catch (error) {
      console.error("Error updating payment gateway:", error);
      res.status(500).json({ message: "Error updating payment gateway" });
    }
  });

  // Delete payment gateway (admin only)
  app.delete("/api/admin/payment-gateways/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const gateway = await storage.getPaymentGateway(id);
      
      if (!gateway) {
        return res.status(404).json({ message: "Payment gateway not found" });
      }
      
      await storage.deletePaymentGateway(id);
      res.json({ message: "Payment gateway deleted successfully" });
    } catch (error) {
      console.error("Error deleting payment gateway:", error);
      res.status(500).json({ message: "Error deleting payment gateway" });
    }
  });

  // Get active payment gateways (for user)
  app.get("/api/payment-gateways", requireAuth, async (req, res) => {
    try {
      const gateways = await storage.getAllPaymentGateways();
      
      // Filter out inactive gateways and only return necessary fields
      const activeGateways = gateways
        .filter(gateway => gateway.isActive)
        .map(gateway => ({
          id: gateway.id,
          name: gateway.name,
          type: gateway.type
        }));
      
      res.json(activeGateways);
    } catch (error) {
      console.error("Error fetching active payment gateways:", error);
      res.status(500).json({ message: "Error fetching payment gateways" });
    }
  });

  // CORREÇÃO CRÍTICA: Endpoint específico para verificar depósitos do usuário
  // Este endpoint é usado pelo frontend para verificar elegibilidade para bônus
  app.get("/api/transactions/deposits", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const username = req.user!.username;
      console.log(`🔍🔍🔍 ENDPOINT DEPOSITS EXECUTADO: Usuário ${username} (${userId})`);
      console.log(`🔍 VERIFICAÇÃO BÔNUS: Consultando depósitos do usuário ${username} (${userId}) para elegibilidade`);
      
      // Buscar apenas transações de depósito com status 'completed'
      const deposits = await storage.getUserTransactions(userId);
      console.log(`🔍 TOTAL TRANSAÇÕES: Usuário ${username} tem ${deposits.length} transações no total`);
      
      // Verificar cada transação individualmente
      deposits.forEach((transaction, index) => {
        console.log(`🔍 TRANSAÇÃO ${index + 1}: ID=${transaction.id}, Tipo=${transaction.type}, Status=${transaction.status}, Amount=${transaction.amount}`);
      });
      
      const completedDeposits = deposits.filter(transaction => {
        const isDeposit = transaction.type === 'deposit';
        const isCompleted = transaction.status === 'completed';
        console.log(`🔍 FILTRO: ID=${transaction.id} -> IsDeposit=${isDeposit}, IsCompleted=${isCompleted}, Passou=${isDeposit && isCompleted}`);
        return isDeposit && isCompleted;
      });
      
      console.log(`📊 RESULTADO FINAL: Usuário ${username} (${userId}) tem ${completedDeposits.length} depósitos confirmados`);
      console.log(`✅ ELEGÍVEL PARA BÔNUS: ${completedDeposits.length === 0 ? 'SIM' : 'NÃO'}`);
      
      if (completedDeposits.length > 0) {
        console.log(`🔒 BÔNUS BLOQUEADO: Usuário ${username} já utilizou o bônus de primeiro depósito`);
      } else {
        console.log(`✅ BÔNUS DISPONÍVEL: Usuário ${username} é elegível para bônus de primeiro depósito`);
      }
      
      console.log(`🚀 RETORNANDO: ${completedDeposits.length} depósitos para o frontend`);
      res.json(completedDeposits);
    } catch (error) {
      console.error("❌ ERRO CRÍTICO ao buscar depósitos para verificação de bônus:", error);
      res.status(500).json({ message: "Erro ao verificar histórico de depósitos" });
    }
  });

  // Get user payment transactions
  /**
   * Obter todas as transações de pagamento do usuário autenticado 
   * Com múltiplas camadas de isolamento de dados para garantir total privacidade
   */
  app.get("/api/payment-transactions", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const username = req.user!.username;
      console.log(`REQUISIÇÃO: Usuário ${username} (${userId}) solicitando suas transações de pagamento`);
      
      // MÉTODO PRINCIPAL: Usar a função aprimorada que inclui múltiplas camadas de segurança
      // Esta função já implementa:
      //  1. Verificação de existência do usuário
      //  2. Consulta filtrada ao banco de dados
      //  3. Verificação individual de propriedade
      //  4. Detecção e alertas de inconsistências de segurança
      //  5. Sanitização de dados sensíveis
      const userTransactions = await storage.getUserTransactions(userId);
      
      // Filtrar as transações para remover aquelas com type="withdrawal"
      // pois essas já serão obtidas da tabela 'withdrawals'
      const filteredTransactions = userTransactions.filter(tx => tx.type !== "withdrawal");
      
      // Obter os saques do usuário para incluir no histórico de transações
      const userWithdrawals = await storage.getUserWithdrawals(userId);
      
      // Converter saques para o formato de transação para unificar a resposta
      const withdrawalsAsTransactions = userWithdrawals.map(withdrawal => ({
        id: withdrawal.id,
        userId: withdrawal.userId,
        gatewayId: 0, // Gateway fictício para saques
        amount: -withdrawal.amount, // Valor negativo para indicar saída
        status: withdrawal.status,
        externalId: null,
        externalUrl: null,
        response: null,
        createdAt: withdrawal.requestedAt,
        type: "withdrawal" // Identificador adicional
      }));
      
      // Combinar as transações filtradas e os saques, ordenando por data (mais recente primeiro)
      const allTransactions = [...filteredTransactions, ...withdrawalsAsTransactions]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Registramos a conclusão da operação com sucesso
      console.log(`SEGURANÇA: Operação concluída com sucesso. Retornando ${allTransactions.length} transações para usuário ${username} (${userId}) (${filteredTransactions.length} depósitos e ${userWithdrawals.length} saques)`);
      
      // MÉTODO SECUNDÁRIO: Auditoria adicional (somente para fins de logging)
      // Este é um teste duplo independente que não afeta a resposta enviada
      // mas pode ajudar a detectar problemas potenciais no sistema
      try {
        const auditBankCheck = await db
          .select({ count: sql`count(*)` })
          .from(paymentTransactions)
          .where(eq(paymentTransactions.userId, userId));
        
        const expectedCount = Number(auditBankCheck[0].count);
        
        if (expectedCount !== userTransactions.length) {
          console.error(`AUDITORIA: Discrepância entre contagem do banco (${expectedCount}) e contagem retornada (${userTransactions.length}) para usuário ${userId}`);
        } else {
          console.log(`AUDITORIA: Verificação adicional confirma que todas as ${expectedCount} transações do usuário foram corretamente recuperadas`);
        }
      } catch (auditError) {
        // Falha na auditoria não interrompe o fluxo normal
        console.error(`Falha na auditoria adicional de transações para usuário ${userId}:`, auditError);
      }
      
      // A resposta agora inclui depósitos e saques
      console.log(`RESPOSTA: Enviando ${allTransactions.length} transações para usuário ${username} (${userId})`);
      return res.json(allTransactions);
    } catch (error: any) {
      console.error(`ERRO: Falha ao consultar transações para usuário ${req.user!.id}:`, error);
      return res.status(500).json({ 
        message: 'Erro ao consultar transações',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });
  
  // Função auxiliar para sanitizar respostas de gateway antes de enviar ao cliente
  function sanitizeGatewayResponse(response: any): any {
    if (!response) return null;
    
    try {
      // Se for string JSON, converter para objeto
      const responseObj = typeof response === 'string' ? JSON.parse(response) : response;
      
      // Remover campos sensíveis que podem conter dados de outros usuários
      const { 
        customer_details, customer_email, customer_phone, customer_id,
        webhook_url, security_token, api_key, token, apiKey, auth,
        payer, sender, recipient, sensitive_data, ...safeFields 
      } = responseObj;
      
      return safeFields;
    } catch (err) {
      console.error("Erro ao sanitizar resposta do gateway:", err);
      return { sanitized: true, info: "Dados completos removidos por segurança" };
    }
  }
  
  // Get specific payment transaction by ID
  app.get("/api/payment-transactions/:id", requireOwnership('transaction'), async (req, res) => {
    try {
      // O middleware requireOwnership já verificou que a transação existe
      // e pertence ao usuário autenticado, e a armazenou em req.resource
      res.json((req as any).resource);
    } catch (error) {
      console.error("Erro ao buscar transação:", error);
      res.status(500).json({ message: "Erro ao buscar transação" });
    }
  });

  // 🎁 Função para verificar e aplicar bônus de primeiro depósito
  async function checkAndApplyFirstDepositBonus(userId: number, depositAmount: number, userWantsBonus: boolean = false) {
    try {
      console.log(`[BÔNUS] Verificando bônus - UserId: ${userId}, Valor: R$${depositAmount}, Usuário quer bônus: ${userWantsBonus}`);
      
      // PRIMEIRA VERIFICAÇÃO: Usuário deve ter marcado a opção de receber bônus
      if (!userWantsBonus) {
        console.log(`[BÔNUS] Usuário ${userId} não marcou a opção de receber bônus - não aplicando bônus`);
        return;
      }
      
      // Verificar se o bônus de primeiro depósito está habilitado
      const settings = await storage.getSystemSettings();
      if (!settings?.firstDepositBonusEnabled) {
        console.log(`[BÔNUS] Bônus de primeiro depósito desabilitado para usuário ${userId}`);
        return;
      }

      // Verificar se é realmente o primeiro depósito aprovado do usuário
      const userTransactions = await storage.getUserTransactions(userId);
      const completedDeposits = userTransactions.filter(t => 
        t.type === 'deposit' && 
        t.status === 'completed'
      );

      if (completedDeposits.length > 1) {
        console.log(`[BÔNUS] Usuário ${userId} já possui ${completedDeposits.length} depósitos. Não é primeiro depósito.`);
        return;
      }

      // Calcular valor do bônus
      const bonusPercentage = settings.firstDepositBonusPercentage || 100;
      const maxBonusAmount = settings.firstDepositBonusMaxAmount || 200;
      const rollover = settings.firstDepositBonusRollover || 3;
      const expirationDays = settings.firstDepositBonusExpiration || 7;

      let bonusAmount = (depositAmount * bonusPercentage) / 100;
      if (bonusAmount > maxBonusAmount) {
        bonusAmount = maxBonusAmount;
      }

      if (bonusAmount <= 0) {
        console.log(`[BÔNUS] Valor de bônus calculado é R$${bonusAmount}. Não aplicando bônus.`);
        return;
      }

      // Criar data de expiração
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + expirationDays);

      // Criar registro de bônus no banco
      const bonusData = {
        userId: userId,
        type: 'first_deposit' as const,
        amount: bonusAmount,
        remainingAmount: bonusAmount,
        rolloverAmount: bonusAmount * rollover,
        rolledAmount: 0,
        status: 'active' as const,
        expiresAt: expirationDate,
        relatedTransactionId: null
      };

      await storage.createUserBonus(bonusData);

      // Saldo de bônus já é atualizado automaticamente pelo createUserBonus

      console.log(`🎁 [BÔNUS APLICADO] Usuário ${userId} recebeu R$${bonusAmount.toFixed(2)} de bônus de primeiro depósito (${bonusPercentage}% de R$${depositAmount.toFixed(2)})`);
      console.log(`📋 [BÔNUS DETALHES] Rollover: R$${(bonusAmount * rollover).toFixed(2)}, Expira em: ${expirationDate.toLocaleDateString()}`);

    } catch (error) {
      console.error(`[ERRO BÔNUS] Falha ao aplicar bônus de primeiro depósito para usuário ${userId}:`, error);
    }
  }

  // Endpoint para aplicar bônus de primeiro depósito quando usuário escolhe receber
  app.post("/api/apply-first-deposit-bonus", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { transactionId } = req.body;
      
      if (!transactionId) {
        return res.status(400).json({ message: "ID da transação é obrigatório" });
      }
      
      // Buscar a transação
      const transaction = await storage.getPaymentTransaction(transactionId);
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      
      // Verificar se a transação pertence ao usuário
      if (transaction.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      // Verificar se a transação está completa
      if (transaction.status !== 'completed') {
        return res.status(400).json({ message: "Transação deve estar completa para aplicar bônus" });
      }
      
      // Aplicar bônus de primeiro depósito (com usuário explicitamente querendo o bônus)
      await checkAndApplyFirstDepositBonus(userId, transaction.amount, true);
      
      res.json({ 
        success: true, 
        message: "Bônus de primeiro depósito aplicado com sucesso!" 
      });
      
    } catch (error) {
      console.error("Erro ao aplicar bônus de primeiro depósito:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Verificar automaticamente pagamentos pendentes
  app.post("/api/payment-transactions/check-pending", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      // Buscar APENAS as transações do usuário autenticado
      const transactions = await storage.getUserTransactions(userId);
      
      // Verificação adicional de segurança, garantindo que todas as transações pertencem ao usuário
      const userTransactions = transactions.filter(transaction => transaction.userId === userId);
      
      // Log para auditoria de segurança
      if (userTransactions.length !== transactions.length) {
        console.error(`ALERTA DE SEGURANÇA: Encontrado ${transactions.length - userTransactions.length} transações que não pertencem ao usuário ${userId}`);
      }
      
      console.log(`Verificando transações do usuário ${userId}. Total: ${userTransactions.length}`);
      
      // Filtrar apenas transações pendentes
      const pendingTransactions = userTransactions.filter(
        t => (t.status === 'pending' || t.status === 'processing') && t.externalId
      );
      
      if (pendingTransactions.length === 0) {
        return res.json({ 
          message: "Nenhuma transação pendente encontrada", 
          checkedCount: 0,
          updatedCount: 0 
        });
      }
      
      console.log(`Verificando ${pendingTransactions.length} transações pendentes para o usuário ${userId}`);
      
      // Lista para armazenar resultados
      const results: any[] = [];
      let updatedCount = 0;
      let checkedCount = 0;
      
      // Verifica cada transação pendente
      for (const transaction of pendingTransactions) {
        try {
          checkedCount++;
          console.log(`Verificando transação ID: ${transaction.id}, Externa ID: ${transaction.externalId}`);
          
          // Buscar gateway
          const gateway = await storage.getPaymentGateway(transaction.gatewayId);
          
          if (!gateway) {
            results.push({
              transactionId: transaction.id,
              status: "error",
              message: "Gateway não encontrado"
            });
            continue;
          }
          
          // Verificar se é Pushin Pay
          if (gateway.type === 'pushinpay' && transaction.externalId) {
            // Obter token do gateway
            const token = process.env.PUSHIN_PAY_TOKEN;
            if (!token) {
              results.push({
                transactionId: transaction.id,
                status: "error",
                message: "Token da API não configurado"
              });
              continue;
            }
            
            // Tentativa 1: Verificar com API V2
            console.log(`[Transação ${transaction.id}] Tentando verificar com API V2...`);
            let verifiedWithV2 = false;
            
            try {
              const apiUrlV2 = `https://api.pushinpay.com.br/api/transactions/${transaction.externalId}`;
              
              const responseV2 = await fetch(apiUrlV2, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
                }
              });
              
              if (responseV2.ok) {
                const paymentData = await responseV2.json();
                console.log(`[Transação ${transaction.id}] Resposta API V2:`, paymentData);
                
                // Se o pagamento foi concluído com a API V2
                if (paymentData.status === 'PAID' || paymentData.status === 'COMPLETED' ||
                    paymentData.status === 'paid' || paymentData.status === 'completed') {
                  
                  // Verificação adicional de segurança antes de atualizar o status
                  if (transaction.userId !== userId) {
                    console.error(`ALERTA DE SEGURANÇA: Tentativa de processar pagamento de outro usuário.
                      Transação ID: ${transaction.id}
                      Pertence ao usuário: ${transaction.userId}
                      Usuário autenticado: ${userId}`);
                    
                    results.push({
                      transactionId: transaction.id,
                      status: "error",
                      message: "Erro de segurança: transação pertence a outro usuário"
                    });
                    
                    continue; // Pular esta transação
                  }
                  
                  // Verificar se o usuário ainda existe
                  const userV2 = await storage.getUser(transaction.userId);
                  if (!userV2) {
                    console.error(`ALERTA DE SEGURANÇA: Usuário ${transaction.userId} não existe mais, mas possui transação ${transaction.id}`);
                    
                    results.push({
                      transactionId: transaction.id,
                      status: "error",
                      message: "Erro de segurança: usuário não encontrado"
                    });
                    
                    continue; // Pular esta transação
                  }
                  
                  // Atualizar status da transação
                  await storage.updateTransactionStatus(
                    transaction.id,
                    "completed",
                    transaction.externalId,
                    transaction.externalUrl || undefined,
                    paymentData
                  );
                  
                  // Log de auditoria para rastreamento financeiro
                  console.log(`TRANSAÇÃO CONCLUÍDA: ID ${transaction.id}, Usuário ${userV2.username} (${userV2.id}), Valor R$${transaction.amount}`);
                  
                  // Atualizar saldo do usuário
                  await storage.updateUserBalance(transaction.userId, transaction.amount);
                  
                  // 🎁 VERIFICAR E APLICAR BÔNUS DE PRIMEIRO DEPÓSITO
                  // Verificar se a transação tem flag de uso de bônus
                  const shouldApplyBonus = transaction.metadata && transaction.metadata.useBonus === true;
                  console.log(`[BÔNUS] Verificando aplicação de bônus para transação ${transaction.id}: shouldApplyBonus=${shouldApplyBonus}`);
                  
                  if (shouldApplyBonus) {
                    console.log(`[BÔNUS] Aplicando bônus de primeiro depósito para usuário ${transaction.userId}, valor R$${transaction.amount}`);
                    await checkAndApplyFirstDepositBonus(transaction.userId, transaction.amount, true);
                  }
                  
                  updatedCount++;
                  results.push({
                    transactionId: transaction.id,
                    status: "completed",
                    message: "Pagamento confirmado (API V2)"
                  });
                  
                  verifiedWithV2 = true;
                } else {
                  // Se não estiver pago ainda, registrar o status
                  results.push({
                    transactionId: transaction.id,
                    status: "pending",
                    message: `Status atual: ${paymentData.status} (API V2)`,
                    apiStatus: paymentData.status
                  });
                  
                  verifiedWithV2 = true;
                }
              } else {
                console.log(`[Transação ${transaction.id}] API V2 retornou erro ${responseV2.status}`);
              }
            } catch (v2Error) {
              console.log(`[Transação ${transaction.id}] Erro ao acessar API V2:`, v2Error);
            }
            
            // Se já verificou com V2, pular para próxima transação
            if (verifiedWithV2) {
              continue;
            }
            
            // Tentativa 2: Verificar com API V1
            console.log(`[Transação ${transaction.id}] Tentando verificar com API V1...`);
            let verifiedWithV1 = false;
            
            try {
              const apiUrlV1 = `https://api.pushinpay.com.br/api/transactions/${transaction.externalId}`;
              
              const responseV1 = await fetch(apiUrlV1, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
                }
              });
              
              if (responseV1.ok) {
                const paymentData = await responseV1.json();
                console.log(`[Transação ${transaction.id}] Resposta API V1:`, paymentData);
                
                // Se o pagamento foi concluído com a API V1
                if (paymentData.status === 'PAID' || paymentData.status === 'COMPLETED' ||
                    paymentData.status === 'paid' || paymentData.status === 'completed') {
                  
                  // Verificação adicional de segurança antes de atualizar o status
                  if (transaction.userId !== userId) {
                    console.error(`ALERTA DE SEGURANÇA: Tentativa de processar pagamento de outro usuário.
                      Transação ID: ${transaction.id}
                      Pertence ao usuário: ${transaction.userId}
                      Usuário autenticado: ${userId}`);
                    
                    results.push({
                      transactionId: transaction.id,
                      status: "error",
                      message: "Erro de segurança: transação pertence a outro usuário"
                    });
                    
                    continue; // Pular esta transação
                  }
                  
                  // Verificar se o usuário ainda existe
                  const userV1 = await storage.getUser(transaction.userId);
                  if (!userV1) {
                    console.error(`ALERTA DE SEGURANÇA: Usuário ${transaction.userId} não existe mais, mas possui transação ${transaction.id}`);
                    
                    results.push({
                      transactionId: transaction.id,
                      status: "error",
                      message: "Erro de segurança: usuário não encontrado"
                    });
                    
                    continue; // Pular esta transação
                  }
                  
                  // Atualizar status da transação
                  await storage.updateTransactionStatus(
                    transaction.id,
                    "completed",
                    transaction.externalId,
                    transaction.externalUrl || undefined,
                    paymentData
                  );
                  
                  // Log de auditoria para rastreamento financeiro
                  console.log(`TRANSAÇÃO CONCLUÍDA: ID ${transaction.id}, Usuário ${userV1.username} (${userV1.id}), Valor R$${transaction.amount}`);
                  
                  // Atualizar saldo do usuário
                  await storage.updateUserBalance(transaction.userId, transaction.amount);
                  
                  // Bônus aplicado apenas pela primeira chamada
                  
                  updatedCount++;
                  results.push({
                    transactionId: transaction.id,
                    status: "completed",
                    message: "Pagamento confirmado (API V1)"
                  });
                  
                  verifiedWithV1 = true;
                } else {
                  // Se não estiver pago ainda, registrar o status
                  results.push({
                    transactionId: transaction.id,
                    status: "pending",
                    message: `Status atual: ${paymentData.status} (API V1)`,
                    apiStatus: paymentData.status
                  });
                  
                  verifiedWithV1 = true;
                }
              } else {
                console.log(`[Transação ${transaction.id}] API V1 retornou erro ${responseV1.status}`);
              }
            } catch (v1Error) {
              console.log(`[Transação ${transaction.id}] Erro ao acessar API V1:`, v1Error);
            }
            
            // Se já verificou com V1, pular para próxima transação
            if (verifiedWithV1) {
              continue;
            }
            
            // Verificação por tempo (se ambas as APIs falharem)
            console.log(`[Transação ${transaction.id}] Ambas APIs falharam, verificando por tempo...`);
            const transactionDate = new Date(transaction.createdAt);
            const now = new Date();
            const hoursDiff = (now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60);
            
            // IMPORTANTE: MODO DE DESENVOLVIMENTO/TESTE
            // No ambiente de desenvolvimento, consideramos o pagamento como concluído
            // após 1 minuto para fins de teste, já que a API real pode não estar disponível
            const minutesDiff = (now.getTime() - transactionDate.getTime()) / (1000 * 60);
            const isTestMode = process.env.NODE_ENV === 'development';
            
            if (isTestMode && minutesDiff > 1) {
              console.log(`[DESENVOLVIMENTO] Transação ${transaction.id} aprovada automaticamente após ${minutesDiff.toFixed(1)} minutos (modo de teste)`);
              
              // Verificar se o usuário ainda existe
              const userDev = await storage.getUser(transaction.userId);
              if (!userDev) {
                results.push({
                  transactionId: transaction.id,
                  status: "error",
                  message: "Erro de segurança: usuário não encontrado"
                });
                continue;
              }
              
              // Atualizar status da transação
              await storage.updateTransactionStatus(
                transaction.id,
                "completed",
                transaction.externalId,
                transaction.externalUrl || undefined,
                { autoApproved: true, reason: "Aprovado automaticamente em ambiente de desenvolvimento" }
              );
              
              // Log de auditoria para rastreamento financeiro
              console.log(`TRANSAÇÃO CONCLUÍDA (DESENVOLVIMENTO): ID ${transaction.id}, Usuário ${userDev.username} (${userDev.id}), Valor R$${transaction.amount}`);
              
              // Atualizar saldo do usuário
              await storage.updateUserBalance(transaction.userId, transaction.amount);
              
              updatedCount++;
              results.push({
                transactionId: transaction.id,
                status: "completed",
                message: "Pagamento confirmado automaticamente (ambiente de desenvolvimento)"
              });
            } else if (hoursDiff > 24) {
              console.log(`[Transação ${transaction.id}] Tem mais de 24h (${hoursDiff.toFixed(1)}h), marcando como expirada`);
              
              // Atualizar status para falha por tempo
              await storage.updateTransactionStatus(
                transaction.id,
                "failed",
                transaction.externalId,
                transaction.externalUrl || undefined,
                { reason: "Expirada por tempo (mais de 24h)" }
              );
              
              results.push({
                transactionId: transaction.id,
                status: "expired",
                message: "Transação expirada (mais de 24h)"
              });
            } else {
              console.log(`[Transação ${transaction.id}] Tem menos de 24h (${hoursDiff.toFixed(1)}h), mantendo pendente`);
              
              results.push({
                transactionId: transaction.id,
                status: "pending",
                message: "Transação ainda pendente, APIs indisponíveis"
              });
            }
          } else {
            // Outros gateways não suportados
            results.push({
              transactionId: transaction.id,
              status: "skipped",
              message: "Gateway não suportado ou sem ID externo"
            });
          }
        } catch (txError) {
          console.error(`[Transação ${transaction.id}] Erro na verificação:`, txError);
          
          results.push({
            transactionId: transaction.id,
            status: "error",
            message: `Erro inesperado: ${(txError as Error).message}`
          });
        }
      }
      
      // Retornar resultados
      res.json({
        message: `Verificação concluída para ${pendingTransactions.length} transações`,
        checkedCount: pendingTransactions.length,
        updatedCount,
        results
      });
    } catch (error) {
      console.error("Erro ao verificar transações pendentes:", error);
      res.status(500).json({ 
        message: "Erro ao verificar transações pendentes",
        error: (error as Error).message 
      });
    }
  });
  
  // Verificar pagamento próprio do usuário (botão "Já fiz o pagamento")
  app.post("/api/payment-transactions/:id/check", requireAuth, async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      if (isNaN(transactionId)) {
        return res.status(400).json({ message: "ID de transação inválido" });
      }
      
      // Buscar a transação
      const transaction = await storage.getPaymentTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      
      // Verificar se a transação pertence ao usuário autenticado
      if (transaction.userId !== userId) {
        return res.status(403).json({ message: "Acesso negado: esta transação não pertence a você" });
      }
      
      // Se a transação já estiver concluída, apenas retornar
      if (transaction.status === 'completed') {
        return res.json({ 
          message: "Transação já foi confirmada e creditada",
          status: transaction.status,
          transaction 
        });
      }
      
      // Apenas processar transações pendentes ou em processamento
      if (transaction.status === 'pending' || transaction.status === 'processing') {
        // Obter gateway de pagamento
        const gateway = await storage.getPaymentGateway(transaction.gatewayId);
        
        if (!gateway) {
          return res.status(404).json({ message: "Gateway de pagamento não encontrado" });
        }
        
        // Se for Pushin Pay, tentar verificar com a API
        if (gateway.type === 'pushinpay' && transaction.externalId) {
          try {
            // Obter token do gateway
            const token = process.env.PUSHIN_PAY_TOKEN;
            if (!token) {
              return res.status(400).json({ message: "Token da API não configurado" });
            }
            
            // Construir URL para consulta do status conforme documentação da Pushin Pay
            // Endpoint correto para consulta de PIX: /api/pix/transactions/{ID}
            const apiUrl = `https://api.pushinpay.com.br/api/transactions/${transaction.externalId}`;
            
            console.log(`[VERIFICAÇÃO MANUAL] Usuário ${userId} verificando transação ${transaction.externalId}`);
            
            // Fazer requisição para a API da Pushin Pay
            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
              }
            });
            
            // Verificar resposta
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error("Erro na resposta da Pushin Pay:", response.status, errorData);
              
              return res.status(200).json({
                message: "Não foi possível verificar com a API no momento. Tente novamente em alguns minutos.",
                status: transaction.status,
                transaction,
                apiError: true
              });
            }
            
            // Processar resposta
            const paymentData = await response.json();
            console.log(`[VERIFICAÇÃO MANUAL] Resposta da Pushin Pay:`, paymentData);
            
            // Verificar se o pagamento foi concluído
            if (paymentData.status === 'paid' || 
                paymentData.status === 'completed' || 
                paymentData.status === 'approved') {
              
              // Atualizar status da transação
              await storage.updateTransactionStatus(
                transaction.id,
                "completed",
                transaction.externalId,
                transaction.externalUrl || undefined,
                paymentData
              );
              
              // Atualizar saldo do usuário
              await storage.updateUserBalance(transaction.userId, transaction.amount);
              
              console.log(`[VERIFICAÇÃO MANUAL] Pagamento confirmado para usuário ${userId}, valor R$${transaction.amount}`);
              
              // Cache será invalidado no frontend
              
              return res.json({
                message: "Pagamento confirmado! Seu saldo foi atualizado.",
                status: "completed",
                transaction: {
                  ...transaction,
                  status: "completed"
                },
                credited: true
              });
              
            } else {
              // Pagamento ainda não foi processado
              return res.json({
                message: "Pagamento ainda não foi processado. Aguarde alguns minutos e tente novamente.",
                status: transaction.status,
                transaction,
                apiStatus: paymentData.status
              });
            }
            
          } catch (apiError: any) {
            console.error("Erro ao verificar pagamento na API:", apiError);
            return res.status(200).json({ 
              message: "Erro temporário ao verificar com a API. Tente novamente em alguns minutos.",
              status: transaction.status,
              transaction,
              apiError: true
            });
          }
        } else {
          // Para outros gateways ou sem ID externo
          return res.json({
            message: "Verificação automática não disponível para este método de pagamento",
            status: transaction.status,
            transaction
          });
        }
      }
      
      // Se não for pendente ou em processamento, retornar o status atual
      return res.json({
        message: `Transação está atualmente ${transaction.status}`,
        status: transaction.status,
        transaction
      });
      
    } catch (error) {
      console.error("Erro ao verificar transação de pagamento:", error);
      res.status(500).json({ message: "Erro ao verificar transação de pagamento" });
    }
  });

  // Verificar um pagamento (apenas para administradores)
  app.post("/api/payment-transactions/:id/verify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const transactionId = parseInt(req.params.id);
      
      if (isNaN(transactionId)) {
        return res.status(400).json({ message: "ID de transação inválido" });
      }
      
      // Buscar a transação
      const transaction = await storage.getPaymentTransaction(transactionId);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transação não encontrada" });
      }
      
      // Se a transação já estiver concluída, apenas retornar
      if (transaction.status === 'completed') {
        return res.json({ 
          message: "Transação já está concluída",
          status: transaction.status,
          transaction 
        });
      }
      
      // Apenas processar transações pendentes ou em processamento
      if (transaction.status === 'pending' || transaction.status === 'processing') {
        // Obter gateway de pagamento
        const gateway = await storage.getPaymentGateway(transaction.gatewayId);
        
        if (!gateway) {
          return res.status(404).json({ message: "Gateway de pagamento não encontrado" });
        }
        
        // Se for Pushin Pay, tentar verificar com a API
        if (gateway.type === 'pushinpay' && transaction.externalId) {
          try {
            // Obter token do gateway
            const token = process.env.PUSHIN_PAY_TOKEN;
            if (!token) {
              return res.status(400).json({ message: "Token da API não configurado" });
            }
            
            // Construir URL para consulta do status conforme documentação da Pushin Pay
            // Endpoint correto para consulta de PIX: /api/pix/transactions/{ID}
            const apiUrl = `https://api.pushinpay.com.br/api/transactions/${transaction.externalId}`;
            
            console.log(`Verificando status da transação ${transaction.externalId} na API Pushin Pay`);
            
            // Fazer requisição para a API da Pushin Pay
            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
              }
            });
            
            // Verificar resposta
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error("Erro na resposta da Pushin Pay:", response.status, errorData);
              throw new Error(`Erro na API da Pushin Pay: ${response.status}`);
            }
            
            // Processar resposta
            const paymentData = await response.json();
            console.log("Resposta da verificação Pushin Pay:", paymentData);
            
            // Se o pagamento estiver concluído, atualizar status
            // Na API v2 da Pushin Pay, o status de pagamento completado pode ser 'PAID' (maiúsculo)
            if (paymentData.status === 'paid' || paymentData.status === 'completed' || 
                paymentData.status === 'PAID' || paymentData.status === 'COMPLETED') {
              // Atualizar status da transação
              const updatedTransaction = await storage.updateTransactionStatus(
                transactionId,
                "completed",
                transaction.externalId,
                transaction.externalUrl || undefined,
                paymentData
              );
              
              if (!updatedTransaction) {
                return res.status(500).json({ message: "Falha ao atualizar status da transação" });
              }
              
              // Atualizar o saldo do usuário
              try {
                console.log(`UPDATING BALANCE: User ID ${transaction.userId}, Amount: ${transaction.amount}`);
                const userBeforeUpdate = await storage.getUser(transaction.userId);
                console.log(`BALANCE BEFORE: User ID ${transaction.userId}, Current balance: ${userBeforeUpdate?.balance}`);
                
                const user = await storage.updateUserBalance(transaction.userId, transaction.amount);
                
                console.log(`BALANCE UPDATED: User ID ${transaction.userId}, New balance: ${user?.balance}, Added: ${transaction.amount}`);
                console.log(`Saldo do usuário atualizado. Novo saldo: ${user?.balance}`);
              } catch (balanceError) {
                console.error("Erro ao atualizar saldo do usuário:", balanceError);
                return res.status(500).json({ message: "Erro ao atualizar saldo do usuário" });
              }
              
              return res.json({
                message: "Pagamento confirmado pela API da Pushin Pay",
                status: "completed",
                transaction: updatedTransaction
              });
            } else {
              // Se não estiver pago, apenas retornar o status atual
              return res.json({
                message: `Status atual na Pushin Pay: ${paymentData.status}`,
                status: transaction.status,
                apiStatus: paymentData.status,
                transaction
              });
            }
          } catch (apiError: any) {
            console.error("Erro ao verificar pagamento na API:", apiError);
            return res.status(500).json({ message: `Erro ao verificar na API: ${apiError.message}` });
          }
        } else {
          // Para outros gateways ou sem ID externo, apenas notificar
          return res.json({
            message: "Verificação automática não disponível para este método de pagamento",
            status: transaction.status,
            transaction
          });
        }
      }
      
      // Se não for pendente ou em processamento, retornar o status atual
      return res.json({
        message: `Transação está atualmente ${transaction.status}`,
        status: transaction.status,
        transaction
      });
      
    } catch (error) {
      console.error("Erro ao verificar transação de pagamento:", error);
      res.status(500).json({ message: "Erro ao verificar transação de pagamento" });
    }
  });

  // Create new payment transaction - Pushin Pay PIX integration
  app.post("/api/payment/pushinpay", requireAuth, async (req, res) => {
    try {
      // Extrair o userId do usuário autenticado - NUNCA do corpo da requisição
      const userId = req.user!.id;
      
      // Log para auditoria de segurança
      console.log(`SEGURANÇA: Criando transação de pagamento para usuário ID: ${userId}`);
      
      // Extrair apenas o valor do corpo da requisição, ignorando qualquer userId que possa ter sido enviado
      let { amount } = req.body;
      
      // Verificar se alguém tentou enviar um userId no corpo da requisição (potencial ataque)
      if (req.body.userId !== undefined && req.body.userId !== userId) {
        console.error(`ALERTA DE SEGURANÇA: Tentativa de criar transação para outro usuário. 
          Usuário real: ${userId}, 
          Usuário tentado: ${req.body.userId}`);
        
        // Continuar processando, mas ignorar o userId enviado no corpo
      }
      
      // Verificar e limpar o valor recebido
      console.log('Valor original recebido:', amount);
      
      // Se for uma string, converter para número
      if (typeof amount === 'string') {
        // Verificar se a string está no formato brasileiro (com vírgula)
        if (amount.includes(',')) {
          // Converter de PT-BR para EN-US
          amount = parseFloat(amount.replace('.', '').replace(',', '.'));
        } else {
          amount = parseFloat(amount);
        }
      }
      
      // Garantir que é um número válido e positivo
      if (isNaN(amount) || amount <= 0) {
        console.error(`Valor inválido: ${req.body.amount} -> ${amount}`);
        return res.status(400).json({ message: "Valor inválido para depósito" });
      }
      
      // Verificar valor mínimo conforme documentação Pushin Pay (50 centavos)
      if (amount < 0.50) {
        return res.status(400).json({ 
          message: "Valor mínimo para depósito é R$ 0,50" 
        });
      }
      
      console.log('Valor convertido:', amount);
      
      // Limitar a 2 casas decimais para evitar problemas de arredondamento
      amount = parseFloat(amount.toFixed(2));
      
      // Get the Pushin Pay gateway
      const gateway = await storage.getPaymentGatewayByType("pushinpay");
      if (!gateway || !gateway.isActive) {
        return res.status(404).json({ message: "Pushin Pay gateway is not available" });
      }
      
      // Capturar a flag de bônus do frontend
      const useBonus = req.body.useBonus === true;
      console.log(`[BÔNUS] Flag useBonus recebida do frontend: ${useBonus}`);
      
      // Create transaction record
      const transaction = await storage.createPaymentTransaction({
        userId,
        gatewayId: gateway.id,
        amount,
        status: "pending",
        type: "deposit", // Especificar explicitamente que é um depósito
        metadata: { useBonus } // Salvar a flag de bônus nos metadados da transação
      });

      try {
        // Verificar se temos o token da Pushin Pay
        if (!process.env.PUSHIN_PAY_TOKEN) {
          throw new Error("Pushin Pay token not configured");
        }
        
        // Gerar o webhook URL para receber notificações da Pushin Pay
        // Em produção, este URL precisa ser acessível publicamente
        const baseUrl = process.env.BASE_URL || "https://app-jogo-do-bicho.replit.app";
        const webhookUrl = `${baseUrl}/api/webhooks/pushinpay`;
        
        // Integração real com Pushin Pay
        const token = process.env.PUSHIN_PAY_TOKEN;
        const apiUrl = 'https://api.pushinpay.com.br/api/pix/cashIn';
        
        console.log(`Iniciando integração com Pushin Pay - Transação ID: ${transaction.id}`);
        
        // Verificar se o valor atende ao mínimo exigido pela API (R$2,00)
        if (amount < 2) {
          throw new Error(`A API da Pushin Pay exige um valor mínimo de R$2,00. Valor digitado: R$${amount.toFixed(2)}`);
        }
        
        // Se o valor recebido for uma string com vírgula, converter para formato com ponto
        if (typeof amount === 'string' && amount.includes(',')) {
          amount = parseFloat(amount.replace('.', '').replace(',', '.'));
        }
        
        // Garantir que o valor tem 2 casas decimais
        amount = parseFloat(amount.toFixed(2));
        
        // IMPORTANTE: A API da Pushin Pay espera valor em centavos (inteiro)
        // R$ 35,00 deve ser enviado como 3500 (trinta e cinco reais em centavos)
        const amountInCents = Math.round(amount * 100);
        
        const requestData = {
          value: amountInCents, // Enviar o valor em centavos (formato inteiro)
          webhook_url: webhookUrl
        };
        
        console.log(`Valor original do usuário: R$${amount.toFixed(2)}`);
        console.log(`Valor convertido para centavos: ${amountInCents}`);
        console.log(`Formato do valor enviado: ${typeof amountInCents}, valor em centavos: ${amountInCents}`);
        
        console.log("Dados da requisição:", requestData);
        
        // Fazer a requisição para a API da Pushin Pay
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestData)
        });
        
        // Verificar se a resposta foi bem-sucedida
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("Erro na resposta da Pushin Pay:", response.status, errorData);
          throw new Error(`Erro na API da Pushin Pay: ${response.status} - ${errorData.message || 'Erro desconhecido'}`);
        }
        
        // Processar a resposta
        const responseData = await response.json();
        console.log("Resposta da Pushin Pay:", JSON.stringify(responseData, null, 2));
        
        // Verificar o valor retornado pela API
        if (responseData.value !== undefined) {
          console.log(`Valor retornado pela API: ${responseData.value} - Tipo: ${typeof responseData.value}`);
        }
        
        if (!responseData.qr_code || !responseData.qr_code_base64) {
          throw new Error("Resposta da Pushin Pay não contém os dados do PIX necessários");
        }
        
        // Extrair os dados relevantes da resposta conforme documentação
        const qrCodeBase64 = responseData.qr_code_base64;
        const qrCodeText = responseData.qr_code;
        const transactionId = responseData.id || `PUSHIN-${Date.now()}-${transaction.id}`;
        
        // Campos adicionais conforme documentação da Pushin Pay
        const endToEndId = responseData.end_to_end_id || null; // Código identificador do PIX pelo Banco Central
        const payerName = responseData.payer_name || null; // Nome do pagador (após pagamento)
        const payerDocument = responseData.payer_national_registration || null; // CPF/CNPJ do pagador (após pagamento)
        const webhookResponse = responseData.webhook || null; // Retorno interno do processamento
        const splitRules = responseData.split_rules || null; // Regras de divisão de valores
        
        // Construir a URL do QR Code
        // Verificar se o base64 já inclui o prefixo
        const qrCodeUrl = qrCodeBase64.startsWith('data:image/png;base64,') 
          ? qrCodeBase64 
          : `data:image/png;base64,${qrCodeBase64}`;
        
        // Criar objeto com dados completos para armazenar
        const completeResponseData = {
          ...responseData,
          end_to_end_id: endToEndId,
          payer_name: payerName,
          payer_national_registration: payerDocument,
          webhook: webhookResponse,
          split_rules: splitRules,
          created_at: new Date().toISOString()
        };
        
        // Atualizar a transação com os dados da Pushin Pay
        const updatedTransaction = await storage.updateTransactionStatus(
          transaction.id,
          "pending",
          transactionId,
          qrCodeUrl || undefined,
          completeResponseData
        );
        
        // Retornar os dados para o cliente
        res.json({
          transactionId: transaction.id,
          externalId: transactionId,
          externalUrl: undefined, // Não há página externa para redirecionar
          pixCopyPasteCode: qrCodeText,
          qrCodeUrl: qrCodeUrl,
          qrCodeBase64: qrCodeBase64,
          amount: amount.toFixed(2),
          status: "pending",
          message: "PIX payment process initiated via Pushin Pay",
          paymentDetails: responseData
        });
        
      } catch (err) {
        const integrationError = err as Error;
        console.error("Error in Pushin Pay integration:", integrationError);
        
        // Marcar a transação como falha
        await storage.updateTransactionStatus(
          transaction.id,
          "failed",
          undefined,
          undefined,
          { error: integrationError.message }
        );
        
        throw new Error(`Failed to process payment: ${integrationError.message}`);
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error creating payment transaction:", error);
      res.status(500).json({ message: error.message || "Error creating payment transaction" });
    }
  });

  // Webhook/callback for Pushin Pay (would be called by the payment provider)
  app.post("/api/webhooks/pushinpay", async (req, res) => {
    try {
      // Log para auditoria de segurança
      console.log("Webhook da Pushin Pay recebido:", JSON.stringify(req.body, null, 2));
      
      const { transactionId, status, externalId, amount, signature } = req.body;
      
      // Validações básicas dos dados
      if (!transactionId || !status) {
        console.error("Webhook com dados incompletos:", req.body);
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Validar que o ID da transação é um número (segurança)
      const parsedTransactionId = parseInt(transactionId);
      if (isNaN(parsedTransactionId)) {
        console.error(`ALERTA DE SEGURANÇA: ID de transação inválido recebido no webhook: ${transactionId}`);
        return res.status(400).json({ message: "Invalid transaction ID format" });
      }
      
      // Em uma implementação real, verificaríamos a assinatura da requisição
      // para garantir que ela veio realmente do gateway de pagamento
      if (process.env.NODE_ENV === 'production') {
        // Obter o gateway para verificar a chave secreta
        const transaction = await storage.getPaymentTransaction(transactionId);
        if (!transaction) {
          return res.status(404).json({ message: "Transaction not found" });
        }
        
        const gateway = await storage.getPaymentGateway(transaction.gatewayId);
        if (!gateway) {
          return res.status(404).json({ message: "Payment gateway not found" });
        }
        
        // Verificar assinatura
        // Esta é uma simulação - em um cenário real, verificaríamos 
        // a assinatura usando a chave secreta do gateway e um algoritmo específico
        if (!gateway.secretKey || !signature) {
          console.warn("Missing webhook signature or secret key for validation");
          // Em produção, poderíamos rejeitar a solicitação se a assinatura for inválida
          // return res.status(401).json({ message: "Invalid webhook signature" });
        }
      }
      
      // Status válidos que podemos receber do gateway
      const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid transaction status" });
      }
      
      // Consultar a transação atual
      const currentTransaction = await storage.getPaymentTransaction(transactionId);
      if (!currentTransaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      // Verificações adicionais para transações já completadas
      if (currentTransaction.status === 'completed' && status === 'completed') {
        return res.status(200).json({ 
          message: "Transaction already processed", 
          status: currentTransaction.status 
        });
      }
      
      // Verificação de segurança adicional: garantir que a transação pertence a um usuário válido
      // e não está sendo manipulada para creditar saldo indevidamente
      const user = await storage.getUser(currentTransaction.userId);
      if (!user) {
        console.error(`ALERTA DE SEGURANÇA: Tentativa de atualizar transação ${transactionId} para usuário inexistente ${currentTransaction.userId}`);
        return res.status(400).json({ message: "Invalid user associated with transaction" });
      }
      
      // Registrar para auditoria
      console.log(`Atualizando status da transação ${transactionId} para ${status}`);
      console.log(`Transação pertence ao usuário ${user.username} (ID: ${user.id})`);
      
      // Atualizar o status da transação
      const updatedTransaction = await storage.updateTransactionStatus(
        transactionId,
        status,
        externalId || undefined,
        currentTransaction.externalUrl || undefined, // Manter a URL externa existente
        req.body // Salvar todo o payload para registro
      );
      
      if (!updatedTransaction) {
        return res.status(404).json({ message: "Failed to update transaction" });
      }
      
      // Se o pagamento foi bem-sucedido, adicionar saldo ao usuário
      if (status === "completed" && updatedTransaction.userId) {
        console.log(`Payment successful for transaction ${transactionId}. Updating user balance.`);
        
        try {
          // Verificar se é o primeiro depósito do usuário
          const userId = updatedTransaction.userId;
          const depositAmount = updatedTransaction.amount;
          
          // Obter as configurações do sistema
          const systemSettings = await storage.getSystemSettings();
          
          // ==== INÍCIO PROCESSAMENTO DE BÔNUS DE PRIMEIRO DEPÓSITO ====
          console.log(`\n[BÔNUS] Verificando elegibilidade para bônus de primeiro depósito para usuário ${userId}`);
          
          // Verificar se o bônus de primeiro depósito está ativado nas configurações
          if (systemSettings?.firstDepositBonusEnabled) {
            console.log(`[BÔNUS] Bônus de primeiro depósito está ATIVADO nas configurações do sistema`);
            console.log(`[BÔNUS] Configurações: Percentual=${systemSettings.firstDepositBonusPercentage}%, Valor máximo=${systemSettings.firstDepositBonusMaxAmount}, Rollover=${systemSettings.firstDepositBonusRollover}x`);
            
            // Primeiro, verificar se há transações anteriores para este usuário (depósitos anteriores)
            const userTransactions = await db
              .select()
              .from(paymentTransactions)
              .where(and(
                eq(paymentTransactions.userId, userId),
                eq(paymentTransactions.type, "deposit"),
                eq(paymentTransactions.status, "completed")
              ));
            
            const isFirstDeposit = userTransactions.length <= 1; // O depósito atual já está na lista
            console.log(`[BÔNUS] Verificação de primeiro depósito: Usuário ${userId} tem ${userTransactions.length} depósitos (incluindo o atual)`);
            console.log(`[BÔNUS] Este ${isFirstDeposit ? 'É' : 'NÃO é'} o primeiro depósito do usuário ${userId}`);
            
            if (!isFirstDeposit) {
              console.log(`[BÔNUS] Não é o primeiro depósito. Ignorando bônus.`);
              // Podemos pular todo o restante do processamento de bônus
            } else {
              // Verificar se o usuário já recebeu bônus de primeiro depósito anteriormente
              console.log(`[BÔNUS] Verificando registro de bônus anteriores para o usuário ${userId}`);
              const hasBonus = await storage.hasUserReceivedFirstDepositBonus(userId);
              
              if (hasBonus) {
                console.log(`[BÔNUS] Usuário ${userId} JÁ recebeu bônus de primeiro depósito anteriormente. Ignorando.`);
              } else {
                console.log(`[BÔNUS] Usuário ${userId} NUNCA recebeu bônus de primeiro depósito. Prosseguindo.`);
                console.log(`[BÔNUS] Aplicando bônus de primeiro depósito para usuário ${userId}`);
                
                // Calcular o valor do bônus
                let bonusAmount = 0;
                
                if (systemSettings.firstDepositBonusPercentage > 0) {
                  // Bônus percentual sobre o valor do depósito
                  console.log(`[BÔNUS] Calculando bônus percentual: ${depositAmount} * ${systemSettings.firstDepositBonusPercentage}%`);
                  bonusAmount = (depositAmount * systemSettings.firstDepositBonusPercentage) / 100;
                  console.log(`[BÔNUS] Valor calculado inicialmente: ${bonusAmount}`);
                  
                  // Limitar ao valor máximo de bônus, se configurado
                  if (systemSettings.firstDepositBonusMaxAmount > 0 && bonusAmount > systemSettings.firstDepositBonusMaxAmount) {
                    console.log(`[BÔNUS] Valor calculado (${bonusAmount}) excede o máximo permitido (${systemSettings.firstDepositBonusMaxAmount}). Limitando.`);
                    bonusAmount = systemSettings.firstDepositBonusMaxAmount;
                  }
                } else {
                  // Valor fixo de bônus
                  console.log(`[BÔNUS] Usando valor fixo de bônus: ${systemSettings.firstDepositBonusAmount}`);
                  bonusAmount = systemSettings.firstDepositBonusAmount;
                }
                
                // Arredondar para 2 casas decimais
                bonusAmount = parseFloat(bonusAmount.toFixed(2));
                console.log(`[BÔNUS] Valor final do bônus após arredondamento: ${bonusAmount}`);
                
                if (bonusAmount > 0) {
                  console.log(`[BÔNUS] Valor do bônus é positivo (${bonusAmount}). Prosseguindo com a criação.`);
                  
                  // Calcular o rollover e a data de expiração
                  const rolloverAmount = bonusAmount * systemSettings.firstDepositBonusRollover;
                  const expirationDays = systemSettings.firstDepositBonusExpiration || 7;
                  
                  // Configurar data de expiração
                  const expirationDate = new Date();
                  expirationDate.setDate(expirationDate.getDate() + expirationDays);
                  
                  console.log(`[BÔNUS] Detalhes do bônus a ser criado:
                    - Usuário: ${userId}
                    - Tipo: first_deposit
                    - Valor: ${bonusAmount}
                    - Valor disponível: ${bonusAmount}
                    - Rollover necessário: ${rolloverAmount}
                    - Validade: ${expirationDays} dias (até ${expirationDate})
                    - Transação relacionada: ${updatedTransaction.id}`);
                  
                  try {
                    // Criar o bônus
                    const bonus = await storage.createUserBonus({
                      userId,
                      type: "first_deposit",
                      amount: bonusAmount,
                      remainingAmount: bonusAmount,
                      rolloverAmount,
                      status: "active",
                      expiresAt: expirationDate,
                      relatedTransactionId: updatedTransaction.id
                    });
                    
                    console.log(`[BÔNUS] Bônus de primeiro depósito criado com ID ${bonus.id}: R$${bonusAmount.toFixed(2)}, Rollover: R$${rolloverAmount.toFixed(2)}`);
                    
                    // Verificar se o bônus foi criado corretamente
                    const createdBonus = await db
                      .select()
                      .from(userBonuses)
                      .where(eq(userBonuses.id, bonus.id));
                    
                    if (createdBonus.length === 0) {
                      console.error(`[BÔNUS] ERRO CRÍTICO: O bônus com ID ${bonus.id} não foi encontrado na base de dados após a criação!`);
                    } else {
                      console.log(`[BÔNUS] Verificação pós-criação do bônus: Bônus encontrado na base de dados. ID: ${createdBonus[0].id}, Tipo: ${createdBonus[0].type}`);
                    }
                    
                    // Criar uma transação para registrar o bônus recebido
                    console.log(`[BÔNUS] Registrando transação para o bônus`);
                    const bonusTransaction = await storage.createTransaction({
                      userId,
                      type: "deposit", // Usando "deposit" em vez de "bonus" para compatibilidade
                      amount: bonusAmount,
                      description: "Bônus de primeiro depósito",
                      relatedId: bonus.id // Vinculando explicitamente à transação
                    });
                    
                    console.log(`[BÔNUS] Transação registrada com ID ${bonusTransaction.id}`);
                    
                    // *** ETAPA CRÍTICA: Atualizar o saldo de bônus do usuário ***
                    console.log(`[BÔNUS] ETAPA CRÍTICA: Chamando updateUserBonusBalance para atualizar saldo de usuário ${userId} com +${bonusAmount}`);
                    
                    // Verificar saldo antes da atualização
                    const bonusBalanceBefore = await storage.getUserBonusBalance(userId);
                    console.log(`[BÔNUS] Saldo de bônus ANTES da atualização: R$${bonusBalanceBefore}`);
                    
                    // Atualizar saldo de bônus
                    await storage.updateUserBonusBalance(userId, bonusAmount);
                    
                    // Verificar se o saldo foi atualizado corretamente com várias verificações
                    const updatedBonus = await storage.getUserBonusBalance(userId);
                    console.log(`[BÔNUS] Saldo de BÔNUS do usuário APÓS atualização: R$${updatedBonus}`);
                    
                    // Verificação adicional: consultar todos os bônus do usuário
                    const allUserBonuses = await storage.getUserBonuses(userId);
                    console.log(`[BÔNUS] Verificação adicional: Usuário ${userId} tem ${allUserBonuses.length} bônus no total`);
                    
                    const expectedBalance = bonusBalanceBefore + bonusAmount;
                    if (Math.abs(updatedBonus - expectedBalance) < 0.01) { // Tolerância para arredondamento
                      console.log(`[BÔNUS] ✅ SUCESSO: Bônus aplicado corretamente. Saldo anterior: R$${bonusBalanceBefore}, Adicionado: R$${bonusAmount}, Novo saldo: R$${updatedBonus}`);
                    } else {
                      console.error(`[BÔNUS] ❌ ERRO: Bônus não foi aplicado corretamente ao saldo. Esperado: R$${expectedBalance}, Atual: R$${updatedBonus}`);
                    }
                  } catch (error) {
                    console.error(`[BÔNUS] ERRO ao processar bônus: ${error.message}`);
                    console.error(error.stack);
                  }
                } else {
                  console.log(`[BÔNUS] Valor do bônus calculado é zero ou negativo (${bonusAmount}). Ignorando.`);
                }
              }
            }
          } else {
            console.log(`[BÔNUS] Bônus de primeiro depósito está DESATIVADO nas configurações do sistema`);
          }
          console.log(`[BÔNUS] Fim do processamento de bônus de primeiro depósito\n`);
          // ==== FIM PROCESSAMENTO DE BÔNUS DE PRIMEIRO DEPÓSITO ====
          
          // Verificar se o bônus de cadastro está ativado e ainda não foi concedido
          if (systemSettings?.signupBonusEnabled) {
            const hasSignupBonus = await storage.hasUserReceivedSignupBonus(userId);
            
            if (!hasSignupBonus) {
              console.log(`Aplicando bônus de cadastro para usuário ${userId}`);
              
              const bonusAmount = systemSettings.signupBonusAmount;
              const rolloverAmount = bonusAmount * systemSettings.signupBonusRollover;
              
              // Criar o bônus de cadastro
              await storage.createUserBonus({
                userId,
                type: "signup",
                amount: bonusAmount,
                remainingAmount: bonusAmount,
                rolloverAmount,
                status: "active"
              });
              
              console.log(`Bônus de cadastro criado: R$${bonusAmount.toFixed(2)}, Rollover: R$${rolloverAmount.toFixed(2)}`);
            }
          }
          
          // Atualizar o saldo do usuário com o valor do depósito
          const user = await storage.updateUserBalance(userId, depositAmount);
          console.log(`User balance updated successfully. New balance: ${user?.balance}`);
        } catch (balanceError) {
          console.error("Error updating user balance:", balanceError);
          // Continuamos o processo mesmo que a atualização do saldo falhe,
          // mas registramos um erro para investigação posterior
        }
      }
      
      // Resposta de sucesso
      res.json({ 
        message: "Webhook processed successfully",
        transactionId,
        status: updatedTransaction.status
      });
    } catch (err) {
      const error = err as Error;
      console.error("Error processing payment webhook:", error);
      res.status(500).json({ message: "Error processing payment webhook" });
    }
  });

  // ========== Rotas para gerenciamento de saques ==========
  
  // Solicitar um saque (requer autenticação)
  app.post('/api/withdrawals', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Validar e extrair dados do corpo da requisição
      const withdrawalData = insertWithdrawalSchema.parse({
        ...req.body,
        userId
      });
      
      console.log(`Solicitação de saque recebida para usuário ${userId}:`, withdrawalData);
      
      // Criar a solicitação de saque
      const withdrawal = await storage.createWithdrawal(withdrawalData);
      
      // Resposta de sucesso
      res.status(201).json(withdrawal);
    } catch (error) {
      console.error("Erro ao processar solicitação de saque:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Dados inválidos", 
          errors: error.errors 
        });
      }
      
      // Para erros de negócio que já possuem mensagem formatada (ex: saldo insuficiente)
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Erro ao processar solicitação de saque" });
    }
  });
  
  // Obter todos os saques do usuário
  app.get('/api/withdrawals', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const withdrawals = await storage.getUserWithdrawals(userId);
      res.json(withdrawals);
    } catch (error) {
      console.error(`Erro ao buscar saques do usuário ${req.user.id}:`, error);
      res.status(500).json({ message: "Erro ao buscar histórico de saques" });
    }
  });
  
  // Obter um saque específico
  app.get('/api/withdrawals/:id', requireAuth, async (req, res) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      if (isNaN(withdrawalId)) {
        return res.status(400).json({ message: "ID de saque inválido" });
      }
      
      const withdrawal = await storage.getWithdrawal(withdrawalId);
      
      if (!withdrawal) {
        return res.status(404).json({ message: "Saque não encontrado" });
      }
      
      // Verificar se o saque pertence ao usuário atual, a menos que seja admin
      if (withdrawal.userId !== req.user.id && !req.user.isAdmin) {
        console.log(`NEGADO: Usuário ${req.user.id} tentando acessar saque ${withdrawalId} do usuário ${withdrawal.userId}`);
        return res.status(403).json({ message: "Acesso negado" });
      }
      
      res.json(withdrawal);
    } catch (error) {
      console.error(`Erro ao buscar saque ${req.params.id}:`, error);
      res.status(500).json({ message: "Erro ao buscar detalhes do saque" });
    }
  });
  
  // Rotas administrativas para saques
  
  // Listar todos os saques (apenas admin)
  app.get('/api/admin/withdrawals', requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as WithdrawalStatus | undefined;
      
      const withdrawals = await storage.getAllWithdrawals(status);
      res.json(withdrawals);
    } catch (error) {
      console.error("Erro ao buscar todos os saques:", error);
      res.status(500).json({ message: "Erro ao buscar saques" });
    }
  });
  
  // Aprovar ou rejeitar um saque (apenas admin)
  // Verificar o saldo disponível no gateway Pushin Pay
  async function checkPushinPayBalance(): Promise<number> {
    try {
      // Obter o gateway Pushin Pay
      const gateway = await storage.getPaymentGatewayByType("pushinpay");
      if (!gateway) {
        throw new Error("Gateway Pushin Pay não encontrado");
      }
      
      // Exemplo de URL da API para verificar saldo (substituir pelo endpoint correto)
      const apiUrl = "https://api.pushinpay.com.br/api/v2/balance";
      
      // Cabeçalhos de autenticação
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${gateway.apiKey}`
      };
      
      // Fazer requisição para a API da Pushin Pay
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro ao verificar saldo: ${errorData.message || response.statusText}`);
      }
      
      const data = await response.json();
      
      // Extrair saldo da resposta (adaptado para o formato de resposta real da API)
      const balance = data.balance || data.amount || 0;
      console.log(`Saldo disponível no gateway Pushin Pay: R$ ${balance.toFixed(2)}`);
      
      return balance;
    } catch (error) {
      console.error("Erro ao verificar saldo no gateway:", error);
      
      // Em caso de erro, retornar 0 para indicar que não há saldo disponível
      // ou tratar alguma lógica de fallback conforme necessário
      return 0;
    }
  }

  app.get('/api/admin/gateway-balance', requireAdmin, async (req, res) => {
    try {
      const balance = await checkPushinPayBalance();
      res.json({ balance });
    } catch (error) {
      console.error("Erro ao obter saldo do gateway:", error);
      res.status(500).json({ message: "Erro ao obter saldo do gateway" });
    }
  });

  app.patch('/api/admin/withdrawals/:id/status', requireAdmin, async (req, res) => {
    try {
      const withdrawalId = parseInt(req.params.id);
      if (isNaN(withdrawalId)) {
        return res.status(400).json({ message: "ID de saque inválido" });
      }
      
      const { status, rejectionReason, notes } = req.body;
      
      // Validar status
      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Status inválido. Use 'approved' ou 'rejected'" });
      }
      
      // Validar motivo de rejeição quando o status é 'rejected'
      if (status === 'rejected' && !rejectionReason) {
        return res.status(400).json({ message: "Motivo de rejeição é obrigatório para saques rejeitados" });
      }
      
      // Se o status for "approved", verificar se há saldo disponível no gateway
      if (status === "approved") {
        // Obter os detalhes do saque
        const withdrawal = await storage.getWithdrawal(withdrawalId);
        if (!withdrawal) {
          return res.status(404).json({ message: "Saque não encontrado" });
        }
        
        // Verificar o saldo disponível no gateway
        const gatewayBalance = await checkPushinPayBalance();
        
        // Verificar se o saldo é suficiente para realizar o saque
        if (gatewayBalance < withdrawal.amount) {
          return res.status(400).json({ 
            message: "Saldo insuficiente no gateway de pagamento", 
            availableBalance: gatewayBalance,
            requiredAmount: withdrawal.amount
          });
        }
        
        console.log(`Saldo disponível no gateway: R$ ${gatewayBalance.toFixed(2)} - Suficiente para o saque de R$ ${withdrawal.amount.toFixed(2)}`);
      }
      
      // Atualizar status do saque
      const withdrawal = await storage.updateWithdrawalStatus(
        withdrawalId, 
        status as WithdrawalStatus, 
        req.user.id, // ID do admin que está processando
        rejectionReason,
        notes
      );
      
      // Se o saque for aprovado, mudar o status para "processing" e iniciar pagamento via API
      if (status === "approved") {
        // Atualizar status do saque para "processing"
        const processingWithdrawal = await storage.updateWithdrawalStatus(
          withdrawalId,
          "processing" as WithdrawalStatus,
          req.user.id
        );
        
        // TODO: Iniciar o pagamento via API da Pushin Pay
        // Isso seria implementado aqui, ou em um processo assíncrono
        
        res.json(processingWithdrawal);
      } else {
        res.json(withdrawal);
      }
    } catch (error) {
      console.error(`Erro ao atualizar status do saque ${req.params.id}:`, error);
      
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Erro ao processar saque" });
    }
  });
  
  // ========== Rotas para histórico de transações financeiras ==========
  
  // Obter histórico de transações do usuário logado
  app.get('/api/transactions/history', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const transactions = await storage.getUserTransactionHistory(userId);
      res.json(transactions);
    } catch (error) {
      console.error(`Erro ao buscar histórico de transações do usuário ${req.user.id}:`, error);
      res.status(500).json({ message: "Erro ao buscar histórico de transações" });
    }
  });
  
  // Rotas administrativas para transações
  
  // Listar todas as transações (apenas admin)
  app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
    try {
      // Extrair parâmetros de filtro da query
      const type = req.query.type as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const transactions = await storage.getAllTransactions(
        type as any, 
        startDate,
        endDate
      );
      
      res.json(transactions);
    } catch (error) {
      console.error("Erro ao buscar todas as transações:", error);
      res.status(500).json({ message: "Erro ao buscar transações" });
    }
  });
  
  // Obter resumo de transações para relatório financeiro (apenas admin)
  app.get('/api/admin/transactions/summary', requireAdmin, async (req, res) => {
    try {
      // Extrair parâmetros de filtro da query
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const summary = await storage.getTransactionsSummary(startDate, endDate);
      
      res.json(summary);
    } catch (error) {
      console.error("Erro ao gerar resumo de transações:", error);
      res.status(500).json({ message: "Erro ao gerar resumo financeiro" });
    }
  });
  
  /**
   * API para obter as configurações de bônus atuais
   * IMPLEMENTAÇÃO REESCRITA DO ZERO
   */
  app.get("/api/admin/bonus-settings", requireAdmin, async (req, res) => {
    try {
      // Usando o novo módulo especializado
      const { getBonusSettings } = require("./bonus-settings");
      const bonusSettings = await getBonusSettings();
      
      console.log("Enviando configurações de bônus:", JSON.stringify(bonusSettings));
      res.json(bonusSettings);
    } catch (error) {
      console.error("Erro ao obter configurações de bônus:", error);
      res.status(500).json({ message: "Erro ao obter configurações de bônus" });
    }
  });
  
  /**
   * Endpoint para forçar atualização da configuração de bônus para 98%
   * Apenas para teste e debug
   */
  app.post('/api/debug/update-bonus-percentage', async (req, res) => {
    try {
      await pool.query(`
        UPDATE system_settings 
        SET first_deposit_bonus_percentage = 98
        WHERE id = (SELECT id FROM system_settings LIMIT 1)
      `);
      
      res.json({ message: 'Porcentagem de bônus atualizada para 98%' });
    } catch (error) {
      console.error('Erro ao atualizar porcentagem de bônus:', error);
      res.status(500).json({ message: 'Erro ao atualizar porcentagem de bônus' });
    }
  });

  /**
   * API pública para obter as configurações de bônus atuais
   * Disponível para usuários logados e não logados
   * Usa EXATAMENTE a mesma lógica do endpoint admin para garantir sincronização
   */
  app.get("/api/bonus-settings", async (req, res) => {
    try {
      console.log('Buscando configurações de bônus para usuários...');
      
      const settings = await storage.getSystemSettings();
      
      if (!settings) {
        console.log('Configurações não encontradas, retornando padrões');
        return res.status(404).json({ message: "System settings not found" });
      }
      
      const defaultConfig = {
        signupBonus: {
          enabled: false,
          amount: 15,
          rollover: 2,
          expiration: 7
        },
        firstDepositBonus: {
          enabled: false,
          amount: 100,
          percentage: 100,
          maxAmount: 300,
          rollover: 2,
          expiration: 14
        },
        promotionalBanners: {
          enabled: false
        }
      };
      
      const response = {
        signupBonus: {
          enabled: settings?.signupBonusEnabled ?? defaultConfig.signupBonus.enabled,
          amount: Number(settings?.signupBonusAmount ?? defaultConfig.signupBonus.amount),
          rollover: Number(settings?.signupBonusRollover ?? defaultConfig.signupBonus.rollover),
          expiration: Number(settings?.signupBonusExpiration ?? defaultConfig.signupBonus.expiration)
        },
        firstDepositBonus: {
          enabled: settings?.firstDepositBonusEnabled ?? false,
          amount: Number(settings?.firstDepositBonusAmount ?? defaultConfig.firstDepositBonus.amount),
          percentage: Number(settings?.firstDepositBonusPercentage ?? defaultConfig.firstDepositBonus.percentage),
          maxAmount: Number(settings?.firstDepositBonusMaxAmount ?? defaultConfig.firstDepositBonus.maxAmount),
          rollover: Number(settings?.firstDepositBonusRollover ?? defaultConfig.firstDepositBonus.rollover),
          expiration: Number(settings?.firstDepositBonusExpiration ?? defaultConfig.firstDepositBonus.expiration)
        },
        promotionalBanners: {
          enabled: settings?.promotionalBannersEnabled ?? false
        }
      };
      
      console.log('Enviando resposta de configurações de bônus para usuários:', JSON.stringify(response));
      res.json(response);
    } catch (error) {
      console.error("Erro ao buscar configurações de bônus:", error);
      res.status(500).json({ 
        message: "Erro ao buscar configurações de bônus",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * API para salvar as configurações de bônus
   * IMPLEMENTAÇÃO REESCRITA DO ZERO
   */
  app.post("/api/admin/bonus-settings", requireAdmin, async (req, res) => {
    try {
      const { saveBonusSettings } = require("./bonus-settings");
      const bonusConfig = req.body;
      
      console.log("Recebido para salvar:", JSON.stringify(bonusConfig));
      
      // Validando se o formato dos dados recebidos está correto
      if (!bonusConfig.signupBonus || !bonusConfig.firstDepositBonus) {
        return res.status(400).json({ 
          message: "Formato de dados inválido. Verifique a estrutura dos dados enviados."
        });
      }
      
      // Utiliza o módulo especializado para salvar
      const success = await saveBonusSettings(bonusConfig);
      
      if (success) {
        res.json({ 
          message: "Configurações de bônus salvas com sucesso",
          data: bonusConfig
        });
      } else {
        res.status(500).json({ 
          message: "Erro ao salvar configurações de bônus"
        });
      }
    } catch (error) {
      console.error("Erro ao salvar configurações de bônus:", error);
      res.status(500).json({ 
        message: "Erro ao salvar configurações de bônus",
        error: error.message || "Erro desconhecido"
      });
    }
  });

  /**
   * API para obter os bônus ativos do usuário
   */
  app.get("/api/user/bonuses", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const bonuses = await storage.getUserBonuses(userId);
      res.json(bonuses);
    } catch (error) {
      console.error("Erro ao obter bônus do usuário:", error);
      res.status(500).json({ message: "Erro ao obter bônus do usuário" });
    }
  });
  
  /**
   * API para obter o saldo total de bônus do usuário
   */
  app.get("/api/user/bonus-balance", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const bonusBalance = await storage.getUserBonusBalance(userId);
      
      res.json({ bonusBalance });
    } catch (error) {
      console.error("Erro ao obter saldo de bônus do usuário:", error);
      res.status(500).json({ message: "Erro ao obter saldo de bônus do usuário" });
    }
  });
  
  /**
   * API para consultar bônus de um usuário específico (apenas para testes e admin)
   */
  app.get("/api/admin/user/:userId/bonuses", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "ID de usuário inválido" });
      }
      
      const bonuses = await storage.getUserBonuses(userId);
      console.log(`Bônus do usuário ${userId}:`, bonuses);
      
      res.json(bonuses);
    } catch (error) {
      console.error("Erro ao buscar bônus do usuário:", error);
      res.status(500).json({ message: "Erro ao buscar bônus do usuário" });
    }
  });
  
  /**
   * API para testar a funcionalidade de bônus de primeiro depósito (apenas para admin)
   */
  app.post("/api/admin/test/first-deposit-bonus", requireAdmin, async (req, res) => {
    try {
      const { userId, amount } = req.body;
      
      if (!userId || !amount) {
        return res.status(400).json({ message: "Informe userId e amount para o teste" });
      }
      
      // Obter o usuário
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      // Obter configurações do sistema
      const systemSettings = await storage.getSystemSettings();
      if (!systemSettings) {
        return res.status(500).json({ message: "Configurações do sistema não encontradas" });
      }
      
      // Criar uma transação de depósito para teste
      const paymentGateways = await storage.getAllPaymentGateways();
      const gateway = paymentGateways[0]; // Usar o primeiro gateway disponível
      
      if (!gateway) {
        return res.status(404).json({ message: "Nenhum gateway de pagamento disponível" });
      }
      
      // Criar transação
      const transaction = await storage.createPaymentTransaction({
        userId,
        type: "deposit",
        amount,
        status: "pending",
        gatewayId: gateway.id,
        externalId: `test_${Date.now()}`,
      });
      
      console.log(`Transação de teste criada: ${transaction.id} para usuário ${userId}`);
      
      // Atualizar status da transação para completed (o bônus será processado automaticamente pelo webhook)
      const updatedTransaction = await storage.updateTransactionStatus(
        transaction.id,
        "completed",
        transaction.externalId,
        transaction.externalUrl,
        { test: true }
      );
      
      // Adicionar o valor do depósito ao saldo do usuário
      const updatedUser = await storage.updateUserBalance(userId, amount);
      
      res.json({
        message: "Depósito de teste processado com sucesso",
        transaction: updatedTransaction,
        user: updatedUser,
        note: "O bônus será aplicado automaticamente se configurado"
      });
    } catch (error) {
      console.error("Erro ao testar bônus de primeiro depósito:", error);
      res.status(500).json({ message: "Erro ao testar bônus de primeiro depósito" });
    }
  });

  /**
   * API para obter banners de login
   */
  app.get("/api/login-banners", async (req, res) => {
    try {
      const banners = await storage.getLoginBanners();
      res.json(banners);
    } catch (error) {
      console.error("Erro ao obter banners de login:", error);
      res.status(500).json({ message: "Erro ao obter banners de login" });
    }
  });

  /**
   * API para obter todos os banners promocionais (admin)
   */
  app.get("/api/admin/promotional-banners", requireAdmin, async (req, res) => {
    try {
      const banners = await storage.getPromotionalBanners(false);
      res.json(banners);
    } catch (error) {
      console.error("Erro ao obter banners promocionais:", error);
      res.status(500).json({ message: "Erro ao obter banners promocionais" });
    }
  });

  /**
   * API para criar um novo banner promocional
   */
  app.post("/api/admin/promotional-banners", requireAdmin, async (req, res) => {
    try {
      const banner = req.body;
      const newBanner = await storage.createPromotionalBanner(banner);
      res.status(201).json(newBanner);
    } catch (error) {
      console.error("Erro ao criar banner promocional:", error);
      res.status(500).json({ message: "Erro ao criar banner promocional" });
    }
  });

  /**
   * API para atualizar um banner promocional existente
   */
  app.patch("/api/admin/promotional-banners/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const banner = req.body;
      const updatedBanner = await storage.updatePromotionalBanner(id, banner);
      
      if (!updatedBanner) {
        return res.status(404).json({ message: "Banner não encontrado" });
      }
      
      res.json(updatedBanner);
    } catch (error) {
      console.error("Erro ao atualizar banner promocional:", error);
      res.status(500).json({ message: "Erro ao atualizar banner promocional" });
    }
  });

  /**
   * API para excluir um banner promocional
   */
  app.delete("/api/admin/promotional-banners/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deletePromotionalBanner(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Banner não encontrado" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir banner promocional:", error);
      res.status(500).json({ message: "Erro ao excluir banner promocional" });
    }
  });

  const httpServer = createServer(app);
  // ========== ROTAS PARA VERIFICAÇÃO DE SAQUES EM PROCESSAMENTO ==========
  
  // Verificar status de saques em processamento (admin)
  app.post("/api/admin/check-withdrawals", requireAdmin, async (req, res) => {
    try {
      // Buscar todos os saques com status "processing"
      const processingSaques = await storage.getAllWithdrawals("processing" as WithdrawalStatus);
      
      console.log(`Verificando ${processingSaques.length} saques em processamento...`);
      
      const results = [];
      let updatedCount = 0;
      
      // Para cada saque em processamento, verificar se o pagamento foi concluído
      for (const saque of processingSaques) {
        try {
          // Buscar gateway ativo
          const gateway = await storage.getPaymentGatewayByType("pushinpay");
          if (!gateway || !gateway.isActive) {
            console.warn("Nenhum gateway de pagamento ativo encontrado para verificar saques");
            results.push({
              id: saque.id,
              status: "processing",
              message: "Nenhum gateway de pagamento ativo configurado"
            });
            continue;
          }
          
          console.log(`Verificando saque ID=${saque.id} (R$ ${saque.amount}) para ${saque.pixKey}`);
          
          // Em uma implementação real, faríamos uma chamada para a API do gateway
          // Aqui estamos simulando uma verificação básica baseada em tempo
          // O ideal seria usar o ID da transação externa e verificar o status no gateway
          
          // Apenas para simulação: 20% de chance do pagamento estar concluído
          const shouldComplete = Math.random() < 0.2;
          
          if (shouldComplete) {
            // Atualizar o saque para "approved"
            await storage.updateWithdrawalStatus(
              saque.id,
              "approved" as WithdrawalStatus,
              null, // processedBy - automático
              null, // rejectionReason
              "Pagamento confirmado pelo gateway"
            );
            
            console.log(`Saque ID=${saque.id} confirmado pelo gateway e marcado como aprovado!`);
            
            results.push({
              id: saque.id,
              status: "approved",
              message: "Pagamento confirmado pelo gateway"
            });
            
            updatedCount++;
          } else {
            results.push({
              id: saque.id,
              status: "processing",
              message: "Saque ainda em processamento pelo gateway"
            });
          }
        } catch (err) {
          console.error(`Erro ao verificar saque ID=${saque.id}:`, err);
          results.push({
            id: saque.id,
            status: "error",
            message: err instanceof Error ? err.message : "Erro desconhecido"
          });
        }
      }
      
      res.json({
        message: `Verificação concluída para ${processingSaques.length} saques`,
        updatedCount,
        results
      });
    } catch (error) {
      console.error("Erro ao verificar saques em processamento:", error);
      res.status(500).json({ message: "Erro ao verificar saques" });
    }
  });

  // Rota para verificação automática periódica de saques em processamento
  app.post("/api/check-withdrawals-auto", async (req, res) => {
    try {
      // Verificar token de acesso (para evitar chamadas não autorizadas)
      const { token } = req.body;
      
      if (token !== process.env.PUSHIN_PAY_TOKEN) {
        return res.status(401).json({ message: "Token inválido" });
      }
      
      // Buscar todos os saques com status "processing"
      const processingSaques = await storage.getAllWithdrawals("processing" as WithdrawalStatus);
      
      console.log(`Verificação automática de saques: ${processingSaques.length} saques em processamento...`);
      
      const results = [];
      let updatedCount = 0;
      
      // Para cada saque em processamento, verificar se o pagamento foi concluído
      for (const saque of processingSaques) {
        try {
          // Verificar apenas saques com mais de 5 minutos (para dar tempo ao gateway)
          const tempoProcessamento = new Date().getTime() - new Date(saque.requestedAt).getTime();
          const minutos = Math.floor(tempoProcessamento / (1000 * 60));
          
          if (minutos < 5) {
            console.log(`Saque ID=${saque.id} tem apenas ${minutos} minutos, aguardando mais tempo`);
            results.push({
              id: saque.id,
              status: "processing",
              message: `Aguardando mais tempo (${minutos} minutos)`
            });
            continue;
          }
          
          // Verificar com o gateway o status do pagamento
          console.log(`Verificando saque ID=${saque.id} (R$ ${saque.amount}) para ${saque.pixKey}`);
          
          // Em uma implementação real, chamaríamos a API do gateway
          // Aqui estamos simulando uma verificação baseada em tempo
          const tempoHoras = minutos / 60;
          
          // Após 1 hora, 50% de chance de aprovar automaticamente (apenas simulação)
          if (tempoHoras > 1 && Math.random() < 0.5) {
            await storage.updateWithdrawalStatus(
              saque.id,
              "approved" as WithdrawalStatus,
              null,
              null,
              `Pagamento confirmado automaticamente após ${tempoHoras.toFixed(1)}h de processamento`
            );
            
            console.log(`Saque ID=${saque.id} aprovado automaticamente após ${tempoHoras.toFixed(1)}h`);
            
            results.push({
              id: saque.id,
              status: "approved",
              message: `Aprovado após ${tempoHoras.toFixed(1)}h`
            });
            
            updatedCount++;
          } else {
            results.push({
              id: saque.id,
              status: "processing",
              message: `Ainda em processamento (${tempoHoras.toFixed(1)}h)`
            });
          }
        } catch (err) {
          console.error(`Erro ao verificar saque ID=${saque.id}:`, err);
          results.push({
            id: saque.id,
            status: "error",
            message: err instanceof Error ? err.message : "Erro desconhecido"
          });
        }
      }
      
      res.json({
        message: `Verificação automática concluída para ${processingSaques.length} saques`,
        updatedCount,
        results
      });
    } catch (error) {
      console.error("Erro na verificação automática de saques:", error);
      res.status(500).json({ message: "Erro ao verificar saques" });
    }
  });
  
  // Endpoint para atualizar o esquema de configurações do sistema (adicionar novos campos)
  app.get('/api/admin/update-system-schema', async (req, res) => {
    if (!req.isAuthenticated() || !req.user.isAdmin) {
      return res.status(403).json({ error: "Acesso não autorizado" });
    }
    
    try {
      // Verificar se os novos campos existem
      const checkColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'system_settings' 
        AND column_name IN ('site_name', 'site_description', 'logo_url', 'favicon_url')
      `);
      
      const existingColumns = checkColumns.rows.map((row: any) => row.column_name);
      console.log("Colunas existentes:", existingColumns);
      
      // Adicionar colunas ausentes
      const columnsToAdd = [];
      if (!existingColumns.includes('site_name')) columnsToAdd.push("site_name TEXT NOT NULL DEFAULT 'Jogo do Bicho'");
      if (!existingColumns.includes('site_description')) columnsToAdd.push("site_description TEXT NOT NULL DEFAULT 'A melhor plataforma de apostas online'");
      if (!existingColumns.includes('logo_url')) columnsToAdd.push("logo_url TEXT NOT NULL DEFAULT '/img/logo.png'");
      if (!existingColumns.includes('favicon_url')) columnsToAdd.push("favicon_url TEXT NOT NULL DEFAULT '/img/favicon.png'");
      
      if (columnsToAdd.length > 0) {
        // Executar alteração no banco de dados
        const alterQuery = `
          ALTER TABLE system_settings 
          ${columnsToAdd.map(col => `ADD COLUMN IF NOT EXISTS ${col}`).join(', ')}
        `;
        
        console.log("Executando alteração:", alterQuery);
        await pool.query(alterQuery);
        
        res.json({ 
          success: true, 
          message: `Adicionados ${columnsToAdd.length} novos campos à tabela system_settings`,
          added_fields: columnsToAdd
        });
      } else {
        res.json({ 
          success: true, 
          message: "Todos os campos já existem na tabela system_settings",
          existing_fields: existingColumns
        });
      }
    } catch (error) {
      console.error("Erro ao atualizar esquema de system_settings:", error);
      res.status(500).json({ 
        success: false,
        error: "Erro ao atualizar esquema", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ======== EZZEBANK Payment Gateway Routes ========
  
  // Teste de conectividade EZZEBANK (rota pública para teste)
  app.post("/api/ezzebank/test-connection", async (req, res) => {
    try {
      console.log('🧪 EZZEBANK: Iniciando teste de conectividade...');
      
      const ezzebankService = createEzzebankService();
      
      // Tentar criar um pagamento de teste muito pequeno
      const testPayment = await ezzebankService.createPixPayment({
        amount: 1.00,
        description: 'Teste de conectividade EZZEBANK',
        externalId: `test_${Date.now()}`,
        customerName: 'Teste Usuario',
        customerEmail: 'teste@exemplo.com',
        customerDocument: '00000000000'
      });

      console.log('✅ EZZEBANK: Teste de conectividade bem-sucedido!', {
        paymentId: testPayment.id,
        status: testPayment.status,
        amount: testPayment.amount
      });

      res.json({
        success: true,
        message: 'Conectividade com EZZEBANK funcionando!',
        testData: {
          paymentId: testPayment.id,
          status: testPayment.status,
          amount: testPayment.amount,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
        }
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro no teste de conectividade:', error);
      res.json({
        success: false,
        error: 'Falha na conectividade',
        details: error instanceof Error ? error.message : String(error),
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
      });
    }
  });
  
  // Criar pagamento PIX com EZZEBANK
  app.post("/api/ezzebank/create-pix-payment", requireAuth, async (req, res) => {
    try {
      const { amount, description } = req.body;
      const user = req.user!;
      
      // 🎁 Capturar a flag de bônus do frontend (CORREÇÃO CRÍTICA)
      const useBonus = req.body.useBonus === true;
      console.log(`[BÔNUS] EZZEBANK - Flag useBonus recebida: ${useBonus}`);
      
      console.log('🏦 EZZEBANK: Iniciando criação de pagamento PIX:', {
        userId: user.id,
        amount,
        description
      });

      const ezzebankService = createEzzebankService();
      
      // Gerar ID externo único
      const externalId = `deposit_${user.id}_${Date.now()}`;
      
      const payment = await ezzebankService.createPixPayment({
        amount: Number(amount),
        description: description || 'Depósito na plataforma',
        externalId,
        customerName: user.username,
        customerEmail: user.email || `${user.username}@exemplo.com`,
        customerDocument: user.cpf || '00000000000',
        webhookUrl: `${process.env.WEBHOOK_URL || 'https://seu-dominio.com'}/api/ezzebank/webhook`
      });

      // Buscar gateway EZZEBANK
      const gateway = await storage.getPaymentGatewayByType('ezzebank');
      if (!gateway) {
        return res.status(404).json({ message: "Gateway EZZEBANK não encontrado" });
      }

      // Criar transação no banco (CORRIGIDO para incluir flag de bônus)
      await storage.createPaymentTransaction({
        userId: user.id,
        amount: Number(amount),
        status: 'pending',
        type: 'deposit',
        gatewayId: gateway.id,
        externalId: payment.id,
        metadata: { useBonus } // 🎁 CORREÇÃO CRÍTICA: Salvar flag de bônus
      });

      console.log('✅ EZZEBANK: Pagamento PIX criado com sucesso:', payment.id);

      res.json({
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount,
          pixKey: payment.pixKey,
          qrCode: payment.qrCode,
          qrCodeImage: payment.qrCodeImage,
          expiresAt: payment.expiresAt,
          status: payment.status
        }
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao criar pagamento PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao criar pagamento',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Criar saque PIX com EZZEBANK
  app.post("/api/ezzebank/create-pix-withdrawal", requireAuth, async (req, res) => {
    try {
      const { amount, pixKey, pixKeyType } = req.body;
      const user = req.user!;
      
      console.log('🏦 EZZEBANK: Iniciando criação de saque PIX:', {
        userId: user.id,
        amount,
        pixKey,
        pixKeyType
      });

      // Verificar saldo
      if (user.balance < Number(amount)) {
        return res.status(400).json({
          success: false,
          error: 'Saldo insuficiente'
        });
      }

      const ezzebankService = createEzzebankService();
      
      // Gerar ID externo único
      const externalId = `withdrawal_${user.id}_${Date.now()}`;
      
      const withdrawal = await ezzebankService.createPixWithdrawal({
        amount: Number(amount),
        pixKey,
        pixKeyType,
        recipientName: user.username,
        recipientDocument: user.cpf || '00000000000',
        description: 'Saque da plataforma',
        externalId,
        webhookUrl: `${process.env.WEBHOOK_URL || 'https://seu-dominio.com'}/api/ezzebank/webhook`
      });

      // Criar transação de saque no banco
      await storage.createPaymentTransaction({
        userId: user.id,
        amount: Number(amount),
        method: 'pix',
        gateway: 'ezzebank',
        gatewayTransactionId: withdrawal.id,
        status: 'pending',
        type: 'withdrawal'
      });

      // Debitar saldo do usuário
      await storage.updateUserBalance(user.id, user.balance - Number(amount));

      console.log('✅ EZZEBANK: Saque PIX criado com sucesso:', withdrawal.id);

      res.json({
        success: true,
        withdrawal: {
          id: withdrawal.id,
          amount: withdrawal.amount,
          pixKey: withdrawal.pixKey,
          recipientName: withdrawal.recipientName,
          status: withdrawal.status,
          createdAt: withdrawal.createdAt
        }
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao criar saque PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao criar saque',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar status de pagamento EZZEBANK
  app.get("/api/ezzebank/payment-status/:paymentId", requireAuth, async (req, res) => {
    try {
      const { paymentId } = req.params;
      
      console.log('🏦 EZZEBANK: Consultando status do pagamento:', paymentId);

      const ezzebankService = createEzzebankService();
      const status = await ezzebankService.getPaymentStatus(paymentId);

      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do pagamento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar status',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar status de saque EZZEBANK
  app.get("/api/ezzebank/withdrawal-status/:withdrawalId", requireAuth, async (req, res) => {
    try {
      const { withdrawalId } = req.params;
      
      console.log('🏦 EZZEBANK: Consultando status do saque:', withdrawalId);

      const ezzebankService = createEzzebankService();
      const status = await ezzebankService.getWithdrawalStatus(withdrawalId);

      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do saque:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar status',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar saldo EZZEBANK
  app.get("/api/ezzebank/balance", requireAuth, async (req, res) => {
    try {
      console.log('💰 EZZEBANK: Consultando saldo da conta...');

      const ezzebankService = createEzzebankService();
      const balance = await ezzebankService.getBalance();

      res.json({
        success: true,
        balance
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar saldo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar saldo',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar extrato de transações EZZEBANK
  app.get("/api/ezzebank/transactions", requireAuth, async (req, res) => {
    try {
      const { initialDate, finalDate, type, pageSize, page } = req.query;

      // Validar parâmetros obrigatórios
      if (!initialDate || !finalDate) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros initialDate e finalDate são obrigatórios'
        });
      }

      console.log('📊 EZZEBANK: Consultando extrato de transações...', {
        periodo: `${initialDate} até ${finalDate}`,
        tipo: type || 'Todos',
        pagina: page || 1
      });

      const ezzebankService = createEzzebankService();
      const transactions = await ezzebankService.getTransactions({
        initialDate: String(initialDate),
        finalDate: String(finalDate),
        type: type as 'C' | 'D' | undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        page: page ? Number(page) : undefined
      });

      res.json({
        success: true,
        transactions
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar extrato:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar extrato',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Gerar QRCode PIX de recebimento EZZEBANK
  app.post("/api/ezzebank/qrcode", requireAuth, async (req, res) => {
    try {
      const { amount, payerQuestion, external_id, payername, payerdocument } = req.body;

      // Validar parâmetros obrigatórios
      if (!amount || !external_id || !payername || !payerdocument) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros amount, external_id, payername e payerdocument são obrigatórios'
        });
      }

      console.log('📱 EZZEBANK: Gerando QRCode PIX de recebimento...', {
        amount,
        payername,
        external_id
      });

      const ezzebankService = createEzzebankService();
      const qrCodeResponse = await ezzebankService.createPixQRCode({
        amount: Number(amount),
        payerQuestion,
        external_id,
        payername,
        payerdocument
      });

      res.json({
        success: true,
        qrcode: qrCodeResponse
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao gerar QRCode PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar QRCode PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Gerar QRCode PIX com vencimento EZZEBANK (BASS BANKLINE)
  app.post("/api/ezzebank/qrcode/duedate", requireAuth, async (req, res) => {
    try {
      const { 
        amount, 
        payerQuestion, 
        external_id, 
        payer, 
        fine, 
        interest, 
        abatement, 
        discount, 
        calendar, 
        additionalInformation 
      } = req.body;

      // Validar parâmetros obrigatórios
      if (!amount || !external_id || !payer?.name || !payer?.document) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros amount, external_id, payer.name e payer.document são obrigatórios'
        });
      }

      console.log('📅 EZZEBANK: Gerando QRCode PIX com vencimento...', {
        amount,
        payerName: payer.name,
        external_id,
        dueDate: calendar?.dueDate
      });

      const ezzebankService = createEzzebankService();
      const qrCodeResponse = await ezzebankService.createPixQRCodeWithDueDate({
        amount: Number(amount),
        payerQuestion,
        external_id,
        payer,
        fine,
        interest,
        abatement,
        discount,
        calendar,
        additionalInformation
      });

      res.json({
        success: true,
        qrcode: qrCodeResponse
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao gerar QRCode PIX com vencimento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar QRCode PIX com vencimento',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Listar QRCodes PIX EZZEBANK
  app.get("/api/ezzebank/qrcode/list", requireAuth, async (req, res) => {
    try {
      const { initialDate, finalDate, status, transactionId, external_id, pageSize, page } = req.query;

      // Validar parâmetros obrigatórios
      if (!initialDate || !finalDate) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros initialDate e finalDate são obrigatórios'
        });
      }

      console.log('📋 EZZEBANK: Listando QRCodes PIX...', {
        periodo: `${initialDate} até ${finalDate}`,
        status: status || 'Todos',
        pagina: page || 1
      });

      const ezzebankService = createEzzebankService();
      const qrCodes = await ezzebankService.listPixQRCodes({
        initialDate: String(initialDate),
        finalDate: String(finalDate),
        status: status as 'PENDING' | 'APPROVED' | 'EXPIRED' | 'RETURNED' | undefined,
        transactionId: transactionId ? String(transactionId) : undefined,
        external_id: external_id ? String(external_id) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        page: page ? Number(page) : undefined
      });

      res.json({
        success: true,
        qrcodes: qrCodes
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar QRCodes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar QRCodes',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar detalhes de um QRCode PIX específico EZZEBANK
  app.get("/api/ezzebank/qrcode/:transactionId/detail", requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.params;

      // Validar parâmetro obrigatório
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro transactionId é obrigatório'
        });
      }

      console.log('🔍 EZZEBANK: Consultando detalhes do QRCode PIX...', {
        transactionId
      });

      const ezzebankService = createEzzebankService();
      const qrCodeDetail = await ezzebankService.getPixQRCodeDetail(transactionId);

      res.json({
        success: true,
        qrcode: qrCodeDetail
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar QRCode:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar QRCode',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Devolução de um Recebimento PIX EZZEBANK (BASS BANKLINE)
  app.post("/api/ezzebank/pix/:endToEndId/reverse", requireAuth, async (req, res) => {
    try {
      const { endToEndId } = req.params;
      const { amount, external_id, description } = req.body;

      // Validar parâmetros obrigatórios
      if (!endToEndId || !amount || !external_id) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros endToEndId, amount e external_id são obrigatórios'
        });
      }

      console.log('🔄 EZZEBANK: Processando devolução PIX...', {
        endToEndId,
        amount,
        external_id
      });

      const ezzebankService = createEzzebankService();
      const reverseResponse = await ezzebankService.reversePixPayment(endToEndId, {
        amount: Number(amount),
        external_id,
        description
      });

      res.json({
        success: true,
        reverse: reverseResponse
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao processar devolução PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao processar devolução PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Enviar Pagamento PIX EZZEBANK
  app.post("/api/ezzebank/pix/payment", requireAuth, async (req, res) => {
    try {
      const { amount, external_id, description, creditParty } = req.body;

      // Validar parâmetros obrigatórios
      if (!amount || !external_id || !creditParty) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros amount, external_id e creditParty são obrigatórios'
        });
      }

      // Validar dados do beneficiário
      if (!creditParty.keyType || !creditParty.key || !creditParty.name || !creditParty.taxId) {
        return res.status(400).json({
          success: false,
          error: 'Dados do beneficiário (keyType, key, name, taxId) são obrigatórios'
        });
      }

      console.log('💸 EZZEBANK: Enviando pagamento PIX...', {
        amount,
        external_id,
        keyType: creditParty.keyType,
        beneficiario: creditParty.name
      });

      const ezzebankService = createEzzebankService();
      const paymentResponse = await ezzebankService.sendPixPayment({
        amount: Number(amount),
        external_id,
        description,
        creditParty: {
          keyType: creditParty.keyType,
          key: creditParty.key,
          name: creditParty.name,
          taxId: creditParty.taxId
        }
      });

      res.json({
        success: true,
        payment: paymentResponse
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao enviar pagamento PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao enviar pagamento PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar status de um Pagamento PIX EZZEBANK
  app.get("/api/ezzebank/pix/payment/:transactionId/status", requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.params;

      // Validar parâmetro obrigatório
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro transactionId é obrigatório'
        });
      }

      console.log('🔍 EZZEBANK: Consultando status do pagamento PIX...', {
        transactionId
      });

      const ezzebankService = createEzzebankService();
      const paymentStatus = await ezzebankService.getPixPaymentStatus(transactionId);

      res.json({
        success: true,
        payment: paymentStatus
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do pagamento PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar status do pagamento PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Obter comprovante de um Pagamento PIX EZZEBANK
  app.get("/api/ezzebank/pix/payment/:transactionId/receipt", requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.params;

      // Validar parâmetro obrigatório
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro transactionId é obrigatório'
        });
      }

      console.log('📄 EZZEBANK: Obtendo comprovante do pagamento PIX...', {
        transactionId
      });

      const ezzebankService = createEzzebankService();
      const paymentReceipt = await ezzebankService.getPixPaymentReceipt(transactionId);

      res.json({
        success: true,
        receipt: paymentReceipt
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao obter comprovante do pagamento PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao obter comprovante do pagamento PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Listar transferências PIX EZZEBANK
  app.get("/api/ezzebank/pix/payments", requireAuth, async (req, res) => {
    try {
      const { 
        initialDate, 
        finalDate, 
        status, 
        transactionId, 
        external_id, 
        pageSize = '30', 
        page = '1' 
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!initialDate || !finalDate) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros initialDate e finalDate são obrigatórios'
        });
      }

      console.log('📋 EZZEBANK: Listando transferências PIX...', {
        initialDate,
        finalDate,
        status,
        page: Number(page)
      });

      const ezzebankService = createEzzebankService();
      const paymentsList = await ezzebankService.listPixPayments({
        initialDate: String(initialDate),
        finalDate: String(finalDate),
        status: status as any,
        transactionId: transactionId as string,
        external_id: external_id as string,
        pageSize: Number(pageSize),
        page: Number(page)
      });

      res.json({
        success: true,
        payments: paymentsList
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar transferências PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar transferências PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Listar infrações PIX EZZEBANK
  app.get("/api/ezzebank/pix/infractions", requireAuth, async (req, res) => {
    try {
      const { 
        dateFrom, 
        dateTo, 
        status, 
        endtoEndId, 
        externalId, 
        page = '1' 
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!dateFrom || !dateTo) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros dateFrom e dateTo são obrigatórios'
        });
      }

      console.log('⚠️ EZZEBANK: Listando infrações PIX...', {
        dateFrom,
        dateTo,
        status,
        page: Number(page)
      });

      const ezzebankService = createEzzebankService();
      const infractionsList = await ezzebankService.listPixInfractions({
        dateFrom: String(dateFrom),
        dateTo: String(dateTo),
        status: status as any,
        endtoEndId: endtoEndId as string,
        externalId: externalId as string,
        page: Number(page)
      });

      res.json({
        success: true,
        infractions: infractionsList
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar infrações PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar infrações PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Consultar infração PIX específica EZZEBANK
  app.get("/api/ezzebank/pix/infractions/:infractionId", requireAuth, async (req, res) => {
    try {
      const { infractionId } = req.params;

      // Validar parâmetro obrigatório
      if (!infractionId) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro infractionId é obrigatório'
        });
      }

      console.log('🔍 EZZEBANK: Consultando infração PIX...', {
        infractionId
      });

      const ezzebankService = createEzzebankService();
      const infraction = await ezzebankService.getPixInfraction(infractionId);

      res.json({
        success: true,
        infraction: infraction
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar infração PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao consultar infração PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Testar conexão EZZEBANK
  app.get("/api/ezzebank/test", requireAuth, async (req, res) => {
    try {
      console.log('🧪 EZZEBANK: Testando conexão...');

      const ezzebankService = await createEzzebankService();
      
      // Tentar obter saldo da conta para testar a conexão
      const balance = await ezzebankService.getBalance();
      
      console.log('✅ EZZEBANK: Teste de conexão bem-sucedido!', {
        balance: balance.available,
        currency: balance.currency
      });
      
      res.json({
        success: true,
        message: 'Conexão EZZEBANK estabelecida com sucesso!',
        data: {
          balance: balance.available,
          currency: balance.currency,
          environment: 'production'
        }
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro no teste de conexão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao testar conexão EZZEBANK',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Defender infração PIX EZZEBANK
  app.post("/api/ezzebank/pix/infractions/:infractionId/defense", requireAuth, async (req, res) => {
    try {
      const { infractionId } = req.params;
      const { defense, files } = req.body;

      // Validar parâmetros obrigatórios
      if (!infractionId) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetro infractionId é obrigatório'
        });
      }

      if (!defense || typeof defense !== 'string' || defense.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Campo defense é obrigatório e deve ser um texto válido'
        });
      }

      // Validar arquivos se fornecidos
      if (files && (!Array.isArray(files) || files.length > 3)) {
        return res.status(400).json({
          success: false,
          error: 'Campo files deve ser um array com máximo de 3 arquivos em base64'
        });
      }

      console.log('🛡️ EZZEBANK: Defendendo infração PIX...', {
        infractionId,
        defenseLength: defense.length,
        filesCount: files?.length || 0
      });

      const ezzebankService = createEzzebankService();
      const defenseResponse = await ezzebankService.defendPixInfraction(infractionId, {
        defense: defense.trim(),
        files: files || []
      });

      res.json({
        success: true,
        defense: defenseResponse
      });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao defender infração PIX:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao defender infração PIX',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Webhook EZZEBANK para receber notificações de pagamento
  app.post("/api/ezzebank/webhook", async (req, res) => {
    try {
      const payload = req.body;
      const signature = req.headers['x-ezzebank-signature'] as string;
      
      console.log('🔔 EZZEBANK: Webhook recebido:', {
        type: payload.type,
        transactionId: payload.transaction_id,
        status: payload.status
      });

      const ezzebankService = createEzzebankService();
      
      // Validar assinatura do webhook
      const isValid = await ezzebankService.validateWebhook(payload, signature);
      if (!isValid) {
        console.error('🔥 EZZEBANK: Webhook com assinatura inválida');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Processar evento baseado no tipo
      if (payload.type === 'payment.completed') {
        // Pagamento aprovado - creditar saldo
        const transaction = await storage.getPaymentTransactionByGatewayId(payload.transaction_id);
        if (transaction && transaction.status === 'pending') {
          await storage.updatePaymentTransactionStatus(transaction.id, 'approved');
          
          const user = await storage.getUser(transaction.userId);
          if (user) {
            const newBalance = user.balance + transaction.amount;
            await storage.updateUserBalance(user.id, newBalance);
            
            console.log('✅ EZZEBANK: Depósito creditado:', {
              userId: user.id,
              amount: transaction.amount,
              newBalance
            });
          }
        }
      } else if (payload.type === 'withdrawal.completed') {
        // Saque aprovado - atualizar status
        const transaction = await storage.getPaymentTransactionByGatewayId(payload.transaction_id);
        if (transaction && transaction.status === 'pending') {
          await storage.updatePaymentTransactionStatus(transaction.id, 'approved');
          
          console.log('✅ EZZEBANK: Saque aprovado:', {
            transactionId: transaction.id,
            amount: transaction.amount
          });
        }
      } else if (payload.type === 'payment.failed' || payload.type === 'withdrawal.failed') {
        // Pagamento/saque falhou - atualizar status
        const transaction = await storage.getPaymentTransactionByGatewayId(payload.transaction_id);
        if (transaction && transaction.status === 'pending') {
          await storage.updatePaymentTransactionStatus(transaction.id, 'rejected');
          
          // Se for saque, devolver o valor ao saldo
          if (transaction.type === 'withdrawal') {
            const user = await storage.getUser(transaction.userId);
            if (user) {
              const newBalance = user.balance + transaction.amount;
              await storage.updateUserBalance(user.id, newBalance);
              
              console.log('💰 EZZEBANK: Saldo devolvido por saque rejeitado:', {
                userId: user.id,
                amount: transaction.amount,
                newBalance
              });
            }
          }
        }
      }

      res.json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao processar webhook:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ===== ADMIN USER MANAGEMENT APIs =====
  
  // Get user details with betting history and transactions (admin only)
  app.get("/api/admin/users/:id/details", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Buscar informações básicas do usuário
      const userQuery = await pool.query(`
        SELECT u.*, COALESCE(ub.bonus_balance, 0) as bonus_balance
        FROM users u
        LEFT JOIN (
          SELECT user_id, SUM(remaining_amount) as bonus_balance
          FROM user_bonuses 
          WHERE status = 'active' AND expires_at > NOW()
          GROUP BY user_id
        ) ub ON u.id = ub.user_id
        WHERE u.id = $1
      `, [userId]);

      if (userQuery.rows.length === 0) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }

      const user = userQuery.rows[0];

      // Buscar apostas do usuário
      const betsQuery = await pool.query(`
        SELECT 
          b.id, b.amount, b.status, b.created_at, b.win_amount,
          COALESCE(b.use_bonus_balance, false) as use_bonus_balance,
          CASE 
            WHEN COALESCE(b.use_bonus_balance, false) = true THEN 'bonus'
            ELSE 'real'
          END as bet_type,
          a.name as animal_name,
          gm.name as game_mode_name
        FROM bets b
        LEFT JOIN animals a ON b.animal_id = a.id
        LEFT JOIN game_modes gm ON b.game_mode_id = gm.id
        WHERE b.user_id = $1 
        ORDER BY b.created_at DESC 
        LIMIT 50
      `, [userId]);

      // Buscar transações do usuário
      const transactionsQuery = await pool.query(`
        SELECT 
          pt.id, pt.amount, pt.type, pt.status, pt.created_at,
          pg.name as gateway_name
        FROM payment_transactions pt
        LEFT JOIN payment_gateways pg ON pt.gateway_id = pg.id
        WHERE pt.user_id = $1 
        ORDER BY pt.created_at DESC 
        LIMIT 50
      `, [userId]);

      // Calcular estatísticas
      const statsQuery = await pool.query(`
        SELECT 
          COUNT(b.*) as total_bets,
          COUNT(CASE WHEN COALESCE(b.use_bonus_balance, false) = false THEN 1 END) as real_money_bets,
          COUNT(CASE WHEN COALESCE(b.use_bonus_balance, false) = true THEN 1 END) as bonus_bets
        FROM bets b
        WHERE b.user_id = $1
      `, [userId]);

      const transactionStatsQuery = await pool.query(`
        SELECT 
          COUNT(CASE WHEN type = 'deposit' AND status = 'completed' THEN 1 END) as total_deposits,
          COUNT(CASE WHEN type = 'withdrawal' THEN 1 END) as total_withdrawals
        FROM payment_transactions
        WHERE user_id = $1
      `, [userId]);

      const stats = statsQuery.rows[0] || {
        total_bets: 0,
        real_money_bets: 0,
        bonus_bets: 0
      };

      const transactionStats = transactionStatsQuery.rows[0] || {
        total_deposits: 0,
        total_withdrawals: 0
      };

      // Remover dados sensíveis
      delete user.password;

      res.json({
        user: {
          ...user,
          bonusBalance: parseFloat(user.bonus_balance) || 0
        },
        bets: betsQuery.rows.map(bet => ({
          ...bet,
          betType: bet.bet_type,
          createdAt: bet.created_at,
          winAmount: bet.win_amount,
          useBonusBalance: bet.use_bonus_balance
        })),
        transactions: transactionsQuery.rows.map(transaction => ({
          ...transaction,
          createdAt: transaction.created_at,
          gatewayName: transaction.gateway_name
        })),
        stats: {
          totalBets: parseInt(stats.total_bets) || 0,
          realMoneyBets: parseInt(stats.real_money_bets) || 0,
          bonusBets: parseInt(stats.bonus_bets) || 0,
          totalDeposits: parseInt(transactionStats.total_deposits) || 0,
          totalWithdrawals: parseInt(transactionStats.total_withdrawals) || 0
        }
      });

    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ message: "Erro ao buscar detalhes do usuário" });
    }
  });
  
  // Block/Unblock user (admin only)
  app.post("/api/admin/users/:id/block", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { blocked, reason } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      if (user.isAdmin) {
        return res.status(400).json({ message: "Não é possível bloquear um administrador" });
      }
      
      // Update user blocked status using direct SQL
      await pool.query(`
        UPDATE users 
        SET blocked = $1, block_reason = $2
        WHERE id = $3
      `, [blocked, reason || null, userId]);
      
      // Get updated user
      const updatedUserQuery = await pool.query(`
        SELECT * FROM users WHERE id = $1
      `, [userId]);
      
      const updatedUser = updatedUserQuery.rows[0];
      delete updatedUser.password;
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Erro ao atualizar status do usuário" });
    }
  });

  return httpServer;
}
