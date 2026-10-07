#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const downloadedDir = path.join(root, 'downloaded');
const outRoot = path.join(downloadedDir, 'extracted');

function safeName(s){
    return String(s).replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g,'');
}

async function walk(dir){
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile()) await processFile(full);
    }
}

async function processFile(filePath){
    if (!filePath.endsWith('.doenet')) return;
    try{
        const txt = await fs.readFile(filePath, 'utf8');
        let data;
        try{ data = JSON.parse(txt); } catch { return; }

        const rel = path.relative(downloadedDir, filePath);
        const relDir = path.dirname(rel);
        const targetDir = path.join(outRoot, relDir);
        await fs.mkdir(targetDir, { recursive: true });

        const items = Array.isArray(data) ? data : (typeof data === 'object' && data !== null ? [data] : []);
        let written = 0;
        for (let i=0;i<items.length;i++){
            const it = items[i];
            if (!it || typeof it !== 'object') continue;
            if (!('doenetML' in it)) continue;
            const content = it.doenetML;
            const id = it.contentId || it.name || it.ownerId || `item${i+1}`;
            const base = safeName(id + (it.name ? ('__' + it.name) : '')) || (`extracted_${i+1}`);
            const filename = `${base}.doenet`;
            const outPath = path.join(targetDir, filename);
            await fs.writeFile(outPath, content, 'utf8');
            console.log('Wrote', outPath);
            written++;
        }
        if (written===0){
            // Also consider objects that embed doenetML inside nested fields
            // Simple recursive search
            const found = [];
            (function recurse(obj, prefix){
                if (!obj || typeof obj !== 'object') return;
                if (typeof obj.doenetML === 'string') found.push({content: obj.doenetML, id: obj.contentId || obj.name || prefix || 'nested'});
                for (const k of Object.keys(obj)) recurse(obj[k], prefix ? prefix + '_' + k : k);
            })(data, path.basename(filePath));
            for (let j=0;j<found.length;j++){
                const f = found[j];
                const base = safeName(f.id + '__' + j) || `nested_${j}`;
                const outPath = path.join(targetDir, `${base}.doenet`);
                await fs.writeFile(outPath, f.content, 'utf8');
                console.log('Wrote', outPath);
            }
        }
    }catch(err){
        console.error('Error processing', filePath, err.message);
    }
}

async function main(){
    try{
        await fs.access(downloadedDir);
    }catch{
        console.error('No downloaded directory found at', downloadedDir);
        process.exit(1);
    }
    await walk(downloadedDir);
}

main().catch(err=>{ console.error(err); process.exit(1); });
