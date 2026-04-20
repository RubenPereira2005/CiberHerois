// cibertermo.js

const TENTATIVAS_MAX = 6;
let LETRAS_POR_PALAVRA = 5; // Agora é 'let' para ser mutável pelo servidor

let tentativaAtual = 0;
let letraAtual = 0;
let grelha = [];
let estadoJogo = 'JOGANDO'; // JOGANDO, VITORIA, DERROTA

// Usamos a data local (string curta) como chave para limpar o estado antigo
const hoje = new Date().toLocaleDateString();

// Chaves do localStorage
let LS_GRELHA = 'cibertermo_grelha';
let LS_CORES = 'cibertermo_cores';
let LS_TENTATIVA = 'cibertermo_tentativa';
let LS_ESTADO = 'cibertermo_estado';
let LS_DATA = 'cibertermo_data';
let LS_TAMANHO = 'cibertermo_tamanho';
let LS_SABIAS_QUE = 'cibertermo_sabias_que';
let LS_PALAVRAS_USADAS = 'cibertermo_palavras_usadas';
let LS_PALAVRA_REVELADA = 'cibertermo_palavra_revelada';
let LS_ULTIMO_USER_ID = 'cibertermo_ultimo_user_id'; // Mudanças de utilizador para localStorage

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    inicializarTeclado();

    // 1. Descobrir primeiro qual é a configuração do dia
    await fetchTamanhoPalavra();

    // 2. Iniciar o jogo com base nessa configuração e no estado guardado localmente
    verificarResetDiario();
    criarMatrizGrelha(); // Inicializa Array em branco apropriado
    carregarEstadoPreenchido();
    desenharGrelhaOriginal();

    // Suporte para teclado físico
    document.addEventListener('keydown', processarTecladoFisico);
});

async function fetchTamanhoPalavra() {
    try {
        // Adicionando um timestamp para contornar qualquer cache agressiva do browser e PUXAR sempre o ID novo!
        const res = await fetch('/api/termo/info?t=' + new Date().getTime());
        if (res.ok) {
            const data = await res.json();
            LETRAS_POR_PALAVRA = data.tamanho;

            // Garantir que as chaves de gravação locais no browser mudam de acordo com a conta logada!
            if (data.user_id) {
                const uid = data.user_id;
                const ultimoUserId = localStorage.getItem(LS_ULTIMO_USER_ID);

                // Se mudou de utilizador, limpar os dados antigos
                if (ultimoUserId && ultimoUserId !== uid.toString()) {
                    localStorage.removeItem(LS_GRELHA);
                    localStorage.removeItem(LS_CORES);
                    localStorage.removeItem(LS_TENTATIVA);
                    localStorage.removeItem(LS_ESTADO);
                    localStorage.removeItem(LS_DATA);
                    localStorage.removeItem(LS_TAMANHO);
                    localStorage.removeItem(LS_SABIAS_QUE);
                }

                // Guardar o ID do utilizador atual para próximas verificações
                localStorage.setItem(LS_ULTIMO_USER_ID, uid.toString());

                LS_GRELHA = `cibertermo_grelha_${uid}`;
                LS_CORES = `cibertermo_cores_${uid}`;
                LS_TENTATIVA = `cibertermo_tentativa_${uid}`;
                LS_ESTADO = `cibertermo_estado_${uid}`;
                LS_DATA = `cibertermo_data_${uid}`;
                LS_TAMANHO = `cibertermo_tamanho_${uid}`;
                LS_SABIAS_QUE = `cibertermo_sabias_que_${uid}`;
                LS_PALAVRAS_USADAS = `cibertermo_palavras_usadas_${uid}`;
                LS_PALAVRA_REVELADA = `cibertermo_palavra_revelada_${uid}`;
            }

            // Injeção visual da Média Social na UI
            if (data.jogadores > 0) {
                const subtitle = document.querySelector('.termo-header p');
                if (subtitle) {
                    subtitle.innerHTML += `<br><br><span style="font-size: 0.9rem; color: #94a3b8;"><i data-lucide="users" style="width: 14px; height: 14px; display:inline-block; vertical-align:middle; margin-right: 4px;"></i> A média global de hoje são <strong>${data.media_tentativas} tentativas</strong> (${data.jogadores} ciber-heróis já concluíram).</span>`;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        }
    } catch (e) {
        console.error("Falha ao obter info diária, fallback para 5 letras", e);
    }
}

function criarMatrizGrelha() {
    grelha = Array(TENTATIVAS_MAX).fill('').map(() => Array(LETRAS_POR_PALAVRA).fill(''));
}

// --- RENDERIZAÇÃO DOM ---
function desenharGrelhaOriginal() {
    const gridContainer = document.getElementById('termo-grid');
    gridContainer.innerHTML = '';

    for (let i = 0; i < TENTATIVAS_MAX; i++) {
        const row = document.createElement('div');
        row.className = 'termo-row';
        row.id = `row-${i}`;

        // Magia Dinâmica do CSS aqui!
        row.style.gridTemplateColumns = `repeat(${LETRAS_POR_PALAVRA}, 1fr)`;

        for (let j = 0; j < LETRAS_POR_PALAVRA; j++) {
            const tile = document.createElement('div');
            tile.className = 'termo-tile';
            tile.id = `tile-${i}-${j}`;
            row.appendChild(tile);
        }
        gridContainer.appendChild(row);
    }

    // Preencher as letras e cores carregadas
    atualizarGrelhaVisual();
}

function inicializarTeclado() {
    const teclas = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
    ];

    const kbContainer = document.getElementById('termo-keyboard');

    teclas.forEach(linha => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';

        linha.forEach(tecla => {
            const btn = document.createElement('button');
            btn.className = 'key';
            btn.textContent = tecla === 'BACKSPACE' ? '⌫' : tecla;
            btn.setAttribute('data-key', tecla);

            if (tecla === 'ENTER' || tecla === 'BACKSPACE') {
                btn.classList.add('wide');
            }

            btn.addEventListener('click', () => processarInput(tecla));
            rowDiv.appendChild(btn);
        });

        kbContainer.appendChild(rowDiv);
    });
}

