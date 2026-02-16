// Ficheiro: routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

module.exports = (db) => {
    
    // Rota: /api/register
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const query = "INSERT INTO Utilizador (nome, email, senha) VALUES (?, ?, ?)";
            
            db.query(query, [username, email, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: "Erro ao criar conta." });
                res.status(200).json({ success: true });
            });
        } catch (e) {
            res.status(500).json({ error: "Erro no servidor." });
        }
    });

    // Rota: /api/login
    router.post('/login', (req, res) => {
        const { email, password } = req.body;
        // Nota: Verifica se a tabela na BD é 'utilizador' ou 'Utilizador' (Maiúscula/Minúscula importa no Linux)
        const query = "SELECT * FROM Utilizador WHERE email = ?";
        
        db.query(query, [email], async (err, results) => {
            if (err || results.length === 0) return res.status(401).json({ error: "Utilizador não encontrado." });

            const user = results[0];
            const match = await bcrypt.compare(password, user.senha);

            if (match) {
                req.session.userId = user.id_utilizador;
                req.session.userName = user.nome;
                res.status(200).json({ success: true });
            } else {
                res.status(401).json({ error: "Password incorreta." });
            }
        });
    });
    return router;
};