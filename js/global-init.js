/**
 * global-init.js
 * Gere o loader global, a injecao do header e a inicializacao partilhada da UI
 * em todas as paginas autenticadas, sem necessitar de ligacao manual em cada pagina.
 */

// Esconde e remove o overlay de carregamento de pagina inteira
window.esconderLoader = function () {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.style.transition = 'opacity 0.4s ease';
        loader.style.opacity = '0';
        setTimeout(() => {
            if (loader.parentNode) loader.remove();
        }, 400);
    }
};

// =========================================================
// SISTEMA GLOBAL DE TOAST STACKABLE
// =========================================================
window.showGlobalToast = function(mensagem, tipo = 'warning') {
    let wrapper = document.getElementById('toast-wrapper');
    
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'toast-wrapper';
        document.body.appendChild(wrapper);
    }

    const toast = document.createElement('div');
    toast.className = `toast-container ${tipo}`;
    
    let iconName = 'alert-circle';
    if (tipo === 'success') iconName = 'check-circle';
    else if (tipo === 'error') iconName = 'alert-triangle';

    const mensagemLimpa = mensagem.toString().replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim();

    toast.innerHTML = `
        <div class="toast-content">
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <span class="toast-message">${mensagemLimpa}</span>
            <button class="toast-close" title="Fechar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="toast-progress"></div>
    `;

    wrapper.appendChild(toast);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: toast });
    }

    setTimeout(() => {
        toast.classList.add('active');
    }, 10);

    const fecharToast = () => {
        toast.classList.remove('active');
        toast.classList.add('closing');
        setTimeout(() => toast.remove(), 400);
    };

    toast.querySelector('.toast-close').addEventListener('click', fecharToast);
    setTimeout(fecharToast, 4000);
};

// Override das funcoes nativas para usarem o nosso toast global
window.showToast = window.showGlobalToast;

window.alert = function(mensagem) {
    let tipo = 'warning';
    const msgLower = mensagem.toString().toLowerCase();
    
    if (msgLower.includes('sucesso') || msgLower.includes('atualizado') || msgLower.includes('equipado') || msgLower.includes('concluída')) {
        tipo = 'success';
    } else if (msgLower.includes('erro') || msgLower.includes('insuficiente') || msgLower.includes('falha')) {
        tipo = 'error';
    }
    
    window.showGlobalToast(mensagem, tipo);
};

// Chama a API de logout e redireciona para a pagina inicial
window.fazerLogout = async function () {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = 'index';
    } catch (e) {
        console.error('Erro ao terminar sessao:', e);
        window.location.href = 'index';
    }
};

// Vai buscar as estatisticas do utilizador atual e atualiza os badges da navbar
window.atualizarHeaderGlobal = async function () {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            const navPoints = document.getElementById('nav-global-points');
            const navLevel = document.getElementById('nav-global-level');
            const navCoins = document.getElementById('nav-coin-balance');

            if (navPoints) navPoints.textContent = `${stats.pontos || 0} pts`;
            if (navLevel) navLevel.textContent = `Nivel ${stats.nivel || 1}`;
            if (navCoins) navCoins.textContent = `${stats.coins || 0} CC`;

            // Sincroniza os badges do menu mobile
            const mobileCoins = document.getElementById('mobile-coin-balance');
            const mobileLevel = document.getElementById('mobile-level');
            if (mobileCoins) mobileCoins.textContent = `${stats.coins || 0} CC`;
            if (mobileLevel) mobileLevel.textContent = `Nivel ${stats.nivel || 1}`;

            return stats;
        }
    } catch (error) {
        console.error('Erro ao atualizar header:', error);
    }
    return null;
};

