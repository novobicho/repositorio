import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  CreditCard,
  TrendingUp,
  DollarSign,
  Activity
} from "lucide-react";

interface EzzebankTransaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  status: string;
  createdAt: string;
  username: string;
}

export function EzzebankAdminPanel() {
  const [testAmount, setTestAmount] = useState("10.00");
  const { toast } = useToast();

  // Query para transações EZZEBANK
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["/api/admin/ezzebank/transactions"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/admin/ezzebank/transactions");
        return response.json();
      } catch (error) {
        return [];
      }
    },
  });

  // Query para estatísticas EZZEBANK
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/ezzebank/stats"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/admin/ezzebank/stats");
        return response.json();
      } catch (error) {
        return {
          totalDeposits: 0,
          totalWithdrawals: 0,
          pendingTransactions: 0,
          totalVolume: 0
        };
      }
    },
  });

  // Mutation para teste de conectividade
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/ezzebank/test-connection");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "✅ Conexão EZZEBANK OK",
          description: "Gateway funcionando perfeitamente",
        });
      } else {
        toast({
          title: "❌ Erro na Conexão",
          description: data.error || "Falha ao conectar com EZZEBANK",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "❌ Erro de Teste",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Mutation para teste de pagamento
  const testPaymentMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest("POST", "/api/admin/ezzebank/test-payment", { amount });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "✅ Teste de Pagamento Criado",
          description: `PIX de R$ ${data.payment.amount} gerado com sucesso`,
        });
      } else {
        toast({
          title: "❌ Erro no Teste",
          description: data.error || "Falha ao criar pagamento teste",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "❌ Erro de Teste",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">✅ Aprovado</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">⏳ Pendente</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">❌ Rejeitado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">EZZEBANK Gateway</h2>
          <p className="text-muted-foreground">
            Gerencie o gateway de pagamentos EZZEBANK
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-muted-foreground">Ambiente: {process.env.NODE_ENV === 'production' ? 'Produção' : 'Sandbox'}</span>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Depósitos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : formatCurrency(stats?.totalDeposits || 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saques</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : formatCurrency(stats?.totalWithdrawals || 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : stats?.pendingTransactions || 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volume Total</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : formatCurrency(stats?.totalVolume || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controles e Testes */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Teste de Conectividade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Teste de Conectividade
            </CardTitle>
            <CardDescription>
              Verifique se a conexão com o EZZEBANK está funcionando
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending}
              className="w-full"
            >
              {testConnectionMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Testar Conexão
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Teste de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Teste de Pagamento
            </CardTitle>
            <CardDescription>
              Crie um PIX de teste para verificar a integração
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-amount">Valor do Teste (R$)</Label>
              <Input
                id="test-amount"
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                step="0.01"
                min="1"
              />
            </div>
            <Button 
              onClick={() => testPaymentMutation.mutate(parseFloat(testAmount))}
              disabled={testPaymentMutation.isPending}
              className="w-full"
            >
              {testPaymentMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Criando PIX...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Criar PIX Teste
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Transações Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Transações EZZEBANK Recentes</CardTitle>
          <CardDescription>
            Últimas transações processadas pelo gateway EZZEBANK
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.length > 0 ? (
                  transactions.map((transaction: EzzebankTransaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-mono text-xs">
                        {transaction.id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>{transaction.username}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.type === 'deposit' ? 'default' : 'secondary'}>
                          {transaction.type === 'deposit' ? '⬇️ Depósito' : '⬆️ Saque'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                      <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                      <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma transação EZZEBANK encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}