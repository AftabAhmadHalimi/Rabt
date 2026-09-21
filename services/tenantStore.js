const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const TENANTS_DIR = path.join(CONFIG_DIR, 'tenants');
const MIGRATION_MARKER = path.join(TENANTS_DIR, '.legacy-migrated');

function sanitizeId(id) {
    const value = String(id || '').trim();
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error('Invalid tenant id');
    }
    return value;
}

function tenantDir(userId) {
    return path.join(TENANTS_DIR, sanitizeId(userId));
}

function tenantFile(userId, filename) {
    const base = path.basename(String(filename || ''));
    if (!base || base !== String(filename || '') || !/^[A-Za-z0-9._-]+$/.test(base)) {
        throw new Error('Invalid tenant file name');
    }
    return path.join(tenantDir(userId), base);
}

function ensureTenant(userId, businessId) {
    const uid = sanitizeId(userId);
    const dir = tenantDir(uid);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const metaPath = path.join(dir, 'ownership.json');
    const meta = {
        userId: uid,
        user_id: uid,
        businessId: String(businessId || uid),
        business_id: String(businessId || uid),
        createdAt: new Date().toISOString()
    };
    if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
    return dir;
}

function readJson(userId, filename, fallback) {
    ensureTenant(userId);
    const file = tenantFile(userId, filename);
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return parsed == null ? fallback : parsed;
    } catch (err) {
        console.warn('[Tenant] Failed to read', filename, 'for', userId, err.message);
        return fallback;
    }
}

function writeJson(userId, filename, data) {
    ensureTenant(userId);
    const file = tenantFile(userId, filename);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

function listTenantUserIds() {
    if (!fs.existsSync(TENANTS_DIR)) return [];
    return fs.readdirSync(TENANTS_DIR).filter((name) => {
        if (name.startsWith('.')) return false;
        try {
            return fs.statSync(path.join(TENANTS_DIR, name)).isDirectory();
        } catch (_) {
            return false;
        }
    });
}

function removeTenant(userId) {
    const uid = sanitizeId(userId);
    const dir = tenantDir(uid);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    return true;
}

function copyIfMissing(src, dest) {
    if (!src || !fs.existsSync(src) || fs.existsSync(dest)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

function copyDirIfMissing(src, dest) {
    if (!src || !fs.existsSync(src) || fs.existsSync(dest)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: false });
    return true;
}

/** Never let a shared LocalAuth `session-default` folder be used by any user. */
function quarantineSharedWhatsAppDefault() {
    const waRoot = path.join(os.homedir(), '.mela-whatsapp-sessions');
    const legacy = path.join(waRoot, 'session-default');
    if (!fs.existsSync(legacy)) return false;
    let dest = path.join(waRoot, 'session-default.quarantined');
    if (fs.existsSync(dest)) {
        dest = path.join(waRoot, `session-default.quarantined-${Date.now()}`);
    }
    try {
        fs.renameSync(legacy, dest);
        console.log('[Tenant] Quarantined shared WhatsApp session-default folder');
        return true;
    } catch (err) {
        console.warn('[Tenant] Could not quarantine session-default:', err.message);
        return false;
    }
}

function stampOwnership(records, ownerId) {
    if (!Array.isArray(records)) return records;
    return records.map((item) => {
        if (!item || typeof item !== 'object') return item;
        return {
            ...item,
            userId: item.userId || item.user_id || ownerId,
            businessId: item.businessId || item.business_id || ownerId,
            user_id: item.user_id || item.userId || ownerId,
            business_id: item.business_id || item.businessId || ownerId
        };
    });
}

function migrateLegacyData(ownerUserId) {
    if (!ownerUserId) {
        console.warn('[Tenant] Skipping legacy data migration: no owner user');
        return { migrated: false };
    }
    if (fs.existsSync(MIGRATION_MARKER)) {
        ensureTenant(ownerUserId, ownerUserId);
        quarantineSharedWhatsAppDefault();
        return { migrated: false, alreadyDone: true };
    }

    ensureTenant(ownerUserId, ownerUserId);
    const copied = [];

    const files = [
        ['schedules.json', 'schedules.json'],
        ['activity.json', 'activity.json'],
        ['tracking.json', 'tracking.json'],
        ['apiConfig.json', 'apiConfig.json'],
        ['telegramConfig.json', 'telegramConfig.json']
    ];

    for (const [srcName, destName] of files) {
        const src = path.join(CONFIG_DIR, srcName);
        const dest = tenantFile(ownerUserId, destName);
        if (copyIfMissing(src, dest)) copied.push(destName);
    }

    try {
        const schedules = readJson(ownerUserId, 'schedules.json', []);
        if (Array.isArray(schedules) && schedules.length) {
            writeJson(ownerUserId, 'schedules.json', stampOwnership(schedules, ownerUserId));
        }
    } catch (err) {
        console.warn('[Tenant] Could not stamp schedule ownership:', err.message);
    }

    try {
        const activity = readJson(ownerUserId, 'activity.json', []);
        if (Array.isArray(activity) && activity.length) {
            writeJson(ownerUserId, 'activity.json', stampOwnership(activity, ownerUserId));
        }
    } catch (err) {
        console.warn('[Tenant] Could not stamp activity ownership:', err.message);
    }

    quarantineSharedWhatsAppDefault();

    fs.writeFileSync(
        MIGRATION_MARKER,
        JSON.stringify(
            {
                ownerUserId,
                copied,
                migratedAt: new Date().toISOString()
            },
            null,
            2
        ),
        'utf-8'
    );

    console.log(`[Tenant] Legacy workspace data assigned to user ${ownerUserId}`);
    return { migrated: true, ownerUserId, copied };
}

module.exports = {
    CONFIG_DIR,
    TENANTS_DIR,
    tenantDir,
    tenantFile,
    ensureTenant,
    readJson,
    writeJson,
    listTenantUserIds,
    removeTenant,
    migrateLegacyData,
    stampOwnership,
    quarantineSharedWhatsAppDefault
};
