import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const BonusSettingsNew = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const [signupBonus, setSignupBonus] = useState({
    enabled: false,
    amount: 10,
    rollover: 3,
    expiration: 7
  });
  
  const [firstDepositBonus, setFirstDepositBonus] = useState({
    enabled: false,
    amount: 100,
    percentage: 100,
    maxAmount: 200,
    rollover: 3,
    expiration: 7
  });

  const [promotionalBanners, setPromotionalBanners] = useState({
    enabled: false,
    signupBannerEnabled: false,
    firstDepositBannerEnabled: false
  });

  useEffect(() => {
    loadBonusSettings();
  }, []);

  const loadBonusSettings = async () => {
    try {
      const response = await fetch("/api/admin/bonus-settings");
      if (response.ok) {
        const settings = await response.json();
        
        setSignupBonus({
          enabled: settings.signupBonusEnabled || false,
          amount: settings.signupBonusAmount || 10,
          rollover: settings.signupBonusRollover || 3,
          expiration: settings.signupBonusExpiration || 7
        });
        
        setFirstDepositBonus({
          enabled: settings.firstDepositBonusEnabled || false,
          amount: settings.firstDepositBonusAmount || 100,
          percentage: settings.firstDepositBonusPercentage || 100,
          maxAmount: settings.firstDepositBonusMaxAmount || 200,
          rollover: settings.firstDepositBonusRollover || 3,
          expiration: settings.firstDepositBonusExpiration || 7
        });
        
        setPromotionalBanners({
          enabled: settings.promotionalBannersEnabled || false,
          signupBannerEnabled: settings.signupBonusBannerEnabled || false,
          firstDepositBannerEnabled: settings.firstDepositBonusBannerEnabled || false
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configurações de bônus:", error);
    }
  };

  const saveBonusSettings = async () => {
    setLoading(true);
    setSaveSuccess(false);
    
    try {
      const response = await fetch("/api/admin/bonus-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          signupBonusEnabled: signupBonus.enabled,
          signupBonusAmount: signupBonus.amount,
          signupBonusRollover: signupBonus.rollover,
          signupBonusExpiration: signupBonus.expiration,
          firstDepositBonusEnabled: firstDepositBonus.enabled,
          firstDepositBonusAmount: firstDepositBonus.amount,
          firstDepositBonusPercentage: firstDepositBonus.percentage,
          firstDepositBonusMaxAmount: firstDepositBonus.maxAmount,
          firstDepositBonusRollover: firstDepositBonus.rollover,
          firstDepositBonusExpiration: firstDepositBonus.expiration,
          promotionalBannersEnabled: promotionalBanners.enabled,
          signupBonusBannerEnabled: promotionalBanners.signupBannerEnabled,
          firstDepositBonusBannerEnabled: promotionalBanners.firstDepositBannerEnabled
        })
      });

      if (response.ok) {
        setSaveSuccess(true);
        toast({
          title: "Configurações salvas",
          description: "As configurações de bônus foram atualizadas com sucesso."
        });
      } else {
        throw new Error("Erro ao salvar configurações");
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao salvar as configurações de bônus.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bônus de Cadastro</CardTitle>
          <CardDescription>Configure o bônus oferecido aos novos usuários</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="signup-bonus-enabled"
              checked={signupBonus.enabled}
              onCheckedChange={(checked) => 
                setSignupBonus(prev => ({ ...prev, enabled: checked }))
              }
            />
            <Label htmlFor="signup-bonus-enabled">Ativar bônus de cadastro</Label>
          </div>
          
          {signupBonus.enabled && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="signup-amount">Valor (R$)</Label>
                <Input
                  id="signup-amount"
                  type="number"
                  value={signupBonus.amount}
                  onChange={(e) => 
                    setSignupBonus(prev => ({ ...prev, amount: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="signup-rollover">Rollover (x)</Label>
                <Input
                  id="signup-rollover"
                  type="number"
                  value={signupBonus.rollover}
                  onChange={(e) => 
                    setSignupBonus(prev => ({ ...prev, rollover: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="signup-expiration">Expiração (dias)</Label>
                <Input
                  id="signup-expiration"
                  type="number"
                  value={signupBonus.expiration}
                  onChange={(e) => 
                    setSignupBonus(prev => ({ ...prev, expiration: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bônus de Primeiro Depósito</CardTitle>
          <CardDescription>Configure o bônus oferecido no primeiro depósito</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="first-deposit-bonus-enabled"
              checked={firstDepositBonus.enabled}
              onCheckedChange={(checked) => 
                setFirstDepositBonus(prev => ({ ...prev, enabled: checked }))
              }
            />
            <Label htmlFor="first-deposit-bonus-enabled">Ativar bônus de primeiro depósito</Label>
          </div>
          
          {firstDepositBonus.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first-deposit-percentage">Percentual (%)</Label>
                <Input
                  id="first-deposit-percentage"
                  type="number"
                  value={firstDepositBonus.percentage}
                  onChange={(e) => 
                    setFirstDepositBonus(prev => ({ ...prev, percentage: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="first-deposit-max">Valor máximo (R$)</Label>
                <Input
                  id="first-deposit-max"
                  type="number"
                  value={firstDepositBonus.maxAmount}
                  onChange={(e) => 
                    setFirstDepositBonus(prev => ({ ...prev, maxAmount: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="first-deposit-rollover">Rollover (x)</Label>
                <Input
                  id="first-deposit-rollover"
                  type="number"
                  value={firstDepositBonus.rollover}
                  onChange={(e) => 
                    setFirstDepositBonus(prev => ({ ...prev, rollover: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="first-deposit-expiration">Expiração (dias)</Label>
                <Input
                  id="first-deposit-expiration"
                  type="number"
                  value={firstDepositBonus.expiration}
                  onChange={(e) => 
                    setFirstDepositBonus(prev => ({ ...prev, expiration: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Banners Promocionais</CardTitle>
          <CardDescription>Configure a exibição de banners promocionais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="promotional-banners-enabled"
              checked={promotionalBanners.enabled}
              onCheckedChange={(checked) => 
                setPromotionalBanners(prev => ({ ...prev, enabled: checked }))
              }
            />
            <Label htmlFor="promotional-banners-enabled">Ativar banners promocionais</Label>
          </div>
          
          {promotionalBanners.enabled && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  id="signup-banner-enabled"
                  checked={promotionalBanners.signupBannerEnabled}
                  onCheckedChange={(checked) => 
                    setPromotionalBanners(prev => ({ ...prev, signupBannerEnabled: checked }))
                  }
                />
                <Label htmlFor="signup-banner-enabled">Banner de bônus de cadastro</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="first-deposit-banner-enabled"
                  checked={promotionalBanners.firstDepositBannerEnabled}
                  onCheckedChange={(checked) => 
                    setPromotionalBanners(prev => ({ ...prev, firstDepositBannerEnabled: checked }))
                  }
                />
                <Label htmlFor="first-deposit-banner-enabled">Banner de bônus de primeiro depósito</Label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button 
          onClick={saveBonusSettings} 
          disabled={loading}
          className="flex-1"
        >
          {loading ? "Salvando..." : "Salvar Configurações"}
        </Button>
        
        {saveSuccess && (
          <div className="flex items-center text-green-600">
            Configurações salvas com sucesso!
          </div>
        )}
      </div>
    </div>
  );
};
