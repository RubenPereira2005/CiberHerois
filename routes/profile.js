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
    
    // --- ROTA 1: Obter dados ---
    router.get('/me', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        // 1. Vai buscar os dados do utilizador e o ID da turma a que pertence
        const { data, error } = await supabase
            .from('utilizador')
            .select('nome, email, role, mfa_ativo, foto_perfil, foto_google, foto_upload, id_turma')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !data) return res.status(404).json({ error: "Utilizador não encontrado." });

        // 2. Se o utilizador tiver uma turma associada, vai buscar o nome da turma e da escola
        if (data.id_turma) {
            const { data: turmaData } = await supabase
                .from('turma')
                .select('nome, escola(nome)')
                .eq('id_turma', data.id_turma)
                .single();
            data.turma = turmaData;
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
            // (Verificação flexível: aceita boolean ou string do frontend)
            if (mfa_ativo === true || mfa_ativo === 'true') {
                const { data: userDados, error: userError } = await supabase
                    .from('utilizador')
                    .select('pontos_totais, mfa_recompensa_recebida')
                    .eq('id_utilizador', req.session.userId)
                    .single();

                if (userError) throw userError;

                // Se ainda não recebeu a recompensa, dá os 50 pontos!
                if (userDados && userDados.mfa_recompensa_recebida === false) {
                    const novosPontos = (userDados.pontos_totais || 0) + 50;
                    
                    const { error: updateError } = await supabase
                        .from('utilizador')
                        .update({ 
                            mfa_ativo: true,
                            pontos_totais: novosPontos,
                            mfa_recompensa_recebida: true // Bloqueia para não ganhar duas vezes
                        })
                        .eq('id_utilizador', req.session.userId);

                    if (updateError) throw updateError;

                    return res.json({ message: "MFA ativado! Ganhaste +50 Pontos de XP!", recompensa: true });
                }
            }

            // Se for para desativar, ou se já ganhou a recompensa antes, apenas atualiza o estado
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

    // --- ROTA 7: Obter Atividade Recente do Utilizador ---
    router.get('/recent-activity', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            const { data, error } = await supabase
                .from('progresso')
                .select(`
                    pontos_obtidos,
                    respostas_corretas,
                    total_perguntas,
                    data_realizacao,
                    atividade (
                        titulo,
                        tipo
                    )
                `)
                .eq('id_utilizador', req.session.userId)
                .order('data_realizacao', { ascending: false })
                .limit(5);

            if (error) throw error;
            res.json(data);
        } catch (error) {
            console.error("Erro ao carregar atividade recente:", error);
            res.status(500).json({ error: "Erro ao carregar atividade recente." });
        }
    });

    // --- ROTA 8: Obter TODO o Histórico do Utilizador ---
    router.get('/history', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        try {
            const { data, error } = await supabase
                .from('progresso')
                .select(`
                    pontos_obtidos,
                    respostas_corretas,
                    total_perguntas,
                    data_realizacao,
                    atividade (
                        titulo,
                        tipo
                    )
                `)
                .eq('id_utilizador', req.session.userId)
                .order('data_realizacao', { ascending: false });

            if (error) throw error;
            res.json(data);
        } catch (error) {
            console.error("Erro ao carregar histórico completo:", error);
            res.status(500).json({ error: "Erro ao carregar histórico." });
        }
    });
    
    // --- ROTA 9: Juntar a um Esquadrão (Turma) através de Código ---
    router.post('/join-turma', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        const { codigo } = req.body;
        
        if (!codigo || codigo.trim() === '') return res.status(400).json({ error: "O código não pode estar vazio." });

        // 1. Procurar se existe alguma turma com este código
        const { data: turma, error: turmaErr } = await supabase
            .from('turma')
            .select('id_turma, nome')
            .eq('codigo_acesso', codigo.trim().toUpperCase())
            .single();

        if (turmaErr || !turma) {
            return res.status(404).json({ error: "Código inválido. Verifica se escreveste bem!" });
        }

        // 2. Associar o utilizador à turma encontrada
        const { error: updateErr } = await supabase
            .from('utilizador')
            .update({ id_turma: turma.id_turma })
            .eq('id_utilizador', req.session.userId);

        if (updateErr) return res.status(500).json({ error: "Erro ao associar ao esquadrão." });

        res.json({ message: `Acesso Concedido! Agora pertences ao esquadrão ${turma.nome}!` });
    });

    return router;
};