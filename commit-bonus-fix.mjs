#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🚀 Fazendo commit das correções do sistema de bônus...\n');

try {
  // Verificar status do git
  console.log('📋 Verificando arquivos modificados...');
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  console.log(status);

  // Adicionar arquivos específicos que foram modificados
  console.log('➕ Adicionando arquivos modificados...');
  
  const filesToAdd = [
    'server/routes.ts',
    'shared/schema.ts'
  ];

  filesToAdd.forEach(file => {
    try {
      execSync(`git add ${file}`);
      console.log(`✅ Adicionado: ${file}`);
    } catch (error) {
      console.log(`⚠️  Arquivo não encontrado ou sem mudanças: ${file}`);
    }
  });

  // Fazer commit
  const commitMessage = `fix: Corrigir sistema de bônus de primeiro depósito

🎁 Correções implementadas:
- EZZEBANK: Adicionar captura e salvamento da flag useBonus
- Schema: Adicionar campo metadata na tabela payment_transactions  
- Unificar comportamento entre EZZEBANK e Pushin Pay
- Garantir que bônus seja creditado corretamente para usuários elegíveis

🔧 Arquivos alterados:
- server/routes.ts: Corrigida criação de transação EZZEBANK
- shared/schema.ts: Adicionado campo metadata para salvar flags
- Banco de dados: Coluna metadata adicionada via migração

✅ Sistema de verificação de elegibilidade já funcionava
✅ Bônus agora deve ser creditado automaticamente`;

  console.log('\n💾 Fazendo commit...');
  execSync(`git commit -m "${commitMessage}"`);
  
  console.log('\n🎉 Commit realizado com sucesso!');
  console.log('\n📝 Resumo das correções:');
  console.log('✅ EZZEBANK agora salva flag useBonus corretamente');
  console.log('✅ Campo metadata adicionado ao schema');
  console.log('✅ Sistema unificado entre gateways de pagamento');
  console.log('✅ Bônus deve funcionar para novos usuários');
  
} catch (error) {
  console.error('❌ Erro ao fazer commit:', error.message);
  process.exit(1);
}