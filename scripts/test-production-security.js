const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const { createBackup, restoreBackup, decryptBuffer, MAGIC, backupKey } = require('../services/backupService');
const { isBlockedPath, normalizedPath } = require('../middleware/securityHeaders');
const { assertPathInside } = require('../utils/safeSendFile');
const listLibrary = require('../services/listLibrary');
const tenantStore = require('../services/tenantStore');

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PASSWORD = 'isolate-test-123';

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

function request(pathname, { method = 'GET', body, cookie } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: process.env.PORT || 3005,
                path: pathname,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                    ...(cookie ? { Cookie: cookie } : {})
                }
            },
            (res) => {
                const cookies = [].concat(res.headers['set-cookie'] || []);
                let raw = '';
                res.on('data', (chunk) => { raw += chunk; });
                res.on('end', () => {
                    let json = null;
                    try { json = raw ? JSON.parse(raw) : null; } catch (_) {}
                    resolve({ status: res.statusCode, json, cookies, raw, headers: res.headers });
                });
            }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function cookieFrom(res) {
    const line = (res.cookies || []).find((c) => c.startsWith('rabt_auth='));
    return line ? line.split(';')[0] : '';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { hash, salt };
}

function upsertVerifiedUser(id, name, email) {
    const file = path.join(__dirname, '..', 'config', 'users.json');
    const users = JSON.parse(fs.readFileSync(file, 'utf8'));
    const existing = users.find((u) => u.id === id || u.email === email);
    const { hash, salt } = hashPassword(PASSWORD);
    const patch = {
        id,
        businessId: id,
        name,
        email,
        passwordHash: hash,
        salt,
        emailVerified: true,
        subscriptionStatus: 'active',
        planId: 'existing',
        onboardingCompleted: true,
        disabled: false
    };
    if (existing) Object.assign(existing, patch);
    else users.push({ ...patch, createdAt: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
    tenantStore.ensureTenant(id, id);
}

function envConfigTests() {
    const runtime = require('../config/runtimeEnv');
    assert(!runtime.isProduction(), 'Security tests must run in development, not production');
    assert(!runtime.cookiesSecure(), 'Localhost must not force Secure cookies');
    const attrs = runtime.cookieSecurityAttrs();
    assert(attrs.indexOf('HttpOnly') !== -1, 'Cookies must be HttpOnly');
    assert(attrs.indexOf('SameSite=Lax') !== -1, 'Cookies must use SameSite=Lax');
    assert(attrs.indexOf('Secure') === -1, 'Secure cookies must stay off on localhost HTTP');
    if (!process.env.BIND_HOST) {
        assert(runtime.listenHost() === '0.0.0.0', 'Development must bind 0.0.0.0 for LAN/localhost HTTP');
    }
    const prodCheck = runtime.validateProductionEnv();
    assert(prodCheck.ok, 'Development startup validation must not fail');

    const previousNode = process.env.NODE_ENV;
    const previousSecure = process.env.COOKIE_SECURE;
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = 'false';
    try {
        const forced = runtime.validateProductionEnv();
        assert(!forced.ok, 'Production without COOKIE_SECURE=true must fail startup validation');
        assert(forced.errors.some((msg) => msg.indexOf('COOKIE_SECURE') !== -1), 'Production validation must mention COOKIE_SECURE');
        assert(!JSON.stringify(forced).includes('Farid'), 'Validation messages must not include secret values');
    } finally {
        if (previousNode == null) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNode;
        if (previousSecure == null) delete process.env.COOKIE_SECURE;
        else process.env.COOKIE_SECURE = previousSecure;
    }
    console.log('Development environment config tests passed.');
}

function backupTests() {
    const key = 'test-backup-key-' + crypto.randomBytes(8).toString('hex');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rabt-bak-'));
    const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rabt-rst-'));
    const marker = 'private-contact-' + Date.now() + '@example.com';
    const created = createBackup({
        key,
        dir,
        id: 'unit-test',
        files: [{ path: 'storage/lists/userA/email/contacts.txt', data: Buffer.from(marker).toString('base64') }]
    });
    const blob = fs.readFileSync(created.path);
    assert(blob.subarray(0, MAGIC.length).equals(MAGIC), 'Backup must use the Rabط encrypted archive header');
    assert(blob.toString('utf8').indexOf(marker) === -1, 'Encrypted backup must not contain plaintext contacts');
    let wrongKeyFailed = false;
    try {
        decryptBuffer(blob, backupKey(key + '-wrong'));
    } catch (_) {
        wrongKeyFailed = true;
    }
    assert(wrongKeyFailed, 'Backup must not decrypt with the wrong key');
    restoreBackup(created.path, restoreDir, { key });
    const restored = fs.readFileSync(path.join(restoreDir, 'storage', 'lists', 'userA', 'email', 'contacts.txt'), 'utf8');
    assert(restored === marker, 'Backup must restore with the correct encryption key');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(restoreDir, { recursive: true, force: true });
    console.log('Backup encryption tests passed.');
}

function pathGuardTests() {
    const fakeReq = (url) => ({ originalUrl: url, url, path: url.split('?')[0] });
    assert(isBlockedPath('/config/apiConfig.json'), '/config must be blocked');
    assert(isBlockedPath('/storage/userA/file.pdf'), '/storage must be blocked');
    assert(isBlockedPath('/backups/backup.enc'), '/backups must be blocked');
    assert(isBlockedPath('/.env'), '/.env must be blocked');
    assert(isBlockedPath('/.git/config'), '/.git must be blocked');
    assert(normalizedPath(fakeReq('/config/%2e%2e/config/sessions.json')) === '/config/sessions.json', 'encoded traversal must normalize into /config');
    assert(isBlockedPath(normalizedPath(fakeReq('/public/../config/users.json'))), 'path traversal into config must be blocked');
    assert(isBlockedPath(normalizedPath(fakeReq('/%2e%2e/.env'))), 'encoded .env traversal must be blocked');
    const root = path.join(__dirname, '..', 'storage');
    let threw = false;
    try {
        assertPathInside(path.join(root, '..', 'config', 'users.json'), root);
    } catch (_) {
        threw = true;
    }
    assert(threw, 'File send path traversal must fail');
    console.log('Path protection tests passed.');
}

async function httpTests() {
    upsertVerifiedUser(USER_A, 'Isolation A', 'isolation-a@example.com');
    upsertVerifiedUser(USER_B, 'Isolation B', 'isolation-b@example.com');
    const savedA = listLibrary.saveList(USER_A, {
        kind: 'email',
        name: 'A security list',
        originalName: 'a.txt',
        buffer: Buffer.from('secret-a@example.com\n')
    });

    const loginA = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-a@example.com', password: PASSWORD }
    });
    const loginB = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-b@example.com', password: PASSWORD }
    });
    assert(loginA.status === 200 && loginB.status === 200, 'Security test users must sign in');
    const cookieA = cookieFrom(loginA);
    const cookieB = cookieFrom(loginB);
    const setCookie = (loginA.cookies || []).join(' ');
    assert(/HttpOnly/i.test(setCookie), 'Auth cookie must be HttpOnly');
    assert(/SameSite=Lax/i.test(setCookie), 'Auth cookie must be SameSite=Lax');
    assert(!/;\s*Secure/i.test(setCookie), 'Auth cookie must not be Secure on localhost HTTP');

    const blocked = [
        '/config/apiConfig.json',
        '/config/sessions.json',
        '/storage/userA/file.pdf',
        '/storage/userB/file.pdf',
        '/backups/backup.enc',
        '/storage/backups/backup.enc',
        '/.env',
        '/.git/config',
        '/public/../config/users.json',
        '/config/%2e%2e/config/sessions.json'
    ];
    for (const url of blocked) {
        const res = await request(url);
        assert(res.status === 404 || res.status === 403, url + ' must not be public, got ' + res.status);
        assert((res.raw || '').indexOf('telegramApiHash') === -1, url + ' must not return config secrets');
        assert((res.raw || '').indexOf('AUTH_SMTP_PASS') === -1, url + ' must not return .env secrets');
    }

    const unauthFile = await request('/api/files/' + savedA.id + '/download');
    assert(unauthFile.status === 401, 'File download must require authentication');

    const stealFile = await request('/api/files/' + savedA.id + '/download', { cookie: cookieB });
    assert(stealFile.status === 404 || stealFile.status === 403, 'User B must not download User A file by id');
    assert((stealFile.raw || '').indexOf('secret-a@example.com') === -1, 'Stolen file body must not be returned');

    const fakeId = await request('/api/files/not-a-real-file-id/download', { cookie: cookieA });
    assert(fakeId.status === 404, 'A fake file id must not return another user\'s file');

    const traversalId = await request('/api/files/..%2F..%2Fconfig%2Fusers.json/download', { cookie: cookieA });
    assert(traversalId.status === 404, 'Path traversal file ids must fail');

    const ownFile = await request('/api/files/' + savedA.id + '/download', { cookie: cookieA });
    assert(ownFile.status === 200, 'User A must download their own file');
    assert((ownFile.raw || '').indexOf('secret-a@example.com') !== -1, 'Owner download must return their contacts');

    const backups = await request('/api/super-admin/backups', { cookie: cookieA });
    assert(backups.status === 401, 'A normal user must not list backups');
    const backupDownload = await request('/api/super-admin/backups/unit-test/download', { cookie: cookieA });
    assert(backupDownload.status === 401, 'A normal user must not download backups');

    const smtp = await request('/api/settings/smtp/status', { cookie: cookieA });
    assert(smtp.status === 200, 'SMTP status must load');
    assert(smtp.json && smtp.json.config && smtp.json.config.password === undefined && smtp.json.config.pass === undefined, 'SMTP password must not be returned');

    const tg = await request('/api/external-api/config', { cookie: cookieA });
    const hash = tg.json && tg.json.config && tg.json.config.telegramApiHash;
    if (hash) {
        assert(String(hash).indexOf('...') !== -1, 'Telegram API hash must be masked');
    }

    assert(String(ownFile.headers['cache-control'] || '').indexOf('no-store') !== -1, 'Private file downloads must not be cached');

    listLibrary.deleteList(USER_A, savedA.id);
    console.log('HTTP production security tests passed.');
}

(async function main() {
    envConfigTests();
    backupTests();
    pathGuardTests();
    try {
        await httpTests();
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.log('Server not running; skipped HTTP production security checks.');
            process.exit(0);
            return;
        }
        throw err;
    }
    process.exit(0);
})().catch((err) => {
    console.error('Production security test failed:', err.message);
    process.exit(1);
});
