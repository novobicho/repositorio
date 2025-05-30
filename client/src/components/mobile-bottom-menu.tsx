import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";

export function MobileBottomMenu() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = window.innerWidth <= 768; // Aumentei o limite
      setIsMobile(isMobileDevice);
      console.log('🟦 Verificação mobile:', { 
        windowWidth: window.innerWidth, 
        isMobile: isMobileDevice,
        shouldShow: true // sempre mostrar para teste
      });
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Log para debug
    console.log('MobileBottomMenu montado!', { 
      isMobile, 
      windowWidth: window.innerWidth,
      rendered: true 
    });
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    console.log('🟦 MobileBottomMenu renderizado no DOM');
    console.log('🟦 isMobile:', isMobile);
    console.log('🟦 windowWidth:', window.innerWidth);
    
    // Verificar se o elemento existe no DOM
    setTimeout(() => {
      const element = document.querySelector('.mobile-bottom-menu');
      console.log('🟦 Menu encontrado no DOM:', element);
      if (element) {
        console.log('🟦 Estilos do menu:', window.getComputedStyle(element));
      } else {
        console.log('🟦 ERRO: Menu não encontrado no DOM!');
      }
    }, 100);

    // FORÇA: Criar menu diretamente no body via JavaScript
    const createTestMenu = () => {
      // Verificação mais robusta para páginas admin
      const currentPath = window.location.pathname;
      const isAdminPage = currentPath.includes('/admin') || 
                         currentPath.includes('/dashboard') || 
                         currentPath.includes('admin-dashboard') ||
                         currentPath === '/admin-dashboard';
      
      if (isAdminPage) {
        console.log('🚫 Menu mobile bloqueado no painel admin:', currentPath);
        // Remover qualquer menu existente
        const existingMenus = document.querySelectorAll('#force-mobile-menu, .mobile-menu, [id*="mobile"]');
        existingMenus.forEach(menu => {
          menu.remove();
          console.log('🚫 Menu removido:', menu.id);
        });
        return;
      }
      
      // Remover menu anterior se existir
      const existingMenu = document.getElementById('force-mobile-menu');
      if (existingMenu) {
        existingMenu.remove();
      }

      // Criar novo menu
      const menuDiv = document.createElement('div');
      menuDiv.id = 'force-mobile-menu';
      menuDiv.style.cssText = `
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 80px !important;
        background-color: #ff0000 !important;
        z-index: 99999 !important;
        display: flex !important;
        justify-content: space-around !important;
        align-items: center !important;
        border-top: 3px solid #00ff00 !important;
        color: white !important;
        font-size: 12px !important;
        font-weight: bold !important;
      `;
      
      menuDiv.innerHTML = `
        <div id="btn-inicio">INICIO</div>
        <div id="btn-resultados">RESULTADOS</div>
        <div id="btn-apostar" style="background-color: #ff6600; padding: 4px;">APOSTAR</div>
        <div id="btn-cotacao">COTAÇÃO</div>
        <div id="btn-carteira">CARTEIRA</div>
      `;
      
      document.body.appendChild(menuDiv);
      console.log('🟦 Menu criado diretamente no body:', menuDiv);
      
      // Adicionar event listeners aos botões
      setTimeout(() => {
        const btnInicio = document.getElementById('btn-inicio');
        const btnResultados = document.getElementById('btn-resultados');
        const btnApostar = document.getElementById('btn-apostar');
        const btnCotacao = document.getElementById('btn-cotacao');
        const btnCarteira = document.getElementById('btn-carteira');
        
        if (btnInicio) {
          btnInicio.addEventListener('click', () => {
            console.log('📱 Botão INICIO clicado - sempre vai para página inicial');
            window.dispatchEvent(new CustomEvent('mobile-nav', { detail: 'home' }));
          });
        }
        
        if (btnResultados) {
          btnResultados.addEventListener('click', () => {
            console.log('📱 Botão RESULTADOS clicado');
            window.dispatchEvent(new CustomEvent('mobile-nav', { detail: 'results' }));
          });
        }
        
        if (btnApostar) {
          btnApostar.addEventListener('click', () => {
            console.log('📱 Botão APOSTAR clicado');
            window.dispatchEvent(new CustomEvent('mobile-nav', { detail: 'bet' }));
          });
        }
        
        if (btnCotacao) {
          btnCotacao.addEventListener('click', () => {
            console.log('📱 Botão COTAÇÃO clicado');
            window.dispatchEvent(new CustomEvent('mobile-nav', { detail: 'quotations' }));
          });
        }
        
        if (btnCarteira) {
          btnCarteira.addEventListener('click', () => {
            console.log('📱 Botão CARTEIRA clicado - sempre vai para painel de usuário');
            window.dispatchEvent(new CustomEvent('mobile-nav', { detail: 'wallet' }));
          });
        }
      }, 100);
    };
    
    setTimeout(createTestMenu, 200);

    // Observador para remover menu continuamente nas páginas admin
    const removeMenuFromAdmin = () => {
      const currentPath = window.location.pathname;
      const isAdminPage = currentPath.includes('/admin') || 
                         currentPath.includes('/dashboard') || 
                         currentPath.includes('admin-dashboard') ||
                         currentPath === '/admin-dashboard';
      
      if (isAdminPage) {
        const existingMenus = document.querySelectorAll('#force-mobile-menu, #html-test-menu, [class*="mobile"], [id*="mobile"]');
        existingMenus.forEach(menu => {
          if (menu && menu.parentNode) {
            menu.remove();
            console.log('🚫 Menu removido automaticamente do admin:', menu.id || menu.className);
          }
        });
      }
    };

    // Executar verificação a cada 500ms se estivermos no admin
    const adminMenuRemover = setInterval(removeMenuFromAdmin, 500);

    // Listener para mudanças de rota
    const handleRouteChange = () => {
      setTimeout(createTestMenu, 100);
    };

    window.addEventListener('popstate', handleRouteChange);
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      clearInterval(adminMenuRemover);
    };
  }, [location]); // Adicionar location como dependência

  const handleMakeBet = () => {
    const event = new CustomEvent('openBettingPanel');
    window.dispatchEvent(event);
  };

  const handleNavigation = (path: string) => {
    if (!user) {
      navigate('/auth');
    }
  };

  // Para teste: sempre renderizar (depois voltamos à detecção mobile)
  // if (!isMobile) {
  //   return null;
  // }

  return null; // Usar apenas o menu criado via JavaScript
}