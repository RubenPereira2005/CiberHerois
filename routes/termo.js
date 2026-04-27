const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Lista de palavras validas do jogo (comprimentos entre 4 e 8 letras para usabilidade mobile)
const WORDS = [
    // 4 Letras
    "REDE", "WIFI", "URLS", "BOTS", "SPAM", "DADO", "HACK",
    // 5 Letras
    "SENHA", "VIRUS", "TOKEN", "FALHA", "DADOS",
    // 6 Letras
    "HACKER", "ATAQUE", "COOKIE", "BACKUP",
    // 7 Letras
    "SISTEMA", "BOTNETS", "ROUTERS", "TROJANS",
    // 8 Letras
    "FIREWALL", "PHISHING", "MALWARES", "PASSWORD"
];

// Data de inicio fixa para calcular a mesma palavra do dia independentemente do servidor
const START_DATE = new Date('2026-04-01T00:00:00Z');

function getWordOfTheDay() {
    const today = new Date();
    // Usa UTC para garantir que e a mesma palavra globalmente, independente do fuso horario do servidor
    const diffTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
        Date.UTC(START_DATE.getUTCFullYear(), START_DATE.getUTCMonth(), START_DATE.getUTCDate());

    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Garante que o indice nunca e negativo e da ciclo infinito no array
    const index = Math.abs(diffDays) % WORDS.length;
    return WORDS[index];
}

