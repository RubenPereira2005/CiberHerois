require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const morgan = require('morgan');
const logger = require('./utils/logger');

const app = express();
const port = process.env.PORT;

// Garante que a pasta de imagens existe ao arrancar o servidor
const imgDir = path.join(__dirname, 'img');
if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir);
    logger.info('Pasta "img" criada automaticamente.');
}

// Regista todos os pedidos HTTP e encaminha para o logger
app.use(morgan((tokens, req, res) => {
    const status = tokens.status(req, res);
    const metodo = tokens.method(req, res);
    const url = tokens.url(req, res);
    const tempo = tokens['response-time'](req, res);
    return `[${status}] ${metodo} ${url} - ${tempo}ms`;
}, {
    stream: {
        write: (message) => {
            const msg = message.trim();
            if (msg.includes('[5') || msg.includes('[4')) {
                logger.warn(msg);
            } else {
                logger.info(msg);
            }
        }
    }
}));

// Middleware principal
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// ==========================================================
// MIDDLEWARE DE AUTENTICAÇÃO DAS PÁGINAS
// ==========================================================

// Páginas públicas que não requerem sessão ativa
const publicPages = ['/', '/index', '/login', '/register', '/forgot-password', '/update-password', '/404'];

app.use((req, res, next) => {
    // As rotas de API tratam da sua própria autenticação
    if (req.path.startsWith('/api')) return next();
    if (req.path === '/') return next();

    // Ignora verificação para ficheiros estáticos (.css, .js, imagens, etc.)
    const ext = path.extname(req.path);
    if (ext !== '' && ext !== '.html') return next();

    // Normaliza o caminho removendo a extensão .html se presente
    const cleanPath = req.path.endsWith('.html') ? req.path.slice(0, -5) : req.path;

    if (publicPages.includes(cleanPath)) return next();

    // Bloqueia acesso a páginas protegidas sem sessão ativa
    if (!req.session.userId) {
        logger.warn(`[403] Acesso negado a ${cleanPath} - sem sessão.`);
        return res.redirect('/?erro=sem_sessao');
    }

    // Controlo de acesso baseado em roles (RBAC)
    if (cleanPath === '/gestao' && req.session.role !== 'admin') {
        logger.warn(`[403] Acesso negado a /gestao - ${req.session.userName} (${req.session.role})`);
        return res.redirect('/404');
    }

    if (cleanPath === '/professor' && req.session.role !== 'professor' && req.session.role !== 'admin') {
        logger.warn(`[403] Acesso negado a /professor - ${req.session.userName} (${req.session.role})`);
        return res.redirect('/404');
    }

    next();
});

// ==========================================================
// FICHEIROS ESTÁTICOS
// ==========================================================
app.use(express.static(path.join(__dirname, 'pages'), { extensions: ['html'] }));
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// ==========================================================
// LIGAÇÃO AO SUPABASE
// ==========================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    logger.error('CRITICO: SUPABASE_URL ou SUPABASE_KEY em falta no ficheiro .env.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function testarLigacaoSupabase() {
    try {
        const { error } = await supabase.from('utilizador').select('id_utilizador').limit(1);
        if (error) throw error;
        logger.info('[200] Supabase conectado com sucesso.');
    } catch (err) {
        logger.error(`Erro de ligacao ao Supabase: ${err.message}`);
    }
}
testarLigacaoSupabase();

// ==========================================================
// ROTAS
// ==========================================================
app.use('/api', require('./routes/auth')(supabase));
app.use('/api', require('./routes/profile')(supabase));
app.use('/api/quiz', require('./routes/quiz')(supabase));
app.use('/api/pdf', require('./routes/pdf')(supabase));
app.use('/api/gestao', require('./routes/gestao')(supabase));
app.use('/api/stats', require('./routes/stats')(supabase));
app.use('/api/leaderboard', require('./routes/leaderboard')(supabase));
app.use('/api/professor', require('./routes/professor')(supabase));
app.use('/api/shop', require('./routes/shop')(supabase));
app.use('/api/medals', require('./routes/medals')(supabase));
app.use('/api/phishing', require('./routes/phishing')(supabase));
app.use('/api/termo', require('./routes/termo')(supabase));

// Rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// Tratamento global de erros nao capturados
app.use((err, req, res, next) => {
    logger.error(`Erro nao tratado: ${err.message}`);
    res.status(500).json({ erro: 'Ups! Ocorreu um erro interno.' });
});

app.listen(port, () => {
    logger.info(`Servidor CiberHerois em execucao em http://localhost:${port}`);
});