const fs = require('fs');
const path = require('path');
const tenantStore = require('../services/tenantStore');
const { getUserId, getBusinessId } = require('../services/tenantContext');
const { seal, open } = require('../utils/secretBox');

const PLATFORM_API_FILE = path.join(__dirname, 'apiConfig.json');

const defaultApiConfig = {
    baseUrl: 'https://data.sandboxholding.com',
    apiKey: '',
    telegramApiId: 0,
    telegramApiHash: ''
};

function maskKey(key = '') {
    const k = String(key || '');
    if (!k) return '';
    if (k.length <= 8) return `${k.slice(0, 2)}...${k.slice(-2)}`;
    return `${k.slice(0, 4)}...${k.slice(-4)}`;
}

function normalizeApiConfig(config = {}) {
    const baseUrlRaw = config.baseUrl;
    const baseUrl =
        typeof baseUrlRaw === 'string' && baseUrlRaw.trim()
            ? baseUrlRaw.trim()
            : defaultApiConfig.baseUrl;
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';

    const tid = parseInt(config.telegramApiId, 10);
    const telegramApiId = Number.isFinite(tid) && tid > 0 ? tid : 0;
    const telegramApiHash =
        typeof config.telegramApiHash === 'string' ? config.telegramApiHash.trim() : '';

    return { baseUrl, apiKey, telegramApiId, telegramApiHash };
}

function currentUserId(explicit) {
    return explicit || getUserId();
}

function loadApiConfigFromFile(userId) {
    const uid = currentUserId(userId);
    if (!uid) {
        return { ...defaultApiConfig };
    }
    const stored = tenantStore.readJson(uid, 'apiConfig.json', null);
    if (!stored) {
        return { ...defaultApiConfig };
    }
    const normalized = normalizeApiConfig({ ...defaultApiConfig, ...stored });
    if (normalized.telegramApiHash) {
        normalized.telegramApiHash = open(normalized.telegramApiHash);
    }
    return normalized;
}

function saveApiConfigToFile(config, userId) {
    const uid = currentUserId(userId);
    if (!uid) {
        throw new Error('Cannot save API config without an authenticated user');
    }
    tenantStore.ensureTenant(uid, getBusinessId(uid));
    const normalized = normalizeApiConfig(config);
    const stored = {
        ...normalized,
        telegramApiHash: normalized.telegramApiHash ? seal(normalized.telegramApiHash) : ''
    };
    tenantStore.writeJson(uid, 'apiConfig.json', stored);
    return normalized;
}

function isApiConfigured(cfg) {
    return !!(cfg && cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY_HERE');
}

function loadPlatformTelegramCredentials() {
    try {
        if (!fs.existsSync(PLATFORM_API_FILE)) {
            return { telegramApiId: 0, telegramApiHash: '' };
        }
        const parsed = JSON.parse(fs.readFileSync(PLATFORM_API_FILE, 'utf8'));
        const normalized = normalizeApiConfig(parsed || {});
        if (normalized.telegramApiHash) {
            normalized.telegramApiHash = open(normalized.telegramApiHash);
        }
        return normalized;
    } catch (_) {
        return { telegramApiId: 0, telegramApiHash: '' };
    }
}

function resolveTelegramAppCredentials(userId) {
    const envId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const envHash = String(process.env.TELEGRAM_API_HASH || '').trim();
    if (Number.isFinite(envId) && envId > 0 && envHash.length >= 16) {
        return { telegramApiId: envId, telegramApiHash: envHash };
    }
    const platform = loadPlatformTelegramCredentials();
    if (platform.telegramApiId && platform.telegramApiHash && platform.telegramApiHash.length >= 16) {
        return {
            telegramApiId: platform.telegramApiId,
            telegramApiHash: platform.telegramApiHash
        };
    }
    const tenant = loadApiConfigFromFile(userId);
    return {
        telegramApiId: tenant.telegramApiId || 0,
        telegramApiHash: tenant.telegramApiHash || ''
    };
}

function isTelegramApiConfigured(cfg, userId) {
    if (cfg && cfg.telegramApiId && cfg.telegramApiHash && cfg.telegramApiHash.length >= 16) {
        return true;
    }
    const resolved = resolveTelegramAppCredentials(userId);
    return !!(resolved.telegramApiId && resolved.telegramApiId > 0 && resolved.telegramApiHash && resolved.telegramApiHash.length >= 16);
}

module.exports = {
    defaultApiConfig,
    maskKey,
    normalizeApiConfig,
    loadApiConfigFromFile,
    saveApiConfigToFile,
    isApiConfigured,
    isTelegramApiConfigured,
    loadPlatformTelegramCredentials,
    resolveTelegramAppCredentials
};
