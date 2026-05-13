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
        const { data, error } = await supabase.from('turma').select('id_turma, nome, ano_letivo, codigo_acesso, id_escola, escola (nome)').eq('id_professor', req.session.userId).order('id_turma', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.post('/turmas', verificarProfessor, async (req, res) => {
        const { nome, ano_letivo, id_escola } = req.body;
        try {
            let escolaId = id_escola;
            // Se não foi fornecida uma escola, tenta usar a primeira disponível (fallback)
            if (!escolaId) {
                const { data: escolas } = await supabase.from('escola').select('id_escola').limit(1);
                escolaId = (escolas && escolas.length > 0) ? escolas[0].id_escola : null;
            }
            if (!escolaId) return res.status(400).json({ error: 'Nenhuma escola registada no sistema.' });

            const codigo_acesso = gerarCodigoAcesso();
            const { data, error } = await supabase.from('turma').insert([{ nome, ano_letivo, id_escola: escolaId, id_professor: req.session.userId, codigo_acesso }]).select();
            if (error) throw error;
            res.json({ message: 'Turma criada!', turma: data[0] });
        } catch (err) { res.status(500).json({ error: 'Erro interno ao criar turma.' }); }
    });

    router.put('/turmas/:id', verificarProfessor, async (req, res) => {
        const { nome, ano_letivo, id_escola } = req.body;
        try {
            const updateData = { nome, ano_letivo };
            if (id_escola) updateData.id_escola = id_escola;
            const { error } = await supabase.from('turma').update(updateData).eq('id_turma', req.params.id).eq('id_professor', req.session.userId);
            if (error) throw error;
            res.json({ message: 'Turma atualizada com sucesso!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    // Lista todas as escolas disponíveis para o professor escolher
    router.get('/escolas', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase.from('escola').select('*').order('nome');
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    // Professor pode criar uma escola caso a sua não exista ainda
    router.post('/escolas', verificarProfessor, async (req, res) => {
        const { nome, localizacao } = req.body;
        if (!nome || !nome.trim()) return res.status(400).json({ error: 'O nome da escola é obrigatório.' });
        const { data, error } = await supabase.from('escola').insert([{ nome: nome.trim(), localizacao: localizacao ? localizacao.trim() : null }]).select().single();
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Escola criada!', escola: data });
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

    async function syncInteractiveGuide(url_conteudo, perguntas, id_professor, titulo) {
        if (!perguntas || perguntas.length === 0) return;
        const slug = url_conteudo.replace('resource-', '');
        const categoria = 'guia-' + slug;

        let { data: ativ } = await supabase.from('atividade')
            .select('id_atividade')
            .eq('tipo', 'miniquiz')
            .eq('categoria', categoria)
            .maybeSingle();

        let id_atividade;
        if (!ativ) {
            const { data: newAtiv, error: errAtiv } = await supabase.from('atividade').insert([{
                titulo: `Mini-Quiz: ${titulo}`,
                descricao: 'Guia Interativo',
                tipo: 'miniquiz',
                categoria: categoria,
                dificuldade: 'facil',
                pontos: 50,
                id_professor
            }]).select('id_atividade').single();
            if (errAtiv) throw errAtiv;
            id_atividade = newAtiv.id_atividade;
        } else {
            id_atividade = ativ.id_atividade;
            const { data: pergs } = await supabase.from('pergunta').select('id_pergunta').eq('id_atividade', id_atividade);
            if (pergs && pergs.length > 0) {
                const ids = pergs.map(p => p.id_pergunta);
                await supabase.from('opcao_resposta').delete().in('id_pergunta', ids);
                await supabase.from('pergunta').delete().eq('id_atividade', id_atividade);
            }
        }

        for (const p of perguntas) {
            const { data: novaPerg, error: errP } = await supabase.from('pergunta').insert([{
                id_atividade,
                texto_pergunta: p.texto_pergunta,
                pontos_pergunta: 10
            }]).select('id_pergunta').single();
            
            if (errP) continue;

            const opcoesToInsert = p.opcoes.map((op, idx) => ({
                id_pergunta: novaPerg.id_pergunta,
                texto_opcao: op,
                e_correta: idx.toString() === p.corretaIndex.toString()
            }));

            await supabase.from('opcao_resposta').insert(opcoesToInsert);
        }
    }
    async function deleteInteractiveGuideActivity(url_conteudo) {
        const slug = url_conteudo.replace('resource-', '');
        const categoria = 'guia-' + slug;

        const { data: ativ } = await supabase.from('atividade')
            .select('id_atividade')
            .eq('tipo', 'miniquiz')
            .eq('categoria', categoria)
            .maybeSingle();

        if (ativ) {
            const id_atividade = ativ.id_atividade;
            const { data: pergs } = await supabase.from('pergunta').select('id_pergunta').eq('id_atividade', id_atividade);
            if (pergs && pergs.length > 0) {
                const ids = pergs.map(p => p.id_pergunta);
                await supabase.from('opcao_resposta').delete().in('id_pergunta', ids);
                await supabase.from('pergunta').delete().eq('id_atividade', id_atividade);
            }
            await supabase.from('atividade').delete().eq('id_atividade', id_atividade);
        }
    }

    router.get('/resources', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').eq('id_professor', req.session.userId);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    router.post('/resources', verificarProfessor, async (req, res) => {
        const payload = { ...req.body, id_professor: req.session.userId };
        const perguntasGuia = payload.perguntas;
        delete payload.perguntas;

        if (payload.seccoes && typeof payload.seccoes !== 'string') {
            payload.seccoes = JSON.stringify(payload.seccoes);
        }

        const { data, error } = await supabase.from('materialpedagogico').insert([payload]).select();
        if (error) {
            console.error("ERRO AO CRIAR RECURSO:", error);
            return res.status(500).json({ error: error.message });
        }
        
        if (payload.tipo === 'guia-interativo' && perguntasGuia) {
            try {
                await syncInteractiveGuide(payload.url_conteudo, perguntasGuia, req.session.userId, payload.titulo);
            } catch (err) {
                console.error("Erro ao sincronizar guia interativo:", err);
            }
        }
        
        res.json(data[0]);
    });

    router.put('/resources/:id', verificarProfessor, async (req, res) => {
        const payload = { ...req.body };
        const perguntasGuia = payload.perguntas;
        delete payload.perguntas;

        if (payload.seccoes && typeof payload.seccoes !== 'string') {
            payload.seccoes = JSON.stringify(payload.seccoes);
        }

        const { error } = await supabase.from('materialpedagogico').update(payload).eq('id_material', req.params.id).eq('id_professor', req.session.userId);
        if (error) {
            console.error("ERRO AO ATUALIZAR RECURSO:", error);
            return res.status(500).json({ error: error.message });
        }
        
        if (payload.tipo === 'guia-interativo' && perguntasGuia) {
            try {
                await syncInteractiveGuide(payload.url_conteudo, perguntasGuia, req.session.userId, payload.titulo);
            } catch (err) {
                console.error("Erro ao sincronizar guia interativo:", err);
            }
        }
        
        res.json({ message: 'Recurso atualizado na Base de Dados!' });
    });

    router.delete('/resources/:id', verificarProfessor, async (req, res) => {
        const { data: recData } = await supabase.from('materialpedagogico').select('tipo, url_conteudo').eq('id_material', req.params.id).single();
        if (recData && recData.tipo === 'guia-interativo') {
            await deleteInteractiveGuideActivity(recData.url_conteudo);
        }

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

    // ==========================================================
    // ESTATÍSTICAS DO PROFESSOR
    // ==========================================================

    // Lista as turmas do professor (para o seletor da página de stats)
    router.get('/stats/turmas', verificarProfessor, async (req, res) => {
        try {
            const { data: user } = await supabase
                .from('utilizador')
                .select('role')
                .eq('id_utilizador', req.session.userId)
                .single();

            let turmas;
            if (user && user.role === 'admin') {
                // Admin vê todas as turmas
                const { data } = await supabase
                    .from('turma')
                    .select('id_turma, nome, ano_letivo, escola(nome)')
                    .order('nome');
                turmas = data || [];
            } else {
                // Professor vê apenas as suas turmas
                const { data } = await supabase
                    .from('turma')
                    .select('id_turma, nome, ano_letivo, escola(nome)')
                    .eq('id_professor', req.session.userId)
                    .order('nome');
                turmas = data || [];
            }
            res.json(turmas);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Estatísticas detalhadas dos alunos de uma turma com filtro de período
    router.get('/stats/turma/:id', verificarProfessor, async (req, res) => {
        const idTurma = req.params.id;
        const periodo = req.query.periodo || 'sempre'; // 'semana' | 'mes' | 'ano' | 'sempre'

        try {
            // Verificar acesso à turma
            const { data: turmaData } = await supabase
                .from('turma')
                .select('id_professor, nome, ano_letivo')
                .eq('id_turma', idTurma)
                .single();

            if (!turmaData) return res.status(404).json({ error: 'Turma não encontrada.' });

            // Admin pode ver qualquer turma; professor apenas as suas
            const { data: authUser } = await supabase
                .from('utilizador')
                .select('role')
                .eq('id_utilizador', req.session.userId)
                .single();

            const isAdmin = authUser && authUser.role === 'admin';
            if (!isAdmin && turmaData.id_professor !== req.session.userId) {
                return res.status(403).json({ error: 'Acesso negado a esta turma.' });
            }

            // Calcular a data de início do período
            let dataInicio = null;
            const agora = new Date();
            if (periodo === 'semana') {
                dataInicio = new Date(agora);
                dataInicio.setDate(agora.getDate() - 7);
            } else if (periodo === 'mes') {
                dataInicio = new Date(agora);
                dataInicio.setMonth(agora.getMonth() - 1);
            } else if (periodo === 'ano') {
                dataInicio = new Date(agora);
                dataInicio.setFullYear(agora.getFullYear() - 1);
            }

            // Buscar alunos da turma
            const { data: alunos, error: alunosErr } = await supabase
                .from('utilizador')
                .select('id_utilizador, nome, pontos_totais, foto_perfil')
                .eq('id_turma', idTurma)
                .eq('role', 'aluno')
                .order('pontos_totais', { ascending: false });

            if (alunosErr) throw alunosErr;

            if (!alunos || alunos.length === 0) {
                return res.json({
                    turma: turmaData,
                    alunos: [],
                    resumo: { total_alunos: 0, media_precisao: 0, total_quizzes: 0, melhor_aluno: null }
                });
            }

            const ids = alunos.map(a => a.id_utilizador);

            // Buscar progresso de quizzes no período
            let progressoQuery = supabase
                .from('progresso')
                .select('id_utilizador, respostas_corretas, total_perguntas, data_realizacao, atividade(tipo)')
                .in('id_utilizador', ids);

            if (dataInicio) {
                progressoQuery = progressoQuery.gte('data_realizacao', dataInicio.toISOString());
            }

            const { data: progresso } = await progressoQuery;

            // Buscar jogos CiberTermo no período
            let termoQuery = supabase
                .from('cibertermo_historico')
                .select('id_utilizador, data_jogo')
                .in('id_utilizador', ids);

            if (dataInicio) {
                termoQuery = termoQuery.gte('data_jogo', dataInicio.toISOString().split('T')[0]);
            }

            const { data: termoHistorico } = await termoQuery;

            // Agrupar dados por aluno
            const progressoMap = {};
            const termoMap = {};

            (progresso || []).forEach(p => {
                if (!progressoMap[p.id_utilizador]) progressoMap[p.id_utilizador] = [];
                progressoMap[p.id_utilizador].push(p);
            });

            (termoHistorico || []).forEach(t => {
                if (!termoMap[t.id_utilizador]) termoMap[t.id_utilizador] = [];
                termoMap[t.id_utilizador].push(t);
            });

            // Calcular nível
            function calcularNivel(pts) {
                let nivel = 1, base = 0, step = 200;
                while (pts >= base + step) { base += step; nivel++; step = Math.floor(step * 1.5); }
                return nivel;
            }

            // Calcular streak de dias consecutivos
            function calcularStreak(diasProgresso, diasTermo) {
                const diasUnicos = [...new Set([...diasProgresso, ...diasTermo])].sort((a, b) => b - a);
                if (diasUnicos.length === 0) return 0;

                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);

                let streak = 0;
                let tempoCheck;

                if (diasUnicos.includes(hoje.getTime())) {
                    streak = 1; tempoCheck = ontem.getTime();
                } else if (diasUnicos.includes(ontem.getTime())) {
                    streak = 1;
                    const ante = new Date(ontem); ante.setDate(ontem.getDate() - 1);
                    tempoCheck = ante.getTime();
                } else {
                    return 0;
                }

                while (diasUnicos.includes(tempoCheck)) {
                    streak++;
                    const d = new Date(tempoCheck); d.setDate(d.getDate() - 1);
                    tempoCheck = d.getTime();
                }
                return streak;
            }

            // Montar dados por aluno
            const alunosStats = alunos.map(aluno => {
                const progAluno = progressoMap[aluno.id_utilizador] || [];
                const termoAluno = termoMap[aluno.id_utilizador] || [];

                const quizzes = progAluno.filter(p => p.atividade && p.atividade.tipo === 'quiz');
                const totalQuizzes = quizzes.length;
                let totalCorretas = 0, totalPerguntas = 0;
                quizzes.forEach(q => {
                    totalCorretas += q.respostas_corretas || 0;
                    totalPerguntas += q.total_perguntas || 0;
                });
                const precisao = totalPerguntas > 0 ? Math.round((totalCorretas / totalPerguntas) * 100) : 0;
                const erradas = totalPerguntas - totalCorretas;

                // Última atividade
                const datasProgresso = progAluno.map(p => new Date(p.data_realizacao).getTime());
                const datasTermo = termoAluno.map(t => new Date(t.data_jogo + 'T00:00:00').getTime());
                const todasDatas = [...datasProgresso, ...datasTermo].sort((a, b) => b - a);
                const ultimaAtividade = todasDatas.length > 0 ? new Date(todasDatas[0]).toISOString() : null;

                // Streak
                const diasProg = datasProgresso.map(d => { const dt = new Date(d); dt.setHours(0,0,0,0); return dt.getTime(); });
                const diasTermo = datasTermo.map(d => { const dt = new Date(d); dt.setHours(0,0,0,0); return dt.getTime(); });
                const streak = calcularStreak(diasProg, diasTermo);

                // Avatar
                let avatar = '/img/default_avatar.png';
                if (aluno.foto_perfil) {
                    if (aluno.foto_perfil.startsWith('http')) avatar = aluno.foto_perfil;
                    else if (aluno.foto_perfil.startsWith('upload-')) avatar = `/img/uploads/${aluno.foto_perfil}`;
                    else avatar = `/img/${aluno.foto_perfil}`;
                }

                return {
                    id_utilizador: aluno.id_utilizador,
                    nome: aluno.nome,
                    avatar,
                    pontos: aluno.pontos_totais || 0,
                    nivel: calcularNivel(aluno.pontos_totais || 0),
                    total_quizzes: totalQuizzes,
                    respostas_corretas: totalCorretas,
                    respostas_erradas: erradas,
                    total_perguntas: totalPerguntas,
                    precisao,
                    streak,
                    ultima_atividade: ultimaAtividade
                };
            });

            // Calcular resumo
            const totalQuizzesGlobal = alunosStats.reduce((acc, a) => acc + a.total_quizzes, 0);
            const alunosAtivos = alunosStats.filter(a => a.total_quizzes > 0 || a.streak > 0).length;
            const mediaPrec = alunosStats.length > 0
                ? Math.round(alunosStats.reduce((acc, a) => acc + a.precisao, 0) / alunosStats.length)
                : 0;
            const melhorAluno = alunosStats.length > 0 ? alunosStats[0] : null; // já ordenado por pontos

            res.json({
                turma: turmaData,
                alunos: alunosStats,
                resumo: {
                    total_alunos: alunos.length,
                    alunos_ativos: alunosAtivos,
                    media_precisao: mediaPrec,
                    total_quizzes: totalQuizzesGlobal,
                    melhor_aluno: melhorAluno ? { nome: melhorAluno.nome, pontos: melhorAluno.pontos } : null
                }
            });

        } catch (err) {
            console.error("Erro nas stats do professor:", err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
