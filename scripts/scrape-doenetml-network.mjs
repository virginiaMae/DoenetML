#!/usr/bin/env node
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

if (process.argv.length < 3) {
    console.log('Usage: node scripts/scrape-doenetml-network.mjs <url> [--output=outdir]');
    process.exit(1);
}

let outDir = 'downloaded';
const args = process.argv.slice(2);
const urls = [];
for (const a of args) {
    if (a.startsWith('--output=')) outDir = a.split('=')[1] || outDir;
    else urls.push(a);
}

async function run() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const found = [];

        page.on('response', async (res) => {
            try {
                const url = res.url();
                const ct = res.headers()['content-type'] || '';
                if (/json|text|xml|html/.test(ct)) {
                    const text = await res.text();
                    if (text && /<doenet|<Doenet|doenetML|DoenetML/i.test(text)) {
                        found.push({ source: 'response', url, text });
                        console.log('Captured DoenetML-like in response:', url);
                    }
                }
            } catch (err) {
                // ignore
            }
        });

        for (const url of urls) {
            console.log('Visiting', url);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Also execute in-page to catch dynamically created strings
            try {
                const inpage = await page.evaluate(() => {
                    const matches = [];
                    // search scripts
                    document.querySelectorAll('script').forEach(s => {
                        const t = s.textContent || '';
                        if (/<doenet|<Doenet|doenetML|DoenetML/i.test(t)) matches.push({ src: s.src || 'inline', text: t });
                    });
                    // search textareas/templates
                    document.querySelectorAll('textarea, template').forEach(e => {
                        const t = e.value || e.innerHTML || '';
                        if (/<doenet|<Doenet|doenetML|DoenetML/i.test(t)) matches.push({ src: e.id || 'elem', text: t });
                    });
                    return matches;
                });
                for (const m of inpage) found.push({ source: 'inpage', url, text: m.text });
            } catch (err) {
                // ignore
            }

            // Save found items
            if (found.length === 0) console.log('No DoenetML-like data captured for', url);
            else {
                const u = new URL(url);
                const segments = u.pathname.split('/').filter(Boolean);
                const baseDir = path.join(process.cwd(), outDir, ...segments.slice(0, -1));
                await fs.mkdir(baseDir, { recursive: true });
                const last = segments[segments.length - 1] || 'index';
                for (let i = 0; i < found.length; i++) {
                    const name = `${last}_${i + 1}.doenet`;
                    const filePath = path.join(baseDir, name);
                    await fs.writeFile(filePath, found[i].text, 'utf8');
                    console.log('Wrote', filePath, 'from', found[i].source, found[i].url || '');
                }
            }
        }
        await page.close();
    } finally {
        await browser.close();
    }
}

run().catch(err => { console.error(err); process.exit(1); });
