const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

module.exports = (supabase) => {
    
    // Rota de Registo (Tradicional)
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Supabase: Insert
            const { data, error } = await supabase
                .from('utilizador')
                .insert([
                    { nome: username, email: email, senha: hashedPassword, role: 'aluno' } 
                ]);

            if (error) {
                // Erro 23505 no Postgres é "Unique violation" (Email repetido)
                if (error.code === '23505') {
                    return res.status(400).json({ error: "Este e-mail já está em uso." });
                }
                throw error; // Vai para o catch block
            }
                
            logger.info(`[200] Novo Herói Registado: ${username} (${email}) | IP: ${userIp}`);
            res.status(200).json({ success: true });

        } catch (e) {
            logger.error(`[500] Erro interno no registo de (${email}) | IP: ${userIp}: ${e.message}`);
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // Rota de Login (Tradicional)
    router.post('/login', async (req, res) => {
        const { email, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        try {
            // Supabase: Select
            const { data: results, error } = await supabase
                .from('utilizador')
                .select('*')
                .eq('email', email);

            if (error) throw error;

            if (!results || results.length === 0) {
                logger.warn(`[401] Tentativa de login falhada (Email inexistente): ${email} | IP: ${userIp}`);
                return res.status(401).json({ error: "Credenciais inválidas." });
            }

            const user = results[0];

            if (!user.senha) {
                return res.status(403).json({ error: "Esta conta foi criada com o Google. Por favor, utilize o botão 'Continuar com o Google'." });
            }

            const match = await bcrypt.compare(password, user.senha);

            if (!match) {
                logger.warn(`[401] Tentativa de login falhada (Password errada): ${email} | IP: ${userIp}`);
                return res.status(401).json({ error: "Credenciais inválidas." });
            }

            // Sucesso
            req.session.userId = user.id_utilizador;
            req.session.userName = user.nome;
            req.session.role = user.role;
            
            logger.info(`[200] Herói Autenticado: ${user.nome} (Role: ${user.role}) | IP: ${userIp}`);
            res.status(200).json({ success: true, role: user.role });

        } catch (e) {
            logger.error(`[500] Erro ao processar login (${email}) | IP: ${userIp}: ${e.message}`);
            res.status(500).json({ error: "Erro ao processar login." });
        }
    });

    // Rota de Login/Registo com Google
    router.post('/google-login', async (req, res) => {
        const { token, action } = req.body; 
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            
            const payload = ticket.getPayload();
            const { email, name: nome, sub: googleId, picture } = payload;

            // Supabase: Select
            const { data: results, error } = await supabase
                .from('utilizador')
                .select('*')
                .eq('email', email);

            if (error) throw error;

            if (results && results.length > 0) {
                const user = results[0];

                if (!user.google_id) {
                    return res.status(403).json({ 
                        error: "Já existe uma conta criada com este email. Por favor, inicie sessão com a sua palavra-passe." 
                    });
                }

                if (action === 'register') {
                    return res.status(400).json({ 
                        error: "Esta conta Google já está registada. Por favor, faça Login." 
                    });
                }

                // Iniciar Sessão
                req.session.userId = user.id_utilizador;
                req.session.userName = user.nome;
                req.session.role = user.role;
                logger.info(`[200] Herói Autenticado (Google): ${user.nome} (Role: ${user.role}) | IP: ${userIp}`);
                
                return res.status(200).json({ success: true, role: user.role });

            } else {
                // UTILIZADOR NÃO EXISTE
                if (action === 'login') {
                    return res.status(404).json({ 
                        redirect: true, 
                        error: "Conta não encontrada. A redirecionar para o registo..." 
                    });
                }

                if (action === 'register') {
                    const fotoParaGuardar = picture ? picture : "default_avatar.png";

                    // Supabase: Insert
                    // Retornamos os dados inseridos (select()) para podermos guardar o ID na sessão
                    const { data: newUser, error: insertError } = await supabase
                        .from('utilizador')
                        .insert([
                            { 
                                nome: nome, 
                                email: email, 
                                google_id: googleId, 
                                foto_perfil: fotoParaGuardar, 
                                foto_google: picture || null,
                                role: 'aluno'
                            }
                        ])
                        .select(); // Pede ao supabase para devolver a linha inserida

                    if (insertError) {
                        logger.error(`[500] Erro ao criar conta Google (${email}): ${insertError.message}`);
                        return res.status(500).json({ error: "Erro ao criar conta Google" });
                    }

                    const insertedUser = newUser[0];

                    req.session.userId = insertedUser.id_utilizador;
                    req.session.userName = insertedUser.nome;
                    req.session.role = insertedUser.role; 
                    
                    logger.info(`[200] Novo Herói Registado (Google): ${nome} | IP: ${userIp}`);
                    res.status(200).json({ success: true, role: insertedUser.role });
                }
            }
        } catch (error) {
            logger.error(`[400] Token Google Inválido ou Erro DB | IP: ${userIp} | Erro: ${error.message}`);
            res.status(400).json({ error: "Falha na autenticação com a Google" });
        }
    });
    
    return router;
};