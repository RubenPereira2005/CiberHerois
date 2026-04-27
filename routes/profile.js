const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verificarEAtribuirMedalhas } = require('./medals');

// Uploads de avatar ficam em memoria e sao enviados para o Supabase Storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 } // Limite de 2 MB
});

module.exports = (supabase) => {

    // Devolve o perfil, definicoes de privacidade e info de turma do utilizador autenticado
    router.get('/me', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        const { data, error } = await supabase
            .from('utilizador')
            .select('nome, email, role, mfa_ativo, foto_perfil, moldura_perfil, foto_google, foto_upload, id_turma, priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva, coins, pontos_totais, priv_estatisticas, mfa_recompensa_recebida')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Utilizador nao encontrado.' });

        if (data.id_turma) {
            const { data: turmaData } = await supabase
                .from('turma')
                .select('nome, escola(nome)')
                .eq('id_turma', data.id_turma)
                .single();
            data.turma = turmaData;
        }

        if (data.role === 'professor' || data.role === 'admin') {
            const { data: turmasProf } = await supabase
                .from('turma')
                .select('nome, escola(nome)')
                .eq('id_professor', req.session.userId)
                .limit(4);
            data.turmas_geridas = turmasProf || [];
        }

        res.json(data);
    });

    // Atualiza o nome de exibicao do utilizador autenticado
    router.put('/update', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        const { nome } = req.body;
        if (!nome || nome.trim() === '') return res.status(400).json({ error: 'O nome nao pode estar vazio.' });

        const { error } = await supabase.from('utilizador').update({ nome: nome }).eq('id_utilizador', req.session.userId);
        if (error) return res.status(500).json({ error: 'Erro ao atualizar dados.' });
        res.json({ message: 'Dados atualizados com sucesso!' });
    });

    // Atualiza as definicoes de privacidade do utilizador autenticado
    router.put('/update-privacy', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        const { priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva, priv_estatisticas } = req.body;

        try {
            const { error } = await supabase.from('utilizador').update({
                priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas,
                priv_historico, priv_ranking, priv_ofensiva, priv_estatisticas
            }).eq('id_utilizador', req.session.userId);

            if (error) throw error;
            res.json({ message: 'Privacidade atualizada com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar privacidade:', error);
            res.status(500).json({ error: 'Erro ao atualizar protocolos de privacidade.' });
        }
    });

    // Elimina permanentemente a conta do utilizador autenticado via Supabase Admin
    router.delete('/delete', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        try {
            const { error } = await supabase.auth.admin.deleteUser(req.session.userId);
            if (error) throw error;

            req.session.destroy((err) => {
                if (err) return res.status(500).json({ error: 'Conta apagada, mas erro ao limpar a sessao no browser.' });
                res.json({ message: 'Conta eliminada permanentemente de todo o sistema.' });
            });
        } catch (error) {
            console.error('Erro ao apagar conta:', error);
            res.status(500).json({ error: 'Erro ao apagar conta permanentemente.' });
        }
    });

    // Atualiza o avatar preset selecionado pelo utilizador
    router.put('/update-avatar', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
        const { avatar } = req.body;
        if (!avatar) return res.status(400).json({ error: 'Nenhum avatar enviado.' });

        const { error } = await supabase.from('utilizador').update({ foto_perfil: avatar }).eq('id_utilizador', req.session.userId);
        if (error) return res.status(500).json({ error: 'Erro ao atualizar avatar.' });
        res.json({ message: 'Avatar atualizado com sucesso!' });
    });

    // Atualiza a moldura do perfil. Enviar string vazia remove a moldura.
    router.put('/update-border', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
        const { border } = req.body;
        const molduraFinal = border === '' ? null : border;

        const { error } = await supabase.from('utilizador').update({ moldura_perfil: molduraFinal }).eq('id_utilizador', req.session.userId);
        if (error) return res.status(500).json({ error: 'Erro ao atualizar moldura.' });
        res.json({ message: 'Moldura atualizada com sucesso!' });
    });

    // Faz upload de uma foto personalizada para o Supabase Storage e atualiza o perfil
    router.post('/upload-avatar', upload.single('ficheiroAvatar'), async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
        if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro recebido.' });

        try {
            // Apaga o upload anterior do Supabase Storage se existir
            const { data: user } = await supabase.from('utilizador').select('foto_upload').eq('id_utilizador', req.session.userId).single();

            if (user && user.foto_upload && user.foto_upload.includes('supabase.co')) {
                const urlPartes = user.foto_upload.split('/');
                const ficheiroAntigo = urlPartes[urlPartes.length - 1];
                supabase.storage.from('avatars').remove([ficheiroAntigo]).catch(err => console.error('Erro ao apagar avatar antigo:', err));
            }

            const extensao = req.file.originalname.split('.').pop();
            const novoNome = `upload-${req.session.userId}-${Date.now()}.${extensao}`;

            const { error: uploadError } = await supabase.storage.from('avatars').upload(novoNome, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(novoNome);
            const urlImagem = publicUrlData.publicUrl;

            const { error: dbError } = await supabase.from('utilizador')
                .update({ foto_perfil: urlImagem, foto_upload: urlImagem })
                .eq('id_utilizador', req.session.userId);
            if (dbError) throw dbError;

            res.json({ message: 'Upload concluido!', filename: urlImagem });

        } catch (error) {
            console.error('Erro no upload do avatar:', error);
            res.status(500).json({ error: 'Erro ao guardar a imagem na nuvem.' });
        }
    });

    // Ativa ou desativa o MFA. Atribui uma recompensa unica ao ativar pela primeira vez via o banner da missao.
    router.put('/update-mfa', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        const { mfa_ativo, veio_da_missao } = req.body;
        const isAtivando = (mfa_ativo === true || mfa_ativo === 'true');

        try {
            const { data: userDados, error: userError } = await supabase
                .from('utilizador')
                .select('pontos_totais, coins, mfa_recompensa_recebida')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (userError) throw userError;

            // Atribui bonus unico ao ativar via banner da missao, apenas se a recompensa ainda nao foi dada
            if (isAtivando && userDados && userDados.mfa_recompensa_recebida === false && veio_da_missao === true) {
                const novosPontos = (userDados.pontos_totais || 0) + 50;
                const novasMoedas = (userDados.coins || 0) + 10;

                const { error: updateError } = await supabase
                    .from('utilizador')
                    .update({ mfa_ativo: true, pontos_totais: novosPontos, coins: novasMoedas, mfa_recompensa_recebida: true })
                    .eq('id_utilizador', req.session.userId);

                if (updateError) throw updateError;

                const novasMedalhas = await verificarEAtribuirMedalhas(supabase, req.session.userId);
                return res.json({
                    message: 'Missao Concluida! Ganhaste +50 XP e +10 CiberCoins!',
                    recompensa: true,
                    novas_medalhas: novasMedalhas
                });
            }

            // Alternancia padrao sem recompensa
            const { error: normalUpdateError } = await supabase
                .from('utilizador')
                .update({ mfa_ativo: isAtivando })
                .eq('id_utilizador', req.session.userId);

            if (normalUpdateError) throw normalUpdateError;

            let novasMedalhas = [];
            if (isAtivando) {
                novasMedalhas = await verificarEAtribuirMedalhas(supabase, req.session.userId);
            }

            res.json({
                message: isAtivando ? 'MFA ativado com sucesso.' : 'MFA desativado. A tua conta esta vulneravel!',
                recompensa: false,
                novas_medalhas: novasMedalhas
            });

        } catch (error) {
            console.error('Erro ao atualizar MFA:', error);
            res.status(500).json({ error: 'Erro ao atualizar estado MFA.' });
        }
    });

    // Devolve as 5 atividades mais recentes do utilizador autenticado
    router.get('/recent-activity', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });
        try {
            const { data, error } = await supabase.from('progresso')
                .select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)')
                .eq('id_utilizador', req.session.userId)
                .order('data_realizacao', { ascending: false })
                .limit(5);
            if (error) throw error;
            res.json(data);
        } catch (error) { res.status(500).json({ error: 'Erro ao carregar atividade recente.' }); }
    });

    // Devolve o historico completo de atividades do utilizador autenticado
    router.get('/history', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });
        try {
            const { data, error } = await supabase.from('progresso')
                .select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)')
                .eq('id_utilizador', req.session.userId)
                .order('data_realizacao', { ascending: false });
            if (error) throw error;
            res.json(data);
        } catch (error) { res.status(500).json({ error: 'Erro ao carregar historico.' }); }
    });

    // Devolve o historico de um perfil publico, sujeito as definicoes de privacidade desse utilizador
    router.get('/history/:id', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });
        const targetId = req.params.id;

        try {
            const { data: user, error: userErr } = await supabase
                .from('utilizador')
                .select('priv_perfil_publico, priv_historico')
                .eq('id_utilizador', targetId)
                .single();

            if (userErr || !user) return res.status(404).json({ error: 'Utilizador nao encontrado.' });

            if (user.priv_perfil_publico === false || user.priv_historico === false) {
                return res.status(403).json({ error: 'Acesso Negado pelas configuracoes de Privacidade.' });
            }

            const { data, error } = await supabase
                .from('progresso')
                .select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)')
                .eq('id_utilizador', targetId)
                .order('data_realizacao', { ascending: false });

            if (error) throw error;
            res.json(data);

        } catch (error) {
            console.error('Erro no historico publico:', error);
            res.status(500).json({ error: 'Erro ao carregar historico.' });
        }
    });

    // Associa o utilizador autenticado a uma turma usando um codigo de acesso
    router.post('/join-turma', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
        const { codigo } = req.body;
        if (!codigo || codigo.trim() === '') return res.status(400).json({ error: 'O codigo nao pode estar vazio.' });

        const { data: turma, error: turmaErr } = await supabase.from('turma').select('id_turma, nome').eq('codigo_acesso', codigo.trim().toUpperCase()).single();
        if (turmaErr || !turma) return res.status(404).json({ error: 'Codigo invalido. Verifica se escreveste bem!' });

        const { error: updateErr } = await supabase.from('utilizador').update({ id_turma: turma.id_turma }).eq('id_utilizador', req.session.userId);
        if (updateErr) return res.status(500).json({ error: 'Erro ao associar ao esquadrao.' });

        res.json({ message: `Acesso Concedido! Agora pertences ao esquadrao ${turma.nome}!` });
    });

    // Pesquisa utilizadores por nome (apenas perfis publicos, exclui o utilizador que fez o pedido)
    router.get('/search', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Utilizador nao autenticado' });

        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 6;

        if (!query || query.length < 2) return res.json([]);

        try {
            const { data, error } = await supabase
                .from('utilizador')
                .select('id_utilizador, nome, foto_perfil, role')
                .ilike('nome', `%${query}%`)
                .in('role', ['aluno', 'professor'])
                .eq('priv_perfil_publico', true)
                .neq('id_utilizador', req.session.userId)
                .limit(limit);

            if (error) throw error;
            res.json(data);
        } catch (error) {
            console.error('Erro na pesquisa de utilizadores:', error);
            res.status(500).json({ error: 'Erro na pesquisa' });
        }
    });

    // Devolve um perfil publico com os campos filtrados de acordo com as definicoes de privacidade do utilizador
    router.get('/user/:id', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
        const { id } = req.params;

        try {
            const { data, error } = await supabase
                .from('utilizador')
                .select('nome, email, role, mfa_ativo, foto_perfil, moldura_perfil, foto_google, foto_upload, id_turma, priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva, coins, pontos_totais, priv_estatisticas')
                .eq('id_utilizador', id)
                .single();

            if (error) return res.status(404).json({ error: 'Erro na BD: ' + error.message });
            if (!data) return res.status(404).json({ error: 'Utilizador nao encontrado.' });

            if (data.priv_perfil_publico === false) {
                return res.status(404).json({ error: 'Utilizador nao encontrado.' });
            }

            // Visibilidade de pontos e nivel
            if (data.priv_pontos === false) {
                delete data.pontos_totais;
                data.nivel = null;
            } else {
                const totalPontos = data.pontos_totais || 0;
                let nivel = 1, pontosDoNivelAtual = 0, pontosParaSubir = 200;
                while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                    pontosDoNivelAtual += pontosParaSubir;
                    nivel++;
                    pontosParaSubir = Math.floor(pontosParaSubir * 1.5);
                }
                data.nivel = nivel;
            }

            // Visibilidade da turma
            if (data.priv_turma === false) {
                delete data.id_turma;
            } else {
                if (data.id_turma) {
                    const { data: turmaData } = await supabase.from('turma').select('nome, escola(nome)').eq('id_turma', data.id_turma).single();
                    data.turma = turmaData;
                }
                if (data.role === 'professor' || data.role === 'admin') {
                    const { data: turmasProf } = await supabase.from('turma').select('nome, escola(nome)').eq('id_professor', id).limit(4);
                    data.turmas_geridas = turmasProf || [];
                }
            }

            // Visibilidade da atividade recente
            if (data.priv_historico) {
                const { data: acts } = await supabase.from('progresso')
                    .select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)')
                    .eq('id_utilizador', id).order('data_realizacao', { ascending: false }).limit(5);
                data.atividades_recentes = acts || [];
            }

            // Visibilidade da posicao no ranking
            if (data.priv_ranking && data.role === 'aluno') {
                const { data: rankingData } = await supabase.from('utilizador').select('id_utilizador').eq('role', 'aluno').eq('priv_ranking', true).order('pontos_totais', { ascending: false });
                if (rankingData) {
                    const myIndex = rankingData.findIndex(u => u.id_utilizador === id);
                    data.posicao_ranking = myIndex !== -1 ? myIndex + 1 : '--';
                }
            }

            // Visibilidade da ofensiva (sequencia diaria)
            if (data.priv_ofensiva) {
                const { data: progresso } = await supabase.from('progresso').select('data_realizacao').eq('id_utilizador', id);
                let ofensiva = 0;
                if (progresso && progresso.length > 0) {
                    const diasJogados = [...new Set(progresso.map(p => {
                        const d = new Date(p.data_realizacao); d.setHours(0, 0, 0, 0); return d.getTime();
                    }))];
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
                    let tempoCheck = hoje.getTime();

                    if (diasJogados.includes(tempoCheck)) { ofensiva = 1; tempoCheck = ontem.getTime(); }
                    else if (diasJogados.includes(ontem.getTime())) {
                        ofensiva = 1;
                        const anteontem = new Date(ontem); anteontem.setDate(anteontem.getDate() - 1);
                        tempoCheck = anteontem.getTime();
                    }
                    if (ofensiva > 0) {
                        while (diasJogados.includes(tempoCheck)) {
                            ofensiva++;
                            const diaAnterior = new Date(tempoCheck); diaAnterior.setDate(diaAnterior.getDate() - 1);
                            tempoCheck = diaAnterior.getTime();
                        }
                    }
                }
                data.ofensiva = ofensiva;
            }

            // Visibilidade das estatisticas de quizzes
            if (data.priv_estatisticas) {
                const { data: progressoStats } = await supabase
                    .from('progresso')
                    .select('respostas_corretas, total_perguntas, atividade!inner(tipo)')
                    .eq('id_utilizador', id)
                    .eq('atividade.tipo', 'quiz');

                let quizzes = 0, respostas = 0, corretas = 0;
                if (progressoStats && progressoStats.length > 0) {
                    quizzes = progressoStats.length;
                    progressoStats.forEach(p => {
                        if (p.total_perguntas !== null) respostas += p.total_perguntas;
                        if (p.respostas_corretas !== null) corretas += p.respostas_corretas;
                    });
                }
                data.estatisticas = {
                    quizzes,
                    respostas,
                    precisao: respostas > 0 ? Math.round((corretas / respostas) * 100) : 0
                };
            }

            // Visibilidade do total de medalhas
            if (data.priv_medalhas) {
                const { count, error: erroMedalhas } = await supabase
                    .from('utilizador_medalha')
                    .select('*', { count: 'exact', head: true })
                    .eq('id_utilizador', id);
                data.total_medalhas = (!erroMedalhas) ? (count || 0) : 0;
            }

            // Passa as flags de visibilidade para o frontend
            data.showMedalhas = data.priv_medalhas;
            data.showHistorico = data.priv_historico;
            data.showRanking = data.priv_ranking;
            data.showOfensiva = data.priv_ofensiva;
            data.showEstatisticas = data.priv_estatisticas;

            res.json(data);

        } catch (error) {
            console.error('Erro no perfil publico:', error);
            res.status(500).json({ error: 'Erro ao procurar perfil publico.' });
        }
    });

    return router;
};