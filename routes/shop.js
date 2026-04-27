const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- ROTA: Obter todos os itens da loja e o inventário do utilizador ---
    router.get('/itens', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        
        try {
            // Vai buscar todos os itens disponiveis na loja
            const { data: itens, error: errorItens } = await supabase
                .from('loja_itens')
                .select('*')
                .order('preco', { ascending: true });
            
            if (errorItens) throw errorItens;

            // Vai buscar os itens que o utilizador ja comprou
            const { data: inventario, error: errorInv } = await supabase
                .from('utilizador_itens')
                .select('id_item')
                .eq('id_utilizador', req.session.userId);

            if (errorInv) throw errorInv;

            // Transforma o inventario num Set para verificacao eficiente
            const itensComprados = inventario.map(i => i.id_item);

            // Junta a informacao da loja com o estado de compra de cada item
            const lojaComStatus = itens.map(item => ({
                ...item,
                // Item considerado comprado se o preco for 0 (gratuito) ou se o ID estiver no inventario
                comprado: item.preco === 0 || itensComprados.includes(item.id_item)
            }));

            res.json(lojaComStatus);
        } catch (err) {
            console.error("Erro ao carregar a loja:", err);
            res.status(500).json({ error: "Erro ao carregar os itens da loja." });
        }
    });

    // --- ROTA: Comprar um avatar ---
    router.post('/comprar', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        const { id_item } = req.body;

        try {
            // Verifica o preco do item
            const { data: item, error: errorItem } = await supabase
                .from('loja_itens')
                .select('preco, nome')
                .eq('id_item', id_item)
                .single();
            
            if (errorItem || !item) return res.status(404).json({ error: "Item não encontrado na loja." });

            // Verifica o saldo atual do utilizador
            const { data: user, error: errorUser } = await supabase
                .from('utilizador')
                .select('coins')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (errorUser) throw errorUser;

            // Valida se o utilizador tem moedas suficientes
            if (user.coins < item.preco) {
                return res.status(400).json({ error: "Não tens CiberCoins suficientes para comprar isto." });
            }

            // Valida se o utilizador ja tem este item
            const { data: jaTem } = await supabase
                .from('utilizador_itens')
                .select('id_item')
                .eq('id_utilizador', req.session.userId)
                .eq('id_item', id_item)
                .single();
            
            if (jaTem) return res.status(400).json({ error: "Já tens este avatar no teu inventário!" });

            // Executa a transacao: desconta as moedas e regista o item no inventario
            const novasCoins = user.coins - item.preco;

            // Atualiza o saldo do utilizador
            await supabase
                .from('utilizador')
                .update({ coins: novasCoins })
                .eq('id_utilizador', req.session.userId);
            
            // Adiciona o item ao inventario do utilizador
            await supabase
                .from('utilizador_itens')
                .insert({ id_utilizador: req.session.userId, id_item: id_item });

            res.json({ 
                message: `Compraste o avatar ${item.nome} com sucesso!`, 
                novasCoins: novasCoins 
            });
            
        } catch (err) {
            console.error("Erro ao comprar:", err);
            res.status(500).json({ error: "Erro interno ao processar a compra." });
        }
    });

    return router;
};