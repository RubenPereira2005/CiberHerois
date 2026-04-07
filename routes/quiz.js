const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Importa a AI do Gemini
const { verificarEAtribuirMedalhas } = require('./medals');

module.exports = (supabase) => {

    // --- ROTA 1: Obter resumo (contagem de perguntas por categoria) ---
    router.get('/summary/all', async (req, res) => {
        try {
            const { data, error } = await supabase.from('pergunta').select('id_pergunta, atividade!inner(categoria)');
            if (error) throw error;

            const contagem = {};
            data.forEach(item => {
                const cat = item.atividade.categoria.trim().toLowerCase();
                contagem[cat] = (contagem[cat] || 0) + 1;
            });

            const results = Object.keys(contagem).map(key => ({
                categoria: key,
                total_questoes: contagem[key]
            }));
            res.json(results);
        } catch (err) {
            console.error("Erro Supabase:", err.message);
            res.status(500).json({ error: "Erro ao carregar resumo dos quizzes." });
        }
    });

    // --- NOVA ROTA: Obter o progresso do utilizador (Estrelas / Desbloqueios) ---
    router.get('/user-progress/all', async (req, res) => {
        if (!req.session.userId) return res.json({});
        try {
            const { data, error } = await supabase
                .from('progresso')
                .select('respostas_corretas, total_perguntas, atividade!inner(categoria, dificuldade)')
                .eq('id_utilizador', req.session.userId);

            if (error) throw error;

            const progress = {};
            data.forEach(p => {
                const cat = p.atividade.categoria.trim().toLowerCase();
                const diff = p.atividade.dificuldade.trim().toLowerCase();

                if (!progress[cat]) {
                    progress[cat] = { facil: false, medio: false, dificil: false };
                }

                // A REGRA DE OURO: Para ganhar a estrela, tem de acertar TUDO (ex: 5/5)
                if (p.respostas_corretas === p.total_perguntas && p.total_perguntas > 0) {
                    progress[cat][diff] = true;
                }
            });

            res.json(progress);
        } catch (err) {
            console.error("Erro ao verificar progresso:", err.message);
            res.status(500).json({ error: "Erro interno" });
        }
    });

    // --- ROTA 2: Obter info das dificuldades (Para o Modal) ---
    router.get('/info/:categoria', async (req, res) => {
        const categoria = req.params.categoria.trim();
        try {
            const { data: perguntas, error } = await supabase
                .from('pergunta')
                .select(`pontos_pergunta, atividade!inner(dificuldade, categoria)`)
                .ilike('atividade.categoria', categoria);

            if (error) throw error;

            let stats = {
                facil: { max_xp: 0, max_coins: 0 },
                medio: { max_xp: 0, max_coins: 0 },
                dificil: { max_xp: 0, max_coins: 0 }
            };

            let counts = { facil: 0, medio: 0, dificil: 0 };
            let pontosPorPergunta = { facil: 10, medio: 20, dificil: 30 };

            if (perguntas && perguntas.length > 0) {
                perguntas.forEach(p => {
                    let diff = p.atividade.dificuldade.trim().toLowerCase();
                    if (stats[diff]) {
                        counts[diff] += 1;
                        if (p.pontos_pergunta) pontosPorPergunta[diff] = p.pontos_pergunta;
                    }
                });

                ['facil', 'medio', 'dificil'].forEach(diff => {
                    let limitePerguntasJogo = Math.min(counts[diff], 5);
                    stats[diff].max_xp = limitePerguntasJogo * pontosPorPergunta[diff];
                    let multiplicadorMoedas = diff === 'facil' ? 2 : (diff === 'medio' ? 5 : 10);
                    stats[diff].max_coins = limitePerguntasJogo * multiplicadorMoedas;
                });
            }
            res.json(stats);
        } catch (err) {
            console.error("Erro ao calcular info:", err.message);
            res.status(500).json({ error: "Erro interno" });
        }
    });

    // --- ROTA 3: Obter perguntas do QUIZ ---
    router.get('/:categoria', async (req, res) => {
        const categoria = req.params.categoria.trim();
        const dificuldade = (req.query.diff || 'medio').trim();

        try {
            const { data: perguntas, error } = await supabase
                .from('pergunta')
                .select(`
                    id_pergunta, texto_pergunta, pontos_pergunta,
                    atividade!inner(dificuldade, categoria),
                    opcao_resposta(id_opcao, texto_opcao, e_correta)
                `)
                .ilike('atividade.categoria', categoria)
                .ilike('atividade.dificuldade', dificuldade);

            if (error) throw error;
            if (!perguntas || perguntas.length === 0) return res.status(404).json({ error: "Nenhuma pergunta encontrada." });

            let quizFinal = perguntas.map(p => {
                let correctAnswerId = null;
                const options = p.opcao_resposta.map(opt => {
                    if (opt.e_correta) correctAnswerId = opt.id_opcao;
                    return { id: opt.id_opcao, text: opt.texto_opcao };
                });
                return {
                    id: p.id_pergunta, question: p.texto_pergunta, dificuldade: p.atividade.dificuldade,
                    pontos: p.pontos_pergunta, options: options, correctAnswer: correctAnswerId
                };
            });

            for (let i = quizFinal.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [quizFinal[i], quizFinal[j]] = [quizFinal[j], quizFinal[i]];
            }
            res.json(quizFinal.slice(0, 5));
        } catch (err) {
            console.error("Erro Supabase:", err.message);
            res.status(500).json({ error: "Erro ao carregar o quiz." });
        }
    });

    // --- ROTA 4: Guardar Score e Moedas ---
    router.post('/save-score', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { categoria, dificuldade, respostas_corretas, total_perguntas } = req.body;
        const diffSegura = (dificuldade || 'medio').trim();

        try {
            const { data: atividade, error: errorAtv } = await supabase
                .from('atividade').select('id_atividade').ilike('categoria', categoria.trim())
                .ilike('dificuldade', diffSegura).limit(1).single();

            if (errorAtv || !atividade) return res.status(404).json({ error: "Atividade não encontrada." });

            let pontosGanhos = 0;
            const { data: perguntaDB } = await supabase.from('pergunta').select('pontos_pergunta').eq('id_atividade', atividade.id_atividade).limit(1).single();

            const valorPorPergunta = perguntaDB ? perguntaDB.pontos_pergunta : 10;
            pontosGanhos = respostas_corretas * valorPorPergunta;

            let moedasGanhas = 0;
            if (respostas_corretas > 0) {
                let multiplicadorMoedas = 0;
                let df = diffSegura.toLowerCase();
                if (df === 'facil') multiplicadorMoedas = 2;
                else if (df === 'medio') multiplicadorMoedas = 5;
                else if (df === 'dificil') multiplicadorMoedas = 10;
                moedasGanhas = respostas_corretas * multiplicadorMoedas;
            }

            await supabase.from('progresso').insert({
                id_utilizador: req.session.userId, id_atividade: atividade.id_atividade,
                pontos_obtidos: pontosGanhos, respostas_corretas: respostas_corretas,
                total_perguntas: total_perguntas, data_realizacao: new Date()
            });

            const { data: userData, error: userError } = await supabase.from('utilizador').select('pontos_totais, coins').eq('id_utilizador', req.session.userId).single();

            if (!userError && userData) {
                await supabase.from('utilizador').update({
                    pontos_totais: (userData.pontos_totais || 0) + pontosGanhos,
                    coins: (userData.coins || 0) + moedasGanhas
                }).eq('id_utilizador', req.session.userId);
            }
            // --- VERIFICAR E ATRIBUIR MEDALHAS AUTOMATICAMENTE ---
            const novasMedalhas = await verificarEAtribuirMedalhas(supabase, req.session.userId);

            res.json({
                message: "Guardado com sucesso!",
                pontos_ganhos: pontosGanhos,
                moedas_ganhas: moedasGanhas,
                novas_medalhas: novasMedalhas
            });
        } catch (err) {
            console.error("Erro ao guardar:", err.message);
            res.status(500).json({ error: "Erro interno." });
        }
    });

    // --- NOVA ROTA: O Ciber-Mentor (IA Gemini) ---
    router.post('/hint', async (req, res) => {
        const { pergunta, respostaErrada } = req.body;

        try {
            // Inicializa a IA com a tua chave do ficheiro .env
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Prompt para a IA: Explica o erro de forma amigável, sem dar a resposta certa
            const prompt = `Assume a persona de "Ciber-Mentor", um professor especialista em Cibersegurança.

            CONTEXTO DO ALUNO:
            - Pergunta do quiz: "${pergunta}"
            - Opção errada escolhida: "${respostaErrada}"

            INSTRUÇÕES E REGRAS ESTRITAS:
            1. Começa o texto DIRETAMENTE com a explicação. É expressamente proibido usar saudações, introduções, pedir desculpa ou dizer quem és (ex: sem "Olá", "Bom dia", ou "Aqui é o Ciber-Mentor").
            2. Explica brevemente porque é que a opção escolhida está errada ou foca-te no conceito que o aluno precisa de rever.
            3. NUNCA dês a resposta correta diretamente. O objetivo é fazê-lo pensar.
            4. O tamanho máximo da resposta são 2 a 3 frases curtas e diretas.
            5. Usa um tom encorajador e focado no ensino.
            6. O idioma é estritamente Português de Portugal (PT-PT).

            Resposta do Ciber-Mentor:`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            res.json({ hint: text });
        } catch (error) {
            console.error("Erro no Ciber-Mentor IA:", error);
            res.status(500).json({ error: "O Ciber-Mentor está a fazer uma atualização de sistema. Tenta novamente mais tarde!" });
        }
    });
    return router;
};