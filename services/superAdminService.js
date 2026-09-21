const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cookieSecurityAttrs } = require('../utils/cookieFlags');

const ADMIN_FILE = path.join(__dirname, '..', 'config', 'super-admin.json');
const SESSIONS_FILE = path.join(__dirname, '..', 'config', 'super-admin-sessions.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'platform.settings.json');
const AUDIT_FILE = path.join(__dirname, '..', 'config', 'admin-audit.json');
const NOTES_FILE = path.join(__dirname, '..', 'config', 'admin-notes.json');
const BROADCASTS_FILE = path.join(__dirname, '..', 'config', 'broadcast-history.json');
const COOKIE_NAME = 'rabt_super_admin';
const SESSION_DAYS = 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const DEFAULT_EMAIL = 'admin@localhost';

const loginAttempts = new Map();

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return parsed == null ? fallback : parsed;
    } catch (err) {
        console.error('[SuperAdmin] Failed to read', file, err.message);
        return fallback;
    }
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    try {
        const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
    } catch (_) {
        return false;
    }
}

function publicAdmin(admin) {
    if (!admin) return null;
    return {
        email: admin.email,
        name: admin.name || 'Super Admin',
        role: 'super_admin'
    };
}

function loadAdmin() {
    const data = readJson(ADMIN_FILE, null);
    return data && data.email && data.passwordHash ? data : null;
}

function saveAdmin(admin) {
    writeJson(ADMIN_FILE, admin);
    return admin;
}