// Inicializa a pesquisa de utilizadores com debounce, navegacao por teclado e realce de texto
window.iniciarPesquisa = function () {
    const searchInput = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-results-dropdown');
    const searchBtn = document.querySelector('.search-trigger');
    const clearBtn = document.getElementById('search-clear-btn');

    if (!searchInput || !dropdown) return;

    let debounceTimer;
    let currentFocus = -1;

    // Realca o item na posicao currentFocus e faz scroll ate ele ficar visivel
    const setActiveItem = (items) => {
        if (!items || items.length === 0) return false;
        items.forEach(item => item.classList.remove('active-search-item'));
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (items.length - 1);
        items[currentFocus].classList.add('active-search-item');
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    };

    // Navega diretamente para o perfil se houver correspondencia exata, caso contrario vai para os resultados de pesquisa
    const executarPesquisaPrincipal = async (queryAForcar = null) => {
        const query = queryAForcar || searchInput.value.trim();
        if (query.length >= 2) {
            try {
                const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=5');
                const results = await response.json();
                if (Array.isArray(results) && results.length > 0) {
                    const matchExato = results.find(u => u.nome.trim().toLowerCase() === query.toLowerCase());
                    if (matchExato) {
                        window.location.href = 'profile?id=' + matchExato.id_utilizador;
                        return;
                    }
                }
            } catch (error) { console.error('Erro na pesquisa:', error); }
            window.location.href = 'search?q=' + encodeURIComponent(query);
        }
    };

    // Navegacao por teclado: setas movem pelos resultados, Enter executa a pesquisa ou clica no item selecionado
    searchInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-result-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus++;
            setActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus--;
            setActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1 && items.length > 0) {
                items[currentFocus].click();
            } else {
                executarPesquisaPrincipal();
            }
        }
    });

    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            executarPesquisaPrincipal();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.value = '';
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            clearBtn.classList.add('hidden');
            searchInput.focus();
        });
    }

    // Pesquisa com debounce: vai buscar resultados e renderiza o dropdown com realce de texto
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (query.length > 0 && clearBtn) clearBtn.classList.remove('hidden');
        else if (clearBtn) clearBtn.classList.add('hidden');

        if (query.length < 2) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            currentFocus = -1;
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                dropdown.innerHTML = '<div class="search-message">A procurar...</div>';
                dropdown.classList.remove('hidden');

                const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=5');
                const results = await response.json();

                dropdown.innerHTML = '';
                currentFocus = -1;

                if (!Array.isArray(results) || results.length === 0) {
                    dropdown.innerHTML = '<div class="search-message">Nenhum ciber-heroi encontrado.</div>';
                    return;
                }

                results.forEach(user => {
                    let avatarSrc = '/img/default_avatar.png';
                    if (user.foto_perfil) {
                        if (user.foto_perfil.startsWith('http')) avatarSrc = user.foto_perfil;
                        else if (user.foto_perfil.startsWith('upload-')) avatarSrc = '/img/uploads/' + user.foto_perfil;
                        else avatarSrc = '/img/' + user.foto_perfil;
                    }

                    let roleNome = user.role === 'professor' ? 'Professor(a)' : (user.role === 'admin' ? 'Administrador' : 'Aluno(a)');

                    // Envolve os caracteres correspondentes num span para realce visual
                    const regexHighlight = new RegExp(`(${query})`, 'gi');
                    const nomeComHighlight = user.nome.replace(regexHighlight, "<span class='search-highlight'>$1</span>");

                    const item = document.createElement('a');
                    item.href = 'profile?id=' + user.id_utilizador;
                    item.className = 'search-result-item';
                    item.innerHTML = `
                        <img src="${avatarSrc}" alt="${user.nome}" class="search-result-avatar">
                        <div class="search-result-info">
                            <span class="search-result-name">${nomeComHighlight}</span>
                            <span class="search-result-role">${roleNome}</span>
                        </div>
                    `;
                    dropdown.appendChild(item);
                });

                const moreLink = document.createElement('a');
                moreLink.href = 'search?q=' + encodeURIComponent(query);
                moreLink.className = 'search-result-item search-dropdown-footer';
                moreLink.innerHTML = 'Ver todos os resultados <i data-lucide="arrow-right" style="width: 14px; height: 14px; margin-left: 4px; vertical-align: middle;"></i>';
                dropdown.appendChild(moreLink);

                lucide.createIcons();

            } catch (error) {
                console.error('Erro na pesquisa:', error);
                dropdown.innerHTML = '<div class="search-message error-msg">Erro de ligacao.</div>';
            }
        }, 100);
    });

    // Fecha o dropdown ao clicar fora da barra de pesquisa
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.auth-navbar-search-container')) {
            dropdown.classList.add('hidden');
        }
    });
};

// Inicializa o menu hamburger para navegacao mobile
window.iniciarHamburger = function () {
    const hamburgerBtn = document.getElementById('hamburger-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    if (!hamburgerBtn || !mobileMenu) return;

    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = mobileMenu.classList.toggle('open');
        hamburgerBtn.classList.toggle('active', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Fecha o menu ao clicar fora da navbar
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.auth-navbar') && mobileMenu.classList.contains('open')) {
            mobileMenu.classList.remove('open');
            hamburgerBtn.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Fecha o menu ao clicar num link de navegacao no mobile
    mobileMenu.querySelectorAll('.mobile-menu-link').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
            hamburgerBtn.classList.remove('active');
            hamburgerBtn.setAttribute('aria-expanded', 'false');
        });
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('includedContent');
    const isProfilePage = window.location.pathname.includes('profile.html');

    // Paginas COM header: injeta o HTML do header partilhado e inicializa tudo
    if (container) {
        fetch('header-authenticated.html')
            .then(res => res.text())
            .then(async (html) => {
                container.innerHTML = html;

                if (typeof lucide !== 'undefined') lucide.createIcons();
                if (typeof window.setTheme === 'function') {
                    window.setTheme(localStorage.getItem('theme') || 'system');
                }

                // Marca o link da pagina atual como ativo na navbar
                const current = window.location.pathname.split('/').pop() || 'index';
                document.querySelectorAll('.auth-navbar-link').forEach(link => {
                    if (link.getAttribute('href') === current) link.classList.add('auth-navbar-link-active');
                });

                await window.atualizarHeaderGlobal();
                window.iniciarPesquisa();
                window.iniciarHamburger();

                // Da tempo extra a pagina de perfil para preencher os dados assincronos antes de esconder o loader
                if (isProfilePage) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    } catch (e) { console.error('Erro na espera do perfil:', e); }
                }

                window.esconderLoader();
            })
            .catch(err => {
                console.error('Erro ao carregar header:', err);
                window.esconderLoader();
            });
    } else {
        // Paginas SEM header: apenas inicializa os icones e esconde o loader
        setTimeout(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.esconderLoader();
        }, 300);
    }
});