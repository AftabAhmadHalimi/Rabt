const path = require('path');

const BLOCKED_EXTS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
    '.js', '.mjs', '.cjs', '.php', '.sh', '.ps1', '.vbs', '.jar',
    '.html', '.htm', '.svg', '.xml', '.wasm', '.py', '.rb', '.pl'
]);

function fileExt(name) {
    return path.extname(String(name || '')).toLowerCase();
}

function isBlockedExt(name) {
    return BLOCKED_EXTS.has(fileExt(name));
}

function safeStoredName(originalName, allowedExts) {
    const ext = fileExt(originalName);
    if (!ext || ext.length > 8 || BLOCKED_EXTS.has(ext)) return '';
    if (Array.isArray(allowedExts) && allowedExts.length && allowedExts.indexOf(ext) === -1) {
        return '';
    }
    return Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
}

module.exports = { BLOCKED_EXTS, fileExt, isBlockedExt, safeStoredName };
