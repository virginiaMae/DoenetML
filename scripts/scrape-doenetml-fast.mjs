#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

function usage() {
    console.log('Usage: node scripts/scrape-doenetml-fast.mjs <url> [--output=outdir]');
}

const rawArgs = process.argv.slice(2);
if (rawArgs.length === 0) { usage(); process.exit(1); }
let outDir = 'downloaded';
let url;
for (const a of rawArgs) {
    if (a.startsWith('--output=')) outDir = a.split('=')[1] || outDir;
    else url = a;
}
if (!url) { usage(); process.exit(1); }

async function fetchHtml(u) {
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return res.text();
}

function extractDoenetMLFromHtml(html) {
    const results = [];
    // capture script contents
    const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = scriptRe.exec(html))) {
        const t = m[1];
        if (t && /<doenet|<Doenet|<doenetML|<DoenetML/i.test(t)) results.push({ text: t.trim(), source: 'script' });
    }

    // capture textarea
    const taRe = /<textarea[^>]*>([\s\S]*?)<\/textarea>/gi;
    while ((m = taRe.exec(html))) {
        const t = m[1];
        if (t && /<doenet|<Doenet|<doenetML|<DoenetML/i.test(t)) results.push({ text: t.trim(), source: 'textarea' });
    }

    // capture template
    const tempRe = /<template[^>]*>([\s\S]*?)<\/template>/gi;
    while ((m = tempRe.exec(html))) {
        const t = m[1];
        if (t && /<doenet|<Doenet|<doenetML|<DoenetML/i.test(t)) results.push({ text: t.trim(), source: 'template' });
    }

    // capture Doenet tags directly
    const tagRe = /<(?:doenet|Doenet|doenetML|DoenetML)[\s\S]*?<\/(?:doenet|Doenet|doenetML|DoenetML)>/gi;
    while ((m = tagRe.exec(html))) {
        const t = m[0];
        if (t) results.push({ text: t.trim(), source: 'tag' });
    }

    return results;
}

async function run() {
    console.log('Fetching', url);
    const html = await fetchHtml(url);
    const found = extractDoenetMLFromHtml(html);
    if (!found.length) {
        console.log('No DoenetML-like snippets found in fetched HTML.');
        return;
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
}

run().catch(err => { console.error(err); process.exit(1); });
