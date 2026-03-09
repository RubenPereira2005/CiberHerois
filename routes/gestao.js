const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

module.exports = (supabase) => {

    const gerarHtmlTemplate = (titulo, cor_card, icone_card, tipo, htmlSeccoes, url_conteudo) => `<!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${titulo} - CiberHeróis</title>
        <link rel="stylesheet" href="style.css">
        <link rel="stylesheet" href="dark-mode.css">
        <script src="https://unpkg.com/lucide@latest"></script>
        <script src="theme.js"></script>
    </head>
    <body class="site-body">
        <nav class="auth-navbar"><div class="auth-navbar-inner"><div class="auth-navbar-left"><a href="quizzes.html" class="auth-brand">CiberHeróis</a><div class="auth-navbar-menu"><a href="resources.html" class="auth-navbar-link auth-navbar-link-active">Recursos</a><a href="quizzes.html" class="auth-navbar-link">Quizzes</a></div></div><div class="auth-navbar-right"><a href="profile.html" class="auth-navbar-btn" title="Ver Perfil"><i data-lucide="user" class="auth-navbar-icon"></i></a></div></div></nav>

        <div class="auth-container resource-detail-container">
            <a href="resources.html" class="resource-back-link"><i data-lucide="arrow-left" class="icon-20"></i> Voltar aos Recursos</a>
            
            <div class="resource-header">
                <div class="resource-header-icon resource-header-icon-${cor_card}">
                    <i data-lucide="${icone_card}" class="icon-32"></i>
                </div>
                <div>
                    <p class="resource-category">${tipo}</p>
                    <h1 class="resource-title">${titulo}</h1>
                </div>
            </div>

            <div class="resource-content">
                ${htmlSeccoes}
            </div>

            <div class="resource-buttons">
                <button class="resource-btn resource-btn-secondary" onclick="window.location.href='/api/pdf/download/${url_conteudo.replace('.html', '')}'">
                    <i data-lucide="download" class="icon-20"></i> Descarregar PDF
                </button>
            </div>
        </div>
        <script>lucide.createIcons();</script>
    </body>
    </html>`;

    // ==========================================
    // RECURSOS
    // ==========================================
    
    // Obter todos
    router.get('/resources', async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').order('id_material', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    });

    // Obter um específico para editar
    router.get('/resources/:id', async (req, res) => {
        const { data, error } = await supabase.from('materialpedagogico').select('*').eq('id_material', req.params.id).single();
        if (error || !data) return res.status(404).json({ error: 'Não encontrado' });
        res.json(data);
    });

    // Criar novo
    router.post('/resources', async (req, res) => {
        const { titulo, descricao, tipo, cor_card, icone_card, url_conteudo, seccoes } = req.body;
        const id_professor = req.session.userId || 1; 

        let nomeFicheiro = url_conteudo.replace('.html', '') + '.html';
        let caminhoFicheiro = path.join(__dirname, '../pages', nomeFicheiro);

        let htmlSeccoes = '';
        seccoes.forEach(sec => {
            htmlSeccoes += `
            <div class="resource-section border-${cor_card}">
                <div class="resource-section-content">
                    <i data-lucide="${sec.icone}" class="icon-24 icon-${cor_card}"></i>
                    <div><h2>${sec.titulo}</h2><p>${sec.texto}</p></div>
                </div>
            </div>`;
        });

        const htmlTemplate = gerarHtmlTemplate(titulo, cor_card, icone_card, tipo, htmlSeccoes, nomeFicheiro);

        try { fs.writeFileSync(caminhoFicheiro, htmlTemplate, 'utf8'); } 
        catch (fsError) { return res.status(500).json({ error: "Erro ao criar ficheiro HTML." }); }

        const seccoesStr = JSON.stringify(seccoes);
        const tipoMinusculo = tipo.toLowerCase(); // Garantir que o tipo é armazenado em minúsculas para consistência

        const { error } = await supabase.from('materialpedagogico').insert([{
            titulo, 
            descricao, 
            tipo: tipoMinusculo,
            cor_card, 
            icone_card, 
            url_conteudo: nomeFicheiro, 
            id_professor, 
            seccoes: seccoesStr
        }]);

        if (error) {
            console.error("❌ ERRO SUPABASE (INSERT):", error);
            return res.status(500).json({ error: error.message });
        }
        res.json({ message: 'Recurso criado com sucesso!' });
    });

    // Atualizar existente
    router.put('/resources/:id', async (req, res) => {
        const { titulo, descricao, tipo, cor_card, icone_card, url_conteudo, seccoes } = req.body;
        const id = req.params.id;

        let nomeFicheiro = url_conteudo.replace('.html', '') + '.html';
        let caminhoFicheiro = path.join(__dirname, '../pages', nomeFicheiro);

        let htmlSeccoes = '';
        seccoes.forEach(sec => {
            htmlSeccoes += `
            <div class="resource-section border-${cor_card}">
                <div class="resource-section-content">
                    <i data-lucide="${sec.icone}" class="icon-24 icon-${cor_card}"></i>
                    <div><h2>${sec.titulo}</h2><p>${sec.texto}</p></div>
                </div>
            </div>`;
        });

        const htmlTemplate = gerarHtmlTemplate(titulo, cor_card, icone_card, tipo, htmlSeccoes, nomeFicheiro);
        const seccoesStr = JSON.stringify(seccoes);
        const tipoMinusculo = tipo.toLowerCase(); // Garantir que o tipo é armazenado em minúsculas para consistência

        try {
            fs.writeFileSync(caminhoFicheiro, htmlTemplate, 'utf8');
            
            const { error } = await supabase.from('materialpedagogico').update({
                titulo, 
                descricao, 
                tipo: tipoMinusculo,
                cor_card, 
                icone_card, 
                url_conteudo: nomeFicheiro, 
                seccoes: seccoesStr
            }).eq('id_material', id);

            if (error) {
                console.error("❌ ERRO SUPABASE (UPDATE):", error);
                return res.status(500).json({ error: error.message });
            }
            res.json({ message: 'Recurso atualizado!' });

        } catch (err) { res.status(500).json({ error: "Erro ao atualizar ficheiro HTML." }); }
    });

    // Apagar
    router.delete('/resources/:id', async (req, res) => {
        const { data, error: selectErr } = await supabase.from('materialpedagogico').select('url_conteudo').eq('id_material', req.params.id).single();
        
        if (!selectErr && data) {
            const ficheiro = path.join(__dirname, '../pages', data.url_conteudo);
            if (fs.existsSync(ficheiro)) fs.unlinkSync(ficheiro); 
        }

        const { error } = await supabase.from('materialpedagogico').delete().eq('id_material', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Apagado!' });
    });

    // ==========================================
    // QUIZZES
    // ==========================================

    // Obter todos
    router.get('/quizzes', async (req, res) => {
        const { data, error } = await supabase
            .from('pergunta')
            .select('id_pergunta, texto_pergunta, atividade!inner(categoria, dificuldade)')
            .order('id_pergunta', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        
        // Mapear para ter as propriedades flat
        const formatado = data.map(p => ({
            id_pergunta: p.id_pergunta,
            categoria: p.atividade.categoria,
            dificuldade: p.atividade.dificuldade,
            texto_pergunta: p.texto_pergunta
        }));

        res.json(formatado);
    });

    // Obter um específico para editar
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

    // Criar novo
    router.post('/quiz', async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex } = req.body;
        const id_professor = req.session.userId || 1;

        try {
            // 1. Inserir Atividade
            const { data: ativ, error: ativErr } = await supabase.from('atividade').insert([{
                titulo: `Quiz de ${categoria}`, tipo: 'quiz', categoria, descricao: 'Quiz gerado via Admin', dificuldade, id_professor
            }]).select();
            if (ativErr) throw ativErr;

            // 2. Inserir Pergunta
            const { data: perg, error: pergErr } = await supabase.from('pergunta').insert([{
                id_atividade: ativ[0].id_atividade, texto_pergunta
            }]).select();
            if (pergErr) throw pergErr;

            // 3. Inserir Opções
            const opcoesArray = opcoes.map((texto, index) => ({
                id_pergunta: perg[0].id_pergunta,
                texto_opcao: texto,
                e_correta: index === parseInt(corretaIndex)
            }));
            const { error: opcErr } = await supabase.from('opcao_resposta').insert(opcoesArray);
            if (opcErr) throw opcErr;

            res.json({ message: 'Criado!' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Atualizar existente
    router.put('/quizzes/:id', async (req, res) => {
        const { texto_pergunta, categoria, dificuldade, opcoes, corretaIndex, id_atividade } = req.body;
        
        try {
            // 1. Update Atividade
            const { error: ativErr } = await supabase.from('atividade')
                .update({ categoria, dificuldade }).eq('id_atividade', id_atividade);
            if (ativErr) throw ativErr;

            // 2. Update Pergunta
            const { error: pergErr } = await supabase.from('pergunta')
                .update({ texto_pergunta }).eq('id_pergunta', req.params.id);
            if (pergErr) throw pergErr;

            // 3. Apagar opções antigas
            const { error: delErr } = await supabase.from('opcao_resposta')
                .delete().eq('id_pergunta', req.params.id);
            if (delErr) throw delErr;

            // 4. Inserir opções novas
            const opcoesArray = opcoes.map((texto, index) => ({
                id_pergunta: req.params.id,
                texto_opcao: texto,
                e_correta: index === parseInt(corretaIndex)
            }));
            const { error: opcErr } = await supabase.from('opcao_resposta').insert(opcoesArray);
            if (opcErr) throw opcErr;

            res.json({ message: 'Atualizado!' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Apagar
    router.delete('/quizzes/:id', async (req, res) => {
        // Devido ao "ON DELETE CASCADE" na BD, apagar a pergunta irá apagar as Opcoes_Resposta associadas.
        const { error } = await supabase.from('pergunta').delete().eq('id_pergunta', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ message: 'Pergunta apagada!' });
    });

    return router;
};