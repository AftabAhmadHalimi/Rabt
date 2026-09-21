const fs = require('fs');
const path = require('path');
const tenantStore = require('../services/tenantStore');
const { getUserId, getBusinessId } = require('../services/tenantContext');
const { seal, open } = require('../utils/secretBox');

const EMAIL_CONFIG_FILE = path.join(__dirname, 'email.settings.json');
const BLOCKED_SMTP_USERS = new Set(['ceo@sandboxholding.com']);
const BLOCKED_SMTP_HOSTS = new Set(['mail.sandboxholding.com']);

const defaultEmailConfig = {
    provider: 'custom',
    host: '',
    port: 465,
    secure: true,
    auth: {
        user: '',
        pass: ''
    },
    fromName: 'Rabط',
    rateLimit: 550,
    bccLimit: 500,
    systemName: 'Rabط',
    backgroundColor: '#1d4ed8'
};

function withOpenedPass(config) {
    const normalized = normalizeConfig(config || {});
    if (normalized.auth && normalized.auth.pass) {
        normalized.auth.pass = open(normalized.auth.pass);
    }
    return normalized;
}

function withSealedPass(config) {
    const normalized = normalizeConfig(config || {});
    if (normalized.auth && normalized.auth.pass) {
        normalized.auth.pass = seal(normalized.auth.pass);
    }
    return normalized;
}

function emptyEmailConfig() {
    return JSON.parse(JSON.stringify(defaultEmailConfig));
}

function normalizeConfig(config = {}) {
    return {
        provider: config.provider || 'custom',
        host: config.host || '',
        port: parseInt(config.port, 10) || 465,
        secure: config.secure === true || config.secure === 'true',
        auth: {
            user: config.auth?.user || config.user || '',
            pass: config.auth?.pass || config.password || ''
        },
        fromName: config.fromName || 'Rabط',
        rateLimit: parseInt(config.rateLimit, 10) || 550,
        bccLimit: parseInt(config.bccLimit, 10) || 500,
        systemName: config.systemName || 'Rabط',
        backgroundColor: config.backgroundColor || '#1d4ed8'
    };
}

function isSharedDefaultSmtp(config) {
    if (!config) return false;
    const user = String((config.auth && config.auth.user) || config.user || '').trim().toLowerCase();
    const host = String(config.host || '').trim().toLowerCase();
    return BLOCKED_SMTP_USERS.has(user) || BLOCKED_SMTP_HOSTS.has(host);
}

function usableCampaignConfig(config) {
    const normalized = normalizeConfig(config || {});
    if (isSharedDefaultSmtp(normalized)) {
        return emptyEmailConfig();
    }
    return normalized;
}

function loadAuthEmailConfigFromEnv() {
    const host = String(process.env.AUTH_SMTP_HOST || '').trim();
    const user = String(process.env.AUTH_SMTP_USER || '').trim();
    const pass = String(process.env.AUTH_SMTP_PASS || '').trim();
    if (!host || !user || !pass) {
        return emptyEmailConfig();
    }
    return normalizeConfig({
        host,
        port: process.env.AUTH_SMTP_PORT || 465,
        secure: process.env.AUTH_SMTP_SECURE !== 'false',
        user,
        password: pass,
        fromName: process.env.AUTH_SMTP_FROM_NAME || 'Rabط'
    });
}

let platformEmailConfig = emptyEmailConfig();

function persistEmptyPlatformFile() {
    fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(emptyEmailConfig(), null, 2), 'utf-8');
    platformEmailConfig = emptyEmailConfig();
}

function loadAuthEmailConfigFromFile() {
    try {
        const file = path.join(__dirname, 'auth.smtp.json');
        if (!fs.existsSync(file)) return emptyEmailConfig();
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const opened = withOpenedPass(parsed);
        const rawPass = parsed && parsed.auth && parsed.auth.pass;
        if (rawPass && String(rawPass).indexOf('enc:v1:') !== 0 && opened.auth && opened.auth.pass) {
            fs.writeFileSync(file, JSON.stringify(withSealedPass(opened), null, 2), 'utf-8');
        }
        return opened;
    } catch (_) {
        return emptyEmailConfig();
    }
}

