#!/usr/bin/env node
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

function usage() {
    console.log('Usage: node scripts/scrape-doenetml.mjs <url> [<url> ...] [--output=outdir]');
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) {
    usage();
    process.exit(1);
}

let outDir = 'downloaded';
const urls = [];
for (const a of rawArgs) {
    if (a.startsWith('--output=')) outDir = a.split('=')[1] || outDir;
    else urls.push(a);
}

if (urls.length === 0) {
    usage();
    process.exit(1);
}

async function extractDoenetMLFromPage(page) {
    return page.evaluate(() => {
        const results = [];
        function addIf(text, source) {
            if (!text) return;
            const t = text.trim();
            if (t.includes('<doenet') || t.includes('<Doenet') || t.includes('<doenetML') || t.includes('<DoenetML')) {
                results.push({ text: t, source });
            }
        }

        document.querySelectorAll('script').forEach(s => addIf(s.textContent, 'script' + (s.id ? ('#' + s.id) : (s.type ? (' type=' + s.type) : ''))));
        document.querySelectorAll('textarea').forEach(t => addIf(t.value, 'textarea' + (t.id ? ('#' + t.id) : '')));
        document.querySelectorAll('template').forEach(t => addIf(t.innerHTML, 'template' + (t.id ? ('#' + t.id) : '')));

        // Walk text nodes looking for embedded DoenetML snippets
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const v = walker.currentNode.nodeValue;
            if (v && (v.includes('<doenet') || v.includes('<Doenet') || v.includes('<doenetML') || v.includes('<DoenetML'))) {
                addIf(v, 'textnode');
            }
        }

        return results;
    });
}

async function run() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        for (const url of urls) {
            console.log('Visiting', url);
            const page = await browser.newPage();
            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (err) {
                console.error('Failed to load', url, err.message);
            }

            const found = await extractDoenetMLFromPage(page);
            if (!found || found.length === 0) {
                console.log('No DoenetML-like snippets found on', url);
                await page.close();
                continue;
            }

            const u = new URL(url);
            const segments = u.pathname.split('/').filter(Boolean);
            const baseDir = path.join(process.cwd(), outDir, ...segments.slice(0, -1));
            await fs.mkdir(baseDir, { recursive: true });

            const last = segments[segments.length - 1] || 'index';
            for (let i = 0; i < found.length; i++) {
                const item = found[i];
                const name = found.length === 1 ? `${last}.doenet` : `${last}_${i + 1}.doenet`;
                const filePath = path.join(baseDir, name);
                await fs.writeFile(filePath, item.text, 'utf8');
                console.log('Wrote', filePath, 'from', item.source);
            }

            await page.close();
        }
    } finally {
        await browser.close();
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
