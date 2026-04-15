const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- ROTA 1: Obter emails aleatórios para o simulador ---
    router.get('/emails', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 5;

            const { data: emails, error } = await supabase
                .from('simulador_phishing')
                .select('id_email, remetente, assunto, corpo, e_phishing, dificuldade, indicadores');

            if (error) throw error;
            if (!emails || emails.length === 0) {
                return res.status(404).json({ error: 'Nenhum email encontrado na base de dados.' });
            }

            // Baralhar os emails (Fisher-Yates shuffle)
            for (let i = emails.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [emails[i], emails[j]] = [emails[j], emails[i]];
            }

            // Devolver apenas a quantidade pedida
            const emailsSelecionados = emails.slice(0, Math.min(limit, emails.length));

            res.json(emailsSelecionados);
        } catch (err) {
            console.error('Erro ao carregar emails de phishing:', err.message);
            res.status(500).json({ error: 'Erro ao carregar emails do simulador.' });
        }
    });

    // --- ROTA 2: Guardar o score do simulador ---
    router.post('/save-score', async (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Utilizador não autenticado' });
        }

        const { acertos, total_emails } = req.body;

        if (acertos === undefined || total_emails === undefined) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        try {
            // Calcular pontos: 20 XP por acerto
            const pontosGanhos = acertos * 20;

            // Calcular moedas: 5 moedas por acerto
            const moedasGanhas = acertos * 5;

            // Atualizar os pontos e moedas do utilizador
            const { data: userData, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais, coins')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (userError) throw userError;

            if (userData) {
                const { error: updateError } = await supabase
                    .from('utilizador')
                    .update({
                        pontos_totais: (userData.pontos_totais || 0) + pontosGanhos,
                        coins: (userData.coins || 0) + moedasGanhas
                    })
                    .eq('id_utilizador', req.session.userId);

                if (updateError) throw updateError;
            }

            res.json({
                message: 'Score guardado com sucesso!',
                pontos_ganhos: pontosGanhos,
                moedas_ganhas: moedasGanhas
            });
        } catch (err) {
            console.error('Erro ao guardar score do simulador:', err.message);
            res.status(500).json({ error: 'Erro ao guardar o score.' });
        }
    });

    return router;
};
