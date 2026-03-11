const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // Função para gerar um código aleatório de 6 caracteres
    const gerarCodigoAcesso = () => {
        const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let codigo = '';
        for (let i = 0; i < 6; i++) {
            codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
        }
        return codigo;
    };

    // Middleware de segurança: Verificar se o utilizador logado é Professor (ou Admin)
    const verificarProfessor = async (req, res, next) => {
        if (!req.session.userId) return res.redirect('/404.html');

        const { data: user, error } = await supabase
            .from('utilizador')
            .select('role')
            .eq('id_utilizador', req.session.userId)
            .single();

        if (error || !user) return res.redirect('/404.html');
        if (user.role !== 'professor' && user.role !== 'admin') return res.redirect('/404.html');
        
        next();
    };

    // 1. Obter as turmas criadas por este professor
    router.get('/turmas', verificarProfessor, async (req, res) => {
        const { data, error } = await supabase
            .from('turma')
            .select(`
                id_turma, 
                nome, 
                ano_letivo,
                codigo_acesso,
                escola (nome)
            `)
            .eq('id_professor', req.session.userId)
            .order('id_turma', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });
        res.json(data || []);
    });

    // 2. Criar uma nova Turma
    router.post('/turmas', verificarProfessor, async (req, res) => {
        const { nome, ano_letivo } = req.body;
        
        try {
            const { data: escolas } = await supabase.from('escola').select('id_escola').limit(1);
            const id_escola = (escolas && escolas.length > 0) ? escolas[0].id_escola : null;

            if (!id_escola) {
                return res.status(400).json({ error: 'Nenhuma escola registada no sistema. O Admin precisa de criar uma na BD.' });
            }

            // Gerar o código de acesso
            const codigo_acesso = gerarCodigoAcesso();

            // Inserir a turma com o código gerado
            const { data, error } = await supabase.from('turma').insert([{
                nome,
                ano_letivo,
                id_escola: id_escola,
                id_professor: req.session.userId,
                codigo_acesso: codigo_acesso // Guardar o código na base de dados
            }]).select();

            if (error) throw error;

            res.json({ 
                message: 'Turma criada com sucesso!', 
                turma: (data && data.length > 0) ? data[0] : null 
            });

        } catch (err) {
            console.error("Erro ao criar turma:", err);
            res.status(500).json({ error: 'Erro interno ao criar turma.' });
        }
    });

    return router;
};