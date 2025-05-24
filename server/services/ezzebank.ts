import crypto from 'crypto';

export interface EzzebankConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
}

export interface EzzebankPixPayment {
  amount: number;
  description: string;
  externalId: string;
  customerName: string;
  customerEmail: string;
  customerDocument: string;
  webhookUrl?: string;
}

export interface EzzebankPixResponse {
  id: string;
  status: string;
  amount: number;
  pixKey: string;
  qrCode: string;
  qrCodeImage: string;
  expiresAt: string;
  createdAt: string;
}

export interface EzzebankWithdrawal {
  amount: number;
  pixKey: string;
  pixKeyType: 'cpf' | 'email' | 'phone' | 'random';
  recipientName: string;
  recipientDocument: string;
  description: string;
  externalId: string;
  webhookUrl?: string;
}

export interface EzzebankWithdrawalResponse {
  id: string;
  status: string;
  amount: number;
  pixKey: string;
  recipientName: string;
  createdAt: string;
  processedAt?: string;
}

export class EzzebankService {
  private config: EzzebankConfig;

  constructor(environment: 'sandbox' | 'production' = 'sandbox', clientId?: string, clientSecret?: string) {
    const isSandbox = environment === 'sandbox';
    
    this.config = {
      clientId: clientId || (isSandbox 
        ? process.env.EZZEBANK_SANDBOX_CLIENT_ID! 
        : process.env.EZZEBANK_PROD_CLIENT_ID!),
      clientSecret: clientSecret || (isSandbox 
        ? process.env.EZZEBANK_SANDBOX_CLIENT_SECRET! 
        : process.env.EZZEBANK_PROD_CLIENT_SECRET!),
      baseUrl: isSandbox 
        ? 'https://api-staging.ezzebank.com'
        : 'https://api.ezzebank.com',
      environment
    };

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(`EZZEBANK ${environment} credentials not configured`);
    }

