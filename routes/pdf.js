const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

module.exports = (supabase) => {
    const router = express.Router();

    router.get('/download/:pageName', async (req, res) => {
        const pageName = req.params.pageName;
        const absolutePath = path.resolve(__dirname, '../pages', `${pageName}.html`);
        
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).send('Erro: Página não encontrada.');
        }

        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });

        try {
            const page = await browser.newPage();
            const fileUrl = `file://${absolutePath}`;
            
            await page.goto(fileUrl, { 
                waitUntil: ['networkidle0', 'domcontentloaded'], 
                timeout: 30000 
            });

            await page.waitForFunction(() => window.lucide);

            await page.evaluate(() => {
                lucide.createIcons();
            });

            const stylePath = path.resolve(__dirname, '../css/style.css');
            if (fs.existsSync(stylePath)) {
                const styleContent = fs.readFileSync(stylePath, 'utf8');
                await page.addStyleTag({ content: styleContent });
            }

            await page.addStyleTag({ content: `
                body.site-body { background: white !important; background-color: white !important; }
                svg.lucide, svg { display: inline-block !important; visibility: visible !important; stroke: currentColor !important; fill: none !important; width: 24px; height: 24px; }
                .auth-navbar, .resource-buttons, .resource-back-link, .resource-cta-box, #sequential-quiz, .resource-video-container, iframe, video { display: none !important; }
                .auth-container { box-shadow: none !important; background: transparent !important; margin: 0 !important; width: 100% !important; }
                .resource-section { page-break-inside: avoid; border-left: 3px solid #ddd !important; }
            `});

            await new Promise(r => setTimeout(r, 500)); 

            await page.emulateMediaType('screen');

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
            });

            await browser.close();

            res.set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=CiberHerois_${pageName}.pdf`,
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