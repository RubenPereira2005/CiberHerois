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

// 1.5. Função global para fazer Logout seguro
window.fazerLogout = async function() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        // Limpa tokens locais se houver (por precaução) e redireciona
        window.location.href = 'index.html';
    } catch (e) {
        console.error("Erro ao terminar sessão", e);
        window.location.href = 'index.html'; // Redireciona na mesma por segurança
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

// 3. Função para inicializar a pesquisa de utilizadores
window.iniciarPesquisa = function() {
    const searchInput = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-results-dropdown');
    const searchBtn = document.querySelector('.search-trigger');
    const clearBtn = document.getElementById('search-clear-btn'); // O nosso novo botão
    
    if (!searchInput || !dropdown) return;

    let debounceTimer;
    let currentFocus = -1; // Usado para saber em que linha as setas do teclado estão

    // --- FUNÇÃO PARA NAVEGAÇÃO POR TECLADO ---
    const setActiveItem = (items) => {
        if (!items || items.length === 0) return false;
        
        // Remove a classe "active" de todos
        items.forEach(item => item.classList.remove('active-search-item'));
        
        // Faz a matemática para "dar a volta" se passarmos do limite
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (items.length - 1);
        
        // Adiciona a classe "active" ao item selecionado e faz scroll para ele
        items[currentFocus].classList.add('active-search-item');
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    };

    // --- FUNÇÃO CENTRAL QUE TRATA DA PESQUISA ---
    const executarPesquisaPrincipal = async (queryAForcar = null) => {
        const query = queryAForcar || searchInput.value.trim();
        
        if (query.length >= 2) {
            try {
                const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=5');
                const results = await response.json();

                if (Array.isArray(results) && results.length > 0) {
                    const matchExato = results.find(u => u.nome.trim().toLowerCase() === query.toLowerCase());
                    if (matchExato) {
                        window.location.href = 'profile.html?id=' + matchExato.id_utilizador;
                        return; 
                    }
                }
            } catch (error) { console.error("Erro:", error); }

            window.location.href = 'search.html?q=' + encodeURIComponent(query);
        }
    };

    // 1. Deteta as Teclas: ENTER, SETA CIMA, SETA BAIXO
    searchInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.search-result-item');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault(); // Impede o cursor do texto de ir para o fim
            currentFocus++;
            setActiveItem(items);
        } 
        else if (e.key === 'ArrowUp') {
            e.preventDefault(); // Impede o cursor do texto de ir para o início
            currentFocus--;
            setActiveItem(items);
        } 
        else if (e.key === 'Enter') {
            e.preventDefault();
            // Se tivermos selecionado alguém com as setas, clica nesse item!
            if (currentFocus > -1 && items.length > 0) {
                items[currentFocus].click();
            } else {
                // Senão, faz a pesquisa normal / Sinto-me com sorte
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

    // LÓGICA DO BOTÃO "X" PARA LIMPAR
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.value = '';
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            clearBtn.classList.add('hidden');
            searchInput.focus(); // Devolve o cursor para a pessoa voltar a escrever
        });
    }

    // 3. Lógica do Dropdown e HIGHLIGHT
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        // Mostra ou Esconde o "X"
        if (query.length > 0 && clearBtn) clearBtn.classList.remove('hidden');
        else if (clearBtn) clearBtn.classList.add('hidden');

        if (query.length < 2) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = ''; 
            currentFocus = -1; // Reset da navegação
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                dropdown.innerHTML = '<div class="search-message">A procurar...</div>';
                dropdown.classList.remove('hidden');

                const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=5');
                const results = await response.json();

                dropdown.innerHTML = ''; 
                currentFocus = -1; // Reset porque chegaram novos resultados

                if (!Array.isArray(results) || results.length === 0) {
                    dropdown.innerHTML = '<div class="search-message">Nenhum ciber-herói encontrado.</div>';
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
                    
                    // MAGIA DO HIGHLIGHT: Embrulha a letra pesquisada num <span>
                    const regexHighlight = new RegExp(`(${query})`, "gi");
                    const nomeComHighlight = user.nome.replace(regexHighlight, "<span class='search-highlight'>$1</span>");

                    const item = document.createElement('a');
                    item.href = 'profile.html?id=' + user.id_utilizador;
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

                // Botão de "Ver todos"
                const moreLink = document.createElement('a');
                moreLink.href = 'search.html?q=' + encodeURIComponent(query);
                moreLink.className = 'search-result-item search-dropdown-footer'; 
                moreLink.innerHTML = 'Ver todos os resultados <i data-lucide="arrow-right" style="width: 14px; height: 14px; margin-left: 4px; vertical-align: middle;"></i>';
                dropdown.appendChild(moreLink);
                
                lucide.createIcons();

            } catch (error) {
                console.error('Erro:', error);
                dropdown.innerHTML = '<div class="search-message error-msg">Erro de ligação.</div>';
            }
        }, 100); 
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.auth-navbar-search-container')) {
            dropdown.classList.add('hidden');
        }
    });
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
                
                // 1.5. Inicia o campo de pesquisa dinâmico
                window.iniciarPesquisa();

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