function bootstrap() {
    const envEmail = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const envPass = String(process.env.SUPER_ADMIN_PASSWORD || '');
    let admin = loadAdmin();
    const reset = String(process.env.SUPER_ADMIN_RESET || '').toLowerCase() === 'true';

    if (!admin) {
        const email = envEmail || DEFAULT_EMAIL;
        const password = envPass || crypto.randomBytes(18).toString('base64url');
        const { hash, salt } = hashPassword(password);
        admin = saveAdmin({
            email,
            name: 'Super Admin',
            passwordHash: hash,
            salt,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        if (!envPass) {
            const initialFile = path.join(__dirname, '..', 'config', 'super-admin-initial.txt');
            fs.writeFileSync(
                initialFile,
                'email=' + email + '\npassword=' + password + '\n',
                { encoding: 'utf8', mode: 0o600 }
            );
            console.log('[SuperAdmin] Created default platform admin.');
            console.log('[SuperAdmin] Initial credentials were written to config/super-admin-initial.txt. Change this password after first login.');
        } else {
            console.log(`[SuperAdmin] Created platform admin from .env (${email}).`);
        }
    } else if (reset && envPass) {
        const email = envEmail || admin.email;
        const { hash, salt } = hashPassword(envPass);
        admin = saveAdmin({
            ...admin,
            email,
            passwordHash: hash,
            salt,
            updatedAt: new Date().toISOString()
        });
        console.log('[SuperAdmin] Password reset from SUPER_ADMIN_RESET=true.');
    }

    console.log('[SuperAdmin] Login: http://localhost:' + (process.env.PORT || 3005) + '/super/admin/platform/login');
    return publicAdmin(admin);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function loadSessions() {
    const now = Date.now();
    const data = readJson(SESSIONS_FILE, []);
    const sessions = (Array.isArray(data) ? data : []).filter((s) => s && s.expiresAt > now);
    let changed = sessions.length !== (Array.isArray(data) ? data.length : 0);
    for (const session of sessions) {
        if (session.token && !session.tokenHash) {
            session.tokenHash = hashToken(session.token);
            changed = true;
        }
        if (session.token) {
            delete session.token;
            changed = true;
        }
    }
    if (changed) writeJson(SESSIONS_FILE, sessions);
    return sessions;
}

function saveSessions(sessions) {
    writeJson(SESSIONS_FILE, sessions);
}

function clientKey(req) {
    return String((req.headers['x-forwarded-for'] || req.ip || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0]).trim();
}

function assertLoginAllowed(req) {
    const key = clientKey(req);
    const rec = loginAttempts.get(key);
    if (!rec) return;
    if (Date.now() - rec.first > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return;
    }
    if (rec.count >= LOGIN_MAX_ATTEMPTS) {
        const wait = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - rec.first)) / 60000);
        const err = new Error(`Too many login attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
        err.statusCode = 429;
        throw err;
    }
}

function recordLoginFailure(req) {
    const key = clientKey(req);
    const rec = loginAttempts.get(key);
    if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { first: Date.now(), count: 1 });
        return;
    }
    rec.count += 1;
}

function clearLoginFailures(req) {
    loginAttempts.delete(clientKey(req));
}

function login({ email, password }, req) {
    assertLoginAllowed(req);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    const admin = loadAdmin();
    if (!admin || cleanEmail !== String(admin.email || '').toLowerCase() || !verifyPassword(cleanPassword, admin.passwordHash, admin.salt)) {
        recordLoginFailure(req);
        throw new Error('Incorrect email or password.');
    }
    clearLoginFailures(req);
    const sessions = loadSessions();
    const token = crypto.randomBytes(32).toString('hex');
    sessions.push({
        tokenHash: hashToken(token),
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    });
    saveSessions(sessions);
    return { admin: publicAdmin(admin), token };
}

function changePassword({ currentPassword, newPassword }) {
    const admin = loadAdmin();
    if (!admin) throw new Error('Super admin is not configured.');
    if (!verifyPassword(currentPassword, admin.passwordHash, admin.salt)) {
        throw new Error('Current password is incorrect.');
    }
    const next = String(newPassword || '');
    if (next.length < 8) throw new Error('New password must be at least 8 characters.');
    const { hash, salt } = hashPassword(next);
    saveAdmin({
        ...admin,
        passwordHash: hash,
        salt,
        updatedAt: new Date().toISOString()
    });
    saveSessions([]);
    return publicAdmin(admin);
}

function destroySession(token) {
    if (!token) return;
    const hashed = hashToken(token);
    saveSessions(loadSessions().filter((s) => s.tokenHash !== hashed));
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx > 0) {
            const key = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();
            try {
                out[key] = decodeURIComponent(value);
            } catch (_) {
                out[key] = value;
            }
        }
    });
    return out;
}

function getTokenFromRequest(req) {
    return parseCookies(req)[COOKIE_NAME] || '';
}

function getAdminFromRequest(req) {
    const token = getTokenFromRequest(req);
    if (!token) return null;
    const hashed = hashToken(token);
    const session = loadSessions().find((s) => s.tokenHash === hashed && s.expiresAt > Date.now());
    if (!session) return null;
    return publicAdmin(loadAdmin());
}

function cookieHeader(token) {
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieSecurityAttrs()}; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
    return `${COOKIE_NAME}=; ${cookieSecurityAttrs()}; Max-Age=0`;
}

function requireAdmin(req, res, next) {
    const admin = getAdminFromRequest(req);
    if (!admin) {
        return res.status(401).json({ success: false, message: 'Super admin sign-in required.' });
    }
    req.superAdmin = admin;
    next();
}

const DEFAULT_SETTINGS = {
    signupEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: 'Rabط is temporarily unavailable. Please try again shortly.',
    androidAppEnabled: false,
    androidApp: null,
    homeVideos: [],
    trustedByTitle: 'Trusted by',
    trustedBy: [],
    socialMedia: {
        contactEmail: 'contact@raabt.app',
        twitter: '',
        linkedin: '',
        facebook: '',
        instagram: ''
    }
};

function getSettings() {
    const stored = readJson(SETTINGS_FILE, {});
    const next = {
        ...DEFAULT_SETTINGS,
        ...(stored && typeof stored === 'object' ? stored : {})
    };
    delete next.allowImpersonation;
    return next;
}

function setSettings(patch) {
    const current = getSettings();
    const next = {
        ...current,
        signupEnabled: patch.signupEnabled !== undefined ? !!patch.signupEnabled : current.signupEnabled,
        maintenanceMode: patch.maintenanceMode !== undefined ? !!patch.maintenanceMode : current.maintenanceMode,
        maintenanceMessage: patch.maintenanceMessage !== undefined
            ? String(patch.maintenanceMessage || '').trim().slice(0, 400) || DEFAULT_SETTINGS.maintenanceMessage
            : current.maintenanceMessage,
        socialMedia: patch.socialMedia !== undefined ? patch.socialMedia : current.socialMedia,
        updatedAt: new Date().toISOString()
    };
    delete next.allowImpersonation;
    writeJson(SETTINGS_FILE, next);
    return next;
}

function androidAppPath() {
    return path.join(__dirname, '..', 'storage', 'android', 'platform.apk');
}

function safeApkName(name) {
    let base = String(name || 'Rabt.apk').replace(/[^\w.\- ()[\]]+/g, '_').trim() || 'Rabt.apk';
    if (!/\.apk$/i.test(base)) base += '.apk';
    return base.slice(0, 120);
}

function androidAppPublic() {
    const settings = getSettings();
    const file = androidAppPath();
    let size = 0;
    let exists = false;
    try {
        const stat = fs.statSync(file);
        exists = stat.isFile();
        size = stat.size;
    } catch (_) {}
    const meta = settings.androidApp && typeof settings.androidApp === 'object' ? settings.androidApp : {};
    return {
        enabled: !!settings.androidAppEnabled && exists,
        available: exists,
        appName: String(meta.appName || 'Rabط Android App').slice(0, 80),
        version: String(meta.version || '').slice(0, 40),
        releaseNotes: String(meta.releaseNotes || '').slice(0, 800),
        originalName: safeApkName(meta.originalName),
        size: exists ? size : Number(meta.size || 0),
        uploadedAt: meta.uploadedAt || null,
        downloadCount: Number(meta.downloadCount || 0) || 0
    };
}

function saveAndroidApp(file, extra) {
    if (!file || !file.buffer || !file.buffer.length) {
        throw new Error('Choose an .apk file to upload.');
    }
    const originalName = safeApkName(file.originalname);
    if (!/\.apk$/i.test(originalName)) {
        throw new Error('Upload an Android .apk file.');
    }
    if (file.buffer.length > 200 * 1024 * 1024) {
        throw new Error('APK must be 200MB or smaller.');
    }
    const dir = path.dirname(androidAppPath());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(androidAppPath(), file.buffer);
    const settings = getSettings();
    const prev = settings.androidApp && typeof settings.androidApp === 'object' ? settings.androidApp : {};
    const patch = extra && typeof extra === 'object' ? extra : {};
    settings.androidAppEnabled = settings.androidAppEnabled === true;
    settings.androidApp = {
        originalName,
        size: file.buffer.length,
        uploadedAt: new Date().toISOString(),
        appName: String(patch.appName != null ? patch.appName : (prev.appName || 'Rabط Android App')).trim().slice(0, 80) || 'Rabط Android App',
        version: String(patch.version != null ? patch.version : (prev.version || '')).trim().slice(0, 40),
        releaseNotes: String(patch.releaseNotes != null ? patch.releaseNotes : (prev.releaseNotes || '')).trim().slice(0, 800),
        downloadCount: Number(prev.downloadCount || 0) || 0
    };
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return androidAppPublic();
}

function updateAndroidAppMeta(patch) {
    const info = androidAppPublic();
    if (!info.available) throw new Error('Upload the Android APK first.');
    const settings = getSettings();
    const prev = settings.androidApp && typeof settings.androidApp === 'object' ? settings.androidApp : {};
    if (patch.appName !== undefined) prev.appName = String(patch.appName || 'Rabط Android App').trim().slice(0, 80) || 'Rabط Android App';
    if (patch.version !== undefined) prev.version = String(patch.version || '').trim().slice(0, 40);
    if (patch.releaseNotes !== undefined) prev.releaseNotes = String(patch.releaseNotes || '').trim().slice(0, 800);
    settings.androidApp = prev;
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return androidAppPublic();
}

function recordAndroidDownload() {
    const settings = getSettings();
    const prev = settings.androidApp && typeof settings.androidApp === 'object' ? settings.androidApp : {};
    prev.downloadCount = (Number(prev.downloadCount || 0) || 0) + 1;
    settings.androidApp = prev;
    writeJson(SETTINGS_FILE, settings);
    return androidAppPublic();
}

function setAndroidAppEnabled(enabled) {
    const info = androidAppPublic();
    if (enabled && !info.available) {
        throw new Error('Upload the Android APK first, then turn downloads on.');
    }
    const settings = getSettings();
    settings.androidAppEnabled = !!enabled;
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return androidAppPublic();
}

function removeAndroidApp() {
    try { fs.unlinkSync(androidAppPath()); } catch (_) {}
    const settings = getSettings();
    settings.androidAppEnabled = false;
    settings.androidApp = null;
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return androidAppPublic();
}

function homeVideoDir() {
    return path.join(__dirname, '..', 'storage', 'home');
}

function videoMimeForExt(ext) {
    const allowed = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime'
    };
    return allowed[ext] || null;
}

function normalizeHomeVideoEntry(raw, index) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const id = String(item.id || '').trim() || `hv-legacy-${index}`;
    const storedName = path.basename(String(item.storedName || ''));
    let size = Number(item.size || 0) || 0;
    let exists = false;
    if (storedName) {
        try {
            const stat = fs.statSync(path.join(homeVideoDir(), storedName));
            exists = stat.isFile();
            size = stat.size;
        } catch (_) {}
    }
    const order = Number.isFinite(Number(item.order)) ? Number(item.order) : index;
    return {
        id,
        description: String(item.description || '').trim().slice(0, 1200),
        storedName,
        mime: String(item.mime || 'video/mp4').slice(0, 80),
        originalName: String(item.originalName || '').replace(/[/\\]/g, '').slice(0, 180),
        size: exists ? size : Number(item.size || 0) || 0,
        order,
        active: item.active !== false,
        uploadedAt: item.uploadedAt || null,
        available: exists
    };
}

function migrateLegacyHomeVideo(settings) {
    const list = Array.isArray(settings.homeVideos) ? settings.homeVideos.slice() : [];
    if (list.length) return list;
    const legacy = settings.homeVideo && typeof settings.homeVideo === 'object' ? settings.homeVideo : null;
    if (!legacy || !legacy.storedName) return list;
    list.push({
        id: 'hv-legacy-intro',
        description: '',
        storedName: path.basename(String(legacy.storedName)),
        mime: legacy.mime || 'video/mp4',
        originalName: legacy.originalName || legacy.storedName,
        size: legacy.size || 0,
        order: 0,
        active: settings.homeVideoEnabled !== false,
        uploadedAt: legacy.uploadedAt || null
    });
    return list;
}

function readHomeVideosRaw() {
    const settings = getSettings();
    const hadArray = Array.isArray(settings.homeVideos) && settings.homeVideos.length > 0;
    const list = migrateLegacyHomeVideo(settings);
    if (!hadArray && list.length) {
        // Persist one-time migration from legacy single-video settings.
        settings.homeVideos = list.map((item, index) => ({
            id: String(item.id),
            description: String(item.description || '').trim().slice(0, 1200),
            storedName: path.basename(String(item.storedName || '')),
            mime: String(item.mime || 'video/mp4').slice(0, 80),
            originalName: String(item.originalName || '').replace(/[/\\]/g, '').slice(0, 180),
            size: Number(item.size || 0) || 0,
            order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
            active: item.active !== false,
            uploadedAt: item.uploadedAt || null
        }));
        settings.updatedAt = new Date().toISOString();
        writeJson(SETTINGS_FILE, settings);
    }
    return list.map((item, index) => normalizeHomeVideoEntry(item, index))
        .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
}

function writeHomeVideos(list) {
    const settings = getSettings();
    settings.homeVideos = (Array.isArray(list) ? list : []).map((item, index) => ({
        id: String(item.id),
        description: String(item.description || '').trim().slice(0, 1200),
        storedName: path.basename(String(item.storedName || '')),
        mime: String(item.mime || 'video/mp4').slice(0, 80),
        originalName: String(item.originalName || '').replace(/[/\\]/g, '').slice(0, 180),
        size: Number(item.size || 0) || 0,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        active: item.active !== false,
        uploadedAt: item.uploadedAt || null
    }));
    // Keep legacy keys in sync with the first active (or first) item for older readers.
    const primary = settings.homeVideos.find((v) => v.active) || settings.homeVideos[0] || null;
    if (primary) {
        settings.homeVideoEnabled = !!primary.active;
        settings.homeVideo = {
            storedName: primary.storedName,
            mime: primary.mime,
            originalName: primary.originalName,
            size: primary.size,
            uploadedAt: primary.uploadedAt
        };
    } else {
        settings.homeVideoEnabled = false;
        settings.homeVideo = null;
    }
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return readHomeVideosRaw();
}

function homeVideoPublicItem(item, opts = {}) {
    const admin = !!opts.admin;
    const show = admin ? !!item.available : (!!item.active && !!item.available);
    return {
        id: item.id,
        description: item.description || '',
        originalName: item.originalName || '',
        mime: item.mime || 'video/mp4',
        size: item.size || 0,
        order: item.order,
        active: !!item.active,
        available: !!item.available,
        uploadedAt: item.uploadedAt || null,
        url: show ? `/api/home-video/file/${encodeURIComponent(item.id)}` : '',
        adminUrl: admin && item.available ? `/api/super-admin/home-videos/${encodeURIComponent(item.id)}/file` : ''
    };
}

function listHomeVideos(opts = {}) {
    const items = readHomeVideosRaw().map((item) => homeVideoPublicItem(item, opts));
    if (opts.publicOnly) {
        return items.filter((item) => item.active && item.url);
    }
    return items;
}

function getHomeVideoById(id) {
    const key = String(id || '').trim();
    return readHomeVideosRaw().find((item) => item.id === key) || null;
}

function homeVideoPathById(id) {
    const item = getHomeVideoById(id);
    if (!item || !item.storedName) return null;
    return path.join(homeVideoDir(), item.storedName);
}

/** @deprecated single-video helper — returns first active public video */
function homeVideoPublic() {
    const items = listHomeVideos({ publicOnly: true });
    const first = items[0];
    if (!first) {
        return {
            enabled: false,
            available: false,
            originalName: '',
            mime: 'video/mp4',
            size: 0,
            uploadedAt: null,
            url: '',
            items: []
        };
    }
    return {
        enabled: true,
        available: true,
        originalName: first.originalName,
        mime: first.mime,
        size: first.size,
        uploadedAt: first.uploadedAt,
        url: first.url,
        items
    };
}

function homeVideoPath() {
    const items = listHomeVideos({ publicOnly: true });
    if (!items[0]) return path.join(homeVideoDir(), 'intro.mp4');
    return homeVideoPathById(items[0].id) || path.join(homeVideoDir(), 'intro.mp4');
}

function createHomeVideo(file, fields = {}) {
    if (!file || !file.buffer || !file.buffer.length) {
        throw new Error('Choose a landscape video to upload.');
    }
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = videoMimeForExt(ext);
    if (!mime) throw new Error('Video must be MP4, WEBM, or MOV.');
    if (file.buffer.length > 120 * 1024 * 1024) {
        throw new Error('Video must be 120MB or smaller.');
    }
    fs.mkdirSync(homeVideoDir(), { recursive: true });
    const id = `hv-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const storedName = `${id}${ext}`;
    fs.writeFileSync(path.join(homeVideoDir(), storedName), file.buffer);
    const current = readHomeVideosRaw();
    const maxOrder = current.reduce((max, item) => Math.max(max, Number(item.order) || 0), -1);
    const orderRaw = fields.order;
    const order = orderRaw === undefined || orderRaw === null || orderRaw === ''
        ? maxOrder + 1
        : Math.max(0, parseInt(orderRaw, 10) || 0);
    const active = fields.active === undefined ? true : !(fields.active === false || fields.active === 'false' || fields.active === '0');
    current.push({
        id,
        description: String(fields.description || '').trim().slice(0, 1200),
        storedName,
        mime,
        originalName: String(file.originalname || storedName).replace(/[/\\]/g, '').slice(0, 180),
        size: file.buffer.length,
        order,
        active,
        uploadedAt: new Date().toISOString(),
        available: true
    });
    return writeHomeVideos(current);
}

function updateHomeVideo(id, patch = {}, file = null) {
    const key = String(id || '').trim();
    const current = readHomeVideosRaw();
    const index = current.findIndex((item) => item.id === key);
    if (index < 0) throw new Error('Video not found.');
    const item = { ...current[index] };

    if (patch.description !== undefined) {
        item.description = String(patch.description || '').trim().slice(0, 1200);
    }
    if (patch.order !== undefined && patch.order !== null && patch.order !== '') {
        item.order = Math.max(0, parseInt(patch.order, 10) || 0);
    }
    if (patch.active !== undefined) {
        item.active = !(patch.active === false || patch.active === 'false' || patch.active === '0');
    }

    if (file && file.buffer && file.buffer.length) {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const mime = videoMimeForExt(ext);
        if (!mime) throw new Error('Video must be MP4, WEBM, or MOV.');
        if (file.buffer.length > 120 * 1024 * 1024) {
            throw new Error('Video must be 120MB or smaller.');
        }
        fs.mkdirSync(homeVideoDir(), { recursive: true });
        if (item.storedName) {
            try { fs.unlinkSync(path.join(homeVideoDir(), item.storedName)); } catch (_) {}
        }
        const storedName = `${item.id}${ext}`;
        fs.writeFileSync(path.join(homeVideoDir(), storedName), file.buffer);
        item.storedName = storedName;
        item.mime = mime;
        item.originalName = String(file.originalname || storedName).replace(/[/\\]/g, '').slice(0, 180);
        item.size = file.buffer.length;
        item.uploadedAt = new Date().toISOString();
        item.available = true;
    }

    if (item.active && !item.available) {
        throw new Error('Upload a video file before setting this item active.');
    }

    current[index] = item;
    return writeHomeVideos(current);
}

function removeHomeVideoById(id) {
    const key = String(id || '').trim();
    const current = readHomeVideosRaw();
    const item = current.find((v) => v.id === key);
    if (!item) throw new Error('Video not found.');
    if (item.storedName) {
        try { fs.unlinkSync(path.join(homeVideoDir(), item.storedName)); } catch (_) {}
    }
    return writeHomeVideos(current.filter((v) => v.id !== key));
}

function saveHomeVideo(file, fields = {}) {
    return createHomeVideo(file, fields);
}

function setHomeVideoEnabled(enabled) {
    const current = readHomeVideosRaw();
    if (!current.length) throw new Error('Upload a home page video before turning it on.');
    if (enabled) {
        const first = current[0];
        if (!first.available) throw new Error('Upload a home page video before turning it on.');
        first.active = true;
    } else {
        current.forEach((item) => { item.active = false; });
    }
    return writeHomeVideos(current);
}

function removeHomeVideo() {
    const current = readHomeVideosRaw();
    current.forEach((item) => {
        if (item.storedName) {
            try { fs.unlinkSync(path.join(homeVideoDir(), item.storedName)); } catch (_) {}
        }
    });
    return writeHomeVideos([]);
}

function trustedByDir() {
    return path.join(__dirname, '..', 'storage', 'trusted-by');
}

function logoMimeForExt(ext) {
    const allowed = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.gif': 'image/gif'
    };
    return allowed[ext] || null;
}

function normalizeTrustedByEntry(raw, index) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const id = String(item.id || '').trim() || `tb-legacy-${index}`;
    const storedName = path.basename(String(item.storedName || ''));
    let size = Number(item.size || 0) || 0;
    let exists = false;
    if (storedName) {
        try {
            const stat = fs.statSync(path.join(trustedByDir(), storedName));
            exists = stat.isFile();
            size = stat.size;
        } catch (_) {}
    }
    return {
        id,
        name: String(item.name || '').trim().slice(0, 80),
        storedName,
        mime: String(item.mime || 'image/png').slice(0, 80),
        originalName: String(item.originalName || '').replace(/[/\\]/g, '').slice(0, 180),
        size: exists ? size : Number(item.size || 0) || 0,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        active: item.active !== false,
        uploadedAt: item.uploadedAt || null,
        available: exists
    };
}

