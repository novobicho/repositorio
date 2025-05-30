import React, { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { CustomToastProvider } from "@/components/custom-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import UserDashboard from "@/pages/user-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import AuthPage from "@/pages/auth-page";
import LandingPage from "@/pages/landing-page";
import UserDetailsPage from "@/pages/user-details-page";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { MaintenanceModal } from "@/components/maintenance-modal";
import { DirectDepositDialog } from "@/components/direct-deposit-dialog";
import { MobileBottomMenu } from "@/components/mobile-bottom-menu";

function Router() {
  const { user } = useAuth();
  const [siteName, setSiteName] = useState("Jogo do Bicho");
  
  // Buscar configurações do sistema
  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });
  
  // Atualizar o nome do site
  useEffect(() => {
    if (settings?.siteName) {
      setSiteName(settings.siteName);
    }
  }, [settings]);

  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <ProtectedRoute path="/user-dashboard" component={UserDashboard} />
      <ProtectedRoute path="/admin-dashboard" component={AdminDashboard} adminOnly={true} />
      <ProtectedRoute path="/admin/user/:id" component={UserDetailsPage} adminOnly={true} />
      <Route path="/auth">
        {/* Modal de manutenção só aparece na página de login para usuários não-admin */}
        <AuthPage siteName={siteName} maintenanceMode={settings?.maintenanceMode || false} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Script para remover qualquer botão fixo de depósito
  useEffect(() => {
    // Função que remove o botão de depósito no footer
    const removeDepositButton = () => {
      // A imagem mostra que o botão está na parte inferior do site
      // Buscamos por qualquer botão que tenha a palavra "Depositar"
      const elementsToRemove: HTMLElement[] = [];

      // Buscar por elementos com texto "Depositar" ou que tenham classes/IDs relacionados
      console.log('🔍 Iniciando verificação de elementos para remoção...');
      document.querySelectorAll('*').forEach(el => {
        // PROTEÇÃO TOTAL: Não remover nosso menu mobile de forma alguma
        if (el.classList.contains('mobile-bottom-menu') || 
            el.classList.contains('mobile-menu-container') ||
            (el as HTMLElement).closest('.mobile-bottom-menu') ||
            (el as HTMLElement).closest('.mobile-menu-container') ||
            el.getAttribute('class')?.includes('mobile-bottom-menu') ||
            el.getAttribute('class')?.includes('mobile-menu-container') ||
            el.id === 'force-mobile-menu' ||
            el.id === 'html-test-menu' ||
            (el as HTMLElement).closest('#force-mobile-menu') ||
            (el as HTMLElement).closest('#html-test-menu')) {
          console.log('🛡️ PROTEGENDO MENU:', el.id, el.className);
          return; // Proteger nosso menu mobile completamente
        }
        
        // PROTEÇÃO ADICIONAL: Não remover elementos que fazem parte do menu mobile
        const elementText = el.textContent?.trim().toLowerCase() || '';
        if (elementText.includes('menu') || elementText.includes('resultados') || 
            elementText.includes('fazer aposta') || elementText.includes('cotação') || 
            elementText.includes('carteira')) {
          const parentElement = (el as HTMLElement).closest('.mobile-bottom-menu');
          if (parentElement) {
            return; // Este elemento faz parte do nosso menu mobile
          }
        }
        
        // Verificar o texto do elemento
        const text = el.textContent?.trim().toLowerCase() || '';
        
        // Verificar estilos do elemento
        let computedStyle = null;
        try {
          computedStyle = window.getComputedStyle(el);
        } catch (e) {
          return; // Ignorar elementos que não podem ter estilo computado
        }
        
        // 1. Remover qualquer botão com texto "Depositar" ou "Sacar" no final da página
        // MAS NUNCA remover nosso menu mobile
        if ((text === 'depositar' || text === 'sacar' || text === 'saque') && 
            !text.includes('menu') && !text.includes('fazer aposta') && 
            !text.includes('resultados') && !text.includes('cotação') && 
            !text.includes('carteira')) {
          const position = computedStyle.getPropertyValue('position');
          const bottom = computedStyle.getPropertyValue('bottom');
          
          if (position === 'fixed' || position === 'absolute') {
            elementsToRemove.push(el as HTMLElement);
            return;
          }
          
          // Verificar se o elemento está na parte inferior da página
          const rect = el.getBoundingClientRect();
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          
          if (rect.bottom > viewportHeight - 100) {
            elementsToRemove.push(el as HTMLElement);
            return;
          }

          // 1.1 Adicionalmente, remove botões "Depositar" em diálogos
          // Verifica se o elemento está dentro de um diálogo ou um footer de diálogo
          let parent = el.parentElement;
          while (parent) {
            if (parent.classList && 
               (parent.classList.contains('dialog-footer') || 
                parent.classList.contains('dialog-content') ||
                parent.tagName === 'FOOTER' ||
                parent.getAttribute('role') === 'dialog')) {
              // Botão dentro de diálogo - remover se tiver classe w-full ou similar
              if (el.classList && 
                 (el.classList.contains('w-full') || 
                  el.getAttribute('class')?.includes('w-full'))) {
                elementsToRemove.push(el as HTMLElement);
                return;
              }
            }
            parent = parent.parentElement;
          }
        }
        
        // 2. Remover elementos fixos no canto inferior
        if ((computedStyle.getPropertyValue('position') === 'fixed' || 
             computedStyle.getPropertyValue('position') === 'absolute') && 
            computedStyle.getPropertyValue('bottom') === '0px') {
          
          // Remover botões na parte inferior da tela
          const rect = el.getBoundingClientRect();
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
          
          if (rect.bottom >= viewportHeight - 80) {
            // Botão na parte inferior
            elementsToRemove.push(el as HTMLElement);
          }
        }
        
        // 3. Remover especificamente botões Depositar dentro de diálogos
        if (el.tagName === 'BUTTON' || el.tagName === 'A') {
          if (text === 'depositar') {
            // Se for um botão dentro de um diálogo modal
            const isInDialog = Boolean(el.closest('[role="dialog"]')) || 
                           Boolean(el.closest('.dialog-content')) || 
                           Boolean(el.closest('.dialog-footer')) ||
                           Boolean(el.closest('footer'));
            
            if (isInDialog) {
              // Verifica se é o botão com class="w-full" no footer
              if (el.classList && (el.classList.contains('w-full') || 
                  el.getAttribute('class')?.includes('w-full'))) {
                elementsToRemove.push(el as HTMLElement);
              }
            }
          }
        }
      });
      
      // Remover todos os elementos identificados
      elementsToRemove.forEach(el => {
        try {
          // Esconder completamente o elemento
          (el as HTMLElement).style.display = 'none';
          (el as HTMLElement).style.visibility = 'hidden';
          (el as HTMLElement).style.opacity = '0';
          (el as HTMLElement).style.pointerEvents = 'none';
          (el as HTMLElement).style.height = '0';
          (el as HTMLElement).style.width = '0';
          (el as HTMLElement).style.overflow = 'hidden';
          (el as HTMLElement).style.position = 'absolute';
          (el as HTMLElement).style.zIndex = '-9999';
          
          console.log('Removido elemento de depósito:', el);
        } catch (e) {
          console.error('Erro ao remover elemento:', e);
        }
      });
    };
    
    // Executar imediatamente
    removeDepositButton();
    
    // Configurar vários intervalos para garantir que o botão seja removido mesmo se for adicionado posteriormente
    const intervals = [
      setInterval(removeDepositButton, 500),  // A cada 500ms
      setInterval(removeDepositButton, 1000), // A cada 1 segundo
      setInterval(removeDepositButton, 2000), // A cada 2 segundos
      setInterval(removeDepositButton, 5000)  // A cada 5 segundos
    ];
    
    // Observar mudanças no DOM para detectar a inserção do botão dinamicamente
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(() => {
        removeDepositButton();
      });
    });

    // Configurar o observador
    observer.observe(document.body, {
      childList: true,   // observa adição/remoção de filhos
      subtree: true      // observa toda a árvore
    });
    
    // Adicionar detector de eventos para o fim da rolagem
    window.addEventListener('scroll', () => {
      setTimeout(removeDepositButton, 100);
    }, { passive: true });
    
    // Limpar quando o componente for desmontado
    return () => {
      intervals.forEach(interval => clearInterval(interval));
      observer.disconnect();
      window.removeEventListener('scroll', () => {});
    };
  }, []);
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CustomToastProvider>
          <AuthProvider>
            <ThemeProvider>
              <SiteHeader />
              <Toaster />
              <Router />
              <MobileBottomMenu />
              <DirectDepositDialog />
            
              {/* Estilo global para ocultar qualquer botão fixo - EXCETO nosso menu mobile */}
              <style>{`
                div[style*="position:fixed"][style*="bottom"][style*="left"]:not([class*="mobile-bottom-menu"]),
                button[style*="position:fixed"][style*="bottom"][style*="left"]:not([class*="mobile-bottom-menu"]),
                .floating-deposit-button,
                .fixed-deposit-button,
                .floating-withdraw-button,
                .fixed-withdraw-button,
                .floating-sacar-button,
                .fixed-sacar-button,
                .floating-saque-button,
                .fixed-saque-button,
                [class*="deposit"][class*="button"],
                [class*="sacar"][class*="button"],
                [class*="saque"][class*="button"],
                [class*="withdraw"][class*="button"] {
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
                
                /* Garantir que nosso menu mobile sempre apareça */
                .mobile-bottom-menu {
                  display: block !important;
                  visibility: visible !important;
                  opacity: 1 !important;
                  pointer-events: auto !important;
                }
              `}</style>
            </ThemeProvider>
          </AuthProvider>
        </CustomToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
