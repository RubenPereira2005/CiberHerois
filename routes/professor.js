const express = require('express');
const router = express.Router();

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

    // Middleware de segurança (AGORA GUARDA O NOME DO PROFESSOR)
    const verificarProfessor = async (req, res, next) => {
        if (!req.session.userId) return res.redirect('/404.html');
        
        // Puxamos o "nome" da base de dados também!
        const { data: user, error } = await supabase.from('utilizador').select('role, nome').eq('id_utilizador', req.session.userId).single();
        
        if (error || !user || (user.role !== 'professor' && user.role !== 'admin')) return res.redirect('/404.html');
        
        // Guardamos o nome na "request" para usar mais à frente na criação do HTML
        req.nomeProfessor = user.nome; 
        
        next();
    };

    // ==========================================
    // RECURSOS DO PROFESSOR (GERAÇÃO DE HTML)
    // ==========================================

    // Função interna à prova de bala para gerar HTML
    const gerarHTMLRecurso = (recurso, nomeAutor = 'Professor') => {
        let seccoesHTML = '';
        let seccoes = [];
        
        let textoCompletoParaCalculo = (recurso.titulo || '') + " " + (recurso.descricao || '') + " ";

        try {
            if (recurso.seccoes) {
                seccoes = typeof recurso.seccoes === 'string' ? JSON.parse(recurso.seccoes) : recurso.seccoes;
            }
        } catch (e) { console.error("Erro ao ler secções:", e); }

        if (Array.isArray(seccoes) && seccoes.length > 0) {
            seccoes.forEach(sec => {
                const icone = sec.icone || 'info';
                const titulo = sec.titulo || 'Secção';
                const texto = sec.texto ? String(sec.texto) : '';

                textoCompletoParaCalculo += titulo + " " + texto + " ";

                const textoHTML = texto.replace(/\n/g, '<br>');

                seccoesHTML += `
            <div class="resource-section">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <i data-lucide="${icone}" class="icon-24" style="color: var(--primary-color); margin-top: 4px;"></i>
                    <div>
                        <h2>${titulo}</h2>
                        <p>${textoHTML}</p>
                    </div>
                </div>
            </div>`;
            });
        }

        // --- CÁLCULO DO TEMPO DE LEITURA ---
        const wpm = 225;
        // Divide e filtra palavras vazias para não contar espaços como palavras
        const arrayPalavras = textoCompletoParaCalculo.trim().split(/\s+/).filter(word => word.length > 0);
        const totalPalavras = arrayPalavras.length;
        
        let tempoLeituraMinutos = Math.ceil(totalPalavras / wpm);
        if (tempoLeituraMinutos < 1) tempoLeituraMinutos = 1; 

        const tipoBadge = recurso.tipo ? String(recurso.tipo).charAt(0).toUpperCase() + String(recurso.tipo).slice(1) : 'Documento';
        const cor = recurso.cor_card || 'blue';
        const iconePrincipal = recurso.icone_card || 'shield';
        const tituloRecurso = recurso.titulo || 'Recurso de Estudo';
        const descRecurso = recurso.descricao || '';
        
        const dataHoje = new Date().toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
        const urlSemHtml = recurso.url_conteudo ? recurso.url_conteudo.replace('.html', '') : '';

        return `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tituloRecurso} - CiberHeróis</title>
    <link rel="icon" type="image/x-icon" href="img/favicon.svg">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="dark-mode.css">
    <link rel="stylesheet" href="preloader.css">
    <script src="https://unpkg.com/lucide@latest"></script>
    <script src="theme.js"></script>
    <script src="global-init.js"></script>
</head>
<body class="site-body">
    <div id="global-loader">
        <div class="loader-logo">Ciber<span>Heróis</span></div>
        <div class="loader-spinner"></div>
    </div>

    <div id="includedContent"></div>

    <div class="auth-container resource-detail-container">
        <a href="resources.html" class="resource-back-link"><i data-lucide="arrow-left" class="icon-20"></i> Voltar aos Recursos</a>
        
        <div class="resource-header">
            <div class="resource-header-icon resource-header-icon-${cor}">
                <i data-lucide="${iconePrincipal}" class="icon-32"></i>
            </div>
            <div>
                <p class="resource-category">${tipoBadge}</p>
                <h1 class="resource-title">${tituloRecurso}</h1>
                <p style="color: var(--text-secondary); margin-top: 8px;">${descRecurso}</p>
            </div>

            <div class="resource-meta">
                <span>📚 ${tempoLeituraMinutos} min de leitura</span>
                <span>•</span>
                <span>✍️ Professor ${nomeAutor}</span>
                <span>•</span>
                <span>📅 ${dataHoje}</span>
            </div>
        </div>

        <div class="resource-content">
            ${seccoesHTML}
        </div>

        <div class="resource-buttons">
            <button class="resource-btn resource-btn-secondary" onclick="window.print()">
                <i data-lucide="download" class="icon-20"></i> Guardar PDF
            </button>
        </div>
        
        <div class="resource-cta-box">
            <h3>Teste os seus conhecimentos!</h3>
            <p>Faça o quiz desta categoria e ganhe pontos táticos</p>
            <a href="quizzes.html" class="resource-cta-link">Ir para os Quizzes</a>
        </div>
    </div>
    <script>lucide.createIcons();</script>
</body>
</html>`;
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

    // ==========================================
    // QUIZZES DO PROFESSOR
    // ==========================================
    router.get('/quizzes', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase.from('pergunta').select(`id_pergunta, texto_pergunta, pontos_pergunta, atividade!inner(id_atividade, categoria, dificuldade, id_professor)`).eq('atividade.id_professor', req.session.userId).order('id_pergunta', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        const formatado = data.map(p => ({ id_pergunta: p.id_pergunta, texto_pergunta: p.texto_pergunta, categoria: p.atividade.categoria, dificuldade: p.atividade.dificuldade, id_atividade: p.atividade.id_atividade }));
        res.json(formatado);
    });

    router.get('/quizzes/:id', verificarProfessor, async (req, res) => {
        try {
            const { data: pergunta, error } = await supabase.from('pergunta').select('*, atividade!inner(id_atividade, categoria, dificuldade, id_professor)').eq('id_pergunta', req.params.id).eq('atividade.id_professor', req.session.userId).single();
            if (error || !pergunta) return res.status(404).json({ error: 'Pergunta não encontrada' });
            const { data: opcoes } = await supabase.from('opcao_resposta').select('*').eq('id_pergunta', req.params.id).order('id_opcao', { ascending: true });
            res.json({ pergunta, opcoes });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.post('/quiz', verificarProfessor, async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        try {
            let { data: ativs } = await supabase.from('atividade').select('id_atividade').eq('id_professor', req.session.userId).eq('categoria', categoria).eq('dificuldade', dificuldade).limit(1);
            let id_atividade;
            if (ativs && ativs.length > 0) { id_atividade = ativs[0].id_atividade; }
            else {
                const { data: newAtiv, error: errAtiv } = await supabase.from('atividade').insert([{ titulo: `Treino de ${categoria}`, tipo: 'quiz', categoria, dificuldade, pontos: 50, id_professor: req.session.userId }]).select();
                if (errAtiv) throw errAtiv; id_atividade = newAtiv[0].id_atividade;
            }
            const { data: perg, error: errPerg } = await supabase.from('pergunta').insert([{ id_atividade, texto_pergunta, pontos_pergunta: 10 }]).select();
            if (errPerg) throw errPerg;
            const opsToInsert = opcoes.map((op, idx) => ({ id_pergunta: perg[0].id_pergunta, texto_opcao: op, e_correta: idx.toString() === corretaIndex.toString() }));
            await supabase.from('opcao_resposta').insert(opsToInsert);
            res.json({ message: 'Pergunta criada com sucesso!' });
        } catch (error) { res.status(500).json({ error: error.message }); }
    });

    router.put('/quizzes/:id', verificarProfessor, async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex, id_atividade } = req.body;
        try {
            const { data: check } = await supabase.from('pergunta').select('atividade!inner(id_professor)').eq('id_pergunta', req.params.id).single();
            if (!check || check.atividade.id_professor !== req.session.userId) return res.status(403).json({ error: 'Acesso negado' });
            await supabase.from('pergunta').update({ texto_pergunta }).eq('id_pergunta', req.params.id);
            await supabase.from('atividade').update({ categoria, dificuldade }).eq('id_atividade', id_atividade);
            await supabase.from('opcao_resposta').delete().eq('id_pergunta', req.params.id);
            const opsToInsert = opcoes.map((op, idx) => ({ id_pergunta: req.params.id, texto_opcao: op, e_correta: idx.toString() === corretaIndex.toString() }));
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

    return router;
};