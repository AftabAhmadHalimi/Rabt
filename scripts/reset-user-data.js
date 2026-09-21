#!/usr/bin/env node
/**
 * Remove all tenant user accounts and wipe user-side data for a clean production test.
 * Keeps super admin, CMS, marketing database, home/trusted-by assets, billing plan settings, and SMTP config.
 *
 * Usage: node scripts/reset-user-data.js --confirm
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const JSON_RESETS = {
    'config/users.json': [],
    'config/sessions.json': [],
    'config/payments.json': [],
    'config/support-chats.json': [],
    'config/contact-messages.json': [],
    'config/schedules.json': [],
    'config/channel-ownership.json': {},
    'config/email-assets-index.json': {},
    'config/admin-notes.json': {},
    'config/ip-geo-cache.json': {},
    'config/platform-visits.json': { visits: [], totals: { home: 0, pricing: 0, about: 0, contact: 0 } }
};

const STORAGE_DIRS_TO_CLEAR = [
    'storage/uploads',
    'storage/lists',
    'storage/billing',
    'storage/onboarding-avatars',
    'storage/email-assets',
    'storage/backups'
];

const KEEP_STORAGE_DIRS = new Set([
    'storage/marketing-database',
    'storage/home',
    'storage/trusted-by',
    'storage/android'
]);

function log(msg) {
    console.log(msg);
}

function writeJson(rel, data) {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    log(`  reset ${rel}`);
}

function clearDirContents(absDir) {
    if (!fs.existsSync(absDir)) {
        fs.mkdirSync(absDir, { recursive: true });
        log(`  created ${path.relative(ROOT, absDir)}`);
        return 0;
    }
    let removed = 0;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        const target = path.join(absDir, entry.name);
        fs.rmSync(target, { recursive: true, force: true });
        removed += 1;
    }
    log(`  cleared ${path.relative(ROOT, absDir)} (${removed} item(s))`);
    return removed;
}

function clearTenants() {
    const tenantsDir = path.join(ROOT, 'config', 'tenants');
    if (!fs.existsSync(tenantsDir)) {
        fs.mkdirSync(tenantsDir, { recursive: true });
        log('  created config/tenants');
        return 0;
    }
    let removed = 0;
    for (const entry of fs.readdirSync(tenantsDir, { withFileTypes: true })) {
        const target = path.join(tenantsDir, entry.name);
        if (entry.isDirectory() || entry.isFile()) {
            fs.rmSync(target, { recursive: true, force: true });
            removed += 1;
        }
    }
    log(`  cleared config/tenants (${removed} item(s))`);
    return removed;
}

function resetTrackingIndex() {
    const file = path.join(ROOT, 'config', 'tracking-index.json');
    let publicBaseUrl = 'http://localhost:3005';
    if (fs.existsSync(file)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (parsed && typeof parsed.publicBaseUrl === 'string' && parsed.publicBaseUrl.trim()) {
                publicBaseUrl = parsed.publicBaseUrl.trim();
            }
        } catch (_) {}
    }
    writeJson('config/tracking-index.json', { publicBaseUrl, tracks: {} });
}

function clearWhatsAppSessions() {
    const waRoot = path.join(os.homedir(), '.mela-whatsapp-sessions');
    if (!fs.existsSync(waRoot)) {
        log('  no WhatsApp session folder found');
        return 0;
    }
    return clearDirContents(waRoot);
}

function verifySuperAdminKept() {
    const adminFile = path.join(ROOT, 'config', 'super-admin.json');
    if (!fs.existsSync(adminFile)) {
        log('  warning: config/super-admin.json not found (super admin may need setup)');
        return;
    }
    try {
        const admin = JSON.parse(fs.readFileSync(adminFile, 'utf-8'));
        log(`  kept super admin: ${admin.email || '(unknown email)'}`);
    } catch (_) {
        log('  warning: could not read super-admin.json');
    }
}

function main() {
    const confirm = process.argv.includes('--confirm');
    if (!confirm) {
        console.error('This will DELETE all user accounts and user uploads.');
        console.error('Super admin, CMS, marketing database, and platform settings are kept.');
        console.error('Run again with --confirm to proceed.');
        process.exit(1);
    }

    log('[Reset] Starting user data wipe...');
    verifySuperAdminKept();

    log('[Reset] Clearing user accounts and sessions...');
    Object.entries(JSON_RESETS).forEach(([rel, data]) => writeJson(rel, data));
    resetTrackingIndex();

    log('[Reset] Clearing tenant workspaces...');
    clearTenants();

    log('[Reset] Clearing user storage...');
    STORAGE_DIRS_TO_CLEAR.forEach((rel) => {
        if (KEEP_STORAGE_DIRS.has(rel)) return;
        clearDirContents(path.join(ROOT, rel));
    });

    log('[Reset] Clearing WhatsApp browser sessions...');
    clearWhatsAppSessions();

    log('[Reset] Done.');
    log('[Reset] Restart the server if it is running, then sign up fresh users for your real test.');
}

main();
