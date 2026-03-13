const express = require('express');
const router = express.Router();

module.exports = (supabase) => {
    
    router.get('/', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            // 1. Pontuação total do utilizador
            const { data: userData, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais, role')
                .eq('id_utilizador', req.session.userId)
                .single();

            const totalPontos = userData ? (userData.pontos_totais || 0) : 0;

            // Lógica de níveis (exponencial)
            let nivel = 1;
            let pontosDoNivelAtual = 0;
            let pontosParaSubir = 200;

            while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                pontosDoNivelAtual += pontosParaSubir;
                nivel++;
                pontosParaSubir = Math.floor(pontosParaSubir * 1.5);
            }

            const pontosFeitosNesteNivel = totalPontos - pontosDoNivelAtual;
            const pontosRestantes = pontosParaSubir - pontosFeitosNesteNivel;
            const progressoPerc = Math.round((pontosFeitosNesteNivel / pontosParaSubir) * 100);

            // 2. Calcular a precisão e ir buscar datas para a OFENSIVA (Streak)
            const { data: progresso, error: erroProgresso } = await supabase
                .from('progresso')
                .select(`respostas_corretas, total_perguntas, data_realizacao, atividade!inner(tipo)`)
                .eq('id_utilizador', req.session.userId)
                .eq('atividade.tipo', 'quiz');

            if (erroProgresso) throw erroProgresso;

            let totalQuizzes = 0;
            let totalCorretas = 0;
            let totalRespostas = 0;
            let ofensiva = 0;

            if (progresso && progresso.length > 0) {
                totalQuizzes = progresso.length;
                progresso.forEach(p => {
                    if (p.respostas_corretas !== null) totalCorretas += p.respostas_corretas;
                    if (p.total_perguntas !== null) totalRespostas += p.total_perguntas;
                });

                // --- CÁLCULO DA OFENSIVA  ---
                // Converter todas as datas para "Meia-Noite" para ignorar horas e fusos horários
                const diasJogados = [...new Set(progresso.map(p => {
                    const d = new Date(p.data_realizacao);
                    d.setHours(0, 0, 0, 0); // Força a ficar na meia noite do dia em que jogou
                    return d.getTime();     // Transforma num número para comparar mais facilmente
                }))];

                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                
                const ontem = new Date(hoje);
                ontem.setDate(ontem.getDate() - 1);

                let tempoCheck = hoje.getTime();

                // 1. Verifica se jogou hoje
                if (diasJogados.includes(tempoCheck)) {
                    ofensiva = 1;
                    tempoCheck = ontem.getTime(); // O próximo dia a verificar vai ser ontem
                } 
                // 2. Se não jogou hoje, verifica se jogou ontem (para a chama não morrer no início do dia)
                else if (diasJogados.includes(ontem.getTime())) {
                    ofensiva = 1;
                    const anteontem = new Date(ontem);
                    anteontem.setDate(anteontem.getDate() - 1);
                    tempoCheck = anteontem.getTime(); 
                }

                // 3. Ir recuando dia a dia até a sequência quebrar
                if (ofensiva > 0) {
                    while (true) {
                        if (diasJogados.includes(tempoCheck)) {
                            ofensiva++;
                            const diaAnterior = new Date(tempoCheck);
                            diaAnterior.setDate(diaAnterior.getDate() - 1);
                            tempoCheck = diaAnterior.getTime();
                        } else {
                            break; // A sequência quebrou, paramos de contar
                        }
                    }
                }
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

            // 4. Calcular a Posição Global (RANKING) CORRIGIDO
            let posicaoRanking = '--';
            if (userData && userData.role === 'aluno') {
                // Vai buscar todos os alunos ordenados por pontos (tal como no leaderboard)
                const { data: rankingData, error: rankErr } = await supabase
                    .from('utilizador')
                    .select('id_utilizador, pontos_totais')
                    .eq('role', 'aluno')
                    .order('pontos_totais', { ascending: false });
                    
                if (!rankErr && rankingData) {
                    // Procura em que posição (index) o nosso utilizador ficou na lista
                    const myIndex = rankingData.findIndex(u => u.id_utilizador === req.session.userId);
                    if (myIndex !== -1) {
                        posicaoRanking = myIndex + 1; // O Array começa em 0, por isso somamos 1 (ex: Index 0 = Top #1)
                    }
                }
            }

            // 5. Devolver os dados ao Frontend
            res.json({
                quizzes: totalQuizzes,
                precisao: precisao,
                respostas: totalRespostas,
                medalhas: totalMedalhas || 0,
                pontos: totalPontos,
                nivel: nivel,
                pontos_restantes: pontosRestantes,
                progresso_perc: progressoPerc,
                ofensiva: ofensiva,
                ranking: posicaoRanking
            });

        } catch (error) {
            console.error("Erro ao carregar estatísticas:", error);
            res.status(500).json({ error: "Erro interno ao carregar estatísticas." });
        }
    });

    return router;
};