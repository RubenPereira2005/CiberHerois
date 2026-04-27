const express = require('express');
const router = express.Router();

module.exports = (supabase) => {
    
    // --- ROTA: Obter Top 10 Jogadores ---
    router.get('/', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            // Vai buscar os alunos ordenados por pontos, apenas os que consentiram aparecer no ranking
            const { data: utilizadores, error } = await supabase
                .from('utilizador')
                .select('id_utilizador, nome, pontos_totais, foto_perfil')
                .eq('role', 'aluno')
                .eq('priv_ranking', true)
                .order('pontos_totais', { ascending: false })
                .limit(10);

            if (error) throw error;

            // Calcula o nivel e formata o caminho do avatar para cada utilizador
            const ranking = utilizadores.map((user, index) => {
                let totalPontos = user.pontos_totais || 0;
                
                // Calculo progressivo de niveis com crescimento exponencial
                let nivel = 1;
                let pontosDoNivelAtual = 0;
                let pontosParaSubir = 200;

                while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                    pontosDoNivelAtual += pontosParaSubir; 
                    nivel++;
                    pontosParaSubir = Math.floor(pontosParaSubir * 1.5); 
                }

                // Determina o caminho correto da imagem do avatar
                let avatarFinal = '/img/default_avatar.png';
                if (user.foto_perfil) {
                    if (user.foto_perfil.startsWith('http')) {
                        avatarFinal = user.foto_perfil;
                    } else if (user.foto_perfil.startsWith('upload-')) {
                        avatarFinal = `/img/uploads/${user.foto_perfil}`;
                    } else {
                        avatarFinal = `/img/${user.foto_perfil}`;
                    }
                }

                return {
                    id_utilizador: user.id_utilizador,
                    posicao: index + 1,
                    nome: user.nome,
                    pontos: totalPontos,
                    nivel: nivel,
                    avatar: avatarFinal,
                    // Indica se a entrada pertence ao utilizador que esta a ver o ranking
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