require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-muito-seguro',
    resave: false,
    saveUninitialized: false
}));

// Servir Estáticos
app.use(express.static(path.join(__dirname, 'pages')));
app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));

// Ligação BD
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) console.error('Erro BD:', err);
    else console.log('✅ MySQL Conectado!');
});

// --- IMPORTAR ROTAS ---

// 1. Autenticação (Login e Registo)
const authRoutes = require('./routes/auth')(db); 
app.use('/api', authRoutes);

// 2. Perfil (Dados, Atualizar, Apagar)
const profileRoutes = require('./routes/profile')(db); 
app.use('/api', profileRoutes);

// 3. Quizzes (Perguntas, Opções, etc)
const quizRoutes = require('./routes/quiz')(db); 
app.use('/api/quiz', quizRoutes);


// Rota principal (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Servidor pronto em http://localhost:${port}`);
});