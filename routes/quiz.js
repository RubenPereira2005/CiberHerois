const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- ROTA: Obter perguntas de um quiz por categoria ---
    router.get('/:categoria', async (req, res) => {
        const categoria = req.params.categoria;

        try {
            // No Supabase, vamos buscar as perguntas que têm a categoria associada através da tabela "atividade"
            const { data: perguntas, error } = await supabase
                .from('pergunta')
                .select(`
                    id_pergunta,
                    texto_pergunta,
                    atividade!inner(dificuldade, categoria),
                    opcao_resposta(id_opcao, texto_opcao, e_correta)
                `)
                .eq('atividade.categoria', categoria);

            if (error) throw error;

            if (!perguntas || perguntas.length === 0) {
                return res.status(404).json({ error: "Nenhuma pergunta encontrada para esta categoria." });
            }

            // 1. Mapear para o formato que o teu frontend espera
            let quizFinal = perguntas.map(p => {
                let correctAnswerId = null;
                const options = p.opcao_resposta.map(opt => {
                    if (opt.e_correta) correctAnswerId = opt.id_opcao;
                    return { id: opt.id_opcao, text: opt.texto_opcao };
                });

                return {
                    id: p.id_pergunta,
                    question: p.texto_pergunta,
                    dificuldade: p.atividade.dificuldade,
                    options: options,
                    correctAnswer: correctAnswerId
                };
            });

            // 2. Baralhar a ordem das perguntas (Algoritmo Fisher-Yates)
            for (let i = quizFinal.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [quizFinal[i], quizFinal[j]] = [quizFinal[j], quizFinal[i]];
            }

            // 3. Escolher apenas 5 perguntas
            const quizLimitado = quizFinal.slice(0, 5);

            res.json(quizLimitado);
        } catch (err) {
            console.error("Erro Supabase:", err.message);
            res.status(500).json({ error: "Erro ao carregar o quiz." });
        }
    });

    // --- ROTA: Obter resumo (contagem de perguntas por categoria) ---
    router.get('/summary/all', async (req, res) => {
        try {
            // Busca todas as perguntas com a categoria associada
            const { data, error } = await supabase
                .from('pergunta')
                .select('id_pergunta, atividade!inner(categoria)');

            if (error) throw error;

            // Faz o agrupamento e contagem de perguntas por categoria
            const contagem = {};
            data.forEach(item => {
                const cat = item.atividade.categoria;
                contagem[cat] = (contagem[cat] || 0) + 1;
            });

            // Converte o resultado para um array
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

    // --- ROTA: Guardar a pontuação do quiz e dar moedas ---
    router.post('/save-score', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Utilizador não autenticado" });
        }

        const { categoria, pontos, respostas_corretas, total_perguntas } = req.body;

        try {
            // 1. Procura a atividade
            const { data: atividade, error: errorAtv } = await supabase
                .from('atividade')
                .select('id_atividade')
                .eq('categoria', categoria)
                .limit(1)
                .single();

            if (errorAtv || !atividade) {
                return res.status(404).json({ error: "Atividade não encontrada para esta categoria." });
            }

            // 2. Insere no Histórico (Progresso)
            const { error: errorProgresso } = await supabase
                .from('progresso')
                .insert({
                    id_utilizador: req.session.userId,
                    id_atividade: atividade.id_atividade,
                    pontos_obtidos: pontos,
                    respostas_corretas: respostas_corretas,
                    total_perguntas: total_perguntas,
                    data_realizacao: new Date()
                });

            if (errorProgresso) throw errorProgresso;

            // 3. Atualiza a coluna 'pontos_totais' e 'coins' na tabela Utilizador
            const { data: userData, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais, coins')
                .eq('id_utilizador', req.session.userId)
                .single();

            let moedasGanhas = 0;

            if (!userError && userData) {
                // Soma os XP (pontos totais)
                const novosPontos = (userData.pontos_totais || 0) + pontos;
                
                // --- LÓGICA DAS MOEDAS ---
                // Se ele acertou pelo menos uma pergunta, ganha moedas (evita dar moedas a quem erra tudo)
                if (respostas_corretas > 0) {
                    const minCoins = 10;
                    const maxCoins = 50;
                    // Gera número aleatório entre 10 e 50
                    moedasGanhas = Math.floor(Math.random() * (maxCoins - minCoins + 1)) + minCoins;
                }
                
                const novasCoins = (userData.coins || 0) + moedasGanhas;
                
                // Atualiza a pontuação total e as coins do utilizador
                await supabase
                    .from('utilizador')
                    .update({ 
                        pontos_totais: novosPontos,
                        coins: novasCoins // GUARDA AS MOEDAS NA DB
                    })
                    .eq('id_utilizador', req.session.userId);
            }

            // RETORNA AS MOEDAS GANHAS PARA O FRONTEND MOSTRAR!
            res.json({ 
                message: "Pontuação guardada com sucesso no histórico e no perfil!",
                moedas_ganhas: moedasGanhas
            });

        } catch (err) {
            console.error("Erro ao guardar pontuação:", err.message);
            res.status(500).json({ error: "Erro interno ao guardar o progresso." });
        }
    });

    return router;
};