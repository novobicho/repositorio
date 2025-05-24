import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Ban, Check, DollarSign, History, UserX } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";

interface UserWithBonusBalance extends User {
  bonusBalance: number;
}

interface UserDetails {
  user: UserWithBonusBalance;
  bets: any[];
  transactions: any[];
  stats: {
    totalBets: number;
    realMoneyBets: number;
    bonusBets: number;
    totalDeposits: number;
    totalWithdrawals: number;
  };
}

export default function UserDetailsPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [balanceAmount, setBalanceAmount] = useState("");
  const [blockReason, setBlockReason] = useState("");

  // Buscar detalhes do usuário
  const { data: userDetails, isLoading, error } = useQuery<UserDetails>({
    queryKey: [`/api/admin/users/${id}/details`],
    enabled: !!id,
  });

  // Mutation para editar usuário
  const editMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}`, userData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}/details`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      toast({
        title: "Sucesso",
        description: "Usuário atualizado com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para atualizar saldo
  const updateBalanceMutation = useMutation({
    mutationFn: async ({ amount, type }: { amount: number; type: "add" | "subtract" }) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/balance`, { amount, type });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}/details`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setBalanceDialogOpen(false);
      setBalanceAmount("");
      toast({
        title: "Sucesso",
        description: "Saldo atualizado com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para bloquear/desbloquear usuário
  const blockMutation = useMutation({
    mutationFn: async ({ blocked, reason }: { blocked: boolean; reason?: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/block`, { blocked, reason });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}/details`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setBlockDialogOpen(false);
      setBlockReason("");
      toast({
        title: "Sucesso",
        description: userDetails?.user.blocked ? "Usuário desbloqueado!" : "Usuário bloqueado!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEditUser = () => {
    if (!userDetails) return;
    setEditUser({
      username: userDetails.user.username,
      email: userDetails.user.email,
      name: userDetails.user.name,
      cpf: userDetails.user.cpf,
      pixKey: userDetails.user.pixKey,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateBalance = (type: "add" | "subtract") => {
    const amount = parseFloat(balanceAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erro",
        description: "Digite um valor válido",
        variant: "destructive",
      });
      return;
    }
    updateBalanceMutation.mutate({ amount, type });
  };

  const handleBlockUser = () => {
    if (!userDetails) return;
    
    if (userDetails.user.blocked) {
      // Desbloquear
      blockMutation.mutate({ blocked: false });
    } else {
      // Bloquear
      if (!blockReason.trim()) {
        toast({
          title: "Erro",
          description: "Digite um motivo para o bloqueio",
          variant: "destructive",
        });
        return;
      }
      blockMutation.mutate({ blocked: true, reason: blockReason });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error || !userDetails) {
    return (
      <div className="container mx-auto p-6">
        <Button onClick={() => setLocation("/admin")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              Erro ao carregar detalhes do usuário.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, bets, transactions, stats } = userDetails;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Header with prominent back button - Mobile Responsive */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 md:p-4 shadow-sm">
        {/* Mobile Layout - Stack vertically */}
        <div className="flex flex-col space-y-3 md:hidden">
          <Button 
            onClick={() => setLocation("/admin-dashboard")} 
            variant="outline"
            size="sm"
            className="w-full bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 font-medium"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Gerenciar Usuários
          </Button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Detalhes do Usuário</h1>
            <p className="text-gray-600 text-xs">Informações e histórico</p>
          </div>
        </div>
        
        {/* Desktop Layout - Side by side */}
        <div className="hidden md:flex md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <Button 
              onClick={() => setLocation("/admin-dashboard")} 
              variant="outline"
              size="lg"
              className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 font-medium"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Voltar para Gerenciar Usuários
            </Button>
            <div className="border-l border-gray-300 pl-4">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">Detalhes do Usuário</h1>
              <p className="text-gray-600 text-sm">Informações completas e histórico de atividades</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={handleEditUser} variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button onClick={() => setBalanceDialogOpen(true)} variant="outline" size="sm">
            <DollarSign className="h-4 w-4 mr-2" />
            Saldo
          </Button>
          <Button 
            onClick={() => setBlockDialogOpen(true)} 
            variant={user.blocked ? "default" : "destructive"}
            size="sm"
          >
            {user.blocked ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Desbloquear
              </>
            ) : (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Bloquear
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Informações Básicas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">ID</Label>
              <p className="text-lg">{user.id}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Nome de Usuário</Label>
              <p className="text-lg">{user.username}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Nome Completo</Label>
              <p className="text-lg">{user.name || "Não informado"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Email</Label>
              <p className="text-lg">{user.email || "Não informado"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">CPF</Label>
              <p className="text-lg">{user.cpf || "Não informado"}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Chave PIX</Label>
              <p className="text-lg">{user.pixKey || "Não informado"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Saldo</Label>
              <p className="text-lg font-bold text-green-600">
                R$ {user.balance.toFixed(2)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Saldo de Bônus</Label>
              <p className="text-lg font-bold text-blue-600">
                R$ {user.bonusBalance.toFixed(2)}
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Status</Label>
              <div className="flex items-center space-x-2">
                <Badge variant={user.blocked ? "destructive" : "default"}>
                  {user.blocked ? "Bloqueado" : "Ativo"}
                </Badge>
                {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
              </div>
            </div>
            {user.blocked && user.blockReason && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Motivo do Bloqueio</Label>
                <p className="text-sm text-red-600">{user.blockReason}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Data de Criação</Label>
              <p className="text-lg">{user.createdAt ? format(new Date(user.createdAt), "dd/MM/yyyy") : "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estatísticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Total de Apostas</Label>
              <p className="text-lg font-bold">{stats.totalBets}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Apostas com Dinheiro</Label>
              <p className="text-lg">{stats.realMoneyBets}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Apostas com Bônus</Label>
              <p className="text-lg">{stats.bonusBets}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Total de Depósitos</Label>
              <p className="text-lg text-green-600">R$ {stats.totalDeposits.toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Total de Saques</Label>
              <p className="text-lg text-red-600">R$ {stats.totalWithdrawals.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Apostas Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <History className="h-5 w-5 mr-2" />
            Apostas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma aposta encontrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Data</TableHead>
                    <TableHead className="min-w-[100px]">Tipo</TableHead>
                    <TableHead className="min-w-[80px]">Valor</TableHead>
                    <TableHead className="min-w-[80px]">Status</TableHead>
                    <TableHead className="min-w-[80px]">Prêmio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bets.slice(0, 10).map((bet: any) => (
                    <TableRow key={bet.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(bet.createdAt), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{bet.gameMode?.name || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>R$ {bet.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={bet.status === "won" ? "default" : bet.status === "lost" ? "destructive" : "secondary"}>
                          {bet.status === "won" ? "Ganhou" : bet.status === "lost" ? "Perdeu" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {bet.winAmount ? `R$ ${bet.winAmount.toFixed(2)}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transações Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <DollarSign className="h-5 w-5 mr-2" />
            Transações Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma transação encontrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Data</TableHead>
                    <TableHead className="min-w-[80px]">Tipo</TableHead>
                    <TableHead className="min-w-[80px]">Valor</TableHead>
                    <TableHead className="min-w-[150px]">Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 10).map((transaction: any) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(transaction.createdAt), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            transaction.type === "deposit" ? "default" : 
                            transaction.type === "withdrawal" ? "destructive" : 
                            "secondary"
                          }
                        >
                          {transaction.type === "deposit" ? "Depósito" : 
                           transaction.type === "withdrawal" ? "Saque" : 
                           transaction.type === "bet" ? "Aposta" :
                           transaction.type === "win" ? "Ganho" : "Bônus"}
                        </Badge>
                      </TableCell>
                      <TableCell 
                        className={
                          transaction.type === "deposit" || transaction.type === "win" || transaction.type === "bonus" 
                            ? "text-green-600" 
                            : "text-red-600"
                        }
                      >
                        {transaction.type === "deposit" || transaction.type === "win" || transaction.type === "bonus" ? "+" : "-"}
                        R$ {Math.abs(transaction.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{transaction.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para Editar Usuário */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Altere as informações do usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="username">Nome de Usuário</Label>
              <Input
                id="username"
                value={editUser.username || ""}
                onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editUser.email || ""}
                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                value={editUser.name || ""}
                onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={editUser.cpf || ""}
                onChange={(e) => setEditUser({ ...editUser, cpf: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="pixKey">Chave PIX</Label>
              <Input
                id="pixKey"
                value={editUser.pixKey || ""}
                onChange={(e) => setEditUser({ ...editUser, pixKey: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => editMutation.mutate(editUser)}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Atualizar Saldo */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Saldo</DialogTitle>
            <DialogDescription>
              Adicione ou subtraia do saldo do usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => handleUpdateBalance("subtract")}
              disabled={updateBalanceMutation.isPending}
              variant="destructive"
            >
              Subtrair
            </Button>
            <Button 
              onClick={() => handleUpdateBalance("add")}
              disabled={updateBalanceMutation.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Bloquear Usuário */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {user.blocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
            </DialogTitle>
            <DialogDescription>
              {user.blocked 
                ? "Tem certeza que deseja desbloquear este usuário?"
                : "Digite o motivo do bloqueio."
              }
            </DialogDescription>
          </DialogHeader>
          {!user.blocked && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="blockReason">Motivo do Bloqueio</Label>
                <Input
                  id="blockReason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Ex: Comportamento inadequado"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBlockUser}
              disabled={blockMutation.isPending}
              variant={user.blocked ? "default" : "destructive"}
            >
              {blockMutation.isPending 
                ? "Processando..." 
                : user.blocked 
                  ? "Desbloquear" 
                  : "Bloquear"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}