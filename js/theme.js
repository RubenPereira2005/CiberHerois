// =========================================================================
// 1. ANTI-FLASH (Corre imediatamente mal o browser lê este ficheiro no <head>)
// =========================================================================
(function() {
    const theme = localStorage.getItem('theme') || 'system';
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark-mode');
    }
})();


// =========================================================================
// 2. LÓGICA DO TEMA (Espera que o HTML esteja pronto para encontrar os botões)
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    
    // Passar a classe do <html> (que o Anti-Flash colocou) para o <body>
    if (document.documentElement.classList.contains('dark-mode')) {
        body.classList.add('dark-mode');
    }

    // Função para atualizar o ícone na Navbar
    function updateNavbarIcon(isDark) {
        const currentThemeToggle = document.getElementById('theme-toggle');
        if (!currentThemeToggle) return;
        
        const iconName = isDark ? 'moon' : 'sun';
        currentThemeToggle.innerHTML = `<i data-lucide="${iconName}" class="auth-navbar-icon"></i>`;
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons(); 
        }
    }

    // Função Global para aplicar o tema
    window.setTheme = function(choice) {
        localStorage.setItem('theme', choice);
        
        let shouldBeDark = false;
        if (choice === 'dark') {
            shouldBeDark = true;
        } else if (choice === 'system') {
            shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        if (shouldBeDark) {
            document.documentElement.classList.add('dark-mode');
            body.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
            body.classList.remove('dark-mode');
        }

        updateNavbarIcon(shouldBeDark);
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: choice } }));
    };

    // Delegação do clique
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#theme-toggle');
        if (toggleBtn) {
            const isCurrentlyDark = body.classList.contains('dark-mode');
            window.setTheme(isCurrentlyDark ? 'light' : 'dark');
        }
    });

    // Inicialização ao carregar a página (Apenas para garantir que os ícones ficam corretos)
    const savedTheme = localStorage.getItem('theme') || 'system';
    let isDark = savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    updateNavbarIcon(isDark);

    // Escutar mudança de tema do sistema em tempo real
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (localStorage.getItem('theme') === 'system') {
            window.setTheme('system');
        }
    });
});