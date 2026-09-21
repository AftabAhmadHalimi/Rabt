const fs = require('fs');
const path = require('path');
const tenantStore = require('./tenantStore');

const FILE = path.join(__dirname, '..', 'config', 'channel-ownership.json');

const MESSAGES = {
    whatsapp: 'This WhatsApp number is already linked to another Rabط account. Each user must scan their own WhatsApp.',
    telegram: 'This Telegram account is already linked to another Rabط user. Sign in with your own Telegram.',
    smtp: 'This email mailbox is already used by another Rabط account. Configure your own SMTP.'
};

function emptyIndex() {
    return { whatsapp: {}, telegram: {}, smtp: {} };
}

function loadIndex() {
    try {
        if (!fs.existsSync(FILE)) return emptyIndex();
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return {
            whatsapp: (parsed && parsed.whatsapp) || {},
            telegram: (parsed && parsed.telegram) || {},
            smtp: (parsed && parsed.smtp) || {}
        };
    } catch (_) {
        return emptyIndex();
    }
}

function saveIndex(index) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(index, null, 2), 'utf8');
}

function normalizeKey(channel, key) {
    const raw = String(key || '').trim().toLowerCase();
    if (!raw) return '';
    if (channel === 'whatsapp' || channel === 'telegram') {
        return raw.replace(/[^\d]/g, '');
    }
    return raw;
}

function claim(channel, key, userId) {
    const uid = String(userId || '').trim();
    const k = normalizeKey(channel, key);
    if (!uid || !k) return { ok: true, skipped: true };
    const index = loadIndex();
    const map = index[channel] || {};
    const owner = map[k];
    if (owner && owner !== uid) {
        return {
            ok: false,
            ownerUserId: owner,
            message: MESSAGES[channel] || 'This account is already linked to another user.'
        };
    }
    if (owner !== uid) {
        map[k] = uid;
        index[channel] = map;
        saveIndex(index);
    }
    return { ok: true };
}

function releaseByUser(channel, userId) {
    const uid = String(userId || '').trim();
    if (!uid) return;
    const index = loadIndex();
    const map = index[channel] || {};
    let changed = false;
    for (const k of Object.keys(map)) {
        if (map[k] === uid) {
            delete map[k];
            changed = true;
        }
    }
    if (changed) {
        index[channel] = map;
        saveIndex(index);
    }
}

function seedExistingClaims() {
    for (const uid of tenantStore.listTenantUserIds()) {
        const email = tenantStore.readJson(uid, 'email.settings.json', null);
        const mailbox = email && email.auth && email.auth.user;
        if (mailbox) claim('smtp', mailbox, uid);
    }
}

module.exports = {
    MESSAGES,
    claim,
    releaseByUser,
    seedExistingClaims,
    normalizeKey
};