function getPlatformEmailConfig() {
    const fromFile = loadAuthEmailConfigFromFile();
    if (fromFile.host && fromFile.auth && fromFile.auth.user && fromFile.auth.pass) {
        return fromFile;
    }
    return loadAuthEmailConfigFromEnv();
}

function setPlatformEmailConfig(config) {
    const normalized = withOpenedPass(config || {});
    if (!normalized.host || !normalized.auth.user || !normalized.auth.pass) {
        throw new Error('Platform SMTP needs host, username, and password.');
    }
    fs.writeFileSync(
        path.join(__dirname, 'auth.smtp.json'),
        JSON.stringify(withSealedPass(normalized), null, 2),
        'utf-8'
    );
    return normalized;
}

function maskPlatformEmailConfig() {
    const config = getPlatformEmailConfig();
    const pass = config.auth && config.auth.pass ? String(config.auth.pass) : '';
    return {
        host: config.host || '',
        port: config.port,
        secure: !!config.secure,
        user: (config.auth && config.auth.user) || '',
        fromName: config.fromName || 'Rabط',
        configured: !!(config.host && config.auth && config.auth.user && config.auth.pass),
        passwordSet: !!pass
    };
}

function isPlatformConfigured() {
    const config = getPlatformEmailConfig();
    return !!(config.host && config.auth && config.auth.user && config.auth.pass);
}

function currentUserId(explicit) {
    return explicit || getUserId();
}

function getEmailConfig(userId) {
    const uid = currentUserId(userId);
    if (!uid) {
        return emptyEmailConfig();
    }
    const stored = tenantStore.readJson(uid, 'email.settings.json', null);
    if (!stored) {
        return emptyEmailConfig();
    }
    const opened = usableCampaignConfig(withOpenedPass(stored));
    const rawPass = stored.auth && stored.auth.pass;
    if (rawPass && String(rawPass).indexOf('enc:v1:') !== 0 && opened.auth && opened.auth.pass) {
        tenantStore.writeJson(uid, 'email.settings.json', withSealedPass(opened));
    }
    return opened;
}

function setEmailConfig(config, userId) {
    const uid = currentUserId(userId);
    if (!uid) {
        throw new Error('Cannot save SMTP settings without an authenticated user');
    }
    if (isSharedDefaultSmtp(config)) {
        throw new Error('This SMTP mailbox cannot be used. Please configure your own SMTP account.');
    }
    tenantStore.ensureTenant(uid, getBusinessId(uid));
    const normalized = usableCampaignConfig(config);
    if (!normalized.auth.user || !normalized.auth.pass || !normalized.host) {
        throw new Error('Please enter your own SMTP host, username, and password.');
    }
    tenantStore.writeJson(uid, 'email.settings.json', withSealedPass(normalized));
    return normalized;
}

function isConfigured(userId) {
    const config = getEmailConfig(userId);
    return !!(
        config.host &&
        config.auth &&
        config.auth.user &&
        config.auth.pass &&
        !isSharedDefaultSmtp(config)
    );
}

function stripSharedDefaultSmtp() {
    persistEmptyPlatformFile();
    let removed = 0;
    for (const uid of tenantStore.listTenantUserIds()) {
        const stored = tenantStore.readJson(uid, 'email.settings.json', null);
        if (stored && isSharedDefaultSmtp(withOpenedPass(stored))) {
            tenantStore.writeJson(uid, 'email.settings.json', emptyEmailConfig());
            removed += 1;
        }
    }
    if (removed) {
        console.log(`[SMTP] Removed shared default mailbox from ${removed} workspace(s).`);
    }
    return { removed };
}

module.exports = {
    getEmailConfig,
    setEmailConfig,
    isConfigured,
    getPlatformEmailConfig,
    setPlatformEmailConfig,
    maskPlatformEmailConfig,
    isPlatformConfigured,
    stripSharedDefaultSmtp,
    isSharedDefaultSmtp,
    emailConfig: platformEmailConfig
};
