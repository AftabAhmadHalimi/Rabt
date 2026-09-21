const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public');
const needle = '<script src="/i18n.js"></script>';
const insert = '<script src="/i18n-dict.js"></script>\n    <script src="/i18n.js"></script>';
fs.readdirSync(dir).forEach(function (name) {
    if (!name.endsWith('.html')) return;
    const file = path.join(dir, name);
    let html = fs.readFileSync(file, 'utf8');
    if (html.indexOf('i18n-dict.js') !== -1) return;
    if (html.indexOf(needle) === -1) return;
    fs.writeFileSync(file, html.replace(needle, insert));
    console.log('updated', name);
});
