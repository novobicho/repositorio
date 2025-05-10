import { useQuery } from "@tanstack/react-query";
import { BetWithDetails } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatBetType } from "@/lib/utils";

export function RecentBets() {
  const { data: bets, isLoading } = useQuery<BetWithDetails[]>({
    queryKey: ["/api/bets"],
  });

  const renderStatus = (bet: BetWithDetails) => {
    if (bet.status === "pending") {
      return (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          Aguardando resultado
        </Badge>
      );
    } else if (bet.status === "won") {
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100">
          Ganhou R$ {bet.winAmount?.toFixed(2)}
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Últimas Apostas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!bets || bets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Últimas Apostas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 py-4">
            Você ainda não fez nenhuma aposta
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas Apostas</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Visão Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Sorteio</TableHead>
                <TableHead>Jogo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Possível Ganho</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bets.map((bet) => (
                <TableRow key={bet.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(bet.createdAt), "dd/MM/yyyy - HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {bet.draw ? `${bet.draw.name} (${bet.draw.time})` : "Não informado"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {bet.type === 'group' && bet.animal ? (
                      <>Grupo {String(bet.animal.group).padStart(2, '0')} - {bet.animal.name}</>
                    ) : bet.type === 'group' && bet.betNumbers?.length ? (
                      <>{bet.gameMode?.name || "Modalidade"}: {bet.betNumbers[0]}</>
                    ) : bet.type === 'duque_grupo' ? (
                      <>Duque de Grupo {String(bet.animal?.group).padStart(2, '0')} - {bet.animal?.name}</>
                    ) : bet.type === 'thousand' ? (
                      <>Milhar: {bet.betNumbers?.join(', ') || 'Não informado'}</>
                    ) : bet.type === 'hundred' ? (
                      <>Centena: {bet.betNumbers?.join(', ') || 'Não informado'}</>
                    ) : bet.type === 'dozen' ? (
                      <>Dezena: {bet.betNumbers?.join(', ') || 'Não informado'}</>
                    ) : bet.betNumbers?.length ? (
                      <>{formatBetType(bet.type).name}: {bet.betNumbers.join(', ')}</>
                    ) : (
                      <>{formatBetType(bet.type).name}: Não informado</>
                    )}
                  </TableCell>
                  <TableCell>R$ {bet.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-emerald-600 font-medium">
                    {bet.potentialWinAmount ? `R$ ${(bet.potentialWinAmount).toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell>{renderStatus(bet)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Visão Mobile (Cards) */}
        <div className="md:hidden space-y-4">
          {bets.map((bet) => (
            <div key={bet.id} className="border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-medium">
                  {bet.type === 'group' && bet.animal ? (
                    <>Grupo {String(bet.animal.group).padStart(2, '0')} - {bet.animal.name}</>
                  ) : bet.type === 'group' && bet.betNumbers?.length ? (
                    <>{bet.gameMode?.name || "Modalidade"}: {bet.betNumbers[0]}</>
                  ) : bet.type === 'duque_grupo' ? (
                    <>Duque de Grupo {String(bet.animal?.group).padStart(2, '0')} - {bet.animal?.name}</>
                  ) : bet.betNumbers?.length ? (
                    <>{formatBetType(bet.type).name}: {bet.betNumbers.join(', ')}</>
                  ) : (
                    <>{formatBetType(bet.type).name}: Não informado</>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {format(new Date(bet.createdAt), "dd/MM/yyyy - HH:mm", { locale: ptBR })}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 mb-3 text-sm">
                <div className="text-gray-600">Sorteio:</div>
                <div className="text-right font-medium">
                  {bet.draw ? `${bet.draw.name} (${bet.draw.time})` : "Não informado"}
                </div>
                
                <div className="text-gray-600">Valor apostado:</div>
                <div className="text-right font-medium">R$ {bet.amount.toFixed(2)}</div>
                
                <div className="text-gray-600">Possível ganho:</div>
                <div className="text-right font-medium text-emerald-600">
                  {bet.potentialWinAmount ? `R$ ${(bet.potentialWinAmount).toFixed(2)}` : "-"}
                </div>
              </div>
              
              <div className="flex justify-end">
                {renderStatus(bet)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
