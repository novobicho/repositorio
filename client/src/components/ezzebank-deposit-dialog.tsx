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
import { Loader2, Copy, Check, Clock, CreditCard, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface EzzebankPayment {
  id: string;
  amount: number;
  pixKey: string;
  qrCode: string;
  qrCodeImage: string;
  expiresAt: string;
  status: string;
}

interface EzzebankDepositDialogProps {
  trigger?: React.ReactNode;
}

export function EzzebankDepositDialog({ trigger }: EzzebankDepositDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<EzzebankPayment | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createPaymentMutation = useMutation({
    mutationFn: async (data: { amount: number; description?: string }) => {
      const response = await apiRequest("POST", "/api/ezzebank/create-pix-payment", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPayment(data.payment);
        toast({
          title: "✅ PIX Criado com Sucesso!",
          description: "Use os dados abaixo para realizar o pagamento",
        });
      } else {
        throw new Error(data.error || "Erro ao criar pagamento");
      }
    },
    onError: (error) => {
      toast({
        title: "❌ Erro ao Criar PIX",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const handleCreatePayment = () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast({
        title: "⚠️ Valor Inválido",
        description: "Digite um valor válido para o depósito",
        variant: "destructive",
      });
      return;
    }

    createPaymentMutation.mutate({
      amount: amountNum,
      description: `Depósito via EZZEBANK - R$ ${amountNum.toFixed(2)}`
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: "📋 Copiado!",
      description: "Chave PIX copiada para a área de transferência",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatExpirationTime = (expiresAt: string) => {
    const expiration = new Date(expiresAt);
    return expiration.toLocaleString('pt-BR');
  };

  const handleClose = () => {
    setOpen(false);
    setAmount("");
    setPayment(null);
    setCopied(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full">
            <CreditCard className="mr-2 h-4 w-4" />
            Depósito via EZZEBANK
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            Depósito EZZEBANK
          </DialogTitle>
          <DialogDescription>
            {!payment ? 
              "Digite o valor que deseja depositar para gerar o PIX" :
              "Use os dados abaixo para realizar o pagamento PIX"
            }
          </DialogDescription>
        </DialogHeader>

        {!payment ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor do Depósito (R$)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="1"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">💡 Sobre o EZZEBANK</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Processamento instantâneo 24/7</li>
                <li>• Sistema seguro e confiável</li>
                <li>• Sem taxas adicionais</li>
                <li>• Confirmação automática</li>
              </ul>
            </div>

            <Button 
              onClick={handleCreatePayment}
              disabled={createPaymentMutation.isPending}
              className="w-full"
            >
              {createPaymentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando PIX...
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  Gerar PIX EZZEBANK
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      <Clock className="mr-1 h-3 w-3" />
                      {payment.status}
                    </Badge>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Valor a pagar</p>
                    <p className="text-2xl font-bold text-green-600">
                      R$ {payment.amount.toFixed(2)}
                    </p>
                  </div>

                  {payment.qrCodeImage && (
                    <div className="flex justify-center">
                      <img 
                        src={payment.qrCodeImage} 
                        alt="QR Code PIX" 
                        className="w-48 h-48 border rounded-lg"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        CHAVE PIX (Clique para copiar)
                      </Label>
                      <div 
                        className="mt-1 p-2 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => copyToClipboard(payment.pixKey)}
                      >
                        <div className="flex items-center justify-between">
                          <code className="text-xs break-all">
                            {payment.pixKey}
                          </code>
                          {copied ? (
                            <Check className="h-4 w-4 text-green-600 ml-2" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-600 ml-2" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">
                        CÓDIGO PIX COPIA E COLA
                      </Label>
                      <div 
                        className="mt-1 p-2 bg-gray-50 rounded border cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => copyToClipboard(payment.qrCode)}
                      >
                        <div className="flex items-center justify-between">
                          <code className="text-xs break-all">
                            {payment.qrCode.substring(0, 50)}...
                          </code>
                          {copied ? (
                            <Check className="h-4 w-4 text-green-600 ml-2" />
                          ) : (
                            <Copy className="h-4 w-4 text-gray-600 ml-2" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">
                        ⏰ Expira em: {formatExpirationTime(payment.expiresAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">⚠️ Instruções Importantes</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• O pagamento será confirmado automaticamente</li>
                <li>• Realize o PIX dentro do prazo de expiração</li>
                <li>• O saldo será creditado em alguns minutos</li>
                <li>• Guarde o ID da transação: <code>{payment.id}</code></li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleClose}
                className="flex-1"
              >
                Fechar
              </Button>
              <Button 
                onClick={() => {
                  // Invalidar queries para atualizar dados
                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
                  handleClose();
                }}
                className="flex-1"
              >
                Pagamento Realizado
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}