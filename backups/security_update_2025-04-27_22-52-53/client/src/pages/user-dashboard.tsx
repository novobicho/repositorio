import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/navbar";
import { UserStats } from "@/components/user-stats";
import { UpcomingDrawsCard, UserActionsCard } from "@/components/stats-card";
import { RecentBets } from "@/components/recent-bets";
import { TransactionHistory } from "@/components/transaction-history";
import { BetWithDetails } from "@/types";
import { DepositDialog } from "@/components/deposit-dialog";
import { WithdrawDialog } from "@/components/withdraw-dialog";
import { UserSettingsDialog } from "@/components/user-settings-dialog";
import { QuickBetDialog } from "@/components/quick-bet-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

export default function UserDashboard() {
  const { user } = useAuth();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickBetOpen, setQuickBetOpen] = useState(false);

  const { data: bets, isLoading: betsLoading } = useQuery<BetWithDetails[]>({
    queryKey: ["/api/bets"],
  });

  // Calculate total stats for user dashboard
  const totalBets = bets?.length || 0;
  const totalBetAmount = bets?.reduce((sum, bet) => sum + bet.amount, 0) || 0;
  const totalWinnings = bets?.reduce((sum, bet) => sum + (bet.winAmount || 0), 0) || 0;

  const handleDeposit = () => {
    setDepositOpen(true);
  };

  const handleWithdraw = () => {
    setWithdrawOpen(true);
  };

  const handleHistory = () => {
    // Already on the history view
    window.scrollTo({
      top: document.getElementById('recent-bets')?.offsetTop || 0,
      behavior: 'smooth'
    });
  };

  const handleSettings = () => {
    setSettingsOpen(true);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-800">Painel do Usuário</h2>
              <button 
                onClick={() => setQuickBetOpen(true)} 
                className="bg-primary hover:bg-primary-dark text-white font-medium px-4 py-2 rounded-md text-sm flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Fazer Aposta
              </button>
            </div>
            <div className="text-sm bg-primary-light text-primary-dark rounded-full px-4 py-2">
              Saldo: <span className="font-semibold">R$ {user.balance.toFixed(2)}</span>
            </div>
          </div>

          <UserStats 
            totalBets={totalBets}
            totalBetAmount={totalBetAmount}
            totalWinnings={totalWinnings}
            isLoading={betsLoading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Resumo</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Apostas hoje:</span>
                  <span className="font-medium">{totalBets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Apostado hoje:</span>
                  <span className="font-medium">R$ {totalBetAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ganhos:</span>
                  <span className="font-medium text-green-600">R$ {totalWinnings.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <UserActionsCard 
              onDeposit={handleDeposit} 
              onWithdraw={handleWithdraw}
              onHistory={handleHistory}
              onSettings={handleSettings}
              onBet={() => setQuickBetOpen(true)}
            />

            <UpcomingDrawsCard />
          </div>

          <div id="history" className="mt-6">
            <Tabs defaultValue="bets" className="w-full">
              <TabsList className="w-full grid grid-cols-2 mb-4">
                <TabsTrigger value="bets">Apostas Recentes</TabsTrigger>
                <TabsTrigger value="transactions">Transações</TabsTrigger>
              </TabsList>
              <TabsContent value="bets" id="recent-bets">
                <RecentBets />
              </TabsContent>
              <TabsContent value="transactions">
                <TransactionHistory />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <WithdrawDialog open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <UserSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <QuickBetDialog open={quickBetOpen} onOpenChange={setQuickBetOpen} />
    </div>
  );
}
