const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
const texts = new Set();

function add(t) {
    t = String(t || '')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#10;/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
    if (t.length < 2 || t.length > 500) return;
    if (!/[A-Za-z]/.test(t)) return;
    texts.add(t);
}

files.forEach((f) => {
    let html = fs.readFileSync(path.join(dir, f), 'utf8');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    html = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    html.replace(/>([^<]+)</g, (_, t) => { add(t); return _; });
    html.replace(/\b(?:placeholder|title|alt|aria-label|data-placeholder)="([^"]+)"/g, (_, t) => { add(t); return _; });
});

const jsFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.html'));
jsFiles.forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /(?:textContent|innerText|placeholder|title|needText)\s*=\s*(?:opts\.[A-Za-z]+ \|\| )?(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = re.exec(src))) add(m[2]);
    const re2 = /(?:toast|notify|banner|alert|confirm|prompt)\s*\(\s*(['"`])([\s\S]*?)\1/g;
    while ((m = re2.exec(src))) add(m[2]);
    const re3 = /innerHTML\s*=\s*(['"`])([\s\S]*?)\1/g;
    while ((m = re3.exec(src))) {
        String(m[2]).replace(/>([^<]+)</g, (_, t) => { add(t); return _; });
        add(m[2].replace(/<[^>]+>/g, ' '));
    }
    const re4 = /(?:emptyLabel|TITLES\.[a-z]+|cancelLabel|confirmLabel):\s*(['"`])([\s\S]*?)\1/g;
    while ((m = re4.exec(src))) add(m[2]);
});

const skip = /^(ok|OK|AM|PM|HH|MM|LIVE|Live|id=|src=|href|span|div|true|false|null|POST|GET|put|dark|rtl|ltr|and|or|To|From)$/;
const out = Array.from(texts)
    .filter((t) => !skip.test(t))
    .filter((t) => !/^fa-/.test(t))
    .filter((t) => !/[;{}=<>]|function |var |const |querySelector|innerHTML|document\./.test(t) || t.length > 40)
    .sort((a, b) => a.localeCompare(b));

fs.writeFileSync(path.join(__dirname, 'i18n-strings.txt'), out.join('\n'));
console.log('COUNT', out.length);
process.stdout.write(out.join('\n'));
