const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- ROTA: Obter perguntas de um quiz por categoria ---
    router.get('/:categoria', async (req, res) => {
        const categoria = req.params.categoria;

        try {
            // No Supabase, fazemos JOIN usando a relação das Foreign Keys (tudo em minúsculas)
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
            // Vamos buscar todas as perguntas e as suas categorias para contar (minúsculas)
            const { data, error } = await supabase
                .from('pergunta')
                .select('id_pergunta, atividade!inner(categoria)');

            if (error) throw error;

            // Fazer o agrupamento e contagem em JavaScript
            const contagem = {};
            data.forEach(item => {
                const cat = item.atividade.categoria;
                contagem[cat] = (contagem[cat] || 0) + 1;
            });

            // Converter no formato array
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

    return router;
};