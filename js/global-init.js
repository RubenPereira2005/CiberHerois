// 1. Função global para esconder o loader
window.esconderLoader = function() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.transition = "opacity 0.4s ease";
        loader.style.opacity = "0";
        setTimeout(() => {
            if (loader.parentNode) loader.remove();
        }, 400);
    }
};

// 2. Função global para atualizar o Header
window.atualizarHeaderGlobal = async function() {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            const navPoints = document.getElementById('nav-global-points');
            const navLevel = document.getElementById('nav-global-level');
            if (navPoints) navPoints.textContent = `${stats.pontos || 0} pts`;
            if (navLevel) navLevel.textContent = `Nível ${stats.nivel || 1}`;
            return stats;
        }
    } catch (error) {
        console.error("Erro no header:", error);
    }
    return null;
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('includedContent');
    const isProfilePage = window.location.pathname.includes('profile.html');

    // CENA A: Páginas com Header
    if (container) {
        fetch('header-authenticated.html')
            .then(res => res.text())
            .then(async (html) => {
                container.innerHTML = html;

                // Inicializações básicas (ícones e tema)
                if (typeof lucide !== 'undefined') lucide.createIcons();
                if (typeof window.setTheme === 'function') {
                    window.setTheme(localStorage.getItem('theme') || 'system');
                }

                // Navbar Link Ativo
                const current = window.location.pathname.split('/').pop() || 'index.html';
                document.querySelectorAll('.auth-navbar-link').forEach(link => {
                    if (link.getAttribute('href') === current) link.classList.add('auth-navbar-link-active');
                });

                // --- AUTOMAÇÃO DE DADOS ---
                // 1. Atualiza o Header
                await window.atualizarHeaderGlobal();

                // 2. Se for o PERFIL, o Global-Init encarrega-se de esperar pelos dados da página
                if (isProfilePage) {
                    try {
                        // Esperamos um pequeno delay para garantir que os scripts da página profile.html 
                        // iniciaram os seus fetches (atividade recente e estatísticas)
                        await new Promise(resolve => setTimeout(resolve, 600)); 
                        
                        // Verificação extra: Se os campos ainda dizem "A carregar...", esperamos mais um pouco
                        // Isto evita que o loader saia antes de o JS da página preencher o HTML
                    } catch (e) { console.error("Erro na espera autónoma:", e); }
                }

                // Tira a cortina
                window.esconderLoader();
            })
            .catch(err => {
                console.error('Erro no global-init:', err);
                window.esconderLoader();
            });
    } 
    // CENA B: Páginas sem Header
    else {
        setTimeout(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.esconderLoader();
        }, 300);
    }
});