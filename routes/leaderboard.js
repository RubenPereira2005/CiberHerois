const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // Função auxiliar: calcula o nível com base nos pontos
    function calcularNivel(totalPontos) {
        let nivel = 1;
        let pontosDoNivelAtual = 0;
        let pontosParaSubir = 200;
        while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
            pontosDoNivelAtual += pontosParaSubir;
            nivel++;
            pontosParaSubir = Math.floor(pontosParaSubir * 1.5);
        }
        return nivel;
    }

    // Função auxiliar: resolve o caminho do avatar
    function resolverAvatar(foto_perfil) {
        if (!foto_perfil) return '/img/default_avatar.png';
        if (foto_perfil.startsWith('http')) return foto_perfil;
        if (foto_perfil.startsWith('upload-')) return `/img/uploads/${foto_perfil}`;
        return `/img/${foto_perfil}`;
    }

    // --- ROTA: Obter as turmas disponíveis para filtrar (depende do role) ---
    router.get('/turmas', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            const { data: userData } = await supabase
                .from('utilizador')
                .select('role, id_turma')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (!userData) return res.status(404).json({ error: "Utilizador não encontrado" });

            let turmas = [];

            if (userData.role === 'aluno') {
                // Aluno só vê a sua própria turma
                if (userData.id_turma) {
                    const { data } = await supabase
                        .from('turma')
                        .select('id_turma, nome')
                        .eq('id_turma', userData.id_turma)
                        .single();
                    if (data) turmas = [data];
                }
            } else if (userData.role === 'professor') {
                // Professor vê as turmas que leciona
                const { data } = await supabase
                    .from('turma')
                    .select('id_turma, nome')
                    .eq('id_professor', req.session.userId)
                    .order('nome');
                turmas = data || [];
            } else if (userData.role === 'admin') {
                // Admin vê todas as turmas
                const { data } = await supabase
                    .from('turma')
                    .select('id_turma, nome')
                    .order('nome');
                turmas = data || [];
            }

            res.json({ turmas, role: userData.role });

        } catch (error) {
            console.error("Erro ao carregar turmas da leaderboard:", error);
            res.status(500).json({ error: "Erro interno ao carregar turmas." });
        }
    });

    // --- ROTA: Obter Top Jogadores (Global ou por Turma) ---
    router.get('/', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            const turmaId = req.query.turma_id || null;

            let query = supabase
                .from('utilizador')
                .select('id_utilizador, nome, pontos_totais, foto_perfil')
                .eq('role', 'aluno')
                .eq('priv_ranking', true)
                .order('pontos_totais', { ascending: false });

            if (turmaId) {
                // Filtrar por turma — verifica primeiro se o utilizador tem acesso à turma
                const { data: userData } = await supabase
                    .from('utilizador')
                    .select('role, id_turma')
                    .eq('id_utilizador', req.session.userId)
                    .single();

                let temAcesso = false;
                if (userData) {
                    if (userData.role === 'admin') {
                        temAcesso = true;
                    } else if (userData.role === 'professor') {
                        const { data: turma } = await supabase
                            .from('turma')
                            .select('id_professor')
                            .eq('id_turma', turmaId)
                            .single();
                        temAcesso = turma && turma.id_professor === req.session.userId;
                    } else if (userData.role === 'aluno') {
                        temAcesso = userData.id_turma && userData.id_turma.toString() === turmaId.toString();
                    }
                }

                if (!temAcesso) {
                    return res.status(403).json({ error: "Não tens acesso a esta turma." });
                }

                query = query.eq('id_turma', turmaId).limit(50);
            } else {
                query = query.limit(10);
            }

            const { data: utilizadores, error } = await query;
            if (error) throw error;

            const ranking = utilizadores.map((user, index) => {
                const totalPontos = user.pontos_totais || 0;
                return {
                    id_utilizador: user.id_utilizador,
                    posicao: index + 1,
                    nome: user.nome,
                    pontos: totalPontos,
                    nivel: calcularNivel(totalPontos),
                    avatar: resolverAvatar(user.foto_perfil),
                    eOUtilizador: user.id_utilizador === req.session.userId
                };
            });

            res.json(ranking);

        } catch (error) {
            console.error("Erro ao carregar Leaderboard:", error);
            res.status(500).json({ error: "Erro interno ao carregar ranking." });
        }
    });

    return router;
};