const express = require('express');
const router = express.Router();

module.exports = (supabase) => {

    // --- ROTA: Obter todos os itens da loja e o inventário do utilizador ---
    router.get('/itens', async (req, res) => {
        if (!req.session.userId) return res.status(401).json({ error: "Não autenticado" });
        
        try {
            // 1. Vai buscar todos os itens que existem na loja
            const { data: itens, error: errorItens } = await supabase
                .from('loja_itens')
                .select('*')
                .order('preco', { ascending: true }); // Ordena do mais barato (grátis) para o mais caro
            
            if (errorItens) throw errorItens;

            // 2. Vai buscar o inventário (o que este utilizador já comprou)
            const { data: inventario, error: errorInv } = await supabase
                .from('utilizador_itens')
                .select('id_item')
                .eq('id_utilizador', req.session.userId);

            if (errorInv) throw errorInv;

            // Transforma o inventário num array de IDs para ser mais fácil verificar (ex: [1, 3, 5])
            const itensComprados = inventario.map(i => i.id_item);

            // 3. Junta tudo: Diz ao frontend se cada item está "desbloqueado" ou não
            const lojaComStatus = itens.map(item => ({
                ...item,
                // É considerado comprado se o preço for 0 (Free) OU se o ID do item estiver no inventário dele
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
            // 1. Verificar o preço do item
            const { data: item, error: errorItem } = await supabase
                .from('loja_itens')
                .select('preco, nome')
                .eq('id_item', id_item)
                .single();
            
            if (errorItem || !item) return res.status(404).json({ error: "Item não encontrado na loja." });

            // 2. Verificar o saldo do utilizador
            const { data: user, error: errorUser } = await supabase
                .from('utilizador')
                .select('coins')
                .eq('id_utilizador', req.session.userId)
                .single();

            if (errorUser) throw errorUser;

            // 3. A Lógica de Validação: Tem moedas?
            if (user.coins < item.preco) {
                return res.status(400).json({ error: "Não tens CiberCoins suficientes para comprar isto." });
            }

            // 4. A Lógica de Validação: Já comprou antes?
            const { data: jaTem } = await supabase
                .from('utilizador_itens')
                .select('id_item')
                .eq('id_utilizador', req.session.userId)
                .eq('id_item', id_item)
                .single();
            
            if (jaTem) return res.status(400).json({ error: "Já tens este avatar no teu inventário!" });

            // 5. Fazer a Transação: Descontar moedas E adicionar ao inventário
            const novasCoins = user.coins - item.preco;

            // Atualiza o saldo
            await supabase
                .from('utilizador')
                .update({ coins: novasCoins })
                .eq('id_utilizador', req.session.userId);
            
            // Adiciona ao inventário
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