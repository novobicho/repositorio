import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  RefreshCw, 
  ExternalLink, 
  ArrowDownCircle, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Timer,
  Clock,
  Copy
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

const withdrawFormSchema = z.object({
  amount: z.number().min(10, "Valor mínimo de saque é R$ 10,00"),
  pixKey: z.string().min(1, "Chave PIX é obrigatória"),
  pixKeyType: z.enum(["cpf", "email", "phone", "random"]),
});

type WithdrawFormValues = z.infer<typeof withdrawFormSchema>;

interface WithdrawDialogProps {
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WithdrawDialog({ onSuccess, open: controlledOpen, onOpenChange }: WithdrawDialogProps) {
  const [open, setOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<'idle' | 'success' | 'processing' | 'error'>('idle');
  const [withdrawDetail, setWithdrawDetail] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Gerenciar estado aberto/fechado
  const isOpen = controlledOpen !== undefined ? controlledOpen : open;
  const setIsOpen = onOpenChange || setOpen;
  
  // Reseta o estado quando o diálogo é fechado
  useEffect(() => {
    if (!isOpen) {
      setWithdrawStatus('idle');
      setWithdrawDetail(null);
      form.reset();
      setWithdrawAmount("");
    }
  }, [isOpen]);

  const form = useForm<WithdrawFormValues>({
    resolver: zodResolver(withdrawFormSchema),
    defaultValues: {
      amount: 0,
      pixKey: user?.cpf || user?.email || "",
      pixKeyType: user?.cpf ? "cpf" : "email"
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error("Erro ao carregar configurações");
      return response.json();
    },
  });

  // Buscar saque pendente
  const { data: pendingWithdraw, refetch: refetchPendingWithdraw } = useQuery({
    queryKey: ["/api/transactions/pending-withdraw"],
    queryFn: async () => {
      const response = await fetch("/api/transactions/pending-withdraw");
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Erro ao verificar saques pendentes");
      }
      return response.json();
    },
    enabled: isOpen && !!user,
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: WithdrawFormValues) => {
      const res = await apiRequest("POST", "/api/withdrawals", data);
      return await res.json();
    },
    onSuccess: (data) => {
      setWithdrawStatus('success');
      setWithdrawDetail(data);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions/pending-withdraw"] });
      refetchPendingWithdraw();
      form.reset();
      setWithdrawAmount("");
      
      if (onSuccess) {
        onSuccess();
      }
      
      toast({
        title: "Solicitação de saque enviada!",
        description: "Seu saque será processado em breve.",
      });
    },
    onError: (error: Error) => {
      setWithdrawStatus('error');
      toast({
        title: "Erro ao solicitar saque",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Converter string de valor para número (considerando formato brasileiro)
  const parseMoneyValue = (value: string): number => {
    if (!value) return 0;
    const cleanValue = value.replace(/[^\d,]/g, "");
    const normalizedValue = cleanValue.replace(",", ".");
    return parseFloat(normalizedValue) || 0;
  };

  const onSubmit = (values: WithdrawFormValues) => {
    console.log("Dados do formulário:", values);
    
    setIsSubmitting(true);
    setWithdrawStatus('processing');
    
    const finalAmount = values.amount;
    
    withdrawMutation.mutate({
      amount: finalAmount,
      pixKey: user?.cpf || user?.email || "",
      pixKeyType: user?.cpf ? "cpf" : "email"
    });
  };

  if (!user) {
    return null;
  }

  // Se há saque pendente, mostrar status
  if (pendingWithdraw) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-orange-500" />
              Saque em Processamento
            </DialogTitle>
            <DialogDescription>
              Você já possui um saque pendente sendo processado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>Saque Pendente</AlertTitle>
              <AlertDescription>
                Valor: R$ {pendingWithdraw.amount.toFixed(2).replace('.', ',')}
                <br />
                Status: {pendingWithdraw.status}
                <br />
                Data: {new Date(pendingWithdraw.createdAt).toLocaleDateString('pt-BR')}
              </AlertDescription>
            </Alert>
            
            <p className="text-sm text-muted-foreground">
              Aguarde o processamento do seu saque atual antes de solicitar um novo.
            </p>
          </div>
          
          <DialogFooter>
            <Button 
              onClick={() => setIsOpen(false)}
              variant="outline"
            >
              Fechar
            </Button>
            <Button 
              onClick={() => refetchPendingWithdraw()}
              disabled={withdrawMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Verificações de sistema
  if (!settings?.allowWithdrawals) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Saques Indisponíveis
            </DialogTitle>
            <DialogDescription>
              Os saques estão temporariamente indisponíveis.
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sistema em Manutenção</AlertTitle>
            <AlertDescription>
              O sistema de saques está passando por manutenção. Tente novamente mais tarde.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button onClick={() => setIsOpen(false)} variant="outline">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!user.cpf) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Cadastro Incompleto
            </DialogTitle>
            <DialogDescription>
              Complete seu cadastro para realizar saques.
            </DialogDescription>
          </DialogHeader>
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>CPF Necessário</AlertTitle>
            <AlertDescription>
              Para realizar saques, você precisa cadastrar seu CPF nas configurações da conta.
            </AlertDescription>
          </Alert>
          
          <DialogFooter>
            <Button onClick={() => setIsOpen(false)} variant="outline">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-green-600" />
            Solicitar Saque
          </DialogTitle>
          <DialogDescription>
            Solicite o saque do seu saldo para sua conta PIX.
          </DialogDescription>
        </DialogHeader>

        {withdrawStatus === 'success' && withdrawDetail && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Saque Solicitado!</AlertTitle>
            <AlertDescription className="text-green-700">
              <div className="space-y-1">
                <p><strong>Valor:</strong> R$ {withdrawDetail.amount?.toFixed(2).replace('.', ',')}</p>
                <p><strong>PIX:</strong> {withdrawDetail.pixKey}</p>
                <p><strong>Status:</strong> {withdrawDetail.status}</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {withdrawStatus === 'error' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Erro no Saque</AlertTitle>
            <AlertDescription>
              Ocorreu um erro ao processar seu saque. Tente novamente.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor do Saque</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      value={withdrawAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        setWithdrawAmount(value);
                        const parsedValue = parseMoneyValue(value);
                        field.onChange(parsedValue);
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="R$ 0,00"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-2xl font-bold text-center ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </FormControl>
                  
                  {/* Valores pré-definidos para seleção rápida */}
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {[50, 100, 200, 500].map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const formattedAmount = `${amount},00`;
                          setWithdrawAmount(formattedAmount);
                          field.onChange(amount);
                        }}
                        className="h-8 text-xs"
                      >
                        R$ {amount}
                      </Button>
                    ))}
                  </div>
                  
                  <FormDescription>
                    Saldo disponível: R$ {user.balance.toFixed(2).replace('.', ',')}
                    <br />
                    Valor mínimo: R$ 10,00
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pixKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chave PIX</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Digite sua chave PIX"
                      value={user?.cpf || user?.email || ""}
                      disabled
                    />
                  </FormControl>
                  <FormDescription>
                    {user?.cpf ? "Usaremos seu CPF como chave PIX para o saque" : "Usaremos seu e-mail como chave PIX para o saque"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pixKeyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo da Chave PIX</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo da chave" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="random">Chave Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-3">
              <Button 
                type="submit" 
                disabled={withdrawMutation.isPending || withdrawStatus === 'processing'}
                className="w-full"
              >
                {withdrawMutation.isPending || withdrawStatus === 'processing' ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <ArrowDownCircle className="mr-2 h-4 w-4" />
                    Solicitar Saque
                  </>
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsOpen(false)}
                disabled={withdrawMutation.isPending}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}