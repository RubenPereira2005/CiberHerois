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

// --- GARANTIR QUE AS PASTAS EXISTEM ---
const imgDir = path.join(__dirname, 'img');
if (!fs.existsSync(imgDir)){
    fs.mkdirSync(imgDir);
    console.log('📁 Pasta "img" criada automaticamente na raiz do projeto!');
}

// Regista todos os pedidos HTTP
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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// ==========================================
// MIDDLEWARE DE AUTENTICAÇÃO DAS PÁGINAS
// ==========================================
// Lista Branca (Ficheiros que qualquer um pode abrir) - Agora sem o .html
const publicPages = [
    '/',
    '/index',
    '/login',
    '/register',
    '/forgot-password',
    '/update-password',
    '/404'
];

app.use((req, res, next) => {
    // Ignorar as rotas de API (deixamos os routers da API tratarem da sua própria segurança)
    if (req.path.startsWith('/api')) return next();

    // Lidar com a página inicial explicitamente
    if (req.path === '/') return next();

    // Se o ficheiro tiver uma extensão que não seja .html (ex: .css, .js, .png, .svg), ignoramos a verificação
    const ext = path.extname(req.path);
    if (ext !== '' && ext !== '.html') return next();

    // Normalizar o caminho: remove o .html caso o utilizador tente aceder à moda antiga
    const cleanPath = req.path.endsWith('.html') ? req.path.slice(0, -5) : req.path;

    // Se estiver na lista branca, deixa passar
    if (publicPages.includes(cleanPath)) {
        return next();
    }

    // Se tentar aceder a uma página protegida sem sessão iniciada: bloquear e redirecionar
    if (!req.session.userId) {
        logger.warn(`[403] Acesso negado a ${cleanPath} - Sem sessão. A redirecionar para index`);
        return res.redirect('/?erro=sem_sessao'); 
    }

    // Verificação de Roles para páginas específicas (Role-Based Access Control)
    if (cleanPath === '/gestao' && req.session.role !== 'admin') {
        logger.warn(`[403] Acesso negado a gestao - Utilizador ${req.session.userName} (${req.session.role})`);
        return res.redirect('/404');
    }

    if (cleanPath === '/professor' && req.session.role !== 'professor' && req.session.role !== 'admin') {
        logger.warn(`[403] Acesso negado a professor - Utilizador ${req.session.userName} (${req.session.role})`);
        return res.redirect('/404');
    }

    next();
});

// ==========================================
// SERVIR FICHEIROS ESTÁTICOS
// ==========================================
// O { extensions: ['html'] } diz ao Express para assumir o .html nas páginas
app.use(express.static(path.join(__dirname, 'pages'), { extensions: ['html'] }));
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// ==========================================
// LIGAÇÃO AO SUPABASE
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO CRÍTICO: Variáveis SUPABASE_URL ou SUPABASE_KEY não foram encontradas no ficheiro .env!'); 
    logger.error('❌ ERRO CRÍTICO: Variáveis em falta no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Testar a ligação
async function testarLigacaoSupabase() {
    try {
        const { error } = await supabase.from('utilizador').select('id_utilizador').limit(1);
        if (error) throw error;
        logger.info('[200] Supabase Conectado com sucesso!');
        console.log('✅ Supabase Conectado com sucesso!'); 
    } catch (err) {
        console.error(`❌ ERRO SUPABASE: ${err.message}`); 
    }
}
testarLigacaoSupabase();

// --- IMPORTAR ROTAS ---
const authRoutes = require('./routes/auth')(supabase); 
app.use('/api', authRoutes);

const profileRoutes = require('./routes/profile')(supabase); 
app.use('/api', profileRoutes);

const quizRoutes = require('./routes/quiz')(supabase); 
app.use('/api/quiz', quizRoutes);

const pdfRoutes = require('./routes/pdf')(supabase); 
app.use('/api/pdf', pdfRoutes);

const gestaoRoutes = require('./routes/gestao')(supabase);
app.use('/api/gestao', gestaoRoutes);

const statsRoutes = require('./routes/stats')(supabase); 
app.use('/api/stats', statsRoutes);

const leaderboardRoutes = require('./routes/leaderboard')(supabase);
app.use('/api/leaderboard', leaderboardRoutes);

const professorRoutes = require('./routes/professor')(supabase);
app.use('/api/professor', professorRoutes);

const shopRoutes = require('./routes/shop')(supabase);
app.use('/api/shop', shopRoutes);

// Rota principal (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// Middleware de Erros Globais
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ erro: 'Ups! Ocorreu um erro interno.' });
});

app.listen(port, () => {
    console.log(`🚀 Servidor CiberHeróis pronto em http://localhost:${port}`); 
});