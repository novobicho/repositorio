import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowDownLeft, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface EzzebankWithdrawal {
  id: string;
  amount: number;
  pixKey: string;
  recipientName: string;
  status: string;
  createdAt: string;
}

interface EzzebankWithdrawalDialogProps {
  trigger?: React.ReactNode;
  userBalance: number;
}

export function EzzebankWithdrawalDialog({ trigger, userBalance }: EzzebankWithdrawalDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<string>("");
  const [withdrawal, setWithdrawal] = useState<EzzebankWithdrawal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createWithdrawalMutation = useMutation({
    mutationFn: async (data: { amount: number; pixKey: string; pixKeyType: string }) => {
      const response = await apiRequest("POST", "/api/ezzebank/create-pix-withdrawal", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setWithdrawal(data.withdrawal);
        toast({
          title: "✅ Saque Solicitado!",
          description: "Sua solicitação está sendo processada",
        });
      } else {
        throw new Error(data.error || "Erro ao solicitar saque");
      }
    },
    onError: (error) => {
      toast({
        title: "❌ Erro ao Solicitar Saque",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const validatePixKey = (key: string, type: string): boolean => {
    switch (type) {
      case 'cpf':
        return /^\d{11}$/.test(key.replace(/\D/g, ''));
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
      case 'phone':
        return /^\+?55\d{10,11}$/.test(key.replace(/\D/g, ''));
      case 'random':
        return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key);
      default:
        return false;
    }
  };

  const handleCreateWithdrawal = () => {
    const amountNum = parseFloat(amount);
    
    if (!amountNum || amountNum <= 0) {
      toast({
        title: "⚠️ Valor Inválido",
        description: "Digite um valor válido para o saque",
        variant: "destructive",
      });
      return;
    }

    if (amountNum > userBalance) {
      toast({
        title: "⚠️ Saldo Insuficiente",
        description: `Você tem apenas R$ ${userBalance.toFixed(2)} disponível`,
        variant: "destructive",
      });
      return;
    }

    if (!pixKey || !pixKeyType) {
      toast({
        title: "⚠️ Dados Incompletos",
        description: "Informe a chave PIX e seu tipo",
        variant: "destructive",
      });
      return;
    }

    if (!validatePixKey(pixKey, pixKeyType)) {
      toast({
        title: "⚠️ Chave PIX Inválida",
        description: "A chave PIX não está no formato correto",
        variant: "destructive",
      });
      return;
    }

    createWithdrawalMutation.mutate({
      amount: amountNum,
      pixKey,
      pixKeyType
    });
  };

  const formatPixKey = (key: string, type: string): string => {
    switch (type) {
      case 'cpf':
        return key.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      case 'phone':
        return key.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      default:
        return key;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">⏳ Processando</Badge>;
      case 'approved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">✅ Aprovado</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">❌ Rejeitado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleClose = () => {
    setOpen(false);
    setAmount("");
    setPixKey("");
    setPixKeyType("");
    setWithdrawal(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full">
            <ArrowDownLeft className="mr-2 h-4 w-4" />
            Saque via EZZEBANK
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <ArrowDownLeft className="h-5 w-5 text-white" />
            </div>
            Saque EZZEBANK
          </DialogTitle>
          <DialogDescription>
            {!withdrawal ? 
              "Solicite um saque via PIX usando o gateway EZZEBANK" :
              "Sua solicitação de saque foi processada"
            }
          </DialogDescription>
        </DialogHeader>

        {!withdrawal ? (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-700">
                💰 <strong>Saldo disponível:</strong> R$ {userBalance.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Valor do Saque (R$)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="1"
                max={userBalance}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pixKeyType">Tipo da Chave PIX</Label>
              <Select value={pixKeyType} onValueChange={setPixKeyType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo da chave" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="random">Chave Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pixKey">Chave PIX</Label>
              <Input
                id="pixKey"
                placeholder={
                  pixKeyType === 'cpf' ? "000.000.000-00" :
                  pixKeyType === 'email' ? "usuario@email.com" :
                  pixKeyType === 'phone' ? "(11) 99999-9999" :
                  pixKeyType === 'random' ? "12345678-1234-1234-1234-123456789012" :
                  "Selecione o tipo primeiro"
                }
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                disabled={!pixKeyType}
              />
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">⚠️ Informações Importantes</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• O valor será debitado imediatamente do seu saldo</li>
                <li>• O processamento pode levar até 1 hora útil</li>
                <li>• Verifique os dados da chave PIX antes de confirmar</li>
                <li>• Processamento 24/7 via EZZEBANK</li>
              </ul>
            </div>

            <Button 
              onClick={handleCreateWithdrawal}
              disabled={createWithdrawalMutation.isPending}
              className="w-full"
            >
              {createWithdrawalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando Saque...
                </>
              ) : (
                <>
                  <ArrowDownLeft className="mr-2 h-4 w-4" />
                  Solicitar Saque EZZEBANK
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold">Saque Solicitado!</h3>
                    <p className="text-sm text-muted-foreground">
                      ID da Transação: <code>{withdrawal.id}</code>
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Valor:</span>
                      <span className="font-semibold">R$ {withdrawal.amount.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Chave PIX:</span>
                      <span className="font-mono text-sm">
                        {formatPixKey(withdrawal.pixKey, pixKeyType)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      {getStatusBadge(withdrawal.status)}
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Data:</span>
                      <span className="text-sm">
                        {new Date(withdrawal.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900 mb-1">Próximos Passos</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• O valor foi debitado do seu saldo</li>
                    <li>• Acompanhe o status na aba de transações</li>
                    <li>• O PIX será processado automaticamente</li>
                    <li>• Você receberá uma notificação quando concluído</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button 
              onClick={() => {
                // Invalidar queries para atualizar dados
                queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
                handleClose();
              }}
              className="w-full"
            >
              Entendido
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}