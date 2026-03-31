const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // ==========================================
    // MIDDLEWARE DE SEGURANÇA: Apenas ADMIN
    // ==========================================
    const verificarAdmin = async (req, res, next) => {
        if (!req.session.userId) return res.redirect('/404');

        const { data: user, error } = await supabase
            .from('utilizador')
            .select('role')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !user || user.role !== 'admin') return res.redirect('/404');
        next();
    };


    // ==========================================
    // RECURSOS
    // ==========================================

    router.get('/resources', async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').order('id_material', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    });

    router.get('/resources/:id', async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').eq('id_material', req.params.id).single();
        if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
        res.json(data);
    });

    router.post('/resources', async (req, res) => {
        const { titulo, descricao, tipo, cor_card, icone_card, url_conteudo, seccoes } = req.body;
        const id_professor = req.session.userId || 1;

        const seccoesStr = JSON.stringify(seccoes);
        const tipoMinusculo = tipo.toLowerCase();

        const { error } = await supabase.from('materialpedagogico').insert([{
            titulo, descricao, tipo: tipoMinusculo, cor_card, icone_card, url_conteudo, id_professor, seccoes: seccoesStr
        }]);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Recurso criado com sucesso!' });
    });

    router.put('/resources/:id', async (req, res) => {
        const { titulo, descricao, tipo, cor_card, icone_card, url_conteudo, seccoes } = req.body;
        const id = req.params.id;

        const seccoesStr = JSON.stringify(seccoes);
        const tipoMinusculo = tipo.toLowerCase();

        try {
            const { error } = await supabase.from('materialpedagogico').update({
                titulo, descricao, tipo: tipoMinusculo, cor_card, icone_card, url_conteudo, seccoes: seccoesStr
            }).eq('id_material', id);

            if (error) return res.status(500).json({ error: error.message });
            res.json({ message: 'Recurso atualizado!' });
        } catch (err) { res.status(500).json({ error: "Erro ao atualizar recurso." }); }
    });

    router.delete('/resources/:id', async (req, res) => {
        const { error } = await supabase.from('materialpedagogico').delete().eq('id_material', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Apagado!' });
    });

    // ==========================================
    // QUIZZES: Lógica de Mudança Dinâmica
    // ==========================================

    router.get('/quizzes', async (req, res) => {
        const { data, error } = await supabase
            .from('pergunta')
            .select('id_pergunta, texto_pergunta, atividade!inner(categoria, dificuldade)')
            .order('id_pergunta', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        const formatado = data.map(p => ({
            id_pergunta: p.id_pergunta,
            categoria: p.atividade.categoria,
            dificuldade: p.atividade.dificuldade,
            texto_pergunta: p.texto_pergunta
        }));
        res.json(formatado);
    });

    router.get('/quizzes/:id', async (req, res) => {
        const { data: pData, error: pErr } = await supabase
            .from('pergunta')
            .select('id_pergunta, texto_pergunta, atividade!inner(id_atividade, categoria, dificuldade)')
            .eq('id_pergunta', req.params.id)
            .single();

        if (pErr || !pData) return res.status(404).json({ error: "Não encontrado" });

        const { data: oData, error: oErr } = await supabase
            .from('opcao_resposta')
            .select('texto_opcao, e_correta')
            .eq('id_pergunta', req.params.id)
            .order('id_opcao', { ascending: true });

        if (oErr) return res.status(500).json({ error: oErr.message });

        res.json({
            pergunta: {
                id_pergunta: pData.id_pergunta,
                texto_pergunta: pData.texto_pergunta,
                id_atividade: pData.atividade.id_atividade,
                categoria: pData.atividade.categoria,
                dificuldade: pData.atividade.dificuldade
            },
            opcoes: oData
        });
    });

    // Procura Atividade + Procura Pontuação Automática
    async function obterAtividadeEPontos(categoria, dificuldade, id_professor) {
        let { data: ativ } = await supabase.from('atividade')
            .select('id_atividade, pontos')
            .ilike('categoria', categoria.trim())
            .ilike('dificuldade', dificuldade.trim())
            .eq('tipo', 'quiz')
            .limit(1)
            .maybeSingle();

        let id_atividade;
        let pontos_pergunta = 10; // Fallback

        if (ativ) {
            id_atividade = ativ.id_atividade;
            // Procurar uma pergunta desta atividade para descobrir o valor exato dos pontos nela!
            let { data: perg } = await supabase.from('pergunta')
                .select('pontos_pergunta')
                .eq('id_atividade', id_atividade)
                .limit(1)
                .maybeSingle();

            if (perg && perg.pontos_pergunta) {
                pontos_pergunta = perg.pontos_pergunta; // Copia o valor da BD
            } else if (ativ.pontos) {
                // Se não houver perguntas, divide os pontos globais por 5 (como configuraste na DB)
                pontos_pergunta = Math.round(ativ.pontos / 5);
            } else {
                if (dificuldade === 'medio') pontos_pergunta = 20;
                if (dificuldade === 'dificil') pontos_pergunta = 30;
            }
        } else {
            // Se a Atividade ainda não existir, cria-a com as tuas regras
            let pontosAtiv = 50;
            if (dificuldade === 'medio') { pontosAtiv = 100; pontos_pergunta = 20; }
            else if (dificuldade === 'dificil') { pontosAtiv = 150; pontos_pergunta = 30; }
            else { pontosAtiv = 50; pontos_pergunta = 10; }

            const { data: newAtiv, error } = await supabase.from('atividade').insert([{
                titulo: `Quiz de ${categoria} (${dificuldade})`,
                tipo: 'quiz',
                categoria: categoria.trim().toLowerCase(),
                descricao: 'Gerado via Admin',
                dificuldade: dificuldade.trim().toLowerCase(),
                pontos: pontosAtiv,
                id_professor
            }]).select('id_atividade').single();

            if (error) throw error;
            id_atividade = newAtiv.id_atividade;
        }

        return { id_atividade, pontos_pergunta };
    }

    router.post('/quiz', async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        const id_professor = req.session.userId || 1;

        try {
            // Usa o sistema automático
            const { id_atividade, pontos_pergunta } = await obterAtividadeEPontos(categoria, dificuldade, id_professor);

            // Insere Pergunta
            const { data: perg, error: pergErr } = await supabase.from('pergunta').insert([{
                id_atividade: id_atividade,
                texto_pergunta,
                pontos_pergunta: pontos_pergunta // Envia a pontuação para a DB!
            }]).select('id_pergunta').single();
            if (pergErr) throw pergErr;

            // Insere Opções
            const opcoesArray = opcoes.map((texto, index) => ({
                id_pergunta: perg.id_pergunta,
                texto_opcao: texto,
                e_correta: index === parseInt(corretaIndex)
            }));
            const { error: opcErr } = await supabase.from('opcao_resposta').insert(opcoesArray);
            if (opcErr) throw opcErr;

            res.json({ message: 'Criado!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.put('/quizzes/:id', async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        const id_professor = req.session.userId || 1;

        try {
            // Obter dados dinâmicos
            const { id_atividade, pontos_pergunta } = await obterAtividadeEPontos(categoria, dificuldade, id_professor);

            // MOVE a pergunta e ATUALIZA a pontuação, deixando o resto quieto
            const { error: pergErr } = await supabase.from('pergunta')
                .update({
                    texto_pergunta,
                    id_atividade: id_atividade,
                    pontos_pergunta: pontos_pergunta
                }).eq('id_pergunta', req.params.id);
            if (pergErr) throw pergErr;

            // Apagar opções velhas e Inserir Novas
            const { error: delErr } = await supabase.from('opcao_resposta')
                .delete().eq('id_pergunta', req.params.id);
            if (delErr) throw delErr;

            const opcoesArray = opcoes.map((texto, index) => ({
                id_pergunta: req.params.id,
                texto_opcao: texto,
                e_correta: index === parseInt(corretaIndex)
            }));
            const { error: opcErr } = await supabase.from('opcao_resposta').insert(opcoesArray);
            if (opcErr) throw opcErr;

            res.json({ message: 'Atualizado!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.delete('/quizzes/:id', async (req, res) => {
        const { error } = await supabase.from('pergunta').delete().eq('id_pergunta', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Pergunta apagada!' });
    });


    // ==========================================
    // TURMAS
    // ==========================================
    const gerarCodigoAcesso = () => {
        const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let codigo = '';
        for (let i = 0; i < 6; i++) codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        return codigo;
    };

    router.get('/turmas', verificarAdmin, async (req, res) => {
        const { data, error } = await supabase
            .from('turma')
            .select(`id_turma, nome, ano_letivo, codigo_acesso, escola (nome), utilizador!turma_id_professor_fkey (nome)`)
            .order('id_turma', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    });

    router.get('/professores', verificarAdmin, async (req, res) => {
        const { data, error } = await supabase.from('utilizador').select('id_utilizador, nome').eq('role', 'professor');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    });

    router.post('/turmas', verificarAdmin, async (req, res) => {
        const { nome, ano_letivo, id_professor } = req.body;
        try {
            const { data: escolas } = await supabase.from('escola').select('id_escola').limit(1);
            const id_escola = (escolas && escolas.length > 0) ? escolas[0].id_escola : null;
            if (!id_escola) return res.status(400).json({ error: 'Nenhuma escola registada.' });
            const { error } = await supabase.from('turma').insert([{ nome, ano_letivo, id_escola, id_professor, codigo_acesso: gerarCodigoAcesso() }]);
            if (error) throw error;
            res.json({ message: 'Turma criada!' });
        } catch (err) { res.status(500).json({ error: 'Erro interno.' }); }
    });

    router.put('/turmas/:id', verificarAdmin, async (req, res) => {
        const { nome, ano_letivo, id_escola, id_professor } = req.body;
        const { error } = await supabase.from('turma').update({ nome, ano_letivo, id_escola, id_professor }).eq('id_turma', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Turma atualizada!' });
    });

    router.delete('/turmas/:id', verificarAdmin, async (req, res) => {
        const { error } = await supabase.from('turma').delete().eq('id_turma', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Apagada!' });
    });

    router.get('/turmas/:id/alunos', verificarAdmin, async (req, res) => {
        const { data, error } = await supabase.from('utilizador').select('id_utilizador, nome, email, pontos_totais').eq('id_turma', req.params.id).order('nome');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.put('/turmas/:id_turma/alunos/:id_aluno/remover', verificarAdmin, async (req, res) => {
        try {
            const { error } = await supabase.from('utilizador').update({ id_turma: null }).eq('id_utilizador', req.params.id_aluno);
            if (error) throw error;
            res.json({ message: 'Aluno removido!' });
        } catch (error) { res.status(500).json({ error: "Erro interno." }); }
    });

    router.get('/escolas', verificarAdmin, async (req, res) => {
        const { data, error } = await supabase.from('escola').select('*').order('nome');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });


    // --- ROTA DINÂMICA DE OPÇÕES (ESCALÁVEL) ---
    router.get('/opcoes-quiz', async (req, res) => {
        try {
            // Vai buscar tudo à tabela atividade
            const { data, error } = await supabase.from('atividade').select('categoria, dificuldade').eq('tipo', 'quiz');
            if (error) throw error;

            // Remove os duplicados automaticamente (cria arrays únicos)
            const categorias = [...new Set(data.map(item => item.categoria))].filter(Boolean).sort();
            const dificuldades = [...new Set(data.map(item => item.dificuldade))].filter(Boolean);

            res.json({ categorias, dificuldades });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};