const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

module.exports = (supabase) => {
    const router = express.Router();

    // Template SUPER SIMPLES e PURO (Apenas Texto, sem ícones, sem metadados)
    const buildPDFTemplate = (recurso) => {
        let seccoesHTML = '';
        let seccoes = [];
        try { if (recurso.seccoes) seccoes = typeof recurso.seccoes === 'string' ? JSON.parse(recurso.seccoes) : recurso.seccoes; } catch (e) {}

        if (Array.isArray(seccoes)) {
            seccoes.forEach(sec => {
                // Troca as quebras de linha por duplo <br> para fazer parágrafos bonitos
                const texto = sec.texto ? String(sec.texto).replace(/\n/g, '<br><br>') : '';
                seccoesHTML += `
                <div class="section">
                    <h2>${sec.titulo || ''}</h2>
                    <p>${texto}</p>
                </div>`;
            });
        }

        return `
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <style>
                /* CSS Mínimo e Limpo para PDF (Estilo Livro/Documento) */
                body {
                    font-family: Arial, Helvetica, sans-serif;
                    line-height: 1.6;
                    color: #000;
                    margin: 0;
                    padding: 0;
                }
                .header {
                    border-bottom: 2px solid #10b981;
                    padding-bottom: 15px;
                    margin-bottom: 30px;
                }
                .category {
                    color: #10b981;
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 12px;
                    letter-spacing: 1px;
                }
                h1 {
                    font-size: 28px;
                    color: #111;
                    margin: 10px 0;
                }
                .desc {
                    font-size: 16px;
                    color: #444;
                    font-style: italic;
                    margin: 0;
                }
                .section {
                    margin-bottom: 30px;
                    page-break-inside: avoid;
                }
                h2 {
                    font-size: 20px;
                    color: #222;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 5px;
                    margin-bottom: 15px;
                }
                p, li {
                    font-size: 14px;
                    color: #333;
                    margin: 0 0 10px 0;
                    text-align: justify;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="category">${recurso.tipo ? recurso.tipo.toUpperCase() : 'DOCUMENTO'}</div>
                <h1>${recurso.titulo || 'Recurso Educativo'}</h1>
                <p class="desc">${recurso.descricao || ''}</p>
            </div>
            <div class="content">
                ${seccoesHTML}
            </div>
        </body>
        </html>`;
    };

    router.get('/download/:pageName', async (req, res) => {
        const pageName = req.params.pageName;
        
        // 1. Identificar se é um ficheiro físico antigo
        const absolutePath = path.resolve(__dirname, '../pages', `${pageName}.html`);
        const isPhysicalFile = fs.existsSync(absolutePath);
        
        let recursoDB = null;
        if (!isPhysicalFile) {
            let queryName = pageName.replace('.html', '');
            const { data } = await supabase.from('materialpedagogico').select('*').eq('url_conteudo', queryName).single();
            if (data) recursoDB = data;
        }

        if (!isPhysicalFile && !recursoDB) {
            return res.status(404).send('Erro: Recurso não encontrado.');
        }

        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });

        try {
            const page = await browser.newPage();
            
            if (isPhysicalFile) {
                // PÁGINAS MANUAIS: Lê a página HTML e limpa-a brutalmente via CSS
                await page.goto(`file://${absolutePath}`, { waitUntil: ['networkidle0', 'domcontentloaded'], timeout: 30000 });
                
                // Remove o Javascript dos ícones para eles nem tentarem renderizar
                await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script');
                    scripts.forEach(s => s.remove());
                });

                // Injeta um CSS que esconde tudo o que não seja texto e formata como um Documento
                await page.addStyleTag({ content: `
                    body, .site-body { background: white !important; color: black !important; font-family: Arial, sans-serif !important; }
                    * { box-shadow: none !important; border-radius: 0 !important; }
                    
                    /* ESCONDE TUDO O QUE FOR VISUAL */
                    svg, i, img, .icon-24, .icon-32, .resource-header-icon, .resource-meta, 
                    .auth-navbar, .resource-buttons, .resource-back-link, .resource-cta-box, 
                    #global-loader, .toast-container, .game-banner, .suggestion-section { 
                        display: none !important; 
                    }
                    
                    /* FORMATAÇÃO DE DOCUMENTO DE TEXTO */
                    .auth-container, .resource-detail-container { margin: 0 !important; padding: 0 !important; max-width: none !important; border: none !important; }
                    .resource-header { text-align: left !important; border-bottom: 2px solid #10b981 !important; padding-bottom: 15px !important; margin-bottom: 30px !important; }
                    .resource-category { color: #10b981 !important; font-weight: bold !important; text-transform: uppercase !important; font-size: 12px !important; margin: 0 0 5px 0 !important; }
                    h1, .resource-title { font-size: 28px !important; color: #111 !important; margin: 0 0 10px 0 !important; }
                    .resource-section { border: none !important; padding: 0 !important; margin-bottom: 30px !important; page-break-inside: avoid; }
                    h2 { font-size: 20px !important; color: #222 !important; border-bottom: 1px solid #eee !important; padding-bottom: 5px !important; margin-bottom: 15px !important; }
                    p, li { font-size: 14px !important; line-height: 1.6 !important; text-align: justify !important; color: #333 !important; }
                `});
            } else {
                // PÁGINAS DA BD: Usa o Template puro definido acima
                const htmlContent = buildPDFTemplate(recursoDB);
                await page.setContent(htmlContent, { waitUntil: ['networkidle0'] });
            }

            await page.emulateMediaType('screen');

            // Geração do PDF com margens de Documento padrão (2cm)
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' }
            });

            await browser.close();

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=CiberHerois_${pageName.replace('.html', '')}.pdf`,
            });

            res.send(pdfBuffer);

        } catch (error) {
            if (browser) await browser.close();
            console.error('[PDF Error]:', error.message);
            res.status(500).send('Erro ao processar o PDF.');
        }
    });

    return router;
};