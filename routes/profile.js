const express = require('express');
const router = express.Router();

module.exports = (db) => {
    
    // --- ROTA 1: Obter dados (JÁ TINHAS ESTA) ---
    // GET /api/me
    router.get('/me', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Utilizador não autenticado" });
        }

        const query = "SELECT nome, email, tipo_utilizador, foto_perfil FROM Utilizador WHERE id_utilizador = ?";
        
        db.query(query, [req.session.userId], (err, results) => {
            if (err) return res.status(500).json({ error: "Erro ao carregar perfil." });
            if (results.length === 0) return res.status(404).json({ error: "Utilizador não encontrado." });
            
            res.json(results[0]);
        });
    });

    // --- ROTA 2: Atualizar Nome (NOVA) ---
    // PUT /api/update
    router.put('/update', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Utilizador não autenticado" });
        }

        const { nome } = req.body;

        // Validação simples
        if (!nome || nome.trim() === "") {
            return res.status(400).json({ error: "O nome não pode estar vazio." });
        }

        const query = "UPDATE Utilizador SET nome = ? WHERE id_utilizador = ?";
        
        db.query(query, [nome, req.session.userId], (err, result) => {
            if (err) {
                console.error("Erro SQL:", err);
                return res.status(500).json({ error: "Erro ao atualizar dados." });
            }
            res.json({ message: "Dados atualizados com sucesso!" });
        });
    });

    // --- ROTA 3: Apagar Conta  ---
    // DELETE /api/delete
    router.delete('/delete', (req, res) => {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Utilizador não autenticado" });
        }

        const query = "DELETE FROM Utilizador WHERE id_utilizador = ?";
        
        db.query(query, [req.session.userId], (err, result) => {
            if (err) {
                console.error("Erro SQL:", err);
                return res.status(500).json({ error: "Erro ao apagar conta." });
            }

            // Importante: Destruir a sessão depois de apagar a conta
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).json({ error: "Conta apagada, mas erro ao terminar sessão." });
                }
                res.json({ message: "Conta eliminada permanentemente." });
            });
        });
    });

    return router;
};