const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

module.exports = (db) => {
    
    // Rota de Registo (Tradicional)
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            // senha não é null, e google_id fica null (por defeito na BD)
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

    // Rota de Login (Tradicional)
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

            // Proteção extra: Se a senha for NULL, significa que a conta é exclusiva do Google
            if (!user.senha) {
                return res.status(403).json({ error: "Esta conta foi criada com o Google. Por favor, utilize o botão 'Continuar com o Google'." });
            }

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

    // Rota de Login/Registo com Google
    router.post('/google-login', async (req, res) => {
        const { token, action } = req.body; // 'action' vem do HTML (login ou register)
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            // 1. Validar o token
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            
            const payload = ticket.getPayload();
            const { email, name: nome, sub: googleId } = payload;

            // 2. Procurar na BD
            db.query("SELECT * FROM Utilizador WHERE email = ?", [email], (err, results) => {
                if (err) {
                    logger.error(`[500] Erro DB Google Login (${email}): ${err.message}`);
                    return res.status(500).json({ error: "Erro interno no servidor" });
                }

                if (results.length > 0) {
                    const user = results[0];

                    // Email existe, mas não tem google_id (Foi criado pelo formulário com palavra-passe)
                    if (!user.google_id) {
                        return res.status(403).json({ 
                            error: "Já exsite uma conta criada com este email. Por favor, inicie sessão com a sua palavra-passe." 
                        });
                    }

                    // Se a pessoa clicou em "Registar", mas a conta Google já existe na BD
                    if (action === 'register') {
                        return res.status(400).json({ 
                            error: "Esta conta Google já está registada. Por favor, faça Login." 
                        });
                    }

                    // Se for login e tudo estiver certo: Iniciar Sessão
                    req.session.userId = user.id_utilizador;
                    req.session.userName = user.nome;
                    logger.info(`[200] Herói Autenticado (Google): ${user.nome} | IP: ${userIp}`);
                    
                    return res.status(200).json({ success: true });

                } else {
                    // O UTILIZADOR NÃO EXISTE NA BD
                    
                    if (action === 'login') {
                        return res.status(404).json({ 
                            redirect: true, 
                            error: "Conta não encontrada. A redirecionar para o registo..." 
                        });
                    }

                    // Se clicou no botão da página de Registo, criamos a conta!
                    if (action === 'register') {
                        // Insere a senha como NULL e guarda o google_id para identificar que esta conta é do Google
                        const queryInsert = "INSERT INTO Utilizador (nome, email, senha, google_id) VALUES (?, ?, NULL, ?)";

                        db.query(queryInsert, [nome, email, googleId], (err, result) => {
                            if (err) {
                                logger.error(`[500] Erro ao criar conta Google (${email}): ${err.message}`);
                                return res.status(500).json({ error: "Erro ao criar conta Google" });
                            }

                            req.session.userId = result.insertId;
                            req.session.userName = nome;
                            logger.info(`[200] Novo Herói Registado (Google): ${nome} | IP: ${userIp}`);
                            
                            res.status(200).json({ success: true });
                        });
                    }
                }
            });
        } catch (error) {
            logger.error(`[400] Token Google Inválido | IP: ${userIp} | Erro: ${error.message}`);
            res.status(400).json({ error: "Falha na autenticação com a Google" });
        }
    });
    
    return router;
};