const path = require('path');
const fs = require('fs');

function assertPathInside(filePath, rootDir) {
    const root = path.resolve(rootDir);
    const resolved = path.resolve(filePath);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved !== root && !resolved.startsWith(prefix)) {
        const err = new Error('Not found');
        err.statusCode = 404;
        throw err;
    }
    return resolved;
}

function sendPrivateFile(res, filePath, rootDir, options = {}) {
    try {
        const resolved = assertPathInside(filePath, rootDir);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            return res.status(404).json({ success: false, message: options.notFound || 'Not found' });
        }
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (options.contentType) res.setHeader('Content-Type', options.contentType);
        if (options.filename) {
            const safe = String(options.filename).replace(/[\r\n"]/g, '');
            res.setHeader('Content-Disposition', (options.inline ? 'inline' : 'attachment') + '; filename="' + safe + '"');
        }
        return res.sendFile(resolved, (err) => {
            if (err && !res.headersSent) {
                res.status(404).json({ success: false, message: options.notFound || 'Not found' });
            }
        });
    } catch (_) {
        return res.status(404).json({ success: false, message: options.notFound || 'Not found' });
    }
}

module.exports = { assertPathInside, sendPrivateFile };
