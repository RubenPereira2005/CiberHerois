const express = require('express');
const router = express.Router();

module.exports = (supabase) => {
    
    // --- ROTA: Obter Top 10 Jogadores ---
    router.get('/', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            // 1. Ir buscar os utilizadores à base de dados, ordenados por pontos
            const { data: utilizadores, error } = await supabase
                .from('utilizador')
                .select('id_utilizador, nome, pontos_totais, foto_perfil')
                .eq('role', 'aluno')
                // Só puxa quem ativou a opção de aparecer no ranking
                .eq('priv_ranking', true) 
                .order('pontos_totais', { ascending: false }) // Do maior para o menor
                .limit(10); // Mostra o Top 10

            if (error) throw error;

            // 2. Tratar os dados (Calcular níveis e formatar imagem)
            const ranking = utilizadores.map((user, index) => {
                let totalPontos = user.pontos_totais || 0;
                
                // Matemática Progressiva dos Níveis
                let nivel = 1;
                let pontosDoNivelAtual = 0; 
                let pontosParaSubir = 200;  

                while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                    pontosDoNivelAtual += pontosParaSubir; 
                    nivel++;
                    pontosParaSubir = Math.floor(pontosParaSubir * 1.5); 
                }

                // Definir caminho correto do Avatar
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
                    posicao: index + 1, // 1º, 2º, 3º, etc.
                    nome: user.nome,
                    pontos: totalPontos,
                    nivel: nivel,
                    avatar: avatarFinal,
                    // Permite destacar a linha se for o próprio utilizador a ver a tabela
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