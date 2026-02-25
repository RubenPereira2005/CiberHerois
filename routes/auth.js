const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

module.exports = (db) => {
    
    // Rota de Registo
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const query = "INSERT INTO Utilizador (nome, email, senha) VALUES (?, ?, ?)";
            
            db.query(query, [username, email, hashedPassword], (err, result) => {
                if (err) {
                    logger.error(`[500] Erro DB ao registar conta (${email}) de IP ${userIp}: ${err.message}`);
                    return res.status(500).json({ error: "Erro ao criar conta. O e-mail já pode estar em uso." });
                }
                
                logger.info(`[200] Novo Herói Registado: ${username} (${email}) | IP: ${userIp}`);
                res.status(200).json({ success: true });
            });
        } catch (e) {
            logger.error(`[500] Erro interno no registo de (${email}) | IP: ${userIp}: ${e.message}`);
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // Rota de Login
    router.post('/login', (req, res) => {
        const { email, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const query = "SELECT * FROM Utilizador WHERE email = ?";
        
        db.query(query, [email], async (err, results) => {
            if (err) {
                logger.error(`[500] Erro DB no login de (${email}) | IP: ${userIp}: ${err.message}`);
                return res.status(500).json({ error: "Erro interno no servidor." });
            }

            if (results.length === 0) {
                logger.warn(`[401] Tentativa de login falhada (Email inexistente): ${email} | IP: ${userIp}`);
                return res.status(401).json({ error: "Credenciais inválidas." });
            }

            const user = results[0];

            try {
                const match = await bcrypt.compare(password, user.senha);

                if (!match) {
                    logger.warn(`[401] Tentativa de login falhada (Password errada): ${email} | IP: ${userIp}`);
                    return res.status(401).json({ error: "Credenciais inválidas." });
                }

                // Sucesso: Criar sessão
                req.session.userId = user.id_utilizador;
                req.session.userName = user.nome;
                
                logger.info(`[200] Herói Autenticado: ${user.nome} (ID: ${user.id_utilizador}) | IP: ${userIp}`);
                res.status(200).json({ success: true });

            } catch (bcryptErr) {
                logger.error(`[500] Erro ao comparar passwords (${email}) | IP: ${userIp}: ${bcryptErr.message}`);
                res.status(500).json({ error: "Erro ao processar login." });
            }
        });
    });
    
    return router;
};