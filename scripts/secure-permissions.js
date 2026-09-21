const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

const PRIVATE_DIRS = [
    'config',
    'storage',
    'storage/backups',
    'storage/uploads',
    'storage/lists',
    'storage/marketing-database',
    'storage/billing',
    'storage/onboarding-avatars',
    'storage/email-assets',
    'storage/android',
    'storage/home',
    'storage/trusted-by'
];

function ensurePrivateDirs() {
    PRIVATE_DIRS.forEach((rel) => {
        const dir = path.join(ROOT, rel);
        fs.mkdirSync(dir, { recursive: true });
        try {
            fs.chmodSync(dir, 0o700);
        } catch (_) {}
    });
    const envFile = path.join(ROOT, '.env');
    if (fs.existsSync(envFile)) {
        try { fs.chmodSync(envFile, 0o600); } catch (_) {}
    }
    const keyFile = path.join(ROOT, 'config', 'secret.key');
    if (fs.existsSync(keyFile)) {
        try { fs.chmodSync(keyFile, 0o600); } catch (_) {}
    }
}

function applyWindowsAcls() {
    if (process.platform !== 'win32') return { skipped: true };
    const { spawnSync } = require('child_process');
    const user = os.userInfo().username;
    const targets = ['config', 'storage', 'storage\\backups'].map((rel) => path.join(ROOT, rel));
    const results = [];
    targets.forEach((dir) => {
        fs.mkdirSync(dir, { recursive: true });
        spawnSync('icacls', [dir, '/inheritance:d'], { encoding: 'utf8' });
        spawnSync('icacls', [dir, '/remove:g', 'Everyone'], { encoding: 'utf8' });
        spawnSync('icacls', [dir, '/remove:g', 'Users'], { encoding: 'utf8' });
        const grant = spawnSync('icacls', [dir, '/grant:r', user + ':(OI)(CI)F', '/grant:r', 'SYSTEM:(OI)(CI)F'], {
            encoding: 'utf8'
        });
        results.push({
            dir,
            ok: grant.status === 0,
            status: grant.status
        });
    });
    return { skipped: false, results };
}

function apply() {
    ensurePrivateDirs();
    const windows = applyWindowsAcls();
    return {
        dirs: PRIVATE_DIRS,
        mode: '0700 directories, 0600 secret files (POSIX; Windows uses NTFS ACLs)',
        windows
    };
}

if (require.main === module) {
    const result = apply();
    console.log('[Permissions] Restricted config/, storage/, and backups/.');
    if (result.windows && result.windows.skipped) {
        console.log('[Permissions] POSIX chmod 700 applied.');
    } else if (result.windows && result.windows.results) {
        result.windows.results.forEach((row) => {
            console.log('[Permissions]', row.ok ? 'ACL updated' : 'ACL update skipped', row.dir);
        });
    }
}

module.exports = { ensurePrivateDirs, apply, PRIVATE_DIRS };
