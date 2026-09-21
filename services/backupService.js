const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'storage', 'backups');
const MAGIC = Buffer.from('RABTBKv1');
const EXCLUDE_NAMES = new Set([
    'secret.key',
    '.env',
    'super-admin-initial.txt'
]);

function backupKey(explicit) {
    const raw = String(explicit || process.env.RABT_BACKUP_KEY || process.env.RABT_SECRET_KEY || '').trim();
    if (raw.length >= 16) {
        return crypto.createHash('sha256').update(raw).digest();
    }
    const keyFile = path.join(ROOT, 'config', 'secret.key');
    if (fs.existsSync(keyFile)) {
        return crypto.createHash('sha256').update(fs.readFileSync(keyFile, 'utf8').trim()).digest();
    }
    const err = new Error('Set RABT_BACKUP_KEY or RABT_SECRET_KEY (16+ characters) before creating backups.');
    err.statusCode = 500;
    throw err;
}

function encryptBuffer(plain, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([MAGIC, iv, tag, enc]);
}

function decryptBuffer(blob, key) {
    if (!Buffer.isBuffer(blob) || blob.length < MAGIC.length + 12 + 16) {
        throw new Error('Backup file is not a valid Rabط archive.');
    }
    if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new Error('Backup file is not a valid Rabط archive.');
    }
    const iv = blob.subarray(MAGIC.length, MAGIC.length + 12);
    const tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28);
    const enc = blob.subarray(MAGIC.length + 28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
}

function walkFiles(absDir, relBase, out) {
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    entries.forEach((entry) => {
        if (entry.name.startsWith('.') || EXCLUDE_NAMES.has(entry.name)) return;
        const abs = path.join(absDir, entry.name);
        const rel = path.posix.join(relBase, entry.name);
        if (entry.isDirectory()) {
            walkFiles(abs, rel, out);
            return;
        }
        if (!entry.isFile()) return;
        out.push({
            path: rel,
            data: fs.readFileSync(abs).toString('base64')
        });
    });
}

function collectDefaultFiles() {
    const files = [];
    walkFiles(path.join(ROOT, 'config', 'tenants'), 'config/tenants', files);
    walkFiles(path.join(ROOT, 'storage', 'lists'), 'storage/lists', files);
    walkFiles(path.join(ROOT, 'storage', 'uploads'), 'storage/uploads', files);
    walkFiles(path.join(ROOT, 'storage', 'billing'), 'storage/billing', files);
    walkFiles(path.join(ROOT, 'storage', 'onboarding-avatars'), 'storage/onboarding-avatars', files);
    [
        'config/users.json',
        'config/sessions.json',
        'config/payments.json',
        'config/billing.settings.json',
        'config/platform.settings.json',
        'config/tracking.json',
        'config/support-chats.json'
    ].forEach((rel) => {
        const abs = path.join(ROOT, rel);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            files.push({ path: rel.replace(/\\/g, '/'), data: fs.readFileSync(abs).toString('base64') });
        }
    });
    return files;
}

function createBackup(options = {}) {
    const key = backupKey(options.key);
    const files = options.files || collectDefaultFiles();
    const payload = Buffer.from(JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        files
    }));
    const gz = zlib.gzipSync(payload);
    const blob = encryptBuffer(gz, key);
    const dir = options.dir || BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });
    try { fs.chmodSync(dir, 0o700); } catch (_) {}
    const id = options.id || ('bak-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'));
    const filename = id + '.enc';
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, blob, { mode: 0o600 });
    return {
        id,
        filename,
        path: dest,
        size: blob.length,
        fileCount: files.length,
        createdAt: new Date().toISOString()
    };
}

function readArchive(filePath, key) {
    const blob = fs.readFileSync(filePath);
    const unzipped = zlib.gunzipSync(decryptBuffer(blob, backupKey(key)));
    const parsed = JSON.parse(unzipped.toString('utf8'));
    if (!parsed || !Array.isArray(parsed.files)) {
        throw new Error('Backup archive is empty or corrupt.');
    }
    return parsed;
}

function restoreBackup(filePath, destRoot, options = {}) {
    const archive = readArchive(filePath, options.key);
    const root = path.resolve(destRoot);
    fs.mkdirSync(root, { recursive: true });
    archive.files.forEach((entry) => {
        const rel = String(entry.path || '').replace(/\\/g, '/');
        if (!rel || rel.indexOf('..') !== -1 || path.isAbsolute(rel)) return;
        const dest = path.resolve(root, rel);
        if (!dest.startsWith(root + path.sep) && dest !== root) return;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(entry.data, 'base64'));
    });
    return { restored: archive.files.length, createdAt: archive.createdAt || null };
}

function listBackups(dir) {
    const folder = dir || BACKUP_DIR;
    if (!fs.existsSync(folder)) return [];
    return fs.readdirSync(folder)
        .filter((name) => name.endsWith('.enc'))
        .map((name) => {
            const abs = path.join(folder, name);
            const stat = fs.statSync(abs);
            return {
                id: name.replace(/\.enc$/i, ''),
                filename: name,
                size: stat.size,
                createdAt: stat.mtime.toISOString()
            };
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function backupAbsPath(id, dir) {
    const folder = path.resolve(dir || BACKUP_DIR);
    const name = path.basename(String(id || '')) + (String(id || '').endsWith('.enc') ? '' : '.enc');
    const abs = path.resolve(folder, name);
    if (!abs.startsWith(folder + path.sep) && abs !== folder) return '';
    return fs.existsSync(abs) ? abs : '';
}

module.exports = {
    BACKUP_DIR,
    MAGIC,
    createBackup,
    restoreBackup,
    readArchive,
    decryptBuffer,
    listBackups,
    backupAbsPath,
    backupKey
};
