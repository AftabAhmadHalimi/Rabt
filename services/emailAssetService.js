'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ASSET_DIR = path.join(ROOT, 'storage', 'email-assets');
const INDEX_FILE = path.join(ROOT, 'config', 'email-assets-index.json');
const MAX_BYTES = 1200000;
const MAX_PER_USER = 200;
const LOCAL_PATH = /^\/m\/([a-f0-9]{32}\.(png|jpe?g|gif|webp))$/i;
const FILE_NAME = /^([a-f0-9]{32})\.(png|jpe?g|gif|webp)$/i;

let index = { assets: {} };
let indexLoaded = false;
const uploadWindows = new Map();

function ensureDir() {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
}

function loadIndex() {
    if (indexLoaded) return index;
    indexLoaded = true;
    try {
        if (fs.existsSync(INDEX_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
            index = { assets: (parsed && parsed.assets) || {} };
        }
    } catch (_) {
        index = { assets: {} };
    }
    return index;
}

function persistIndex() {
    ensureDir();
    fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

function isBlockedHost(hostname) {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' || host === '::') return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
    return false;
}

function isPublicHttpsUrl(url) {
    try {
        const parsed = new URL(String(url || ''));
        if (parsed.protocol !== 'https:') return false;
        if (isBlockedHost(parsed.hostname)) return false;
        return true;
    } catch (_) {
        return false;
    }
}

function publicHttpsBase(explicit) {
    const env = String(process.env.PUBLIC_URL || process.env.APP_URL || '').replace(/\/$/, '');
    if (isPublicHttpsUrl(env)) return env;
    const fromArg = String(explicit || '').replace(/\/$/, '');
    if (isPublicHttpsUrl(fromArg)) return fromArg;
    return '';
}

function publicHttpsBaseFromRequest(req) {
    const env = publicHttpsBase();
    if (env) return env;
    if (!req) return '';
    const proto = String(req.get('x-forwarded-proto') || req.protocol || '')
        .split(',')[0]
        .trim();
    const host = String(req.get('x-forwarded-host') || req.get('host') || '')
        .split(',')[0]
        .trim();
    if (!proto || !host) return '';
    return publicHttpsBase(`${proto}://${host}`);
}

function sniffImage(buffer) {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { mime: 'image/png', ext: 'png' };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mime: 'image/jpeg', ext: 'jpg' };
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return { mime: 'image/gif', ext: 'gif' };
    }
    if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
        return { mime: 'image/webp', ext: 'webp' };
    }
    return null;
}

function parseDataUri(value) {
    const text = String(value || '').trim();
    const match = text.match(/^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\s]+)$/i);
    if (!match) return null;
    let buffer;
    try {
        buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    } catch (_) {
        return null;
    }
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    const sniffed = sniffImage(buffer);
    if (!sniffed) return null;
    return { buffer, mime: sniffed.mime, ext: sniffed.ext };
}

function assertUploadAllowed(userId) {
    const key = String(userId || '');
    const now = Date.now();
    const rec = uploadWindows.get(key);
    if (!rec || now - rec.first > 15 * 60 * 1000) {
        uploadWindows.set(key, { first: now, count: 1 });
        return;
    }
    if (rec.count >= 40) {
        const err = new Error('Too many image uploads. Try again in a few minutes.');
        err.status = 429;
        throw err;
    }
    rec.count += 1;
}

function pruneUser(userId) {
    loadIndex();
    const uid = String(userId || '');
    const owned = Object.keys(index.assets).filter((id) => index.assets[id] && index.assets[id].userId === uid);
    if (owned.length <= MAX_PER_USER) return;
    owned.sort((a, b) => String(index.assets[a].createdAt || '').localeCompare(String(index.assets[b].createdAt || '')));
    const extra = owned.length - MAX_PER_USER;
    owned.slice(0, extra).forEach((id) => {
        const rec = index.assets[id];
        try {
            fs.unlinkSync(path.join(ASSET_DIR, id + '.' + rec.ext));
        } catch (_) {}
        delete index.assets[id];
    });
}

function saveBuffer(userId, buffer, hintExt) {
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
        const err = new Error('Use a PNG, JPG, GIF, or WebP image.');
        err.status = 400;
        throw err;
    }
    if (buffer.length > MAX_BYTES) {
        const err = new Error('Image must be under 1 MB after compression.');
        err.status = 400;
        throw err;
    }
    ensureDir();
    loadIndex();
    const id = crypto.randomBytes(16).toString('hex');
    const ext = sniffed.ext || hintExt || 'png';
    fs.writeFileSync(path.join(ASSET_DIR, id + '.' + ext), buffer);
    index.assets[id] = {
        userId: String(userId || ''),
        mime: sniffed.mime,
        ext,
        createdAt: new Date().toISOString()
    };
    pruneUser(userId);
    persistIndex();
    return {
        id,
        ext,
        mime: sniffed.mime,
        path: '/m/' + id + '.' + ext
    };
}

function saveDataUri(userId, dataUri) {
    const parsed = parseDataUri(dataUri);
    if (!parsed) return null;
    return saveBuffer(userId, parsed.buffer, parsed.ext);
}

function localAssetPath(src) {
    const value = String(src || '').trim();
    const rel = value.match(LOCAL_PATH);
    if (rel) return '/m/' + rel[1].toLowerCase();
    try {
        const parsed = new URL(value);
        const match = parsed.pathname.match(LOCAL_PATH);
        if (match) return '/m/' + match[1].toLowerCase();
    } catch (_) {}
    return '';
}

function publicUrlFor(src, publicBase) {
    const rel = localAssetPath(src);
    const base = publicHttpsBase(publicBase);
    if (rel && base) return base + rel;
    if (isPublicHttpsUrl(src) && !localAssetPath(src)) return String(src).trim();
    return rel || '';
}

function servePublic(req, res) {
    const file = String((req.params && req.params.file) || '').toLowerCase();
    const match = file.match(FILE_NAME);
    if (!match) return res.status(404).end();
    loadIndex();
    const rec = index.assets[match[1]];
    if (!rec || rec.ext !== match[2]) return res.status(404).end();
    const disk = path.join(ASSET_DIR, match[1] + '.' + rec.ext);
    if (!fs.existsSync(disk)) return res.status(404).end();
    res.setHeader('Content-Type', rec.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline; filename="image.' + rec.ext + '"');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(disk);
}

module.exports = {
    isBlockedHost,
    isPublicHttpsUrl,
    publicHttpsBase,
    publicHttpsBaseFromRequest,
    localAssetPath,
    publicUrlFor,
    parseDataUri,
    saveBuffer,
    saveDataUri,
    assertUploadAllowed,
    servePublic,
    LOCAL_PATH
};
