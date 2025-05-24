import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { 
  Eye, 
  Edit, 
  Trash2, 
  DollarSign, 
  Search,
  Ban,
  Check
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface UserWithBonusBalance extends User {
  bonusBalance: number;
}

export function UserManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedUser, setSelectedUser] = useState<UserWithBonusBalance | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [blockReason, setBlockReason] = useState<string>("");
  const [editUserData, setEditUserData] = useState({
    username: "",
    name: "",
    email: "",
    password: "",
    isAdmin: false,
  });

  // Função para formatar valores em reais
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Query para buscar usuários
  const { data: users, isLoading } = useQuery<UserWithBonusBalance[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Erro ao buscar usuários");
      return response.json();
    },
  });

  // Mutations
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!response.ok) throw new Error("Erro ao excluir usuário");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário excluído com sucesso!" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      const response = await apiRequest("PATCH", `/api/users/${selectedUser?.id}`, userData);
      if (!response.ok) throw new Error("Erro ao atualizar usuário");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditOpen(false);
      toast({ title: "Usuário atualizado com sucesso!" });
    },
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async (newBalance: number) => {
      const response = await apiRequest("PATCH", `/api/users/${selectedUser?.id}/balance`, {
        balance: newBalance,
      });
      if (!response.ok) throw new Error("Erro ao atualizar saldo");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setBalanceOpen(false);
      toast({ title: "Saldo atualizado com sucesso!" });
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async ({ userId, blocked, reason }: { userId: number; blocked: boolean; reason?: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/block`, {
        blocked,
        reason: reason || "",
      });
      if (!response.ok) throw new Error("Erro ao alterar status do usuário");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setBlockOpen(false);
      setBlockReason("");
      toast({ title: "Status do usuário alterado com sucesso!" });
    },
  });

  // Handlers
  const showUserDetails = (user: User) => {
    setLocation(`/admin/user/${user.id}`);
  };

  const showEditUser = (user: User) => {
    setSelectedUser(user as UserWithBonusBalance);
    setEditUserData({
      username: user.username,
      name: user.name || "",
      email: user.email || "",
      password: "",
      isAdmin: user.isAdmin,
    });
    setEditOpen(true);
  };

  const showBalanceUpdate = (user: User) => {
    setSelectedUser(user as UserWithBonusBalance);
    setAmount(0);
    setBalanceOpen(true);
  };

  const confirmDeleteUser = (user: User) => {
    if (window.confirm(`Tem certeza que deseja excluir o usuário ${user.username}?`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const showBlockUser = (user: User) => {
    setSelectedUser(user as UserWithBonusBalance);
    setBlockReason("");
    setBlockOpen(true);
  };

  // Filtrar usuários por busca
  const filteredUsers = users?.filter((user) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.name && user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Gerenciar Usuários</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Campo de busca */}
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, usuário ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {/* Tabela Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Bônus</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-4">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers && filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.id}</TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.name || "-"}</TableCell>
                        <TableCell>{user.email || "-"}</TableCell>
                        <TableCell>{formatCurrency(user.balance)}</TableCell>
                        <TableCell>{formatCurrency(user.bonusBalance || 0)}</TableCell>
                        <TableCell>
                          {user.isAdmin && (
                            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                              Admin
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.blocked ? "destructive" : "default"}>
                            {user.blocked ? "Bloqueado" : "Ativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => showUserDetails(user)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => showEditUser(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => showBalanceUpdate(user)}
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={user.blocked ? "default" : "destructive"}
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => showBlockUser(user)}
                            >
                              {user.blocked ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            </Button>
                            {!user.isAdmin && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => confirmDeleteUser(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-4">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Visão Mobile */}
            <div className="md:hidden grid grid-cols-1 gap-4">
              {isLoading ? (
                <div className="text-center py-4">Carregando...</div>
              ) : filteredUsers && filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <div key={user.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-lg">{user.username}</span>
                          {user.isAdmin && (
                            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                              Admin
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          ID: {user.id} • {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Data não disponível"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => showBalanceUpdate(user)}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => showUserDetails(user)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Saldo:</span>
                        <div className="font-medium">{formatCurrency(user.balance)}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Bônus:</span>
                        <div className="font-medium">{formatCurrency(user.bonusBalance || 0)}</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <Badge variant={user.blocked ? "destructive" : "default"}>
                        {user.blocked ? "Bloqueado" : "Ativo"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => showEditUser(user)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant={user.blocked ? "default" : "destructive"}
                          size="sm"
                          onClick={() => showBlockUser(user)}
                        >
                          {user.blocked ? "Desbloquear" : "Bloquear"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">Nenhum usuário encontrado</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1 sm:gap-4">
              <Label htmlFor="edit-username" className="sm:text-right">
                Usuário
              </Label>
              <Input
                id="edit-username"
                value={editUserData.username}
                onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })}
                className="col-span-1 sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1 sm:gap-4">
              <Label htmlFor="edit-name" className="sm:text-right">
                Nome
              </Label>
              <Input
                id="edit-name"
                value={editUserData.name}
                onChange={(e) => setEditUserData({ ...editUserData, name: e.target.value })}
                className="col-span-1 sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1 sm:gap-4">
              <Label htmlFor="edit-email" className="sm:text-right">
                Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={editUserData.email}
                onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                className="col-span-1 sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1 sm:gap-4">
              <Label htmlFor="edit-password" className="sm:text-right">
                Nova Senha
              </Label>
              <Input
                id="edit-password"
                type="password"
                value={editUserData.password}
                onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })}
                placeholder="Deixe em branco para não alterar"
                className="col-span-1 sm:col-span-3"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-center sm:justify-end">
            <Button 
              onClick={() => setEditOpen(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => updateUserMutation.mutate(editUserData)}
              disabled={updateUserMutation.isPending}
              className="w-full sm:w-auto"
            >
              {updateUserMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Balance Dialog */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Atualizar Saldo</DialogTitle>
            <DialogDescription>
              Digite o novo saldo para o usuário {selectedUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-1 sm:gap-4">
              <Label htmlFor="amount" className="sm:text-right">
                Novo Saldo
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="col-span-1 sm:col-span-3"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-center sm:justify-end">
            <Button 
              onClick={() => setBalanceOpen(false)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => updateBalanceMutation.mutate(amount)}
              disabled={updateBalanceMutation.isPending}
              className="w-full sm:w-auto"
            >
              {updateBalanceMutation.isPending ? "Atualizando..." : "Atualizar saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block User Dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.blocked ? "Desbloquear" : "Bloquear"} Usuário
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.blocked 
                ? `Desbloquear o usuário ${selectedUser?.username}?`
                : `Bloquear o usuário ${selectedUser?.username}?`
              }
            </DialogDescription>
          </DialogHeader>
          {!selectedUser?.blocked && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="block-reason">Motivo do bloqueio</Label>
                <Textarea
                  id="block-reason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Digite o motivo do bloqueio..."
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-center sm:justify-end">
            <Button 
              onClick={() => {
                setBlockOpen(false);
                setBlockReason("");
              }}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (selectedUser) {
                  blockUserMutation.mutate({
                    userId: selectedUser.id,
                    blocked: !selectedUser.blocked,
                    reason: selectedUser.blocked ? undefined : blockReason
                  });
                }
              }}
              disabled={blockUserMutation.isPending}
              variant={selectedUser?.blocked ? "default" : "destructive"}
              className="w-full sm:w-auto"
            >
              {blockUserMutation.isPending 
                ? "Processando..." 
                : selectedUser?.blocked 
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