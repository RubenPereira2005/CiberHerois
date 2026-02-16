const express = require('express');
const router = express.Router();

module.exports = (db) => {

    // --- ROTA: Obter perguntas de um quiz por categoria ---
    // GET /api/quiz/:categoria
    router.get('/:categoria', (req, res) => {
        const categoria = req.params.categoria;

        // A Query continua igual, vai buscar tudo o que pertence à categoria
        const query = `
            SELECT 
                a.dificuldade,
                p.id_pergunta, 
                p.texto_pergunta, 
                o.id_opcao, 
                o.texto_opcao, 
                o.e_correta
            FROM Atividade a
            JOIN Pergunta p ON a.id_atividade = p.id_atividade
            JOIN Opcao_Resposta o ON p.id_pergunta = o.id_pergunta
            WHERE a.categoria = ?
        `;

        db.query(query, [categoria], (err, results) => {
            if (err) {
                console.error("Erro SQL:", err);
                return res.status(500).json({ error: "Erro ao carregar o quiz." });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: "Nenhuma pergunta encontrada para esta categoria." });
            }

            // 1. Lógica para agrupar as opções por pergunta
            const perguntasMap = {};

            results.forEach(row => {
                if (!perguntasMap[row.id_pergunta]) {
                    perguntasMap[row.id_pergunta] = {
                        id: row.id_pergunta,
                        question: row.texto_pergunta,
                        dificuldade: row.dificuldade,
                        options: [],
                        correctAnswer: null
                    };
                }

                perguntasMap[row.id_pergunta].options.push({
                    id: row.id_opcao,
                    text: row.texto_opcao
                });

                if (row.e_correta === 1 || row.e_correta === true) {
                    perguntasMap[row.id_pergunta].correctAnswer = row.id_opcao;
                }
            });

            // Converter o objeto num Array
            let quizFinal = Object.values(perguntasMap);

            // 2. NOVA LÓGICA: Baralhar a ordem das perguntas (Algoritmo Fisher-Yates)
            for (let i = quizFinal.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [quizFinal[i], quizFinal[j]] = [quizFinal[j], quizFinal[i]];
            }

            // 3. NOVA LÓGICA: Escolher apenas 5 perguntas (se houver menos de 5, ele apanha as que houver)
            // Podes mudar o '5' para o número de perguntas que quiseres por quiz!
            const quizLimitado = quizFinal.slice(0, 5);

            // Devolver apenas as 5 perguntas escolhidas aleatoriamente
            res.json(quizLimitado);
        });
    });



    // --- ROTA: Obter resumo (contagem de perguntas por categoria) para pagina dashboard---
    // GET /api/quiz/summary/all
    router.get('/summary/all', (req, res) => {
        const query = `
            SELECT 
                a.categoria, 
                COUNT(p.id_pergunta) as total_questoes
            FROM Atividade a
            JOIN Pergunta p ON a.id_atividade = p.id_atividade
            GROUP BY a.categoria;
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error("Erro SQL:", err);
                return res.status(500).json({ error: "Erro ao carregar resumo dos quizzes." });
            }
            res.json(results); // Vai devolver algo como: [{ categoria: 'https', total_questoes: 6 }, ...]
        });
    });

    return router;
};