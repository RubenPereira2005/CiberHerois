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

    // --- ROTA: Guardar a pontuação do quiz ---
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

            // 3. Atualiza a coluna 'pontos_totais' na tabela Utilizador
            // Primeiro, busca o total atual para somar a nova pontuação
            const { data: userData, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (!userError && userData) {
                const novosPontos = (userData.pontos_totais || 0) + pontos;
                
                // Atualiza a pontuação total do utilizador
                await supabase
                    .from('utilizador')
                    .update({ pontos_totais: novosPontos })
                    .eq('id_utilizador', req.session.userId);
            }

            res.json({ message: "Pontuação guardada com sucesso no histórico e no perfil!" });

        } catch (err) {
            console.error("Erro ao guardar pontuação:", err.message);
            res.status(500).json({ error: "Erro interno ao guardar o progresso." });
        }
    });

    return router;
};