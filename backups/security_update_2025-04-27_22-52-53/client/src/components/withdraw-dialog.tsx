import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WithdrawDialog({ open, onOpenChange }: WithdrawDialogProps) {
  const [amount, setAmount] = useState<number>(0);
  const { user, updateBalanceMutation } = useAuth();
  const { toast } = useToast();

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setAmount(isNaN(value) ? 0 : value);
  };

  const handleWithdraw = () => {
    if (amount <= 0) {
      toast({
        title: "Valor inválido",
        description: "O valor de saque deve ser maior que zero",
        variant: "destructive",
      });
      return;
    }

    if (user && user.balance < amount) {
      toast({
        title: "Saldo insuficiente",
        description: "Você não possui saldo suficiente para este saque",
        variant: "destructive",
      });
      return;
    }

    updateBalanceMutation.mutate(
      {
        amount,
        type: "withdraw",
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setAmount(0);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Sacar Saldo</DialogTitle>
          <DialogDescription>
            Realize um saque do seu saldo disponível.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Valor
            </Label>
            <div className="col-span-3 relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <span className="text-gray-500">R$</span>
              </div>
              <Input
                id="amount"
                type="number"
                min="0"
                step="10"
                max={user?.balance || 0}
                value={amount || ""}
                onChange={handleAmountChange}
                className="pl-10"
              />
            </div>
          </div>
          <div className="col-span-4">
            <p className="text-sm text-gray-500">
              Saldo disponível: <span className="font-medium">R$ {user?.balance.toFixed(2) || "0.00"}</span>
            </p>
          </div>
          <div className="col-span-4 text-sm text-gray-500">
            <p>
              Em um ambiente real, aqui seria solicitado dados bancários para
              transferência do valor.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleWithdraw}
            disabled={updateBalanceMutation.isPending}
          >
            {updateBalanceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
              </>
            ) : (
              "Sacar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
