const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = (supabase) => {

    // Função para gerar um código aleatório de 6 caracteres
    const gerarCodigoAcesso = () => {
        const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let codigo = '';
        for (let i = 0; i < 6; i++) {
            codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        return codigo;
    };

    // Middleware de seguranca: permite acesso apenas a utilizadores com role de professor ou admin
    const verificarProfessor = async (req, res, next) => {
        if (!req.session.userId) return res.redirect('/404.html');

        const { data: user, error } = await supabase.from('utilizador').select('role, nome').eq('id_utilizador', req.session.userId).single();

        if (error || !user || (user.role !== 'professor' && user.role !== 'admin')) return res.redirect('/404.html');

        // Guarda o nome do professor na request para uso nas rotas seguintes
        req.nomeProfessor = user.nome;

        next();
    };

    // ==========================================
    // LÓGICA DE TURMAS (ESQUADRÕES)
    // ==========================================

    router.get('/turmas', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase.from('turma').select('id_turma, nome, ano_letivo, codigo_acesso, escola (nome)').eq('id_professor', req.session.userId).order('id_turma', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.post('/turmas', verificarProfessor, async (req, res) => {
        const { nome, ano_letivo } = req.body;
        try {
            const { data: escolas } = await supabase.from('escola').select('id_escola').limit(1);
            const id_escola = (escolas && escolas.length > 0) ? escolas[0].id_escola : null;
            if (!id_escola) return res.status(400).json({ error: 'Nenhuma escola registada no sistema.' });

            const codigo_acesso = gerarCodigoAcesso();
            const { data, error } = await supabase.from('turma').insert([{ nome, ano_letivo, id_escola, id_professor: req.session.userId, codigo_acesso }]).select();
            if (error) throw error;
            res.json({ message: 'Turma criada!', turma: data[0] });
        } catch (err) { res.status(500).json({ error: 'Erro interno ao criar turma.' }); }
    });

    router.put('/turmas/:id', verificarProfessor, async (req, res) => {
        const { nome, ano_letivo } = req.body;
        try {
            const { error } = await supabase.from('turma').update({ nome, ano_letivo }).eq('id_turma', req.params.id).eq('id_professor', req.session.userId);
            if (error) throw error;
            res.json({ message: 'Turma atualizada com sucesso!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.get('/turmas/:id/alunos', verificarProfessor, async (req, res) => {
        const { data: turma } = await supabase.from('turma').select('id_professor').eq('id_turma', req.params.id).single();
        if (!turma || (turma.id_professor !== req.session.userId && req.session.role !== 'admin')) return res.status(403).json({ error: 'Acesso negado' });
        const { data, error } = await supabase.from('utilizador').select('id_utilizador, nome, email, pontos_totais').eq('id_turma', req.params.id).order('nome', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.put('/turmas/:id_turma/alunos/:id_aluno/remover', verificarProfessor, async (req, res) => {
        try {
            const { data: turma } = await supabase.from('turma').select('id_professor').eq('id_turma', req.params.id_turma).single();
            if (!turma || turma.id_professor !== req.session.userId) return res.status(403).json({ error: 'Acesso negado a esta turma.' });
            const { error } = await supabase.from('utilizador').update({ id_turma: null }).eq('id_utilizador', req.params.id_aluno);
            if (error) throw error;
            res.json({ message: 'Aluno removido com sucesso!' });
        } catch (error) { res.status(500).json({ error: "Erro na base de dados." }); }
    });


    // ==========================================
    // ROTAS DE RECURSOS
    // ==========================================

    router.get('/resources', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').eq('id_professor', req.session.userId);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.post('/resources', verificarProfessor, async (req, res) => {
        const payload = { ...req.body, id_professor: req.session.userId };
        if (payload.seccoes && typeof payload.seccoes !== 'string') {
            payload.seccoes = JSON.stringify(payload.seccoes);
        }

        const { data, error } = await supabase.from('materialpedagogico').insert([payload]).select();
        if (error) {
            console.error("ERRO AO CRIAR RECURSO:", error);
            return res.status(500).json({ error: error.message });
        }
        res.json(data[0]);
    });

    router.put('/resources/:id', verificarProfessor, async (req, res) => {
        const payload = { ...req.body };
        if (payload.seccoes && typeof payload.seccoes !== 'string') {
            payload.seccoes = JSON.stringify(payload.seccoes);
        }

        const { error } = await supabase.from('materialpedagogico').update(payload).eq('id_material', req.params.id).eq('id_professor', req.session.userId);
        if (error) {
            console.error("ERRO AO ATUALIZAR RECURSO:", error);
            return res.status(500).json({ error: error.message });
        }
        res.json({ message: 'Recurso atualizado na Base de Dados!' });
    });

    router.delete('/resources/:id', verificarProfessor, async (req, res) => {
        const { error } = await supabase.from('materialpedagogico').delete().eq('id_material', req.params.id).eq('id_professor', req.session.userId);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Recurso apagado da base de dados!' });
    });

    // ==========================================================
    // QUIZZES DO PROFESSOR
    // ==========================================================

    router.get('/quizzes', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase
            .from('pergunta')
            .select(`id_pergunta, texto_pergunta, pontos_pergunta, atividade!inner(id_atividade, categoria, dificuldade, id_professor)`)
            .eq('atividade.id_professor', req.session.userId)
            .order('id_pergunta', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        const formatado = data.map(p => ({
            id_pergunta: p.id_pergunta,
            texto_pergunta: p.texto_pergunta,
            categoria: p.atividade.categoria,
            dificuldade: p.atividade.dificuldade,
            id_atividade: p.atividade.id_atividade
        }));
        res.json(formatado);
    });

    router.get('/quizzes/:id', verificarProfessor, async (req, res) => {
        try {
            const { data: pergunta, error } = await supabase
                .from('pergunta')
                .select('*, atividade!inner(id_atividade, categoria, dificuldade, id_professor)')
                .eq('id_pergunta', req.params.id)
                .eq('atividade.id_professor', req.session.userId)
                .single();

            if (error || !pergunta) return res.status(404).json({ error: 'Pergunta não encontrada' });

            const { data: opcoes } = await supabase
                .from('opcao_resposta')
                .select('*')
                .eq('id_pergunta', req.params.id)
                .order('id_opcao', { ascending: true });

            res.json({ pergunta, opcoes });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    // Localiza a atividade existente para a categoria/dificuldade do professor, ou cria-a automaticamente
    async function obterAtividadeEPontos(categoria, dificuldade, id_professor) {
        let { data: ativ } = await supabase.from('atividade')
            .select('id_atividade, pontos')
            .ilike('categoria', categoria.trim())
            .ilike('dificuldade', dificuldade.trim())
            .eq('tipo', 'quiz')
            .eq('id_professor', id_professor) // Garante que a atividade pertence a este professor
            .limit(1)
            .maybeSingle();

        let id_atividade;
        let pontos_pergunta = 10;

        if (ativ) {
            id_atividade = ativ.id_atividade;
            let { data: perg } = await supabase.from('pergunta')
                .select('pontos_pergunta')
                .eq('id_atividade', id_atividade)
                .limit(1)
                .maybeSingle();

            if (perg && perg.pontos_pergunta) {
                pontos_pergunta = perg.pontos_pergunta;
            } else if (ativ.pontos) {
                pontos_pergunta = Math.round(ativ.pontos / 5);
            } else {
                if (dificuldade === 'medio') pontos_pergunta = 20;
                if (dificuldade === 'dificil') pontos_pergunta = 30;
            }
        } else {
            let pontosAtiv = 50;
            if (dificuldade === 'medio') { pontosAtiv = 100; pontos_pergunta = 20; }
            else if (dificuldade === 'dificil') { pontosAtiv = 150; pontos_pergunta = 30; }

            const { data: newAtiv, error } = await supabase.from('atividade').insert([{
                titulo: `Treino de ${categoria} (${dificuldade})`,
                tipo: 'quiz',
                categoria: categoria.trim().toLowerCase(),
                descricao: 'Criado pelo Professor',
                dificuldade: dificuldade.trim().toLowerCase(),
                pontos: pontosAtiv,
                id_professor
            }]).select('id_atividade').single();

            if (error) throw error;
            id_atividade = newAtiv.id_atividade;
        }

        return { id_atividade, pontos_pergunta };
    }

    router.post('/quiz', verificarProfessor, async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        const id_professor = req.session.userId;

        try {
            const { id_atividade, pontos_pergunta } = await obterAtividadeEPontos(categoria, dificuldade, id_professor);

            const { data: perg, error: errPerg } = await supabase.from('pergunta').insert([{
                id_atividade,
                texto_pergunta,
                pontos_pergunta
            }]).select('id_pergunta').single();
            if (errPerg) throw errPerg;

            const opsToInsert = opcoes.map((op, idx) => ({
                id_pergunta: perg.id_pergunta,
                texto_opcao: op,
                e_correta: idx.toString() === corretaIndex.toString()
            }));
            await supabase.from('opcao_resposta').insert(opsToInsert);

            res.json({ message: 'Pergunta criada com sucesso!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.put('/quizzes/:id', verificarProfessor, async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        const id_professor = req.session.userId;

        try {
            // Verifica se a pergunta pertence ao professor autenticado antes de editar
            const { data: check } = await supabase.from('pergunta').select('atividade!inner(id_professor)').eq('id_pergunta', req.params.id).single();
            if (!check || check.atividade.id_professor !== id_professor) return res.status(403).json({ error: 'Acesso negado' });

            const { id_atividade, pontos_pergunta } = await obterAtividadeEPontos(categoria, dificuldade, id_professor);

            // Atualiza o texto e move a pergunta para a atividade correta
            await supabase.from('pergunta')
                .update({ texto_pergunta, id_atividade, pontos_pergunta })
                .eq('id_pergunta', req.params.id);

            // Elimina as opcoes antigas e insere as novas
            await supabase.from('opcao_resposta').delete().eq('id_pergunta', req.params.id);

            const opsToInsert = opcoes.map((op, idx) => ({
                id_pergunta: req.params.id,
                texto_opcao: op,
                e_correta: idx.toString() === corretaIndex.toString()
            }));
            await supabase.from('opcao_resposta').insert(opsToInsert);

            res.json({ message: 'Pergunta atualizada!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.delete('/quizzes/:id', verificarProfessor, async (req, res) => {
        try {
            const { data: check } = await supabase.from('pergunta').select('atividade!inner(id_professor)').eq('id_pergunta', req.params.id).single();
            if (!check || check.atividade.id_professor !== req.session.userId) return res.status(403).json({ error: 'Acesso negado' });

            await supabase.from('pergunta').delete().eq('id_pergunta', req.params.id);
            res.json({ message: 'Pergunta apagada!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });


    // Devolve as categorias e dificuldades unicas para preencher os filtros do formulario
    router.get('/opcoes-quiz', async (req, res) => {
        try {
            const { data, error } = await supabase.from('atividade').select('categoria, dificuldade').eq('tipo', 'quiz');
            if (error) throw error;

            const categorias = [...new Set(data.map(item => item.categoria))].filter(Boolean).sort();
            const dificuldades = [...new Set(data.map(item => item.dificuldade))].filter(Boolean);

            res.json({ categorias, dificuldades });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    
    // Gera 3 opcoes de resposta para uma pergunta usando IA Gemini, incluindo a resposta correta
    router.post('/generate-options', async (req, res) => {
        
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });

        const { pergunta } = req.body;
        
        if (!pergunta || pergunta.trim().length < 5) {
            return res.status(400).json({ error: "Escreve uma pergunta com sentido primeiro." });
        }

        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-3.0-flash" });

            const prompt = `És um professor de cibersegurança a criar um quiz.
            A tua tarefa é gerar 3 opções de resposta curtas e diretas para a seguinte pergunta: "${pergunta}".
            Exatamente 1 tem de ser a resposta correta, e 2 têm de ser respostas incorretas mas muito plausíveis para enganar o aluno.
            
            Responde APENAS em formato JSON válido e limpo, sem mais texto ou formatação (sem \`\`\`json). Usa a seguinte estrutura exata:
            {
                "opcoes": ["Texto da opção 1", "Texto da opção 2", "Texto da opção 3"],
                "corretaIndex": 0 // Tem de ser 0, 1 ou 2, correspondendo à posição da resposta certa no array "opcoes"
            }`;

            const result = await model.generateContent(prompt);
            let text = result.response.text();
            
            // Remove formatacao Markdown que a IA possa ter adicionado
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const jsonResposta = JSON.parse(text);
            res.json(jsonResposta);
            
        } catch (error) {
            console.error("Erro na IA ao gerar opções:", error);
            res.status(500).json({ error: "O Ciber-Mentor está com problemas de comunicação. Tenta novamente!" });
        }
    });

    return router;
};