// --- LÓGICA DE JOGO ---
function processarTecladoFisico(e) {
    if (estadoJogo !== 'JOGANDO') return;

    const key = e.key.toUpperCase();

    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (key === 'ENTER') {
        processarInput('ENTER');
    } else if (key === 'BACKSPACE') {
        processarInput('BACKSPACE');
    } else if (/^[A-ZÇ]$/.test(key)) {
        processarInput(key);
    }
}

function processarInput(tecla) {
    if (estadoJogo !== 'JOGANDO') return;

    if (tecla === 'BACKSPACE') {
        removerLetra();
        return;
    }

    if (tecla === 'ENTER') {
        submeterPalavra();
        return;
    }

    adicionarLetra(tecla);
}

function adicionarLetra(letra) {
    if (letraAtual < LETRAS_POR_PALAVRA) {
        grelha[tentativaAtual][letraAtual] = letra;

        const tile = document.getElementById(`tile-${tentativaAtual}-${letraAtual}`);
        tile.textContent = letra;
        tile.setAttribute('data-state', 'tbd');

        letraAtual++;
        guardarEstadoLocal();
    }
}

function removerLetra() {
    if (letraAtual > 0) {
        letraAtual--;
        grelha[tentativaAtual][letraAtual] = '';

        const tile = document.getElementById(`tile-${tentativaAtual}-${letraAtual}`);
        tile.textContent = '';
        tile.removeAttribute('data-state');

        guardarEstadoLocal();
    }
}

