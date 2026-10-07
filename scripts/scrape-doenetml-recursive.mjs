#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

if (process.argv.length < 3) {
    console.log('Usage: node scripts/scrape-doenetml-recursive.mjs <sharedActivities_url> [--output=outdir]');
    process.exit(1);
}

let outDir = 'downloaded';
const args = process.argv.slice(2);
let urlArg;
for (const a of args) {
    if (a.startsWith('--output=')) outDir = a.split('=')[1] || outDir;
    else if (!urlArg) urlArg = a;
}

if (!urlArg) {
    console.error('No URL provided');
    process.exit(1);
}

function safeName(s){
    return String(s || '').replace(/\s+/g, '_').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g,'');
}

async function fetchJson(u){
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Fetch ${u} failed: ${res.status}`);
    return res.json();
}

function parseSharedActivitiesUrl(u){
    try{
        const U = new URL(u);
        const seg = U.pathname.split('/').filter(Boolean);
        // Expect .../sharedActivities/<ownerId>/<contentId>
        const idx = seg.indexOf('sharedActivities');
        if (idx === -1 || seg.length < idx + 3) throw new Error('Unexpected URL format');
        return { ownerId: seg[idx+1], rootContentId: seg[idx+2] };
    }catch(e){ throw new Error('Invalid URL: ' + u); }
}

async function scrape(ownerId, rootContentId){
    const queue = [{ contentId: rootContentId, segments: [] }];
    const written = [];
    while (queue.length){
        const item = queue.shift();
        const api = `https://doenet.org/api/contentList/getSharedContent/${ownerId}/${item.contentId}`;
        console.log('Fetching', api);
        let data;
        try{ data = await fetchJson(api); }catch(err){ console.error('Failed', api, err.message); continue; }

        const entries = Array.isArray(data.content) ? data.content : (data.items || []);
        for (const e of entries){
            const name = e.name || e.contentId || 'item';
            if (e.type === 'folder'){
                queue.push({ contentId: e.contentId, segments: item.segments.concat([safeName(name)]) });
            } else if (e.type === 'singleDoc'){
                if (typeof e.doenetML === 'string' && e.doenetML.trim()){
                    const baseDir = path.join(process.cwd(), outDir, 'extracted', 'sharedActivities', ownerId, rootContentId, ...item.segments);
                    await fs.mkdir(baseDir, { recursive: true });
                    const fname = `${safeName(name)}__${e.contentId}.doenet`;
                    const fpath = path.join(baseDir, fname);
                    await fs.writeFile(fpath, e.doenetML, 'utf8');
                    console.log('Wrote', fpath);
                    written.push(fpath);
                } else {
                    // sometimes the API returns a lightweight reference; attempt to fetch the content endpoint directly
                    try{
                        const contentApi = `https://doenet.org/api/content/getContent/${e.contentId}`;
                        const contentJson = await fetchJson(contentApi);
                        if (contentJson && typeof contentJson.doenetML === 'string' && contentJson.doenetML.trim()){
                            const baseDir = path.join(process.cwd(), outDir, 'extracted', 'sharedActivities', ownerId, rootContentId, ...item.segments);
                            await fs.mkdir(baseDir, { recursive: true });
                            const fname = `${safeName(name)}__${e.contentId}.doenet`;
                            const fpath = path.join(baseDir, fname);
                            await fs.writeFile(fpath, contentJson.doenetML, 'utf8');
                            console.log('Wrote', fpath);
                            written.push(fpath);
                        }
                    }catch(_){}
                }
            } else {
                // other types: possible nested content arrays (select/sequence) - inspect children if present
                if (Array.isArray(e.children) && e.children.length){
                    for (const c of e.children){
                        if (c.type === 'singleDoc' && typeof c.doenetML === 'string'){
                            const baseDir = path.join(process.cwd(), outDir, 'extracted', 'sharedActivities', ownerId, rootContentId, ...item.segments);
                            await fs.mkdir(baseDir, { recursive: true });
                            const fname = `${safeName(c.name||c.contentId)}__${c.contentId}.doenet`;
                            const fpath = path.join(baseDir, fname);
                            await fs.writeFile(fpath, c.doenetML, 'utf8');
                            console.log('Wrote', fpath);
                            written.push(fpath);
                        }
                    }
                }
            }
        }
    }
    return written;
}

async function main(){
    const { ownerId, rootContentId } = parseSharedActivitiesUrl(urlArg);
    console.log('Owner:', ownerId, 'root:', rootContentId);
    const files = await scrape(ownerId, rootContentId);
    console.log('Done. Wrote', files.length, 'files.');
}

main().catch(err=>{ console.error(err); process.exit(1); });
