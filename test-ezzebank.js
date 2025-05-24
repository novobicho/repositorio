import https from 'https';

// Teste direto da API EZZEBANK
async function testEzzebank() {
  console.log('🧪 Testando conexão EZZEBANK...');
  
  const clientId = process.env.EZZEBANK_SANDBOX_CLIENT_ID;
  const clientSecret = process.env.EZZEBANK_SANDBOX_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log('❌ Credenciais EZZEBANK não encontradas');
    console.log('SANDBOX_CLIENT_ID:', clientId ? 'Configurado' : 'Não configurado');
    console.log('SANDBOX_CLIENT_SECRET:', clientSecret ? 'Configurado' : 'Não configurado');
    return;
  }
  
  console.log('✅ Credenciais encontradas!');
  console.log('Client ID:', clientId?.substring(0, 10) + '...');
  
  // Autenticar
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const authData = JSON.stringify({
    grant_type: 'client_credentials'
  });
  
  const authOptions = {
    hostname: 'api-staging.ezzebank.com',
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
          console.log('Status da autenticação:', res.statusCode);
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log('✅ Autenticação bem-sucedida!');
            console.log('Token type:', result.token_type);
            console.log('Expires in:', result.expires_in, 'segundos');
            resolve(result.access_token);
          } else {
            console.log('❌ Erro na autenticação:', data);
            reject(new Error(`Autenticação falhou: ${res.statusCode}`));
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
    
    // Testar saldo
    console.log('🔍 Testando consulta de saldo...');
    
    const balanceOptions = {
      hostname: 'api-staging.ezzebank.com',
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
          console.log('Status da consulta de saldo:', res.statusCode);
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log('✅ Consulta de saldo bem-sucedida!');
            console.log('Saldo disponível:', result.available, result.currency);
            resolve(result);
          } else {
            console.log('❌ Erro na consulta de saldo:', data);
            reject(new Error(`Consulta falhou: ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('❌ Erro de conexão:', error.message);
        reject(error);
      });
      
      req.end();
    });
    
    console.log('🎉 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('Ambiente: Sandbox');
    console.log('Saldo:', balance.available, balance.currency);
    
  } catch (error) {
    console.log('🔥 ERRO NO TESTE:', error.message);
  }
}

testEzzebank();