    console.log('🏦 EZZEBANK: Serviço configurado:', {
      environment: this.config.environment,
      baseUrl: this.config.baseUrl,
      clientId: this.config.clientId.substring(0, 10) + '...',
      usingCustomCredentials: !!(clientId && clientSecret)
    });
  }

  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  private getBasicAuthToken(): string {
    // Passo 1: Credenciais em base64 para obter token de acesso
    const authString = `${this.config.clientId}:${this.config.clientSecret}`;
    return Buffer.from(authString).toString('base64');
  }

  private async getAccessToken(): Promise<string> {
    // Verificar se o token ainda é válido
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('🔑 EZZEBANK: Obtendo novo token de acesso...');
      
      const basicAuth = this.getBasicAuthToken();
      
      const response = await fetch(`${this.config.baseUrl}/v2/oauth/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'grant_type': 'client_credentials'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`EZZEBANK Auth Error: ${response.status} ${error}`);
      }

      const data = await response.json();
      
      // Armazenar token com expiração (30 minutos - 1 minuto de margem)
      this.accessToken = data.access_token;
      this.tokenExpiry = new Date(Date.now() + (29 * 60 * 1000)); // 29 minutos
      
      console.log('✅ EZZEBANK: Token de acesso obtido com sucesso!');
      return this.accessToken;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao obter token de acesso:', error);
      throw error;
    }
  }

  private async makeRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const accessToken = await this.getAccessToken();
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`EZZEBANK API Error: ${response.status} ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`🔥 EZZEBANK: Erro na requisição ${method} ${endpoint}:`, error);
      throw error;
    }
  }

  async createPixPayment(payment: EzzebankPixPayment): Promise<EzzebankPixResponse> {
    console.log('🏦 EZZEBANK: Criando pagamento PIX:', {
      amount: payment.amount,
      description: payment.description,
      externalId: payment.externalId,
      environment: this.config.environment
    });

    const payload = {
      amount: payment.amount,
      description: payment.description,
      external_id: payment.externalId,
      customer: {
        name: payment.customerName,
        email: payment.customerEmail,
        document: payment.customerDocument
      },
      webhook_url: payment.webhookUrl,
      expires_in: 3600 // 1 hora
    };

    try {
      const response = await this.makeRequest('/pix/payments', 'POST', payload);
      
      console.log('✅ EZZEBANK: Pagamento PIX criado com sucesso:', {
        id: response.id,
        status: response.status,
        amount: response.amount
      });

      return {
        id: response.id,
        status: response.status,
        amount: response.amount,
        pixKey: response.pix_key,
        qrCode: response.qr_code,
        qrCodeImage: response.qr_code_image,
        expiresAt: response.expires_at,
        createdAt: response.created_at
      };
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao criar pagamento PIX:', error);
      throw error;
    }
  }

  async createPixWithdrawal(withdrawal: EzzebankWithdrawal): Promise<EzzebankWithdrawalResponse> {
    console.log('🏦 EZZEBANK: Criando saque PIX:', {
      amount: withdrawal.amount,
      pixKey: withdrawal.pixKey,
      pixKeyType: withdrawal.pixKeyType,
      externalId: withdrawal.externalId,
      environment: this.config.environment
    });

    const payload = {
      amount: withdrawal.amount,
      pix_key: withdrawal.pixKey,
      pix_key_type: withdrawal.pixKeyType,
      recipient: {
        name: withdrawal.recipientName,
        document: withdrawal.recipientDocument
      },
      description: withdrawal.description,
      external_id: withdrawal.externalId,
      webhook_url: withdrawal.webhookUrl
    };

    try {
      const response = await this.makeRequest('/pix/withdrawals', 'POST', payload);
      
      console.log('✅ EZZEBANK: Saque PIX criado com sucesso:', {
        id: response.id,
        status: response.status,
        amount: response.amount
      });

      return {
        id: response.id,
        status: response.status,
        amount: response.amount,
        pixKey: response.pix_key,
        recipientName: response.recipient.name,
        createdAt: response.created_at,
        processedAt: response.processed_at
      };
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao criar saque PIX:', error);
      throw error;
    }
  }

  async getPaymentStatus(paymentId: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/pix/payments/${paymentId}`);
      
      return {
        id: response.id,
        status: response.status,
        amount: response.amount,
        paidAt: response.paid_at,
        createdAt: response.created_at
      };
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do pagamento:', error);
      throw error;
    }
  }

  async getWithdrawalStatus(withdrawalId: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/pix/withdrawals/${withdrawalId}`);
      
      return {
        id: response.id,
        status: response.status,
        amount: response.amount,
        processedAt: response.processed_at,
        createdAt: response.created_at
      };
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do saque:', error);
      throw error;
    }
  }

  async getBalance(): Promise<any> {
    try {
      console.log('💰 EZZEBANK: Consultando saldo da conta...');
      
      const response = await this.makeRequest('/v2/balance', 'GET');
      
      console.log('✅ EZZEBANK: Saldo consultado com sucesso!', {
        balance: response.balance,
        currency: response.currency
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar saldo:', error);
      throw error;
    }
  }

  async getTransactions(params: {
    initialDate: string;
    finalDate: string;
    type?: 'C' | 'D'; // C = Crédito, D = Débito
    pageSize?: number;
    page?: number;
  }): Promise<any> {
    try {
      console.log('📊 EZZEBANK: Consultando extrato de transações...', {
        periodo: `${params.initialDate} até ${params.finalDate}`,
        tipo: params.type || 'Todos',
        pagina: params.page || 1,
        tamanhoPagina: params.pageSize || 30
      });
      
      // Construir query string
      const queryParams = new URLSearchParams({
        initialDate: params.initialDate,
        finalDate: params.finalDate,
        page: String(params.page || 1),
        pageSize: String(params.pageSize || 30)
      });
      
      if (params.type) {
        queryParams.append('type', params.type);
      }
      
      const response = await this.makeRequest(`/v2/transactions?${queryParams.toString()}`, 'GET');
      
      console.log('✅ EZZEBANK: Extrato consultado com sucesso!', {
        totalTransacoes: response.data?.length || 0,
        pagina: response.page,
        totalPaginas: response.totalPages
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar extrato:', error);
      throw error;
    }
  }

  async createPixQRCode(qrCodeData: {
    amount: number;
    payerQuestion?: string;
    external_id: string;
    payername: string;
    payerdocument: string;
  }): Promise<any> {
    try {
      console.log('📱 EZZEBANK: Gerando QRCode PIX de recebimento...', {
        amount: qrCodeData.amount,
        payername: qrCodeData.payername,
        external_id: qrCodeData.external_id,
        environment: this.config.environment
      });

      const payload = {
        amount: qrCodeData.amount,
        payerQuestion: qrCodeData.payerQuestion,
        external_id: qrCodeData.external_id,
        payer: {
          name: qrCodeData.payername,
          document: qrCodeData.payerdocument
        }
      };

      const response = await this.makeRequest('/v2/pix/qrcode', 'POST', payload);

      console.log('✅ EZZEBANK: QRCode PIX gerado com sucesso!', {
        transactionId: response.transactionId,
        qrCodeGerado: response.qrCode ? 'Sim' : 'Não'
      });

      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao gerar QRCode PIX:', error);
      throw error;
    }
  }

  async createPixQRCodeWithDueDate(qrCodeData: {
    amount: number;
    payerQuestion?: string;
    external_id: string;
    payer: {
      name: string;
      document: string;
    };
    fine?: {
      modality: number;
      value: number;
    };
    interest?: {
      modality: number;
      value: number;
    };
    abatement?: {
      modality: number;
      value: number;
    };
    discount?: {
      modality: number;
      value: number;
    };
    calendar?: {
      dueDate: string;
    };
    additionalInformation?: Array<{
      name: string;
      value: string;
    }>;
  }): Promise<any> {
    try {
      console.log('📅 EZZEBANK: Gerando QRCode PIX com vencimento...', {
        amount: qrCodeData.amount,
        payerName: qrCodeData.payer.name,
        external_id: qrCodeData.external_id,
        dueDate: qrCodeData.calendar?.dueDate,
        environment: this.config.environment
      });

      const payload = {
        amount: qrCodeData.amount,
        payerQuestion: qrCodeData.payerQuestion,
        external_id: qrCodeData.external_id,
        payer: qrCodeData.payer,
        ...(qrCodeData.fine && { fine: qrCodeData.fine }),
        ...(qrCodeData.interest && { interest: qrCodeData.interest }),
        ...(qrCodeData.abatement && { abatement: qrCodeData.abatement }),
        ...(qrCodeData.discount && { discount: qrCodeData.discount }),
        ...(qrCodeData.calendar && { calendar: qrCodeData.calendar }),
        ...(qrCodeData.additionalInformation && { additionalInformation: qrCodeData.additionalInformation })
      };

      const response = await this.makeRequest('/v2/pix/qrcode/duedate', 'POST', payload);

      console.log('✅ EZZEBANK: QRCode PIX com vencimento gerado com sucesso!', {
        transactionId: response.transactionId,
        qrCodeGerado: response.qrCode ? 'Sim' : 'Não',
        vencimento: qrCodeData.calendar?.dueDate
      });

      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao gerar QRCode PIX com vencimento:', error);
      throw error;
    }
  }

  async listPixQRCodes(params: {
    initialDate: string;
    finalDate: string;
    status?: 'PENDING' | 'APPROVED' | 'EXPIRED' | 'RETURNED';
    transactionId?: string;
    external_id?: string;
    pageSize?: number;
    page?: number;
  }): Promise<any> {
    try {
      console.log('📋 EZZEBANK: Listando QRCodes PIX...', {
        periodo: `${params.initialDate} até ${params.finalDate}`,
        status: params.status || 'Todos',
        pagina: params.page || 1,
        tamanhoPagina: params.pageSize || 30
      });
      
      // Construir query string
      const queryParams = new URLSearchParams({
        initialDate: params.initialDate,
        finalDate: params.finalDate,
        page: String(params.page || 1),
        pageSize: String(params.pageSize || 30)
      });
      
      if (params.status) {
        queryParams.append('status', params.status);
      }
      
      if (params.transactionId) {
        queryParams.append('transactionId', params.transactionId);
      }
      
      if (params.external_id) {
        queryParams.append('external_id', params.external_id);
      }
      
      const response = await this.makeRequest(`/v2/pix/qrcode/list?${queryParams.toString()}`, 'GET');
      
      console.log('✅ EZZEBANK: QRCodes listados com sucesso!', {
        totalQRCodes: response.data?.length || 0,
        pagina: response.page,
        totalPaginas: response.totalPages
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar QRCodes:', error);
      throw error;
    }
  }

  async getPixQRCodeDetail(transactionId: string): Promise<any> {
    try {
      console.log('🔍 EZZEBANK: Consultando detalhes do QRCode PIX...', {
        transactionId,
        environment: this.config.environment
      });
      
      const response = await this.makeRequest(`/v2/pix/qrcode/${transactionId}/detail`, 'GET');
      
      console.log('✅ EZZEBANK: Detalhes do QRCode consultados com sucesso!', {
        transactionId,
        status: response.status,
        amount: response.amount
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar QRCode:', error);
      throw error;
    }
  }

  async reversePixPayment(endToEndId: string, reverseData: {
    amount: number;
    external_id: string;
    description?: string;
  }): Promise<any> {
    try {
      console.log('🔄 EZZEBANK: Processando devolução PIX...', {
        endToEndId,
        amount: reverseData.amount,
        external_id: reverseData.external_id,
        environment: this.config.environment
      });

      const payload = {
        amount: reverseData.amount,
        external_id: reverseData.external_id,
        description: reverseData.description || 'Devolução PIX'
      };

      const response = await this.makeRequest(`/v2/pix/qrcode/${endToEndId}/reverse`, 'POST', payload);

      console.log('✅ EZZEBANK: Devolução PIX processada com sucesso!', {
        endToEndId,
        amount: reverseData.amount,
        status: response.status
      });

      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao processar devolução PIX:', error);
      throw error;
    }
  }

  async sendPixPayment(paymentData: {
    amount: number;
    external_id: string;
    description?: string;
    creditParty: {
      keyType: 'CPF' | 'CNPJ' | 'TELEFONE' | 'EMAIL' | 'CHAVE_ALEATORIA';
      key: string;
      name: string;
      taxId: string;
    };
  }): Promise<any> {
    try {
      console.log('💸 EZZEBANK: Enviando pagamento PIX...', {
        amount: paymentData.amount,
        external_id: paymentData.external_id,
        keyType: paymentData.creditParty.keyType,
        beneficiario: paymentData.creditParty.name,
        environment: this.config.environment
      });

      const payload = {
        amount: paymentData.amount,
        external_id: paymentData.external_id,
        description: paymentData.description || 'Pagamento PIX',
        creditParty: {
          keyType: paymentData.creditParty.keyType,
          key: paymentData.creditParty.key,
          name: paymentData.creditParty.name,
          taxId: paymentData.creditParty.taxId
        }
      };

      const response = await this.makeRequest('/v2/pix/payment', 'POST', payload);

      console.log('✅ EZZEBANK: Pagamento PIX enviado com sucesso!', {
        external_id: paymentData.external_id,
        amount: paymentData.amount,
        status: response.status,
        transactionId: response.transactionId
      });

      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao enviar pagamento PIX:', error);
      throw error;
    }
  }

  async getPixPaymentStatus(transactionId: string): Promise<any> {
    try {
      console.log('🔍 EZZEBANK: Consultando status do pagamento PIX...', {
        transactionId,
        environment: this.config.environment
      });
      
      const response = await this.makeRequest(`/v2/pix/payment/${transactionId}/status`, 'GET');
      
      console.log('✅ EZZEBANK: Status do pagamento PIX consultado com sucesso!', {
        transactionId,
        status: response.status,
        amount: response.amount
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar status do pagamento PIX:', error);
      throw error;
    }
  }

  async getPixPaymentReceipt(transactionId: string): Promise<any> {
    try {
      console.log('📄 EZZEBANK: Obtendo comprovante do pagamento PIX...', {
        transactionId,
        environment: this.config.environment
      });
      
      const response = await this.makeRequest(`/v2/pix/payment/${transactionId}/receipt`, 'GET');
      
      console.log('✅ EZZEBANK: Comprovante do pagamento PIX obtido com sucesso!', {
        transactionId,
        comprovanteDisponivel: !!response
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao obter comprovante do pagamento PIX:', error);
      throw error;
    }
  }

  async listPixPayments(params: {
    initialDate: string;
    finalDate: string;
    status?: 'PROCESSING' | 'PEND_CONFIRM' | 'CONFIRMED' | 'ERROR' | 'RETURNED';
    transactionId?: string;
    external_id?: string;
    pageSize?: number;
    page?: number;
  }): Promise<any> {
    try {
      console.log('📋 EZZEBANK: Listando transferências PIX...', {
        periodo: `${params.initialDate} até ${params.finalDate}`,
        status: params.status || 'Todos',
        pagina: params.page || 1,
        tamanhoPagina: params.pageSize || 30
      });
      
      // Construir query string
      const queryParams = new URLSearchParams({
        initialDate: params.initialDate,
        finalDate: params.finalDate,
        page: String(params.page || 1),
        pageSize: String(params.pageSize || 30)
      });
      
      if (params.status) {
        queryParams.append('status', params.status);
      }
      
      if (params.transactionId) {
        queryParams.append('transactionId', params.transactionId);
      }
      
      if (params.external_id) {
        queryParams.append('external_id', params.external_id);
      }
      
      const response = await this.makeRequest(`/v2/pix/payment/list?${queryParams.toString()}`, 'GET');
      
      console.log('✅ EZZEBANK: Transferências PIX listadas com sucesso!', {
        totalTransferencias: response.data?.length || 0,
        pagina: response.page,
        totalPaginas: response.totalPages
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar transferências PIX:', error);
      throw error;
    }
  }

  async listPixInfractions(params: {
    dateFrom: string;
    dateTo: string;
    status?: 'AGREED' | 'DISAGREED' | 'WAITING_ANALYSIS' | 'WAITING_DEFENSE';
    endtoEndId?: string;
    externalId?: string;
    page?: number;
  }): Promise<any> {
    try {
      console.log('⚠️ EZZEBANK: Listando infrações PIX...', {
        periodo: `${params.dateFrom} até ${params.dateTo}`,
        status: params.status || 'Todas',
        pagina: params.page || 1
      });
      
      // Construir query string
      const queryParams = new URLSearchParams({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: String(params.page || 1)
      });
      
      if (params.status) {
        queryParams.append('status', params.status);
      }
      
      if (params.endtoEndId) {
        queryParams.append('endtoEndId', params.endtoEndId);
      }
      
      if (params.externalId) {
        queryParams.append('externalId', params.externalId);
      }
      
      const response = await this.makeRequest(`/v2/infractions?${queryParams.toString()}`, 'GET');
      
      console.log('✅ EZZEBANK: Infrações PIX listadas com sucesso!', {
        totalInfracoes: response.data?.length || 0,
        pagina: response.page,
        totalPaginas: response.totalPages
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao listar infrações PIX:', error);
      throw error;
    }
  }

  async getPixInfraction(infractionId: string): Promise<any> {
    try {
      console.log('🔍 EZZEBANK: Consultando infração PIX...', {
        infractionId,
        environment: this.config.environment
      });
      
      const response = await this.makeRequest(`/v2/infractions/${infractionId}`, 'GET');
      
      console.log('✅ EZZEBANK: Infração PIX consultada com sucesso!', {
        infractionId,
        status: response.status,
        type: response.type
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao consultar infração PIX:', error);
      throw error;
    }
  }

  async defendPixInfraction(infractionId: string, defenseData: {
    defense: string;
    files?: string[];
  }): Promise<any> {
    try {
      console.log('🛡️ EZZEBANK: Defendendo infração PIX...', {
        infractionId,
        defenseLength: defenseData.defense.length,
        filesCount: defenseData.files?.length || 0,
        environment: this.config.environment
      });

      // Validar número máximo de arquivos
      if (defenseData.files && defenseData.files.length > 3) {
        throw new Error('Máximo de 3 arquivos permitidos para defesa');
      }

      const response = await this.makeRequest(`/v2/infractions/${infractionId}/defense`, 'POST', defenseData);
      
      console.log('✅ EZZEBANK: Defesa da infração PIX enviada com sucesso!', {
        infractionId,
        defenseAccepted: !!response.success
      });
      
      return response;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao defender infração PIX:', error);
      throw error;
    }
  }

  async validateWebhook(payload: any, verifySignatureHeader: string): Promise<boolean> {
    try {
      if (!verifySignatureHeader) {
        console.log('⚠️ EZZEBANK: Header Verify-Signature não fornecido');
        return false;
      }

      // Passo 1: Extrair timestamp e assinatura do header
      // Formato: t=timestamp,v1=signature
      const elements = verifySignatureHeader.split(',');
      let timestamp = '';
      let receivedSignature = '';

      for (const element of elements) {
        const [key, value] = element.split('=');
        if (key === 't') {
          timestamp = value;
        } else if (key === 'v1') {
          receivedSignature = value;
        }
      }

      if (!timestamp || !receivedSignature) {
        console.log('❌ EZZEBANK: Formato inválido do header Verify-Signature');
        return false;
      }

      // Passo 2: Preparar string para comparar assinaturas
      // Formato: timestamp + "t" + payload_json
      const payloadString = JSON.stringify(payload);
      const signedPayload = timestamp + 't' + payloadString;

      // Passo 3: Computar HMAC SHA-256 com o Signature Secret
      const signatureSecret = process.env.EZZEBANK_WEBHOOK_SECRET || '';
      if (!signatureSecret) {
        console.log('❌ EZZEBANK: EZZEBANK_WEBHOOK_SECRET não configurado');
        return false;
      }

      const computedSignature = crypto
        .createHmac('sha256', signatureSecret)
        .update(signedPayload)
        .digest('hex');

      // Comparar assinaturas de forma segura
      const isValid = crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'hex'),
        Buffer.from(computedSignature, 'hex')
      );

      if (isValid) {
        console.log('✅ EZZEBANK: Webhook validado com sucesso!', {
          timestamp,
          signatureMatch: true
        });
      } else {
        console.log('❌ EZZEBANK: Assinatura do webhook inválida', {
          timestamp,
          received: receivedSignature.substring(0, 10) + '...',
          computed: computedSignature.substring(0, 10) + '...'
        });
      }

      return isValid;
    } catch (error) {
      console.error('🔥 EZZEBANK: Erro ao validar webhook:', error);
      return false;
    }
  }
}

// Factory para criar instâncias baseadas no ambiente
export async function createEzzebankService(gatewayId?: number): Promise<EzzebankService> {
  if (gatewayId) {
    // Usar credenciais específicas do gateway
    const { storage } = await import('../storage');
    const gateway = await storage.getPaymentGateway(gatewayId);
    
    if (!gateway || gateway.type !== 'ezzebank') {
      throw new Error('Gateway EZZEBANK não encontrado');
    }
    
    const environment = gateway.sandbox ? 'sandbox' : 'production';
    return new EzzebankService(environment, gateway.apiKey || undefined, gateway.secretKey || undefined);
  } else {
    // Buscar gateway EZZEBANK ativo
    const { storage } = await import('../storage');
    const gateways = await storage.getPaymentGateways();
    const ezzebankGateway = gateways.find(g => g.type === 'ezzebank' && g.isActive);
    
    if (!ezzebankGateway) {
      throw new Error('Nenhum gateway EZZEBANK ativo encontrado');
    }
    
    console.log('🏦 EZZEBANK: Usando gateway do painel administrativo:', {
      gatewayId: ezzebankGateway.id,
      name: ezzebankGateway.name,
      isSandbox: ezzebankGateway.isSandbox,
      isActive: ezzebankGateway.isActive
    });
    
    const environment = ezzebankGateway.isSandbox ? 'sandbox' : 'production';
    return new EzzebankService(environment, ezzebankGateway.apiKey, ezzebankGateway.secretKey);
  }
}