module.exports = (supabase) => {

    // Devolve o tamanho da palavra do dia e o ID do utilizador (se autenticado)
    router.get('/info', (req, res) => {
        const wordOfDay = getWordOfTheDay();
        return res.json({
            tamanho: wordOfDay.length,
            user_id: req.session?.userId || null
        });
    });

    router.post('/verificar', async (req, res) => {
        const { tentativa, numero_tentativa } = req.body;
        const wordOfDay = getWordOfTheDay();
        const tamanhoCorreto = wordOfDay.length;

        if (!tentativa || tentativa.length !== tamanhoCorreto) {
            return res.status(400).json({ erro: `A palavra deve ter exatamente ${tamanhoCorreto} letras.` });
        }

        const guess = tentativa.toUpperCase();

        // VALIDACAO DE DICIONARIO
        // Se nao for a palavra do dia nem estiver na lista interna, valida contra dicionarios externos
        if (guess !== wordOfDay && !WORDS.includes(guess)) {
            if (typeof fetch !== 'undefined') {
                try {
                    const guessLow = guess.toLowerCase();
                    
                    // Executa as verificacoes em paralelo para maior desempenho
                    const checkPt = fetch(`https://api.dicionario-aberto.net/word/${guessLow}`)
                        .then(res => res.json())
                        .then(data => data && data.length > 0)
                        .catch(() => false);
                        
                    const checkEn = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${guessLow}`)
                        .then(res => res.ok)
                        .catch(() => false);

                    const results = await Promise.all([checkPt, checkEn]);
                    let isValid = results.some(v => v === true);

                    // Tratamento de plurais em portugues: o dicionario PT nao suporta plurais nativamente
                    // Tenta verificar a forma singular antes de rejeitar a palavra
                    if (!isValid && guessLow.endsWith('s')) {
                        const checksSingular = [];
                        
                        // Plural simples: remove o 's' (ex: casas -> casa)
                        checksSingular.push(fetch(`https://api.dicionario-aberto.net/word/${guessLow.slice(0, -1)}`).then(res => res.json()).then(data => data && data.length > 0).catch(() => false));

                        // Plural com 'es': remove o 'es' (ex: computadores -> computador)
                        if (guessLow.endsWith('es')) {
                            checksSingular.push(fetch(`https://api.dicionario-aberto.net/word/${guessLow.slice(0, -2)}`).then(res => res.json()).then(data => data && data.length > 0).catch(() => false));
                        }
                        
                        // Plural com 'is': substitui por 'l' (ex: animais -> animal)
                        if (guessLow.endsWith('is')) {
                            checksSingular.push(fetch(`https://api.dicionario-aberto.net/word/${guessLow.slice(0, -2)}l`).then(res => res.json()).then(data => data && data.length > 0).catch(() => false));
                        }

                        const singularResults = await Promise.all(checksSingular);
                        if (singularResults.some(v => v === true)) {
                            isValid = true; // E um plural legitimo
                        }
                    }

                    if (!isValid) {
                        return res.status(400).json({ erro: 'Palavra não encontrada no dicionário!' });
                    }
                } catch (err) {
                    console.warn("Erro na validação de dicionário externo:", err);
                }
            }
        }

        // Estado inicial: todas as posicoes marcadas como ausentes
        let resultado = new Array(tamanhoCorreto).fill('absent');

        // Contagem de letras da palavra correta para logica dos amarelos
        let wordCounts = {};

        for (let i = 0; i < tamanhoCorreto; i++) {
            let char = wordOfDay[i];
            wordCounts[char] = (wordCounts[char] || 0) + 1;
        }

        // Primeira passagem: identifica as letras certas no lugar certo (verde)
        for (let i = 0; i < tamanhoCorreto; i++) {
            if (guess[i] === wordOfDay[i]) {
                resultado[i] = 'correct';
                wordCounts[guess[i]]--;
            }
        }

        // Segunda passagem: identifica as letras certas no lugar errado (amarelo)
        for (let i = 0; i < tamanhoCorreto; i++) {
            if (resultado[i] !== 'correct' && wordCounts[guess[i]] > 0) {
                resultado[i] = 'present';
                wordCounts[guess[i]]--; // Consome uma ocorrencia disponivel
            }
        }

        // Verifica se ganharam o jogo
        const vitoria = resultado.every(r => r === 'correct');
        const eUltimaTentativa = (numero_tentativa || 0) >= 6;

        let ganhos = null;

        // Se o jogador acertou e tem sessao iniciada, regista a pontuacao (em background)
        if (vitoria && req.session && req.session.userId && numero_tentativa) {
            const pontosBónus = (6 - numero_tentativa) * 10;
            const pontosBase = tamanhoCorreto * 5;
            const totalPontos = pontosBase + pontosBónus;
            const totalMoedas = Math.floor(totalPontos / 5);

            ganhos = { pontos: totalPontos, moedas: totalMoedas };

            // Atualiza a BD de forma assincrona sem bloquear a resposta ao utilizador
            (async () => {
                try {
                    // Tenta inserir no historico; falha silenciosamente se ja existir uma entrada para hoje (UNIQUE CONSTRAINT)
                    const { error: histError } = await supabase
                        .from('cibertermo_historico')
                        .insert({
                            id_utilizador: req.session.userId,
                            tamanho_palavra: tamanhoCorreto,
                            tentativas: numero_tentativa,
                            pontos_ganhos: totalPontos,
                            moedas_ganhas: totalMoedas
                        });

                    // Se nao deu erro, e a primeira vitoria de hoje: atribui os pontos
                    if (!histError) {
                        const { data: userData } = await supabase
                            .from('utilizador')
                            .select('pontos_totais, coins')
                            .eq('id_utilizador', req.session.userId)
                            .single();

                        if (userData) {
                            await supabase
                                .from('utilizador')
                                .update({
                                    pontos_totais: (userData.pontos_totais || 0) + totalPontos,
                                    coins: (userData.coins || 0) + totalMoedas
                                })
                                .eq('id_utilizador', req.session.userId);
                        }
                    }
                } catch (err) {
                    console.error("Erro ao gravar termo em background:", err);
                }
            })();
        }

        return res.json({
            jogada: guess,
            resultado: resultado,
            vitoria: vitoria,
            ganhos: ganhos,
            // Revela a palavra apenas quando o jogador perde na ultima tentativa
            palavra_revelada: (!vitoria && eUltimaTentativa) ? wordOfDay : null
        });
    });

    router.post('/curiosidade', async (req, res) => {
        try {
            const wordOfDay = getWordOfTheDay();
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

            const prompt = `Assume a persona de "Ciber-Mentor", um professor especialista em Cibersegurança.
            Descreve didaticamente, em tom de "Sabias que...?", o conceito sobre a palavra/sigla: "${wordOfDay}".
            INSTRUÇÕES:
            1. Começa o texto diretamente com a explicação do conceito (ex: "O Phishing é...").
            2. É estritamente proibido incluir saudações (Sem "Olá", "Aqui é o Ciber-Mentor").
            3. Máximo de 2 a 3 frases curtas e cativantes.
            4. Idioma em Português de Portugal (PT-PT).`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            return res.json({ curiosidade: text });
        } catch (error) {
            console.error("Erro no Gemini (Curiosidade Termo):", error);
            res.status(500).json({ error: "O Ciber-Mentor está indisponível neste momento." });
        }
    });

    return router;
};
