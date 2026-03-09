const express = require('express');
const router = express.Router();
const multer = require('multer');

// --- NOVA CONFIGURAÇÃO DO MULTER (Memória em vez de Disco) ---
// Guarda na memória RAM temporariamente e com limite máximo de 2MB
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 } // Limite de 2MB!
});

module.exports = (supabase) => {
    
    // --- ROTA 1: Obter dados ---
    router.get('/me', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { data, error } = await supabase
            .from('utilizador')
            .select('nome, email, role, mfa_ativo, foto_perfil, foto_google, foto_upload')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !data) return res.status(404).json({ error: "Utilizador não encontrado." });
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
            // 1. Apagar o utilizador diretamente do Supabase Auth.
            // Como usas a Service Role Key, tens permissão para fazer isto.
            // Graças ao "ON DELETE CASCADE", o Postgres apaga automaticamente o perfil na tabela 'utilizador'.
            const { data, error } = await supabase.auth.admin.deleteUser(req.session.userId);
            
            if (error) throw error;

            // 2. Destruir a sessão local do Node.js
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

    // --- ROTA 5: Upload de Nova Foto Personalizada (SUPABASE STORAGE OTIMIZADO) ---
    router.post('/upload-avatar', upload.single('ficheiroAvatar'), async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        if (!req.file) return res.status(400).json({ error: "Nenhum ficheiro recebido." });

        try {
            // 1. Procurar se o utilizador já tem um upload antigo para o apagar
            const { data: user } = await supabase.from('utilizador').select('foto_upload').eq('id_utilizador', req.session.userId).single();

            if (user && user.foto_upload && user.foto_upload.includes('supabase.co')) {
                // Extrai apenas o nome final do ficheiro para o apagar do Storage
                const urlPartes = user.foto_upload.split('/');
                const ficheiroAntigo = urlPartes[urlPartes.length - 1];
                
                // NOTA: Sem o 'await', o servidor manda apagar em background e não fica à espera!
                supabase.storage.from('avatars').remove([ficheiroAntigo]).catch(err => console.error("Erro ao apagar antiga:", err));
            }

            // 2. Gerar o nome para o novo ficheiro
            const extensao = req.file.originalname.split('.').pop();
            const novoNome = `upload-${req.session.userId}-${Date.now()}.${extensao}`;

            // 3. Fazer o Upload do buffer para o Supabase
            const { error: uploadError } = await supabase.storage.from('avatars').upload(novoNome, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
            if (uploadError) throw uploadError;

            // 4. Obter o URL público da imagem no Supabase
            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(novoNome);
            const urlImagem = publicUrlData.publicUrl;

            // 5. Guardar o URL na base de dados
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

    // --- ROTA 6: Ligar/Desligar MFA ---
    router.put('/update-mfa', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { mfa_ativo } = req.body;

        const { error } = await supabase
            .from('utilizador')
            .update({ mfa_ativo: mfa_ativo })
            .eq('id_utilizador', req.session.userId);

        if (error) return res.status(500).json({ error: "Erro ao atualizar estado MFA." });
        res.json({ message: "Estado MFA atualizado com sucesso!" });
    });

    return router;
};