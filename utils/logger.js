const winston = require('winston');
const path = require('path');

// Emojis para identificação visual rápida
const levelEmojis = {
    info: '✅',
    warn: '⚠️',
    error: '❌',
    debug: '🐛'
};

// Filtro para garantir que o security.log não recebe erros técnicos pesados
const soInfoEWarn = winston.format((info) => {
    return (info.level === 'info' || info.level === 'warn') ? info : false;
});

// Formato da mensagem
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => {
        const emoji = levelEmojis[info.level] || '🔹';
        return `[${info.timestamp}] ${emoji} ${info.level.toUpperCase()}: ${info.message}`;
    })
);

const logger = winston.createLogger({
    format: logFormat,
    transports: [
        // Ficheiro para erros técnicos (500, falhas de BD, exceções)
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/error.log'), 
            level: 'error' 
        }),
        // Ficheiro para auditoria de segurança (200, 401, logins, registos)
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/security.log'), 
            level: 'info',
            format: winston.format.combine(soInfoEWarn(), logFormat)
        })
    ]
});

// Mostrar no terminal durante o desenvolvimento
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;