async function submeterPalavra() {
    if (letraAtual !== LETRAS_POR_PALAVRA) {
        mostrarMensagem('Faltam letras!');
        animarTremor(tentativaAtual);
        return;
    }

    const palavraEnviada = grelha[tentativaAtual].join('');

    // Verificar se a palavra já foi submetida antes neste jogo
    const usadasRaw = localStorage.getItem(LS_PALAVRAS_USADAS);
    const usadas = usadasRaw ? JSON.parse(usadasRaw) : [];
    if (usadas.includes(palavraEnviada)) {
        mostrarMensagem('Já tentaste essa palavra!');
        animarTremor(tentativaAtual);
        estadoJogo = 'JOGANDO';
        return;
    }

    try {
        estadoJogo = 'A_VERIFICAR';

        const res = await fetch('/api/termo/verificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tentativa: palavraEnviada,
                numero_tentativa: tentativaAtual + 1 // Para calcular pontos no servidor (entre 1 e 6)
            })
        });

        const dados = await res.json();

        if (!res.ok) {
            mostrarMensagem(dados.erro || 'Erro ao validar palavra.');
            estadoJogo = 'JOGANDO';
            return;
        }

        // Registar esta palavra como usada para impedir repetições
        const usadasRaw2 = localStorage.getItem(LS_PALAVRAS_USADAS);
        const usadas2 = usadasRaw2 ? JSON.parse(usadasRaw2) : [];
        usadas2.push(palavraEnviada);
        localStorage.setItem(LS_PALAVRAS_USADAS, JSON.stringify(usadas2));

        animarEAtualizarCores(dados.resultado, dados.vitoria, dados.ganhos, dados.palavra_revelada);

    } catch (err) {
        console.error("Erro na verificação:", err);
        mostrarMensagem("Erro de ligação!");
        estadoJogo = 'JOGANDO';
    }
}

function animarEAtualizarCores(arrayCores, vitoria, ganhos, palavraRevelada) {
    const rowId = tentativaAtual;
    let coresLidas = guardarCoresLocais();
    coresLidas[rowId] = arrayCores;

    localStorage.setItem(LS_CORES, JSON.stringify(coresLidas));

    arrayCores.forEach((cor, i) => {
        setTimeout(() => {
            const tile = document.getElementById(`tile-${rowId}-${i}`);
            tile.setAttribute('data-state', cor);
            atualizarCorTeclado(grelha[rowId][i], cor);
        }, i * 250);
    });

    setTimeout(() => {
        if (vitoria) {
            estadoJogo = 'VITORIA';
            let msg = "Incrível! Apanhaste o conceito de hoje!";
            if (ganhos) {
                // Se ganhámos pela primeira vez hoje
                msg = `Vitória! Acabaste de acumular +${ganhos.pontos} Pontos e +${ganhos.moedas} CC!`;
                // Como ganhámos recompensas, forçar o header a animar as moedas (reusando as queries globais)
                if (typeof window.atualizarHeaderGlobal === 'function') {
                    window.atualizarHeaderGlobal();
                }
            } else {
                msg = "Incível! Apanhaste o conceito de hoje! (Prémios já resgatados anteriormente)";
            }
            mostrarModalFinal(msg, true);
        } else {
            tentativaAtual++;
            letraAtual = 0;

            if (tentativaAtual >= TENTATIVAS_MAX) {
                estadoJogo = 'DERROTA';
                // Guardar a palavra revelada no storage para persistir ao recarregar
                if (palavraRevelada) localStorage.setItem(LS_PALAVRA_REVELADA, palavraRevelada);
                mostrarModalFinal(`Acabaram as tentativas... Volta amanhã e tenta o novo caso!`, false, palavraRevelada);
            } else {
                estadoJogo = 'JOGANDO';
            }
        }

        localStorage.setItem(LS_TENTATIVA, tentativaAtual);
        localStorage.setItem(LS_ESTADO, estadoJogo);
    }, arrayCores.length * 250 + 100);
}

function atualizarCorTeclado(letra, cor) {
    const btn = document.querySelector(`.key[data-key="${letra}"]`);
    if (!btn) return;

    const bgColorAtual = btn.getAttribute('data-state');

    if (bgColorAtual === 'correct') return;
    if (bgColorAtual === 'present' && cor === 'absent') return;

    btn.setAttribute('data-state', cor);
}

