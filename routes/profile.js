const express = require('express');
const router = express.Router();
const multer = require('multer');

// --- CONFIGURAÇÃO DO MULTER (Memória em vez de Disco) ---
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 } // Limite de 2MB!
});

module.exports = (supabase) => {
    
    // --- ROTA 1: Obter dados (Agora puxa também as opções de privacidade) ---
    router.get('/me', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { data, error } = await supabase
            .from('utilizador')
            // CORREÇÃO: Adicionado priv_ofensiva
            .select('nome, email, role, mfa_ativo, foto_perfil, foto_google, foto_upload, id_turma, priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !data) return res.status(404).json({ error: "Utilizador não encontrado." });

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

    // --- ROTA 2: Atualizar Nome ---
    router.put('/update', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { nome } = req.body;
        if (!nome || nome.trim() === "") return res.status(400).json({ error: "O nome não pode estar vazio." });

        const { error } = await supabase.from('utilizador').update({ nome: nome }).eq('id_utilizador', req.session.userId);
        if (error) return res.status(500).json({ error: "Erro ao atualizar dados." });
        res.json({ message: "Dados atualizados com sucesso!" });
    });

    // --- NOVA ROTA: Atualizar Privacidade ---
    router.put('/update-privacy', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        // 👇 AQUI: Recebe a nova variável priv_estatisticas
        const { priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva, priv_estatisticas } = req.body;

        try {
            const { error } = await supabase.from('utilizador').update({ 
                priv_perfil_publico, 
                priv_turma, 
                priv_pontos, 
                priv_medalhas, 
                priv_historico, 
                priv_ranking,
                priv_ofensiva,
                priv_estatisticas
            }).eq('id_utilizador', req.session.userId);

            if (error) throw error;
            res.json({ message: "Privacidade atualizada com sucesso!" });
        } catch (error) {
            console.error("Erro ao atualizar privacidade:", error);
            res.status(500).json({ error: "Erro ao atualizar protocolos de privacidade." });
        }
    });

    // --- ROTA 3: Apagar Conta ---
    router.delete('/delete', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });
        
        try {
            const { data, error } = await supabase.auth.admin.deleteUser(req.session.userId);
            if (error) throw error;

            req.session.destroy((err) => {
                if (err) return res.status(500).json({ error: "Conta apagada, mas erro ao limpar a sessão no browser." });
                res.json({ message: "Conta eliminada permanentemente de todo o sistema." });
            });
        } catch (error) {
            console.error("Erro ao apagar conta (Supabase Admin):", error);
            res.status(500).json({ error: "Erro ao apagar conta permanentemente." });
        }
    });

    // --- ROTA 4: Atualizar Avatar (Clicando nos Bonecos) ---
    router.put('/update-avatar', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        const { avatar } = req.body;
        if (!avatar) return res.status(400).json({ error: "Nenhum avatar enviado." });

        const { error } = await supabase.from('utilizador').update({ foto_perfil: avatar }).eq('id_utilizador', req.session.userId);
        if (error) return res.status(500).json({ error: "Erro ao atualizar avatar." });
        res.json({ message: "Avatar atualizado com sucesso!" });
    });

    // --- ROTA 5: Upload de Nova Foto Personalizada ---
    router.post('/upload-avatar', upload.single('ficheiroAvatar'), async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        if (!req.file) return res.status(400).json({ error: "Nenhum ficheiro recebido." });

        try {
            const { data: user } = await supabase.from('utilizador').select('foto_upload').eq('id_utilizador', req.session.userId).single();

            if (user && user.foto_upload && user.foto_upload.includes('supabase.co')) {
                const urlPartes = user.foto_upload.split('/');
                const ficheiroAntigo = urlPartes[urlPartes.length - 1];
                supabase.storage.from('avatars').remove([ficheiroAntigo]).catch(err => console.error("Erro ao apagar antiga:", err));
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

            res.json({ message: "Upload concluído!", filename: urlImagem });

        } catch (error) {
            console.error("Erro no upload do Supabase:", error);
            res.status(500).json({ error: "Erro ao guardar a imagem na nuvem." });
        }
    });

    // --- ROTA 6: Ligar/Desligar MFA (COM RECOMPENSA ÚNICA) ---
    router.put('/update-mfa', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { mfa_ativo } = req.body;

        try {
            if (mfa_ativo === true || mfa_ativo === 'true') {
                const { data: userDados, error: userError } = await supabase
                    .from('utilizador')
                    .select('pontos_totais, mfa_recompensa_recebida')
                    .eq('id_utilizador', req.session.userId)
                    .single();

                if (userError) throw userError;

                if (userDados && userDados.mfa_recompensa_recebida === false) {
                    const novosPontos = (userDados.pontos_totais || 0) + 50;
                    
                    const { error: updateError } = await supabase
                        .from('utilizador')
                        .update({ 
                            mfa_ativo: true,
                            pontos_totais: novosPontos,
                            mfa_recompensa_recebida: true
                        })
                        .eq('id_utilizador', req.session.userId);

                    if (updateError) throw updateError;

                    return res.json({ message: "MFA ativado! Ganhaste +50 Pontos de XP!", recompensa: true });
                }
            }

            const { error: normalUpdateError } = await supabase
                .from('utilizador')
                .update({ mfa_ativo: mfa_ativo === true || mfa_ativo === 'true' })
                .eq('id_utilizador', req.session.userId);

            if (normalUpdateError) throw normalUpdateError;

            res.json({ message: mfa_ativo ? "MFA reativado com sucesso." : "MFA desativado.", recompensa: false });

        } catch (error) {
            console.error("Erro ao atualizar estado MFA:", error);
            res.status(500).json({ error: "Erro ao atualizar estado MFA." });
        }
    });

    // --- ROTA 7 e 8: Histórico e Atividade ---
    router.get('/recent-activity', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });
        try {
            const { data, error } = await supabase.from('progresso').select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)').eq('id_utilizador', req.session.userId).order('data_realizacao', { ascending: false }).limit(5);
            if (error) throw error;
            res.json(data);
        } catch (error) { res.status(500).json({ error: "Erro ao carregar atividade recente." }); }
    });

    router.get('/history', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });
        try {
            const { data, error } = await supabase.from('progresso').select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)').eq('id_utilizador', req.session.userId).order('data_realizacao', { ascending: false });
            if (error) throw error;
            res.json(data);
        } catch (error) { res.status(500).json({ error: "Erro ao carregar histórico." }); }
    });
    
    // --- ROTA 8.5: Histórico PÚBLICO (Com censura de Privacidade) ---
    router.get('/history/:id', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });
        const targetId = req.params.id;

        try {
            // 1. Verifica as regras de privacidade do utilizador procurado
            const { data: user, error: userErr } = await supabase
                .from('utilizador')
                .select('priv_perfil_publico, priv_historico')
                .eq('id_utilizador', targetId)
                .single();

            if (userErr || !user) return res.status(404).json({ error: "Utilizador não encontrado." });

            // 2. Se o perfil for privado OU o histórico for privado, bloqueia!
            if (user.priv_perfil_publico === false || user.priv_historico === false) {
                return res.status(403).json({ error: "Acesso Negado pelas configurações de Privacidade." });
            }

            // 3. Se estiver tudo OK, busca o histórico completo
            const { data, error } = await supabase
                .from('progresso')
                .select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)')
                .eq('id_utilizador', targetId)
                .order('data_realizacao', { ascending: false });

            if (error) throw error;
            res.json(data);
            
        } catch (error) { 
            console.error("Erro no histórico público:", error);
            res.status(500).json({ error: "Erro ao carregar histórico." }); 
        }
    });

    // --- ROTA 9: Juntar a um Esquadrão ---
    router.post('/join-turma', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        const { codigo } = req.body;
        if (!codigo || codigo.trim() === '') return res.status(400).json({ error: "O código não pode estar vazio." });

        const { data: turma, error: turmaErr } = await supabase.from('turma').select('id_turma, nome').eq('codigo_acesso', codigo.trim().toUpperCase()).single();
        if (turmaErr || !turma) return res.status(404).json({ error: "Código inválido. Verifica se escreveste bem!" });

        const { error: updateErr } = await supabase.from('utilizador').update({ id_turma: turma.id_turma }).eq('id_utilizador', req.session.userId);
        if (updateErr) return res.status(500).json({ error: "Erro ao associar ao esquadrão." });

        res.json({ message: `Acesso Concedido! Agora pertences ao esquadrão ${turma.nome}!` });
    });

    // --- ROTA 10: DE PESQUISA ---
    router.get('/search', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

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
            console.error("Erro na pesquisa:", error);
            res.status(500).json({ error: "Erro na pesquisa" });
        }
    });
    
    // --- ROTA 11: PÚBLICA DE PERFIL (CENSURADA CONFORME A PRIVACIDADE) ---
    router.get('/user/:id', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        const { id } = req.params;

        try {
            const { data, error } = await supabase
                .from('utilizador')
                // 👇 AQUI ESTÃO TODAS AS COLUNAS, INCLUINDO A priv_estatisticas
                .select('nome, role, foto_perfil, id_turma, pontos_totais, priv_perfil_publico, priv_turma, priv_pontos, priv_medalhas, priv_historico, priv_ranking, priv_ofensiva, priv_estatisticas') 
                .eq('id_utilizador', id)
                .single();

            if (error) return res.status(404).json({ error: "Erro na BD: " + error.message });
            if (!data) return res.status(404).json({ error: "Utilizador não encontrado." });

            // 🔴 1. SE O PERFIL FOR PRIVADO
            if (data.priv_perfil_publico === false) {
                // Ao devolver .status(404), o frontend percebe que o utilizador não existe e redireciona!
                return res.status(404).json({ error: "Utilizador não encontrado." });
            }

            // 🟢 2. SE FOR PÚBLICO: Avalia as restantes opções de privacidade
            
            // Privacidade de Pontos e Nível
            if (data.priv_pontos === false) {
                delete data.pontos_totais;
                data.nivel = null;
            } else {
                const totalPontos = data.pontos_totais || 0;
                let nivel = 1;
                let pontosDoNivelAtual = 0;
                let pontosParaSubir = 200;
                while (totalPontos >= pontosDoNivelAtual + pontosParaSubir) {
                    pontosDoNivelAtual += pontosParaSubir;
                    nivel++;
                    pontosParaSubir = Math.floor(pontosParaSubir * 1.5);
                }
                data.nivel = nivel; 
            }

            // Privacidade de Turma
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

            // Privacidade de Atividade
            if (data.priv_historico) {
                const { data: acts } = await supabase.from('progresso').select('pontos_obtidos, respostas_corretas, total_perguntas, data_realizacao, atividade(titulo, tipo)').eq('id_utilizador', id).order('data_realizacao', { ascending: false }).limit(5);
                data.atividades_recentes = acts || [];
            }

            // Privacidade do Ranking
            if (data.priv_ranking && data.role === 'aluno') {
                const { data: rankingData } = await supabase.from('utilizador').select('id_utilizador').eq('role', 'aluno').eq('priv_ranking', true).order('pontos_totais', { ascending: false });
                if (rankingData) {
                    const myIndex = rankingData.findIndex(u => u.id_utilizador === id);
                    data.posicao_ranking = myIndex !== -1 ? myIndex + 1 : '--';
                }
            }

            // Privacidade da Ofensiva
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

            // 🟢 PRIVACIDADE DE ESTATÍSTICAS (Quizzes, Precisão, Respostas)
            if (data.priv_estatisticas) {
                // Filtramos só os Quizzes para a matemática ficar certa
                const { data: progressoStats } = await supabase
                    .from('progresso')
                    .select('respostas_corretas, total_perguntas, atividade!inner(tipo)')
                    .eq('id_utilizador', id)
                    .eq('atividade.tipo', 'quiz'); 

                let quizzes = 0, respostas = 0, corretas = 0;
                
                if (progressoStats && progressoStats.length > 0) {
                    quizzes = progressoStats.length;
                    progressoStats.forEach(p => {
                        if(p.total_perguntas !== null) respostas += p.total_perguntas;
                        if(p.respostas_corretas !== null) corretas += p.respostas_corretas;
                    });
                }
                data.estatisticas = {
                    quizzes: quizzes,
                    respostas: respostas,
                    precisao: respostas > 0 ? Math.round((corretas / respostas) * 100) : 0
                };
            }

            // 🟢 SE MOSTRAR MEDALHAS: Contamos as medalhas da pessoa
            if (data.priv_medalhas) {
                const { count, error: erroMedalhas } = await supabase
                    .from('utilizador_medalha')
                    .select('*', { count: 'exact', head: true })
                    .eq('id_utilizador', id);
                
                data.total_medalhas = (!erroMedalhas) ? (count || 0) : 0;
            }

            // Passa as flags para o Frontend esconder as coisas
            data.showMedalhas = data.priv_medalhas;
            data.showHistorico = data.priv_historico;
            data.showRanking = data.priv_ranking;
            data.showOfensiva = data.priv_ofensiva;
            data.showEstatisticas = data.priv_estatisticas; 

            res.json(data);

        } catch (error) {
            console.error("❌ Erro interno no servidor:", error);
            res.status(500).json({ error: "Erro ao procurar perfil público." });
        }
    });

    return router;
};