function readTrustedByRaw() {
    const settings = getSettings();
    const list = Array.isArray(settings.trustedBy) ? settings.trustedBy : [];
    return list.map((item, index) => normalizeTrustedByEntry(item, index))
        .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)));
}

function writeTrustedBy(list, title) {
    const settings = getSettings();
    if (title !== undefined) {
        settings.trustedByTitle = String(title || 'Trusted by').trim().slice(0, 80) || 'Trusted by';
    }
    settings.trustedBy = (Array.isArray(list) ? list : []).map((item, index) => ({
        id: String(item.id),
        name: String(item.name || '').trim().slice(0, 80),
        storedName: path.basename(String(item.storedName || '')),
        mime: String(item.mime || 'image/png').slice(0, 80),
        originalName: String(item.originalName || '').replace(/[/\\]/g, '').slice(0, 180),
        size: Number(item.size || 0) || 0,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        active: item.active !== false,
        uploadedAt: item.uploadedAt || null
    }));
    settings.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, settings);
    return listTrustedBy({ admin: true });
}

function trustedByPublicItem(item, opts = {}) {
    const admin = !!opts.admin;
    const show = admin ? !!item.available : (!!item.active && !!item.available);
    return {
        id: item.id,
        name: item.name || '',
        originalName: item.originalName || '',
        mime: item.mime || 'image/png',
        size: item.size || 0,
        order: item.order,
        active: !!item.active,
        available: !!item.available,
        uploadedAt: item.uploadedAt || null,
        url: show ? `/api/trusted-by/file/${encodeURIComponent(item.id)}` : '',
        adminUrl: admin && item.available ? `/api/super-admin/trusted-by/${encodeURIComponent(item.id)}/file` : ''
    };
}

