document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // Função para atualizar o ícone na Navbar
    function updateNavbarIcon(isDark) {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector('i, svg');
        if (icon) {
            icon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
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
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }

        updateNavbarIcon(shouldBeDark);
        
        // Disparar evento para as Definições saberem que mudou
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: choice } }));
    };

    // Clique no botão da Navbar (Alterna apenas entre Light/Dark fixo)
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isCurrentlyDark = body.classList.contains('dark-mode');
            window.setTheme(isCurrentlyDark ? 'light' : 'dark');
        });
    }

    // Inicialização ao carregar a página
    const savedTheme = localStorage.getItem('theme') || 'system';
    window.setTheme(savedTheme);

    // Escutar mudança de tema do sistema (Windows/Mac) em tempo real
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (localStorage.getItem('theme') === 'system') {
            window.setTheme('system');
        }
    });
});