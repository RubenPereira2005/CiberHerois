const express = require('express');
const router = express.Router();

module.exports = (supabase) => {
    
    router.get('/', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            // 1. Pontuação total do utilizador
            const { data: userData, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais')
                .eq('id_utilizador', req.session.userId)
                .single();

            const totalPontos = userData ? (userData.pontos_totais || 0) : 0;

            // Lógica de níveis (exponencial)
            let nivel = 1;
            let pontosDoNivelAtual = 0;
            let pontosParaSubir = 200;  // Custo do primeiro nível

            // Vai aumentando o nível enquanto o total de pontos for suficiente para subir
            while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                pontosDoNivelAtual += pontosParaSubir; // Atualiza a base do nível
                nivel++;

                pontosParaSubir = Math.floor(pontosParaSubir * 1.5); // Aumenta a dificuldade em 50% para o próximo nível
            }

            // Cálculos para a barra de progresso
            const pontosFeitosNesteNivel = totalPontos - pontosDoNivelAtual;
            const pontosRestantes = pontosParaSubir - pontosFeitosNesteNivel;
            const progressoPerc = Math.round((pontosFeitosNesteNivel / pontosParaSubir) * 100);


            // 2. Calcular a precisão do utilizador nos quizzes
            const { data: progresso, error: erroProgresso } = await supabase
                .from('progresso')
                .select(`
                    respostas_corretas,
                    total_perguntas,
                    atividade!inner(tipo)
                `)
                .eq('id_utilizador', req.session.userId)
                .eq('atividade.tipo', 'quiz'); 

            if (erroProgresso) throw erroProgresso;

            let totalQuizzes = 0;
            let totalCorretas = 0;
            let totalRespostas = 0;

            // Somar os resultados dos quizzes para calcular a precisão
            if (progresso && progresso.length > 0) {
                totalQuizzes = progresso.length;
                progresso.forEach(p => {
                    if (p.respostas_corretas !== null) totalCorretas += p.respostas_corretas;
                    if (p.total_perguntas !== null) totalRespostas += p.total_perguntas;
                });
            }

            let precisao = 0;
            if (totalRespostas > 0) {
                precisao = Math.round((totalCorretas / totalRespostas) * 100);
            }

            // 3. Contar as Medalhas
            const { count: totalMedalhas, error: erroMedalhas } = await supabase
                .from('utilizador_medalha')
                .select('*', { count: 'exact', head: true })
                .eq('id_utilizador', req.session.userId);

            if (erroMedalhas) throw erroMedalhas;

            // 4. Devolver os dados ao Frontend
            res.json({
                quizzes: totalQuizzes,
                precisao: precisao,
                respostas: totalRespostas,
                medalhas: totalMedalhas || 0,
                pontos: totalPontos,
                nivel: nivel,
                pontos_restantes: pontosRestantes,
                progresso_perc: progressoPerc
            });

        } catch (error) {
            console.error("Erro ao carregar estatísticas:", error);
            res.status(500).json({ error: "Erro interno ao carregar estatísticas." });
        }
    });

    return router;
};