function getTrustedByTitle() {
    const settings = getSettings();
    return String(settings.trustedByTitle || 'Trusted by').trim().slice(0, 80) || 'Trusted by';
}

function listTrustedBy(opts = {}) {
    const items = readTrustedByRaw().map((item) => trustedByPublicItem(item, opts));
    const payload = {
        title: getTrustedByTitle(),
        items: opts.publicOnly ? items.filter((item) => item.active && item.url) : items
    };
    return payload;
}

function getTrustedByById(id) {
    const key = String(id || '').trim();
    return readTrustedByRaw().find((item) => item.id === key) || null;
}

function trustedByPathById(id) {
    const item = getTrustedByById(id);
    if (!item || !item.storedName) return null;
    return path.join(trustedByDir(), item.storedName);
}

function setTrustedByTitle(title) {
    return writeTrustedBy(readTrustedByRaw(), title);
}

function createTrustedBy(file, fields = {}) {
    if (!file || !file.buffer || !file.buffer.length) {
        throw new Error('Choose a company logo to upload.');
    }
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = logoMimeForExt(ext);
    if (!mime) throw new Error('Logo must be PNG, JPG, WEBP, SVG, or GIF.');
    if (file.buffer.length > 5 * 1024 * 1024) {
        throw new Error('Logo must be 5MB or smaller.');
    }
    fs.mkdirSync(trustedByDir(), { recursive: true });
    const id = `tb-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const storedName = `${id}${ext}`;
    fs.writeFileSync(path.join(trustedByDir(), storedName), file.buffer);
    const current = readTrustedByRaw();
    const maxOrder = current.reduce((max, item) => Math.max(max, Number(item.order) || 0), -1);
    const orderRaw = fields.order;
    const order = orderRaw === undefined || orderRaw === null || orderRaw === ''
        ? maxOrder + 1
        : Math.max(0, parseInt(orderRaw, 10) || 0);
    const active = fields.active === undefined ? true : !(fields.active === false || fields.active === 'false' || fields.active === '0');
    current.push({
        id,
        name: String(fields.name || '').trim().slice(0, 80),
        storedName,
        mime,
        originalName: String(file.originalname || storedName).replace(/[/\\]/g, '').slice(0, 180),
        size: file.buffer.length,
        order,
        active,
        uploadedAt: new Date().toISOString(),
        available: true
    });
    return writeTrustedBy(current);
}

function updateTrustedBy(id, patch = {}, file = null) {
    const key = String(id || '').trim();
    const current = readTrustedByRaw();
    const index = current.findIndex((item) => item.id === key);
    if (index < 0) throw new Error('Trusted company not found.');
    const item = { ...current[index] };

    if (patch.name !== undefined) item.name = String(patch.name || '').trim().slice(0, 80);
    if (patch.order !== undefined && patch.order !== null && patch.order !== '') {
        item.order = Math.max(0, parseInt(patch.order, 10) || 0);
    }
    if (patch.active !== undefined) {
        item.active = !(patch.active === false || patch.active === 'false' || patch.active === '0');
    }

    if (file && file.buffer && file.buffer.length) {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const mime = logoMimeForExt(ext);
        if (!mime) throw new Error('Logo must be PNG, JPG, WEBP, SVG, or GIF.');
        if (file.buffer.length > 5 * 1024 * 1024) {
            throw new Error('Logo must be 5MB or smaller.');
        }
        fs.mkdirSync(trustedByDir(), { recursive: true });
        if (item.storedName) {
            try { fs.unlinkSync(path.join(trustedByDir(), item.storedName)); } catch (_) {}
        }
        const storedName = `${item.id}${ext}`;
        fs.writeFileSync(path.join(trustedByDir(), storedName), file.buffer);
        item.storedName = storedName;
        item.mime = mime;
        item.originalName = String(file.originalname || storedName).replace(/[/\\]/g, '').slice(0, 180);
        item.size = file.buffer.length;
        item.uploadedAt = new Date().toISOString();
        item.available = true;
    }

    if (item.active && !item.available) {
        throw new Error('Upload a logo before setting this company active.');
    }

    current[index] = item;
    return writeTrustedBy(current);
}

function removeTrustedByById(id) {
    const key = String(id || '').trim();
    const current = readTrustedByRaw();
    const item = current.find((v) => v.id === key);
    if (!item) throw new Error('Trusted company not found.');
    if (item.storedName) {
        try { fs.unlinkSync(path.join(trustedByDir(), item.storedName)); } catch (_) {}
    }
    return writeTrustedBy(current.filter((v) => v.id !== key));
}

function publicPlatformStatus() {
    const settings = getSettings();
    const android = androidAppPublic();
    const videos = listHomeVideos({ publicOnly: true });
    const trusted = listTrustedBy({ publicOnly: true });
    return {
        signupEnabled: settings.signupEnabled !== false,
        maintenanceMode: !!settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMode ? (settings.maintenanceMessage || DEFAULT_SETTINGS.maintenanceMessage) : '',
        androidAppDownload: !!android.enabled,
        androidAppName: android.enabled ? android.originalName : '',
        homeVideo: videos.length > 0,
        homeVideoUrl: videos[0] ? videos[0].url : '',
        homeVideos: videos.length,
        trustedBy: trusted.items.length
    };
}

function recordAudit(action, detail, adminEmail) {
    const items = readJson(AUDIT_FILE, []);
    const list = Array.isArray(items) ? items : [];
    list.unshift({
        id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        at: new Date().toISOString(),
        action: String(action || 'action').slice(0, 80),
        detail: detail && typeof detail === 'object' ? detail : { message: String(detail || '') },
        admin: adminEmail || 'super admin'
    });
    writeJson(AUDIT_FILE, list.slice(0, 500));
}

function listAudit(limit) {
    const items = readJson(AUDIT_FILE, []);
    const list = Array.isArray(items) ? items : [];
    const n = Math.max(1, Math.min(parseInt(limit, 10) || 120, 500));
    return list.slice(0, n);
}

function getUserNote(userId) {
    const notes = readJson(NOTES_FILE, {});
    return String((notes && notes[userId]) || '').slice(0, 2000);
}

function setUserNote(userId, note) {
    const notes = readJson(NOTES_FILE, {}) || {};
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('User id is required.');
    const text = String(note || '').slice(0, 2000);
    if (text) notes[uid] = text;
    else delete notes[uid];
    writeJson(NOTES_FILE, notes);
    return text;
}

function saveBroadcastRecord(entry) {
    const items = readJson(BROADCASTS_FILE, []);
    const list = Array.isArray(items) ? items : [];
    list.unshift({
        id: `bc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        at: new Date().toISOString(),
        subject: String((entry && entry.subject) || '').slice(0, 200),
        heading: String((entry && entry.heading) || '').slice(0, 200),
        audience: String((entry && entry.audience) || 'verified'),
        test: !!(entry && entry.test),
        sent: Number((entry && entry.sent) || 0),
        failed: Number((entry && entry.failed) || 0),
        attachmentCount: Number((entry && entry.attachmentCount) || 0),
        htmlTemplate: !!(entry && entry.htmlTemplate),
        admin: (entry && entry.admin) || 'super admin'
    });
    writeJson(BROADCASTS_FILE, list.slice(0, 100));
    return list[0];
}

