import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Bet, BetWithDetails, Animal, Draw, User, GameMode } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Eye, Search, Filter } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBetType } from "@/lib/utils";

export function BetManagement() {
  const { toast } = useToast();
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data: bets, isLoading } = useQuery<Bet[]>({
    queryKey: ["/api/admin/bets"],
  });

  const { data: animals } = useQuery<Animal[]>({
    queryKey: ["/api/animals"],
  });

  const { data: draws } = useQuery<Draw[]>({
    queryKey: ["/api/draws"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  
  const { data: gameModes } = useQuery<GameMode[]>({
    queryKey: ["/api/game-modes"],
  });

  const showBetDetails = (bet: Bet) => {
    setSelectedBet(bet);
    setDetailsOpen(true);
  };

  const getAnimalName = (animalId: number | undefined) => {
    if (!animals || animalId === undefined) return "-";
    const animal = animals.find(a => a.id === animalId);
    return animal ? `Grupo ${String(animal.group).padStart(2, '0')} - ${animal.name}` : "-";
  };

  const getDrawName = (drawId: number | undefined) => {
    if (!draws || drawId === undefined) return "-";
    const draw = draws.find(d => d.id === drawId);
    return draw ? `${draw.name} (${draw.time})` : "-";
  };

  const getUserName = (userId: number | undefined) => {
    if (!users || userId === undefined) return "-";
    const user = users.find(u => u.id === userId);
    return user ? user.username : "-";
  };
  
  const getGameModeName = (gameModeId: number | null | undefined) => {
    if (!gameModes || gameModeId === undefined || gameModeId === null) return "-";
    const gameMode = gameModes.find(gm => gm.id === gameModeId);
    return gameMode ? gameMode.name : "-";
  };
  
  const getBetTypeName = (type: string, gameModeId?: number | null) => {
    // Obter o nome do modo de jogo, se disponível
    const gameModeName = gameModeId ? getGameModeName(gameModeId) : undefined;
    
    // Usar a função formatBetType aprimorada que leva em conta o modo de jogo
    return formatBetType(type, false, gameModeName).name;
  };

  // Exibe o status da aposta com o estilo apropriado
  const renderBetStatus = (status: string) => {
    if (status === "pending") {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          Aguardando
        </Badge>
      );
    } else if (status === "won") {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          Ganhou
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100">
          Perdeu
        </Badge>
      );
    }
  };

  // Função removida para usar apenas o getBetTypeName

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const filteredBets = bets?.filter(bet => {
    // Filter by status
    if (filterStatus !== "all" && bet.status !== filterStatus) {
      return false;
    }

    // Filter by search query (user name or animal)
    if (searchQuery) {
      const animalName = getAnimalName(bet.animalId).toLowerCase();
      const userName = getUserName(bet.userId).toLowerCase();
      const drawName = getDrawName(bet.drawId).toLowerCase();
      
      return animalName.includes(searchQuery.toLowerCase()) || 
             userName.includes(searchQuery.toLowerCase()) ||
             drawName.includes(searchQuery.toLowerCase());
    }

    return true;
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Gerenciar Apostas</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder="Buscar..."
                className="pl-8 w-full sm:max-w-[200px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:max-w-[150px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Aguardando</SelectItem>
                <SelectItem value="won">Ganhou</SelectItem>
                <SelectItem value="lost">Perdeu</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Visão para Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Animal</TableHead>
                  <TableHead>Sorteio</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Possível Ganho</TableHead>
                  <TableHead>Ganho Real</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-4">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredBets && filteredBets.length > 0 ? (
                  filteredBets.map((bet) => (
                    <TableRow key={bet.id}>
                      <TableCell className="font-medium">{bet.id}</TableCell>
                      <TableCell>{getUserName(bet.userId)}</TableCell>
                      <TableCell>
                        {bet.type === 'group' && bet.animalId ? (
                          // Animal específico para apostas de grupo
                          getAnimalName(bet.animalId)
                        ) : bet.type === 'group' && bet.betNumbers?.length ? (
                          // Para apostas de grupo que armazenaram o número em vez do animal
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-primary">Número:</span> 
                              <span className="font-mono text-lg font-bold bg-primary/10 px-3 py-1 rounded-md">
                                {bet.betNumbers[0]}
                              </span>
                            </span>
                          </div>
                        ) : bet.type === 'duque_grupo' ? (
                          getAnimalName(bet.animalId)
                        ) : bet.type === 'thousand' || bet.type === 'hundred' || bet.type === 'dozen' ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-primary">{formatBetType(bet.type).name}:</span> 
                              <span className="font-mono text-lg font-bold bg-primary/10 px-3 py-1 rounded-md">
                                {bet.betNumbers?.[0] || '-'}
                              </span>
                            </span>
                            {formatBetType(bet.type, true).description && (
                              <span className="text-xs text-gray-500">
                                {formatBetType(bet.type, true).description}
                              </span>
                            )}
                          </div>
                        ) : bet.betNumbers?.length ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1">
                              <span className="font-medium text-primary">Números:</span> 
                              <span className="font-mono text-lg font-bold bg-primary/10 px-3 py-1 rounded-md">
                                {bet.betNumbers.join(', ')}
                              </span>
                            </span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{getDrawName(bet.drawId)}</TableCell>
                      <TableCell>{formatCurrency(bet.amount)}</TableCell>
                      <TableCell>{getBetTypeName(bet.type, bet.gameModeId)}</TableCell>
                      <TableCell>{renderBetStatus(bet.status)}</TableCell>
                      <TableCell className="text-emerald-600 font-medium">
                        {bet.potentialWinAmount ? formatCurrency(bet.potentialWinAmount) : "-"}
                      </TableCell>
                      <TableCell className="text-blue-600 font-medium">
                        {bet.winAmount ? formatCurrency(bet.winAmount) : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {new Date(bet.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-primary hover:text-primary-dark"
                          onClick={() => showBetDetails(bet)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-4">
                      Nenhuma aposta encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Visão para Mobile */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {isLoading ? (
              <div className="text-center py-4">Carregando...</div>
            ) : filteredBets && filteredBets.length > 0 ? (
              filteredBets.map((bet) => (
                <div 
                  key={bet.id} 
                  className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100"
                  onClick={() => showBetDetails(bet)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-sm text-gray-500">#{bet.id}</span>
                    <div className="flex items-center gap-2">
                      {renderBetStatus(bet.status)}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-primary hover:text-primary-dark"
                        onClick={(e) => {
                          e.stopPropagation();
                          showBetDetails(bet);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                    <div className="font-medium text-gray-500">Usuário:</div>
                    <div className="text-right">{getUserName(bet.userId)}</div>
                    
                    <div className="font-medium text-gray-500">
                      {bet.type.includes('group') ? 'Animal:' : `${formatBetType(bet.type).name}:`}
                    </div>
                    <div className="text-right">
                      {bet.type === 'group' && bet.animalId ? (
                        getAnimalName(bet.animalId)
                      ) : bet.type === 'group' && bet.betNumbers?.length ? (
                        <span className="font-mono text-base font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                          {bet.betNumbers[0]}
                        </span>
                      ) : bet.type === 'duque_grupo' ? (
                        getAnimalName(bet.animalId)
                      ) : bet.type === 'thousand' || bet.type === 'hundred' || bet.type === 'dozen' ? (
                        <span className="font-mono text-base font-bold bg-primary/10 px-2 py-0.5 rounded-md">
                          {bet.betNumbers ? bet.betNumbers[0] : '-'}
                        </span>
                      ) : bet.betNumbers ? (
                        bet.betNumbers.join(', ')
                      ) : '-'}
                    </div>
                    
                    <div className="font-medium text-gray-500">Tipo:</div>
                    <div className="text-right">{getBetTypeName(bet.type, bet.gameModeId)}</div>
                    
                    <div className="font-medium text-gray-500">Valor:</div>
                    <div className="text-right font-medium">{formatCurrency(bet.amount)}</div>
                    
                    <div className="font-medium text-gray-500">Ganho potencial:</div>
                    <div className="text-right text-emerald-600 font-medium">
                      {bet.potentialWinAmount ? formatCurrency(bet.potentialWinAmount) : "-"}
                    </div>
                    
                    <div className="font-medium text-gray-500">Sorteio:</div>
                    <div className="text-right">
                      {getDrawName(bet.drawId)}
                    </div>
                    
                    <div className="font-medium text-gray-500">Data:</div>
                    <div className="text-right">
                      {new Date(bet.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4">Nenhuma aposta encontrada</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bet Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-lg p-0 overflow-hidden shadow-lg">
          <DialogHeader className="pt-6 px-6 pb-2 bg-gradient-to-r from-primary/10 to-primary/5">
            <DialogTitle className="text-lg sm:text-xl text-primary flex items-center gap-2">
              <span className="bg-primary text-white p-1 rounded-full flex items-center justify-center w-7 h-7">
                <span className="text-sm font-bold">#{selectedBet?.id}</span>
              </span>
              Detalhes da Aposta
            </DialogTitle>
            <DialogDescription>
              Informações detalhadas sobre a aposta.
            </DialogDescription>
          </DialogHeader>
          
          {selectedBet && (
            <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
              {/* Status pill at top */}
              <div className="flex justify-end -mt-2 mb-4">
                {renderBetStatus(selectedBet.status)}
              </div>
              
              {/* Highlight Section */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-500">Valor da Aposta</div>
                  <div className="text-xl font-bold">{formatCurrency(selectedBet.amount)}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">Ganho Potencial</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {selectedBet.potentialWinAmount ? formatCurrency(selectedBet.potentialWinAmount) : "-"}
                  </div>
                </div>
                {selectedBet.status === "won" && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                    <div className="text-sm text-gray-500">Ganho Real</div>
                    <div className="text-xl font-bold text-blue-600">
                      {selectedBet.winAmount ? formatCurrency(selectedBet.winAmount) : "-"}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Details grid */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Usuário</div>
                  <div className="font-medium text-right">{getUserName(selectedBet.userId)}</div>
                </div>
                
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Modalidade</div>
                  <div className="font-medium text-right capitalize">
                    {getGameModeName(selectedBet.gameModeId)}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Tipo de Aposta</div>
                  <div className="font-medium text-right capitalize">
                    {getBetTypeName(selectedBet.type, selectedBet.gameModeId)}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Prêmio</div>
                  <div className="font-medium text-right">
                    {selectedBet.premioType === "1-5" ? "Todos (1º ao 5º)" : 
                     selectedBet.premioType === "1" ? "1º Prêmio" : 
                     selectedBet.premioType === "2" ? "2º Prêmio" : 
                     selectedBet.premioType === "3" ? "3º Prêmio" : 
                     selectedBet.premioType === "4" ? "4º Prêmio" : 
                     selectedBet.premioType === "5" ? "5º Prêmio" : "-"}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 items-start">
                  <div className="text-gray-500 text-sm pt-1">
                    {selectedBet.type.includes('group') ? 'Animal' : formatBetType(selectedBet.type).name}
                  </div>
                  <div className="font-medium text-right break-words">
                    {selectedBet.type === 'group' && selectedBet.animalId ? (
                      getAnimalName(selectedBet.animalId)
                    ) : selectedBet.type === 'group' && selectedBet.betNumbers?.length ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-base font-bold bg-primary/10 px-3 py-1 rounded-md">
                          {selectedBet.betNumbers[0]}
                        </span>
                      </div>
                    ) : selectedBet.type === 'duque_grupo' ? (
                      getAnimalName(selectedBet.animalId)
                    ) : selectedBet.type === 'thousand' || selectedBet.type === 'hundred' || selectedBet.type === 'dozen' ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-base font-bold bg-primary/10 px-3 py-1 rounded-md">
                          {selectedBet.betNumbers?.[0] || '-'}
                        </span>
                        {formatBetType(selectedBet.type, true).description && (
                          <span className="text-xs text-gray-500 mt-1">
                            {formatBetType(selectedBet.type, true).description}
                          </span>
                        )}
                      </div>
                    ) : selectedBet.betNumbers ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-base font-bold bg-primary/10 px-3 py-1 rounded-md">
                          {selectedBet.betNumbers.join(', ')}
                        </span>
                      </div>
                    ) : '-'}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Sorteio</div>
                  <div className="font-medium text-right">{getDrawName(selectedBet.drawId)}</div>
                </div>
                
                <div className="grid grid-cols-2 items-center">
                  <div className="text-gray-500 text-sm">Data da Aposta</div>
                  <div className="font-medium text-right">
                    {new Date(selectedBet.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="p-4 border-t">
            <Button 
              onClick={() => setDetailsOpen(false)} 
              className="w-full rounded-full py-5 text-base font-medium shadow-md transition-all hover:shadow-lg"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}