// --- STORAGE LOCAL ---
function verificarResetDiario() {
    const dataGuardada = localStorage.getItem(LS_DATA);
    const tamanhoMatrizGuardado = localStorage.getItem(LS_TAMANHO);

    // Se mudou o dia OU mudou o tamanho do tabuleiro de repente, limpa tudo!
    if (dataGuardada !== hoje || tamanhoMatrizGuardado !== LETRAS_POR_PALAVRA.toString()) {
        localStorage.removeItem(LS_GRELHA);
        localStorage.removeItem(LS_CORES);
        localStorage.removeItem(LS_TENTATIVA);
        localStorage.removeItem(LS_ESTADO);
        localStorage.removeItem(LS_SABIAS_QUE);
        localStorage.removeItem(LS_PALAVRAS_USADAS);
        localStorage.removeItem(LS_PALAVRA_REVELADA);
        
        localStorage.setItem(LS_DATA, hoje);
        localStorage.setItem(LS_TAMANHO, LETRAS_POR_PALAVRA);
    }
}

function guardarEstadoLocal() {
    localStorage.setItem(LS_GRELHA, JSON.stringify(grelha));
}

function guardarCoresLocais() {
    const mem = localStorage.getItem(LS_CORES);
    return mem ? JSON.parse(mem) : Array(TENTATIVAS_MAX).fill(null);
}

function carregarEstadoPreenchido() {
    const strGrelha = localStorage.getItem(LS_GRELHA);
    if (strGrelha) {
        grelha = JSON.parse(strGrelha);
    }

    const memTentativa = localStorage.getItem(LS_TENTATIVA);
    if (memTentativa !== null) {
        tentativaAtual = parseInt(memTentativa);
        letraAtual = 0;
        if (tentativaAtual < TENTATIVAS_MAX) {
            while (letraAtual < LETRAS_POR_PALAVRA && grelha[tentativaAtual][letraAtual] !== '') {
                letraAtual++;
            }
        }
    }

    const memEstado = localStorage.getItem(LS_ESTADO);
    if (memEstado) {
        estadoJogo = memEstado;
        if (estadoJogo === 'VITORIA') mostrarModalFinal("Incrível! Apanhaste o conceito de hoje!", true);
        if (estadoJogo === 'DERROTA') {
            // Restaurar a palavra revelada guardada para mostrar no modal
            const palavraGuardada = localStorage.getItem(LS_PALAVRA_REVELADA);
            mostrarModalFinal("Acabaram as tentativas... Volta amanhã e tenta o novo caso!", false, palavraGuardada);
        }
    }
}

function atualizarGrelhaVisual() {
    const arrayCores = guardarCoresLocais();

    for (let r = 0; r < TENTATIVAS_MAX; r++) {
        for (let c = 0; c < LETRAS_POR_PALAVRA; c++) {
            const letra = grelha[r][c];
            const tile = document.getElementById(`tile-${r}-${c}`);

            if (letra) {
                tile.textContent = letra;
                if (r < tentativaAtual || estadoJogo === 'VITORIA' || estadoJogo === 'DERROTA') {
                    if (arrayCores[r] && arrayCores[r][c]) {
                        const cor = arrayCores[r][c];
                        tile.setAttribute('data-state', cor);
                        atualizarCorTeclado(letra, cor);
                    }
                } else {
                    tile.setAttribute('data-state', 'tbd');
                }
            }
        }
    }
}

// --- UTILITIES UI ---
function mostrarMensagem(msg) {
    const el = document.getElementById('termo-msg-container');
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');

    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.classList.add('hidden'), 300);
    }, 2000);
}

function animarTremor(rowId) {
    const row = document.getElementById(`row-${rowId}`);
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    setTimeout(() => {
        row.classList.remove('shake');
    }, 600);
}

