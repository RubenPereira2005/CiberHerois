document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('includedContent');
    const loader = document.getElementById('global-loader');

    // Função mágica que esconde a cortina suavemente
    const hideLoader = () => {
        if (loader) {
            loader.classList.add('loader-hidden');
            // Remove o loader do HTML após meio segundo para deixar o site mais leve
            setTimeout(() => loader.remove(), 500); 
        }
    };

    if (container) {
        fetch('header-authenticated.html')
            .then(response => {
                if (!response.ok) throw new Error('Falha na rede ao carregar o header');
                return response.text();
            })
            .then(html => {
                // 1. Injeta o HTML
                container.innerHTML = html;
                
                // 2. Ativa os ícones
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
                
                // 3. Liga o Botão de Tema
                const themeToggleBtn = document.getElementById('theme-toggle');
                if (themeToggleBtn && typeof window.setTheme === 'function') {
                    themeToggleBtn.addEventListener('click', () => {
                        const currentTheme = localStorage.getItem('theme') || 'light';
                        window.setTheme(currentTheme === 'dark' ? 'light' : 'dark');
                    });
                }

                // 4. Dinâmica de "Menu Ativo"
                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                const navLinks = document.querySelectorAll('.auth-navbar-link');
                navLinks.forEach(link => {
                    link.classList.remove('auth-navbar-link-active');
                    if (link.getAttribute('href') === currentPage) {
                        link.classList.add('auth-navbar-link-active');
                    }
                });

                // 5. TUDO PRONTO! Tira a cortina!
                // Um atraso de 50ms só para garantir que o browser já desenhou o header no ecrã
                setTimeout(hideLoader, 50);
            })
            .catch(error => {
                console.error('Erro ao carregar o header:', error);
                hideLoader(); // Tira a cortina mesmo que dê erro, para o user não ficar preso!
            });
    } else {
        // Se a página não tiver header (ex: se puseres o loader no login), tira a cortina direto
        hideLoader();
    }
});