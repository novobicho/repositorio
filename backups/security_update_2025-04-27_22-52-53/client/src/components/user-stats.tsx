import { 
  Wallet, 
  BarChart3, 
  Award,
  DollarSign,
  Coins,
  Trophy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

interface UserStatsCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
}

function UserStatsCard({ icon, title, value }: UserStatsCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center">
          <div className="bg-primary bg-opacity-20 p-3 rounded-full mr-4">
            {icon}
          </div>
          <div>
            <div className="text-gray-500 text-sm">{title}</div>
            <div className="text-xl font-bold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface UserStatsProps {
  totalBets?: number;
  totalBetAmount?: number;
  totalWinnings?: number;
  isLoading?: boolean;
}

export function UserStats({ 
  totalBets = 0, 
  totalBetAmount = 0, 
  totalWinnings = 0,
  isLoading = false
}: UserStatsProps) {
  const { user } = useAuth();
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Skeleton className="h-[100px] w-full" />
        <Skeleton className="h-[100px] w-full" />
        <Skeleton className="h-[100px] w-full" />
      </div>
    );
  }
  
  // Retorno dos cards com ícones atualizados
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <UserStatsCard
        icon={<Coins className="h-6 w-6 text-primary" />}
        title="Saldo disponível"
        value={`R$ ${user?.balance?.toFixed(2) || '0.00'}`}
      />
      <UserStatsCard
        icon={<BarChart3 className="h-6 w-6 text-primary" />}
        title="Apostas realizadas"
        value={totalBets.toString()}
      />
      <UserStatsCard
        icon={<Trophy className="h-6 w-6 text-primary" />}
        title="Total ganho"
        value={`R$ ${totalWinnings.toFixed(2)}`}
      />
    </div>
  );
}
