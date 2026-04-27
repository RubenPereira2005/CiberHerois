const winston = require('winston');
const path = require('path');

// Rotulos de nivel para identificacao visual no log
const levelLabels = {
    info: '[INFO]',
    warn: '[AVISO]',
    error: '[ERRO]',
    debug: '[DEBUG]'
};

// Filtro para garantir que o security.log nao recebe erros tecnicos pesados
const soInfoEWarn = winston.format((info) => {
    return (info.level === 'info' || info.level === 'warn') ? info : false;
});

// Formato da mensagem
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => {
        return `[${info.timestamp}] ${levelLabels[info.level] || info.level.toUpperCase()} ${info.message}`;
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

// Apresenta os logs no terminal durante o desenvolvimento
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

module.exports = logger;