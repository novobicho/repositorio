import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Draw } from "@/types";

export function UpcomingDrawsCard() {
  const { data: upcomingDraws, isLoading } = useQuery<Draw[]>({
    queryKey: ["/api/draws/upcoming"],
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Próximos Sorteios</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-8 bg-gray-200 rounded-md"></div>
            <div className="h-8 bg-gray-200 rounded-md"></div>
            <div className="h-8 bg-gray-200 rounded-md"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingDraws && upcomingDraws.length > 0 ? (
              upcomingDraws.map((draw) => (
                <div
                  key={draw.id}
                  className="flex justify-between items-center p-2 bg-gray-100 rounded-md"
                >
                  <span className="font-medium">{draw.name}</span>
                  <span>{draw.time}</span>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-2">
                Não há sorteios agendados
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function ActionButton({ icon, label, onClick }: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      className="flex-1 flex items-center justify-center p-3 hover:bg-gray-100"
      onClick={onClick}
    >
      {icon}
      <span className="ml-2">{label}</span>
    </Button>
  );
}

interface UserActionsCardProps {
  onDeposit: () => void;
  onWithdraw: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onBet: () => void;
}

export function UserActionsCard({
  onDeposit,
  onWithdraw,
  onHistory,
  onSettings,
  onBet,
}: UserActionsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Ações</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Button
            variant="default"
            className="w-full flex items-center justify-center p-3 bg-primary hover:bg-primary-dark"
            onClick={onBet}
          >
            <span className="text-lg mr-2">🎮</span>
            <span>Fazer Aposta</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            icon={<span className="text-lg">💰</span>}
            label="Depositar"
            onClick={onDeposit}
          />
          <ActionButton
            icon={<span className="text-lg">💸</span>}
            label="Sacar"
            onClick={onWithdraw}
          />
          <ActionButton
            icon={<span className="text-lg">📜</span>}
            label="Histórico"
            onClick={onHistory}
          />
          <ActionButton
            icon={<span className="text-lg">⚙️</span>}
            label="Configurações"
            onClick={onSettings}
          />
        </div>
      </CardContent>
    </Card>
  );
}
