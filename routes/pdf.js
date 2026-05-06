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
                // Tratar os vídeos (iframes) para mostrar o link!
                let textoConvertido = sec.texto ? String(sec.texto) : '';
                
                // Procurar links de youtube/vimeo e criar caixa descritiva
                if (textoConvertido.includes('<iframe')) {
                    const srcMatch = textoConvertido.match(/src="([^"]+)"/);
                    let urlVideo = (srcMatch && srcMatch[1]) ? srcMatch[1] : '';
                    if (urlVideo) {
                        textoConvertido = `<div style="padding: 10px; background-color: #f8fafc; border-left: 4px solid #ef4444; margin-top: 10px;">
                                            <p style="margin: 0; font-weight: bold; color: #ef4444;">▶ Vídeo Disponível</p>
                                            <p style="margin: 5px 0 0 0;">O conteúdo abaixo contém um vídeo que pode ser visualizado em:</p>
                                            <a href="${urlVideo}" style="color: #3b82f6; word-break: break-all;">${urlVideo}</a>
                                           </div>`;
                    } else {
                        textoConvertido = `[Vídeo Incorporado: Assista na plataforma CiberHeróis]`;
                    }
                } else if (sec.tipo === 'video' && (textoConvertido.startsWith('http') || textoConvertido.includes('youtube.com') || textoConvertido.includes('youtu.be'))) {
                    // É um link cru
                    let urlVideo = textoConvertido.trim();
                    textoConvertido = `<div style="padding: 10px; background-color: #f8fafc; border-left: 4px solid #ef4444; margin-top: 10px;">
                                        <p style="margin: 0; font-weight: bold; color: #ef4444;">▶ Vídeo Disponível</p>
                                        <p style="margin: 5px 0 0 0;">Este recurso inclui um vídeo principal acessível em:</p>
                                        <a href="${urlVideo}" style="color: #3b82f6; word-break: break-all;">${urlVideo}</a>
                                       </div>`;
                } else {
                    textoConvertido = textoConvertido.replace(/\n/g, '<br><br>');
                }
                
                seccoesHTML += `
                <div class="section">
                    <h2>${sec.titulo || ''}</h2>
                    <p>${textoConvertido}</p>
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

    let _browser;

    // Singleton para o browser
    const getBrowser = async () => {
        if (_browser && _browser.connected) return _browser;
        _browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        _browser.on('disconnected', () => { _browser = null; });
        return _browser;
    };

    router.get('/download/:pageName', async (req, res) => {
        const pageName = req.params.pageName;
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

        let page;
        try {
            const browser = await getBrowser();
            page = await browser.newPage();
            
            // Intercetar pedidos para ignorar media pesada
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                if (['image', 'font', 'media'].includes(request.resourceType())) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            if (isPhysicalFile) {
                await page.goto(`file://${absolutePath}`, { waitUntil: 'load', timeout: 20000 });
                await page.evaluate(() => {
                    document.querySelectorAll('script').forEach(s => s.remove());
                });
                await page.addStyleTag({ content: `
                    body { background: white !important; color: black !important; font-family: Arial, sans-serif !important; padding: 20px !important; }
                    svg, i, img, .auth-navbar, .resource-buttons, .resource-back-link, .toast-container, #global-loader { display: none !important; }
                    h1 { color: #111 !important; border-bottom: 2px solid #10b981 !important; padding-bottom: 10px !important; }
                    p, li { font-size: 14px !important; line-height: 1.6 !important; color: #333 !important; }
                `});
            } else {
                const htmlContent = buildPDFTemplate(recursoDB);
                await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
            }

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' }
            });

            await page.close();

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=CiberHerois_${pageName.replace('.html', '')}.pdf`,
                'Cache-Control': 'public, max-age=3600'
            });

            res.send(pdfBuffer);
        } catch (error) {
            console.error('[PDF Error]:', error);
            if (page) await page.close().catch(() => {});
            res.status(500).json({ erro: 'Erro ao gerar PDF.', detalhe: error.message });
        }
    });

    return router;
};