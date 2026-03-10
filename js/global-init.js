document.addEventListener('DOMContentLoaded', () => {
    // Procura os elementos na página
    const container = document.getElementById('includedContent');
    const loader = document.getElementById('global-loader');

    // Função para tirar a cortina
    const hideLoader = () => {
        if (loader) {
            loader.classList.add('loader-hidden');
            setTimeout(() => loader.remove(), 500); 
        }
    };

    // O nosso temporizador de 500ms (obrigatório para todas as páginas)
    const minimumDelayPromise = new Promise(resolve => setTimeout(resolve, 500));

    // CENA 1: A página TEM header (ex: Quizzes, Perfil)
    if (container) {
        const fetchPromise = fetch('header-authenticated.html')
            .then(response => {
                if (!response.ok) throw new Error('Falha ao carregar header');
                return response.text();
            });

        Promise.all([fetchPromise, minimumDelayPromise])
            .then(([html]) => {
                container.innerHTML = html;
                
                if (typeof lucide !== 'undefined') lucide.createIcons();
                
                if (typeof window.setTheme === 'function') {
                    const savedTheme = localStorage.getItem('theme') || 'system';
                    window.setTheme(savedTheme);
                }

                const currentPage = window.location.pathname.split('/').pop() || 'index.html';
                const navLinks = document.querySelectorAll('.auth-navbar-link');
                navLinks.forEach(link => {
                    link.classList.remove('auth-navbar-link-active');
                    if (link.getAttribute('href') === currentPage) {
                        link.classList.add('auth-navbar-link-active');
                    }
                });

                // Tira a cortina
                hideLoader();
            })
            .catch(error => {
                console.error('Erro ao carregar o header:', error);
                hideLoader();
            });
            
    } 
    // CENA 2: A página NÃO TEM header (ex: Login, Index)
    else {
        // Espera apenas os 500ms da animação e tira a cortina
        minimumDelayPromise.then(() => {
            hideLoader();
            
            // Força a atualização do tema e ícones (útil para a página de Login)
            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (typeof window.setTheme === 'function') {
                const savedTheme = localStorage.getItem('theme') || 'system';
                window.setTheme(savedTheme);
            }
        });
    }
});