require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const session = require('express-session');
const fs = require('fs'); 

const morgan = require('morgan'); 
const logger = require('./utils/logger'); 

const app = express();
const port = process.env.PORT || 3000;

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

// Proteção gestao
app.get('/gestao.html', (req, res, next) => {
    if (req.session && req.session.role === 'admin') {
        next(); 
    } else {
        res.status(404).send(`<h1>404</h1><p>Acesso Negado</p>`);
    }
});

// Servir Estáticos
app.use(express.static(path.join(__dirname, 'pages')));
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

// Rota principal (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// Middleware de Erros Globais
app.use((err, req, res, next) => {
    res.status(500).json({ erro: 'Ups! Ocorreu um erro interno.' });
});

app.listen(port, () => {
    console.log(`🚀 Servidor CiberHeróis pronto em http://localhost:${port}`); 
});