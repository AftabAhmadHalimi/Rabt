const { isProduction, cookiesSecure } = require('../config/runtimeEnv');

function decodeRepeated(value) {
    let current = String(value || '');
    for (let i = 0; i < 4; i += 1) {
        try {
            const next = decodeURIComponent(current.replace(/\+/g, '%20'));
            if (next === current) break;
            current = next;
        } catch (_) {
            break;
        }
    }
    return current.replace(/\\/g, '/');
}

function normalizedPath(req) {
    const raw = decodeRepeated((req.originalUrl || req.url || req.path || '').split('?')[0]);
    const parts = [];
    raw.split('/').forEach((part) => {
        if (!part || part === '.') return;
        if (part === '..') {
            parts.pop();
            return;
        }
        parts.push(part.toLowerCase());
    });
    return '/' + parts.join('/');
}

function applySecurityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' data: https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self'"
    ];
    if (cookiesSecure()) {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
        csp.push('upgrade-insecure-requests');
    }
    res.setHeader('Content-Security-Policy', csp.join('; '));
    next();
}

function corsOrigin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
        const url = new URL(origin);
        const extra = String(process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
        if (extra.includes(origin)) return callback(null, true);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
            return callback(null, true);
        }
        if (!isProduction() && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
            return callback(null, true);
        }
        return callback(null, false);
    } catch (_) {
        return callback(null, false);
    }
}

const BLOCKED_PREFIXES = [
    '/config',
    '/storage',
    '/backups',
    '/.git',
    '/.env',
    '/node_modules',
    '/whatsapp-uploads',
    '/telegram-uploads',
    '/whatsapp-sessions',
    '/telegram-sessions'
];

function isBlockedPath(pathname) {
    const page = String(pathname || '').toLowerCase();
    if (page === '/.env' || page.startsWith('/.env.') || page.endsWith('/.env')) return true;
    if (page === '/.git' || page.startsWith('/.git/')) return true;
    return BLOCKED_PREFIXES.some((prefix) => page === prefix || page.startsWith(prefix + '/'));
}

function blockPublicPrivatePaths(req, res, next) {
    const page = normalizedPath(req);
    if (isBlockedPath(page)) {
        return res.status(404).end();
    }
    next();
}

module.exports = {
    applySecurityHeaders,
    corsOrigin,
    blockPublicPrivatePaths,
    normalizedPath,
    isBlockedPath
};
