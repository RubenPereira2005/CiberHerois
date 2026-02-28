const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// --- CONFIGURAÇÃO DO MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../img/uploads')); 
    },
    filename: (req, file, cb) => {
        const extensao = path.extname(file.originalname);
        const novoNome = `upload-${req.session.userId}-${Date.now()}${extensao}`;
        cb(null, novoNome);
    }
});
const upload = multer({ storage: storage });

module.exports = (db) => {
    
    // --- ROTA 1: Obter dados ---
    router.get('/me', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const query = "SELECT nome, email, tipo_utilizador, foto_perfil, foto_google, foto_upload FROM Utilizador WHERE id_utilizador = ?";
        
        db.query(query, [req.session.userId], (err, results) => {
            if (err) return res.status(500).json({ error: "Erro ao carregar perfil." });
            if (results.length === 0) return res.status(404).json({ error: "Utilizador não encontrado." });
            
            res.json(results[0]);
        });
    });

    // --- ROTA 2: Atualizar Nome ---
    router.put('/update', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const { nome } = req.body;
        if (!nome || nome.trim() === "") return res.status(400).json({ error: "O nome não pode estar vazio." });

        const query = "UPDATE Utilizador SET nome = ? WHERE id_utilizador = ?";
        db.query(query, [nome, req.session.userId], (err, result) => {
            if (err) return res.status(500).json({ error: "Erro ao atualizar dados." });
            res.json({ message: "Dados atualizados com sucesso!" });
        });
    });

    // --- ROTA 3: Apagar Conta ---
    router.delete('/delete', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Utilizador não autenticado" });

        const query = "DELETE FROM Utilizador WHERE id_utilizador = ?";
        db.query(query, [req.session.userId], (err, result) => {
            if (err) return res.status(500).json({ error: "Erro ao apagar conta." });

            req.session.destroy((err) => {
                if (err) return res.status(500).json({ error: "Conta apagada, mas erro ao terminar sessão." });
                res.json({ message: "Conta eliminada permanentemente." });
            });
        });
    });

    // --- ROTA 4: Atualizar Avatar ---
    router.put('/update-avatar', (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });

        const { avatar } = req.body;
        if (!avatar) return res.status(400).json({ error: "Nenhum avatar enviado." });

        const query = "UPDATE Utilizador SET foto_perfil = ? WHERE id_utilizador = ?";
        db.query(query, [avatar, req.session.userId], (err) => {
            if (err) return res.status(500).json({ error: "Erro ao atualizar avatar." });
            res.json({ message: "Avatar atualizado com sucesso!" });
        });
    });

    // --- ROTA 5: Upload de Nova Foto Personalizada ---
    router.post('/upload-avatar', upload.single('ficheiroAvatar'), (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        if (!req.file) return res.status(400).json({ error: "Nenhum ficheiro recebido." });

        const nomeDoFicheiro = req.file.filename;
        
        // Guarda o novo ficheiro como ativo (foto_perfil) e guarda-o na memória (foto_upload)
        const query = "UPDATE Utilizador SET foto_perfil = ?, foto_upload = ? WHERE id_utilizador = ?";
        
        db.query(query, [nomeDoFicheiro, nomeDoFicheiro, req.session.userId], (err) => {
            if (err) return res.status(500).json({ error: "Erro ao guardar na base de dados." });
            res.json({ message: "Upload concluído!", filename: nomeDoFicheiro });
        });
    });

    return router;
};