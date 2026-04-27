const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- UTILITÁRIO: Atribuir uma medalha (seguro, sem duplicados) ---
    async function atribuirMedalha(id_utilizador, id_medalha) {
        // Verifica se já tem a medalha
        const { data: jatem } = await supabase
            .from('utilizador_medalha')
            .select('id_medalha')
            .eq('id_utilizador', id_utilizador)
            .eq('id_medalha', id_medalha)
            .maybeSingle();

        if (jatem) return false; // Ja tinha, nao atribui de novo

        const { error } = await supabase
            .from('utilizador_medalha')
            .insert({ id_utilizador, id_medalha });

        if (error) {
            console.error(`[Medalhas] Erro ao atribuir medalha ${id_medalha}:`, error.message);
            return false;
        }
        return true;
    }

    // --- ROTA 1: Listar as medalhas do utilizador autenticado ---
    router.get('/mine', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });

        try {
            // Vai buscar todas as medalhas existentes na base de dados
            const { data: todasMedalhas, error: erroTodas } = await supabase
                .from('medalha')
                .select('id_medalha, nome, descricao, icone, imagem_url')
                .order('id_medalha', { ascending: true });

            if (erroTodas) throw erroTodas;

            // Vai buscar as medalhas que o utilizador ja desbloqueou
            const { data: conquistadas, error: erroConq } = await supabase
                .from('utilizador_medalha')
                .select('id_medalha, data_conquista')
                .eq('id_utilizador', req.session.userId);

            if (erroConq) throw erroConq;

            // Cria um mapa para lookup rapido por id
            const conquistadasMap = {};
            (conquistadas || []).forEach(c => {
                conquistadasMap[c.id_medalha] = c.data_conquista;
            });

            // Combina todas as medalhas com o estado de desbloqueio do utilizador
            const resultado = (todasMedalhas || []).map(m => ({
                id_medalha: m.id_medalha,
                nome: m.nome,
                descricao: m.descricao,
                icone: m.icone || '🏅',
                imagem_url: m.imagem_url || null,
                desbloqueada: !!conquistadasMap[m.id_medalha],
                data_conquista: conquistadasMap[m.id_medalha] || null
            }));

            res.json(resultado);
        } catch (err) {
            console.error('[Medalhas] Erro ao carregar medalhas:', err.message);
            res.status(500).json({ error: 'Erro ao carregar medalhas.' });
        }
    });

    // --- ROTA 2: Medalhas PÚBLICAS de outro utilizador (respeita privacidade) ---
    router.get('/public/:id', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
        const targetId = req.params.id;

        try {
            // Verificar privacidade
            const { data: user } = await supabase
                .from('utilizador')
                .select('priv_perfil_publico, priv_medalhas')
                .eq('id_utilizador', targetId)
                .single();

            if (!user || user.priv_perfil_publico === false || user.priv_medalhas === false) {
                return res.status(403).json({ error: 'Privacidade ativa.' });
            }

            // Mostra apenas as medalhas que o utilizador ja desbloqueou
            const { data: conquistadas } = await supabase
                .from('utilizador_medalha')
                .select('id_medalha, data_conquista, medalha(nome, descricao, icone, imagem_url)')
                .eq('id_utilizador', targetId);

            const resultado = (conquistadas || []).map(c => ({
                id_medalha: c.id_medalha,
                nome: c.medalha.nome,
                descricao: c.medalha.descricao,
                icone: c.medalha.icone || '🏅',
                imagem_url: c.medalha.imagem_url || null,
                desbloqueada: true,
                data_conquista: c.data_conquista
            }));

            res.json(resultado);
        } catch (err) {
            console.error('[Medalhas] Erro no perfil público:', err.message);
            res.status(500).json({ error: 'Erro ao carregar medalhas.' });
        }
    });

    // Verifica e atribui medalhas manualmente (util para chamadas internas ou de teste)
    router.post('/verificar', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });

        const novasMedalhas = await verificarEAtribuirMedalhas(supabase, req.session.userId);
        res.json({ novas_medalhas: novasMedalhas });
    });

    return router;
};