function mostrarModalFinal(mensagem, sucesso, palavraRevelada) {
    const modal = document.getElementById('termo-modal');
    const titulo = sucesso ? 'Vitória!' : 'Fim do Jogo';

    document.getElementById('modal-title').textContent = titulo;
    
    const descEl = document.getElementById('modal-desc');
    descEl.textContent = mensagem;

    // Se for derrota e temos a palavra, criar um badge vistoso abaixo da mensagem
    const badgeExistente = document.getElementById('palavra-revelada-badge');
    if (badgeExistente) badgeExistente.remove();
    
    if (!sucesso && palavraRevelada) {
        const badge = document.createElement('div');
        badge.id = 'palavra-revelada-badge';
        badge.style.cssText = 'margin: 12px 0; padding: 12px 20px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); border-radius: 8px; display: inline-block;';
        badge.innerHTML = `<span style="font-size: 0.85rem; color: #ef4444; display: block; margin-bottom: 4px;">A palavra era:</span><span style="font-size: 1.8rem; font-weight: 900; letter-spacing: 6px; color: #f87171;">${palavraRevelada}</span>`;
        descEl.insertAdjacentElement('afterend', badge);
    }

    // Resetar o estado da curiosidade no modal
    const memoriaCuriosidade = localStorage.getItem(LS_SABIAS_QUE);

    if (memoriaCuriosidade) {
        document.getElementById('modal-sabias-que').style.display = 'block';
        document.getElementById('sabias-que-text').innerHTML = memoriaCuriosidade;
        document.getElementById('btn-curiosidade').style.display = 'none';
    } else {
        document.getElementById('modal-sabias-que').style.display = 'none';
        document.getElementById('sabias-que-text').innerHTML = '';
        const btnC = document.getElementById('btn-curiosidade');
        btnC.style.display = 'block';
        btnC.textContent = 'Ver Sabias Que';
        btnC.disabled = false;
    }

    const modalIcon = document.getElementById('modal-icon');
    const iconContainer = document.getElementById('modal-icon-container');

    if (sucesso) {
        modalIcon.setAttribute('data-lucide', 'award');
        modalIcon.style.color = '#10b981';
        iconContainer.style.background = 'rgba(16, 185, 129, 0.1)';
    } else {
        modalIcon.setAttribute('data-lucide', 'x-circle');
        modalIcon.style.color = '#ef4444';
        iconContainer.style.background = 'rgba(239, 68, 68, 0.1)';
    }

    lucide.createIcons();
    modal.classList.add('active');

    // Inicia o contador para a próxima meia-noite (UTC)
    iniciarContadorTermo();
}

// ==========================================
// FUNÇÕES CURIOSIDADE E TEMPO
// ==========================================
let termoTimerInterval = null;

function iniciarContadorTermo() {
    const el = document.getElementById('termo-countdown');
    if (termoTimerInterval) clearInterval(termoTimerInterval);

    function atualizarTempo() {
        const agora = new Date();
        // Próximo dia à meia noite UTC
        const amanhaUTC = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 1));
        const faltaMs = amanhaUTC - agora;

        if (faltaMs <= 0) {
            el.textContent = "00:00:00";
            return;
        }

        const h = Math.floor(faltaMs / (1000 * 60 * 60));
        const m = Math.floor((faltaMs % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((faltaMs % (1000 * 60)) / 1000);

        el.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    atualizarTempo();
    termoTimerInterval = setInterval(atualizarTempo, 1000);
}

async function pedirCuriosidade() {
    const btn = document.getElementById('btn-curiosidade');
    const container = document.getElementById('modal-sabias-que');
    const textoEl = document.getElementById('sabias-que-text');

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width: 16px; display:inline-block; vertical-align:middle; animation: spin 1s linear infinite;"></i> A perguntar ao Ciber-Mentor...`;
    lucide.createIcons();

    try {
        const res = await fetch('/api/termo/curiosidade', { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.curiosidade) {
            btn.style.display = 'none'; // Esconde botão se teve sucesso
            container.style.display = 'block'; // Mostra a div azul

            // Render basic markdown (bold) if Gemini responds with it
            let finalHtml = data.curiosidade.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            textoEl.innerHTML = finalHtml;

            // Guarda na cache local do browser para não gastar mais queries da conta hoje
            localStorage.setItem(LS_SABIAS_QUE, finalHtml);
        } else {
            btn.disabled = false;
            btn.textContent = 'Ver Sabias Que';
            textoEl.textContent = data.error || "Ocorreu um erro. Tenta novamente.";
            container.style.display = 'block'; // Mostrar de qualquer forma para ver o erro
        }
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = 'Ver Sabias Que';
    }
}
