require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const fs = require('fs'); // Necessário para criar as pastas
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

// Criar a pasta uploads dentro da pasta img
const uploadsDir = path.join(__dirname, 'img', 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
    console.log('📁 Sub-pasta "img/uploads" criada automaticamente!');
}

// Regista todos os pedidos HTTP (quem visita o quê) no log do sistema
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

// Servir Estáticos
app.use(express.static(path.join(__dirname, 'pages')));
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));

// Ligação BD
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) {
        logger.error(`[500] Falha na ligação à Base de Dados: ${err.message}`);
        console.error(`❌ ERRO BD: ${err.message}`); 
    } else {
        logger.info('[200] MySQL Conectado com sucesso!');
        console.log('✅ MySQL Conectado com sucesso!'); 
    }
});

// --- IMPORTAR ROTAS ---
const authRoutes = require('./routes/auth')(db); 
app.use('/api', authRoutes);

const profileRoutes = require('./routes/profile')(db); 
app.use('/api', profileRoutes);

const quizRoutes = require('./routes/quiz')(db); 
app.use('/api/quiz', quizRoutes);

const pdfRoutes = require('./routes/pdf')(db); 
app.use('/api/pdf', pdfRoutes);

// Rota principal (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

// Middleware de Erros Globais (Rede de Segurança)
app.use((err, req, res, next) => {
    logger.error(`[500] Falha Crítica em ${req.originalUrl} | Motivo: ${err.message} | IP: ${req.ip}`);
    res.status(500).json({ erro: 'Ups! Ocorreu um erro interno. A nossa equipa de segurança foi notificada.' });
});

app.listen(port, () => {
    logger.info(`[200] Servidor CiberHeróis pronto na porta ${port}`);
    console.log(`🚀 Servidor CiberHeróis pronto em http://localhost:${port}`); 
});