// ==========================================================
// FUNCAO EXPORTADA PARA USO INTERNO
// Verifica as condicoes de todas as medalhas e atribui as que se aplicam
// ==========================================================
async function verificarEAtribuirMedalhas(supabase, id_utilizador) {
    const novasMedalhas = [];

    try {
        // Vai buscar todas as medalhas da base de dados para mapear pelo nome
        const { data: medalhasDB } = await supabase
            .from('medalha')
            .select('id_medalha, nome')
            .order('id_medalha', { ascending: true });

        if (!medalhasDB || medalhasDB.length === 0) return novasMedalhas;

        // Mapear por nome para identificar facilmente
        const medalhaMap = {};
        medalhasDB.forEach(m => { medalhaMap[m.nome] = m.id_medalha; });

        // --- 1. MEDALHA: "Guardião Digital" (MFA ativo) ---
        const idGuardiao = medalhaMap['Guardião Digital'];
        if (idGuardiao) {
            const { data: user } = await supabase
                .from('utilizador')
                .select('mfa_ativo')
                .eq('id_utilizador', id_utilizador)
                .single();

            if (user && user.mfa_ativo) {
                const atribuida = await atribuirMedalhaUtil(supabase, id_utilizador, idGuardiao);
                if (atribuida) novasMedalhas.push({ nome: 'Guardião Digital', icone: '🔐' });
            }
        }

        // Vai buscar o progresso do utilizador para verificar as restantes condicoes
        const { data: progressoList } = await supabase
            .from('progresso')
            .select('respostas_corretas, total_perguntas, atividade!inner(categoria, dificuldade)')
            .eq('id_utilizador', id_utilizador);

        if (!progressoList || progressoList.length === 0) return novasMedalhas;

        // --- 2. MEDALHA: "Pontuação Perfeita" (100% numa tentativa) ---
        const idPerfeita = medalhaMap['Pontuação Perfeita'];
        if (idPerfeita) {
            const temPerfeita = progressoList.some(p =>
                p.total_perguntas > 0 && p.respostas_corretas === p.total_perguntas
            );
            if (temPerfeita) {
                const atribuida = await atribuirMedalhaUtil(supabase, id_utilizador, idPerfeita);
                if (atribuida) novasMedalhas.push({ nome: 'Pontuação Perfeita', icone: '⭐' });
            }
        }

        // --- Medalha: 'Mestre Completo' (todas as dificuldades de uma categoria concluidas) ---
        const idMestre = medalhaMap['Mestre Completo'];
        if (idMestre) {
            // Agrupa por categoria as dificuldades concluidas pelo utilizador
            const categorias = {};
            progressoList.forEach(p => {
                if (!p.atividade) return;
                const cat = p.atividade.categoria.trim().toLowerCase();
                const diff = p.atividade.dificuldade.trim().toLowerCase();
                if (!categorias[cat]) categorias[cat] = new Set();
                categorias[cat].add(diff);
            });

            // Verifica se alguma categoria tem as tres dificuldades concluidas
            const temMestre = Object.values(categorias).some(diffs =>
                diffs.has('facil') && diffs.has('medio') && diffs.has('dificil')
            );

            if (temMestre) {
                const atribuida = await atribuirMedalhaUtil(supabase, id_utilizador, idMestre);
                if (atribuida) novasMedalhas.push({ nome: 'Mestre Completo', icone: '🏆' });
            }
        }

    } catch (err) {
        console.error('[Medalhas] Erro na verificação automática:', err.message);
    }

    return novasMedalhas;
}

// Utilitário interno (não exposto como rota)
async function atribuirMedalhaUtil(supabase, id_utilizador, id_medalha) {
    const { data: jatem } = await supabase
        .from('utilizador_medalha')
        .select('id_medalha')
        .eq('id_utilizador', id_utilizador)
        .eq('id_medalha', id_medalha)
        .maybeSingle();

    if (jatem) return false;

    const { error } = await supabase
        .from('utilizador_medalha')
        .insert({ id_utilizador, id_medalha });

    return !error;
}

module.exports.verificarEAtribuirMedalhas = verificarEAtribuirMedalhas;
