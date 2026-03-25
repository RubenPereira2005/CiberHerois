const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

module.exports = (supabase) => {
    
    // --- ROTA DE REGISTO (EMAIL/PASSWORD) ---
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

            if (authError) {
                logger.error(`[400] Erro Auth no registo: ${authError.message} | IP: ${userIp}`);
                return res.status(400).json({ error: authError.message });
            }

            const { error: dbError } = await supabase.from('utilizador').insert([{ 
                id_utilizador: authData.user.id, 
                nome: username, 
                email: email, 
                role: 'aluno',
                foto_perfil: 'default_avatar.png' 
            }]);

            if (dbError) {
                logger.error(`[500] Erro DB ao criar perfil: ${dbError.message}`);
                return res.status(500).json({ error: "Erro ao criar perfil de utilizador." });
            }
                
            logger.info(`[200] Novo Herói Registado: ${username} (${email}) | IP: ${userIp}`);
            res.status(200).json({ success: true, message: "Registo efetuado! Verifica o teu e-mail para confirmar a conta." });

        } catch (e) {
            logger.error(`[500] Erro inesperado no registo: ${e.message}`);
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // --- ROTA DE LOGIN INTELIGENTE (EMAIL/PASSWORD) ---
    router.post('/login', async (req, res) => {
        const { email, password } = req.body;

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            
            if (authError) {
                // A MÁGICA: Se o erro do Supabase falar em confirmação, mandamos essa mensagem específica
                if (authError.message.toLowerCase().includes('confirm')) {
                    return res.status(401).json({ error: "Ainda não confirmaste o teu e-mail!" });
                }
                return res.status(401).json({ error: "Email ou palavra-passe incorretos." });
            }

            const userId = authData.user.id;
            const { data: userData } = await supabase.from('utilizador').select('*').eq('id_utilizador', userId).single();

            if (userData && userData.mfa_ativo === true) {
                const { error: otpError } = await supabase.auth.signInWithOtp({ email });
                if (otpError) return res.status(500).json({ error: "Erro ao enviar código MFA." });
                return res.json({ step: 'mfa', email: userData.email, message: "Password correta. Código enviado." });
            } else {
                req.session.userId = userData.id_utilizador;
                req.session.userName = userData.nome;
                req.session.role = userData.role;
                return res.json({ step: 'done', role: userData.role, message: "Login efetuado!" });
            }
        } catch (e) {
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // --- ROTA DE LOGIN INTELIGENTE COM GOOGLE ---
    router.post('/google-login', async (req, res) => {
        const { token, action } = req.body; // <--- RECEBEMOS O 'ACTION' AQUI
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            if (!token) return res.status(400).json({ error: "Token Google em falta." });

            const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({ provider: 'google', token: token });
            if (authError) throw authError;

            const user = authData.user;
            const { data: existingUser } = await supabase.from('utilizador').select('*').eq('id_utilizador', user.id).single();

            let finalUser;
            if (!existingUser) {
                // A MAGIA ESTÁ AQUI: Se a pessoa clicou no Google na página de Login, rejeitamos!
                if (action === 'login') {
                    return res.status(404).json({ 
                        error: "Conta não encontrada. A redirecionar para o registo...", 
                        redirectToRegister: true 
                    });
                }

                // Se estiver na página de Registo (action === 'register'), então sim, criamos a conta!
                const googlePicture = user.user_metadata?.picture || user.user_metadata?.avatar_url || null;
                const { data: newUser, error: insertError } = await supabase.from('utilizador').insert([{
                    id_utilizador: user.id,
                    nome: user.user_metadata?.full_name || "Herói Google",
                    email: user.email,
                    foto_perfil: googlePicture || 'default_avatar.png',
                    foto_google: googlePicture,
                    role: 'aluno'
                }]).select().single();
                if (insertError) throw insertError;
                finalUser = newUser;
            } else {
                finalUser = existingUser;
            }

            if (finalUser.mfa_ativo === true) {
                const { error: otpError } = await supabase.auth.signInWithOtp({ email: finalUser.email });
                if (otpError) throw otpError;
                return res.json({ step: 'mfa', email: finalUser.email, message: "Google verificado. Código enviado." });
            } else {
                req.session.userId = finalUser.id_utilizador;
                req.session.userName = finalUser.nome;
                req.session.role = finalUser.role;
                logger.info(`[200] Google Auth Sucesso: ${finalUser.email} | IP: ${userIp}`);
                return res.status(200).json({ step: 'done', role: finalUser.role });
            }
        } catch (error) {
            res.status(400).json({ error: "Falha na autenticação com a Google" });
        }
    });

    // --- ROTA DE VERIFICAÇÃO DO CÓDIGO (OTP) ---
    router.post('/verify-otp', async (req, res) => {
        const { email, code } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            if (!email || !code) return res.status(400).json({ error: "Email e código são obrigatórios." });

            const { data: authData, error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'magiclink' });
            if (authError) return res.status(401).json({ error: "Código inválido ou expirado." });

            const user = authData.user;
            const { data: existingUser } = await supabase.from('utilizador').select('*').eq('id_utilizador', user.id).single();

            req.session.userId = existingUser.id_utilizador;
            req.session.userName = existingUser.nome;
            req.session.role = existingUser.role;

            logger.info(`[200] MFA Autenticado com Sucesso: ${existingUser.nome} | IP: ${userIp}`);
            res.status(200).json({ success: true, role: existingUser.role });

        } catch (e) {
            res.status(500).json({ error: "Erro interno ao validar código." });
        }
    });

    // --- ROTA DE LOGOUT ---
    router.post('/logout', (req, res) => {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (req.session.userId) {
            logger.info(`[200] Utilizador terminou sessão: ${req.session.userName} | IP: ${userIp}`);
            req.session.destroy((err) => {
                if (err) {
                    logger.error(`[500] Erro ao destruir sessão: ${err.message}`);
                    return res.status(500).json({ error: 'Erro ao terminar sessão.' });
                }
                res.clearCookie('connect.sid'); // Limpa o cookie de sessão do expressconst express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

module.exports = (supabase) => {
    
    // --- ROTA DE REGISTO (EMAIL/PASSWORD) ---
    router.post('/register', async (req, res) => {
        const { email, username, password } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

            if (authError) {
                logger.error(`[400] Erro Auth no registo: ${authError.message} | IP: ${userIp}`);
                return res.status(400).json({ error: authError.message });
            }

            const { error: dbError } = await supabase.from('utilizador').insert([{ 
                id_utilizador: authData.user.id, 
                nome: username, 
                email: email, 
                role: 'aluno',
                foto_perfil: 'default_avatar.png' 
            }]);

            if (dbError) {
                logger.error(`[500] Erro DB ao criar perfil: ${dbError.message}`);
                return res.status(500).json({ error: "Erro ao criar perfil de utilizador." });
            }
                
            logger.info(`[200] Novo Herói Registado: ${username} (${email}) | IP: ${userIp}`);
            res.status(200).json({ success: true, message: "Registo efetuado! Verifica o teu e-mail para confirmar a conta." });

        } catch (e) {
            logger.error(`[500] Erro inesperado no registo: ${e.message}`);
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // --- ROTA DE LOGIN INTELIGENTE (EMAIL/PASSWORD) ---
    router.post('/login', async (req, res) => {
        const { email, password } = req.body;

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
            
            if (authError) {
                // A MÁGICA: Se o erro do Supabase falar em confirmação, mandamos essa mensagem específica
                if (authError.message.toLowerCase().includes('confirm')) {
                    return res.status(401).json({ error: "Ainda não confirmaste o teu e-mail!" });
                }
                return res.status(401).json({ error: "Email ou palavra-passe incorretos." });
            }

            const userId = authData.user.id;
            const { data: userData } = await supabase.from('utilizador').select('*').eq('id_utilizador', userId).single();

            if (userData && userData.mfa_ativo === true) {
                const { error: otpError } = await supabase.auth.signInWithOtp({ email });
                if (otpError) return res.status(500).json({ error: "Erro ao enviar código MFA." });
                return res.json({ step: 'mfa', email: userData.email, message: "Password correta. Código enviado." });
            } else {
                req.session.userId = userData.id_utilizador;
                req.session.userName = userData.nome;
                req.session.role = userData.role;
                return res.json({ step: 'done', role: userData.role, message: "Login efetuado!" });
            }
        } catch (e) {
            res.status(500).json({ error: "Erro interno no servidor." });
        }
    });

    // --- ROTA DE LOGIN INTELIGENTE COM GOOGLE ---
    router.post('/google-login', async (req, res) => {
        const { token, action } = req.body; // <--- RECEBEMOS O 'ACTION' AQUI
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            if (!token) return res.status(400).json({ error: "Token Google em falta." });

            const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({ provider: 'google', token: token });
            if (authError) throw authError;

            const user = authData.user;
            const { data: existingUser } = await supabase.from('utilizador').select('*').eq('id_utilizador', user.id).single();

            let finalUser;
            if (!existingUser) {
                // A MAGIA ESTÁ AQUI: Se a pessoa clicou no Google na página de Login, rejeitamos!
                if (action === 'login') {
                    return res.status(404).json({ 
                        error: "Conta não encontrada. A redirecionar para o registo...", 
                        redirectToRegister: true 
                    });
                }

                // Se estiver na página de Registo (action === 'register'), então sim, criamos a conta!
                const googlePicture = user.user_metadata?.picture || user.user_metadata?.avatar_url || null;
                const { data: newUser, error: insertError } = await supabase.from('utilizador').insert([{
                    id_utilizador: user.id,
                    nome: user.user_metadata?.full_name || "Herói Google",
                    email: user.email,
                    foto_perfil: googlePicture || 'default_avatar.png',
                    foto_google: googlePicture,
                    role: 'aluno'
                }]).select().single();
                if (insertError) throw insertError;
                finalUser = newUser;
            } else {
                finalUser = existingUser;
            }

            if (finalUser.mfa_ativo === true) {
                const { error: otpError } = await supabase.auth.signInWithOtp({ email: finalUser.email });
                if (otpError) throw otpError;
                return res.json({ step: 'mfa', email: finalUser.email, message: "Google verificado. Código enviado." });
            } else {
                req.session.userId = finalUser.id_utilizador;
                req.session.userName = finalUser.nome;
                req.session.role = finalUser.role;
                logger.info(`[200] Google Auth Sucesso: ${finalUser.email} | IP: ${userIp}`);
                return res.status(200).json({ step: 'done', role: finalUser.role });
            }
        } catch (error) {
            res.status(400).json({ error: "Falha na autenticação com a Google" });
        }
    });

    // --- ROTA DE VERIFICAÇÃO DO CÓDIGO (OTP) ---
    router.post('/verify-otp', async (req, res) => {
        const { email, code } = req.body;
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        try {
            if (!email || !code) return res.status(400).json({ error: "Email e código são obrigatórios." });

            const { data: authData, error: authError } = await supabase.auth.verifyOtp({ email, token: code, type: 'magiclink' });
            if (authError) return res.status(401).json({ error: "Código inválido ou expirado." });

            const user = authData.user;
            const { data: existingUser } = await supabase.from('utilizador').select('*').eq('id_utilizador', user.id).single();

            req.session.userId = existingUser.id_utilizador;
            req.session.userName = existingUser.nome;
            req.session.role = existingUser.role;

            logger.info(`[200] MFA Autenticado com Sucesso: ${existingUser.nome} | IP: ${userIp}`);
            res.status(200).json({ success: true, role: existingUser.role });

        } catch (e) {
            res.status(500).json({ error: "Erro interno ao validar código." });
        }
    });

    // --- ROTA DE LOGOUT ---
    router.post('/logout', (req, res) => {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (req.session.userId) {
            logger.info(`[200] Utilizador terminou sessão: ${req.session.userName} | IP: ${userIp}`);
            req.session.destroy((err) => {
                if (err) {
                    logger.error(`[500] Erro ao destruir sessão: ${err.message}`);
                    return res.status(500).json({ error: 'Erro ao terminar sessão.' });
                }
                res.clearCookie('connect.sid'); // Limpa o cookie de sessão do express
                return res.status(200).json({ success: true, message: 'Sessão terminada com sucesso.' });
            });
        } else {
            res.status(200).json({ success: true, message: 'Nenhuma sessão ativa.' });
        }
    });

    return router;
};
                return res.status(200).json({ success: true, message: 'Sessão terminada com sucesso.' });
            });
        } else {
            res.status(200).json({ success: true, message: 'Nenhuma sessão ativa.' });
        }
    });

    return router;
};