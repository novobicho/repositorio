import https from 'https';

// Teste usando credenciais do painel administrativo
async function testEzzebankAdmin() {
  console.log('🧪 Testando EZZEBANK com credenciais do painel admin...');
  
  // Suas credenciais do painel (que você mostrou na imagem)
  const clientId = 'eyJpZCI6ImU5MmYzMWFjLWI2ZGYtNGU1OC05YzZjLWZkNzBlZDI2NjM2NCIsInR5cGUiOiJhY2Nlc3MifQ';
  const clientSecret = 'ygmozvGSN4rh6nG8A2uqHp9l';
  
  console.log('✅ Usando credenciais de produção do painel!');
  console.log('Client ID:', clientId.substring(0, 15) + '...');
  
  // Autenticar na API de PRODUÇÃO
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const authData = JSON.stringify({
    grant_type: 'client_credentials'
  });
  
  const authOptions = {
    hostname: 'api.ezzebank.com', // PRODUÇÃO
    port: 443,
    path: '/auth/oauth/token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': authData.length
    }
  };
  
  try {
    const token = await new Promise((resolve, reject) => {
      const req = https.request(authOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log('Status da autenticação PRODUÇÃO:', res.statusCode);
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log('✅ Autenticação em PRODUÇÃO bem-sucedida!');
            console.log('Token type:', result.token_type);
            console.log('Expires in:', result.expires_in, 'segundos');
            resolve(result.access_token);
          } else {
            console.log('❌ Erro na autenticação PRODUÇÃO:', data);
            reject(new Error(`Autenticação falhou: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('❌ Erro de conexão:', error.message);
        reject(error);
      });
      
      req.write(authData);
      req.end();
    });
    
    // Testar saldo em PRODUÇÃO
    console.log('🔍 Testando consulta de saldo em PRODUÇÃO...');
    
    const balanceOptions = {
      hostname: 'api.ezzebank.com', // PRODUÇÃO
      port: 443,
      path: '/v1/balance',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    const balance = await new Promise((resolve, reject) => {
      const req = https.request(balanceOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          console.log('Status da consulta de saldo PRODUÇÃO:', res.statusCode);
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log('✅ Consulta de saldo em PRODUÇÃO bem-sucedida!');
            console.log('Saldo disponível:', result.available, result.currency);
            resolve(result);
          } else {
            console.log('❌ Erro na consulta de saldo PRODUÇÃO:', data);
            reject(new Error(`Consulta falhou: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('❌ Erro de conexão:', error.message);
        reject(error);
      });
      
      req.end();
    });
    
    console.log('🎉 TESTE DE PRODUÇÃO CONCLUÍDO COM SUCESSO!');
    console.log('Ambiente: PRODUÇÃO (api.ezzebank.com)');
    console.log('Saldo:', balance.available, balance.currency);
    console.log('✅ Suas credenciais do painel estão funcionando em PRODUÇÃO!');
    
  } catch (error) {
    console.log('🔥 ERRO NO TESTE DE PRODUÇÃO:', error.message);
  }
}

testEzzebankAdmin();