function listBroadcasts() {
    const items = readJson(BROADCASTS_FILE, []);
    return Array.isArray(items) ? items : [];
}

function listAdminSessions() {
    return loadSessions().map((session) => ({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
    }));
}

module.exports = {
    COOKIE_NAME,
    bootstrap,
    login,
    changePassword,
    destroySession,
    getAdminFromRequest,
    getTokenFromRequest,
    cookieHeader,
    clearCookieHeader,
    requireAdmin,
    getSettings,
    setSettings,
    androidAppPath,
    androidAppPublic,
    saveAndroidApp,
    updateAndroidAppMeta,
    recordAndroidDownload,
    setAndroidAppEnabled,
    removeAndroidApp,
    homeVideoDir,
    homeVideoPath,
    homeVideoPathById,
    homeVideoPublic,
    listHomeVideos,
    getHomeVideoById,
    createHomeVideo,
    updateHomeVideo,
    removeHomeVideoById,
    saveHomeVideo,
    setHomeVideoEnabled,
    removeHomeVideo,
    trustedByDir,
    listTrustedBy,
    getTrustedByById,
    trustedByPathById,
    setTrustedByTitle,
    createTrustedBy,
    updateTrustedBy,
    removeTrustedByById,
    publicPlatformStatus,
    recordAudit,
    listAudit,
    getUserNote,
    setUserNote,
    saveBroadcastRecord,
    listBroadcasts,
    listAdminSessions
};
