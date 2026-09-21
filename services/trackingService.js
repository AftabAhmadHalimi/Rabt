const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tenantStore = require('./tenantStore');
const { getUserId, requireTenant, getBusinessId, runWithTenant } = require('./tenantContext');

const INDEX_FILE = path.join(__dirname, '..', 'config', 'tracking-index.json');
const MAX_ITEMS = 4000;
const PIXEL_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

const caches = new Map();
let publicBaseUrl = String(process.env.PUBLIC_URL || process.env.APP_URL || '').replace(/\/$/, '');
let persistTimer = null;
let index = { tracks: {}, wa: {} };
let indexLoaded = false;

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function currentUserId(explicit) {
    return explicit || getUserId() || requireTenant().userId;
}

function loadIndex() {
    if (indexLoaded) return index;
    indexLoaded = true;
    try {
        if (fs.existsSync(INDEX_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
            index = {
                tracks: (parsed && parsed.tracks) || {},
                wa: (parsed && parsed.wa) || {}
            };
            if (!publicBaseUrl && parsed && parsed.publicBaseUrl) {
                publicBaseUrl = String(parsed.publicBaseUrl).replace(/\/$/, '');
            }
        }
    } catch (err) {
        console.warn('[KPI] Failed to load tracking index:', err.message);
        index = { tracks: {}, wa: {} };
    }
    return index;
}

function persistIndexSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
            fs.writeFileSync(INDEX_FILE, JSON.stringify({
                publicBaseUrl: publicBaseUrl || '',
                tracks: index.tracks,
                wa: index.wa
            }, null, 2), 'utf8');
        } catch (err) {
            console.warn('[KPI] Failed to save tracking index:', err.message);
        }
    }, 400);
}

function rememberIndex(userId, item) {
    loadIndex();
    if (item && item.id) index.tracks[item.id] = userId;
    if (item && item.waId) index.wa[item.waId] = userId;
    persistIndexSoon();
}

function forgetIndex(item) {
    loadIndex();
    if (item && item.id) delete index.tracks[item.id];
    if (item && item.waId) delete index.wa[item.waId];
    persistIndexSoon();
}

function rebuildMaps(store) {
    store.byId.clear();
    store.byWaId.clear();
    for (const item of store.items) {
        if (item && item.id) store.byId.set(item.id, item);
        if (item && item.waId) store.byWaId.set(item.waId, item);
    }
}

function getStore(userId) {
    const uid = currentUserId(userId);
    if (!caches.has(uid)) {
        const parsed = tenantStore.readJson(uid, 'tracking.json', { items: [] });
        let items = [];
        if (Array.isArray(parsed)) items = parsed;
        else if (parsed && Array.isArray(parsed.items)) {
            items = parsed.items;
            if (!publicBaseUrl && parsed.publicBaseUrl) {
                publicBaseUrl = String(parsed.publicBaseUrl).replace(/\/$/, '');
            }
        }
        const store = { items, byId: new Map(), byWaId: new Map() };
        rebuildMaps(store);
        caches.set(uid, store);
        loadIndex();
        for (const item of items) rememberIndex(uid, item);
    }
    return caches.get(uid);
}

function persistStore(userId) {
    const uid = currentUserId(userId);
    const store = getStore(uid);
    tenantStore.writeJson(uid, 'tracking.json', {
        publicBaseUrl: publicBaseUrl || '',
        items: store.items
    });
}

function persistSoon(userId) {
    persistStore(userId);
    persistIndexSoon();
}

function cap(store) {
    if (store.items.length > MAX_ITEMS) {
        store.items = store.items.slice(0, MAX_ITEMS);
        rebuildMaps(store);
    }
}

function newId(bytes = 12) {
    return crypto.randomBytes(bytes).toString('hex');
}

function maskEmail(value) {
    const email = String(value || '').trim();
    const at = email.indexOf('@');
    if (at < 1) return 'hidden';
    return `${email[0]}***@${email.slice(at + 1)}`;
}

function maskPhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    if (digits.length < 4) return '****';
    return `***${digits.slice(-4)}`;
}

function isPublicUrl(url) {
    const host = String(url || '').replace(/^https?:\/\//i, '').split('/')[0];
    return !!(host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host));
}

function getPublicBaseUrl() {
    loadIndex();
    return publicBaseUrl || '';
}

function setPublicBaseUrl(url) {
    const next = String(url || '').trim().replace(/\/$/, '');
    if (!next || next === publicBaseUrl) return publicBaseUrl;
    publicBaseUrl = next;
    persistIndexSoon();
    return publicBaseUrl;
}

function resolvePublicBaseUrl(explicit) {
    const fromArg = String(explicit || '').trim().replace(/\/$/, '');
    if (fromArg) {
        setPublicBaseUrl(fromArg);
        return fromArg;
    }
    return getPublicBaseUrl();
}

function rememberPublicBaseFromRequest(req) {
    if (!req) return getPublicBaseUrl();
    const env = String(process.env.PUBLIC_URL || process.env.APP_URL || '').replace(/\/$/, '');
    if (env) {
        setPublicBaseUrl(env);
        return env;
    }
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http')
        .split(',')[0]
        .trim();
    const host = String(req.get('x-forwarded-host') || req.get('host') || '')
        .split(',')[0]
        .trim();
    if (!host) return getPublicBaseUrl();
    return setPublicBaseUrl(`${proto}://${host}`);
}

function shouldTrackHref(href, blob) {
    const value = String(href || '').trim();
    if (!value) return false;
    if (/unsubscribe/i.test(blob) || /unsubscribe/i.test(value)) return false;
    if (/^(mailto:|tel:|cid:|#|javascript:)/i.test(value)) return false;
    if (!/^https?:\/\//i.test(value)) return false;
    if (value.includes('/t/c/') || value.includes('/t/o/')) return false;
    return true;
}

function instrumentHtml(html, trackId, baseUrl) {
    const links = {};
    let out = String(html || '');
    out = out.replace(/<a\b([^>]*?)href\s*=\s*(["'])([^"']+)\2([^>]*)>/gi, (full, pre, q, href, post) => {
        if (!shouldTrackHref(href, `${pre} ${post}`)) return full;
        const clickId = newId(6);
        links[clickId] = href.trim();
        return `<a${pre}href=${q}${baseUrl}/t/c/${trackId}/${clickId}${q}${post}>`;
    });
    const pixel =
        `<img src="${baseUrl}/t/o/${trackId}.gif" width="1" height="1" alt="" border="0" ` +
        'style="height:1px;width:1px;border:0;display:block;margin:0;padding:0;" />';
    if (/<\/body>/i.test(out)) {
        out = out.replace(/<\/body>/i, `${pixel}</body>`);
    } else {
        out += pixel;
    }
    return { html: out, links };
}

function createEmailTrack(recipient, html, baseUrl, userId) {
    const uid = userId || getUserId();
    if (!uid) throw new Error('No authenticated user context');
    const bid = getBusinessId(uid) || uid;
    const store = getStore(uid);
    const id = newId();
    const resolvedBase = resolvePublicBaseUrl(baseUrl);
    let nextHtml = String(html || '');
    let links = {};
    if (resolvedBase) {
        const instrumented = instrumentHtml(nextHtml, id, resolvedBase);
        nextHtml = instrumented.html;
        links = instrumented.links;
    }
    const item = {
        id,
        channel: 'email',
        to: maskEmail(recipient),
        status: 'pending',
        sentAt: new Date().toISOString(),
        openedAt: null,
        clickedAt: null,
        deliveredAt: null,
        readAt: null,
        links,
        userId: uid,
        businessId: bid,
        user_id: uid,
        business_id: bid
    };
    store.items.unshift(item);
    store.byId.set(id, item);
    cap(store);
    rememberIndex(uid, item);
    persistSoon(uid);
    return { id, html: nextHtml };
}

function confirmSent(id, extra = {}, userId) {
    const uid = userId || currentUserId();
    const store = getStore(uid);
    const item = store.byId.get(id);
    if (!item) return null;
    item.status = 'sent';
    item.sentAt = extra.sentAt || item.sentAt || new Date().toISOString();
    if (extra.delivered) item.deliveredAt = item.deliveredAt || new Date().toISOString();
    if (extra.waId) {
        item.waId = extra.waId;
        store.byWaId.set(extra.waId, item);
        rememberIndex(uid, item);
    }
    if (extra.peerId) item.peerId = extra.peerId;
    if (extra.msgId != null) item.msgId = extra.msgId;
    persistSoon(uid);
    return item;
}

function discard(id, userId) {
    const uid = userId || currentUserId();
    const store = getStore(uid);
    const item = store.byId.get(id);
    if (!item) return;
    store.items = store.items.filter((entry) => entry.id !== id);
    forgetIndex(item);
    rebuildMaps(store);
    persistSoon(uid);
}

function recordOutbound(entry) {
    const uid = (entry && entry.userId) || getUserId();
    if (!uid) throw new Error('No authenticated user context');
    const bid = (entry && entry.businessId) || getBusinessId(uid) || uid;
    const store = getStore(uid);
    const id = newId();
    const now = new Date().toISOString();
    const item = {
        id,
        channel: entry.channel,
        to: entry.channel === 'email' ? maskEmail(entry.to) : maskPhone(entry.to),
        status: 'sent',
        sentAt: now,
        openedAt: null,
        clickedAt: null,
        deliveredAt: entry.delivered ? now : null,
        readAt: entry.read ? now : null,
        waId: entry.waId || null,
        peerId: entry.peerId || null,
        msgId: entry.msgId != null ? entry.msgId : null,
        links: {},
        userId: uid,
        businessId: bid,
        user_id: uid,
        business_id: bid
    };
    store.items.unshift(item);
    store.byId.set(id, item);
    if (item.waId) store.byWaId.set(item.waId, item);
    cap(store);
    rememberIndex(uid, item);
    persistSoon(uid);
    return item;
}

function ownerForTrack(id) {
    loadIndex();
    const key = String(id || '').replace(/\.gif$/i, '');
    return index.tracks[key] || null;
}

function ownerForWa(waId) {
    loadIndex();
    return index.wa[String(waId || '')] || null;
}

function withOwner(userId, fn) {
    if (!userId) return null;
    return runWithTenant({ userId, businessId: getBusinessId(userId) || userId }, fn);
}

function markOpened(id) {
    const owner = ownerForTrack(id);
    if (!owner) return false;
    return withOwner(owner, () => {
        const store = getStore(owner);
        const item = store.byId.get(String(id || '').replace(/\.gif$/i, ''));
        if (!item || item.status === 'pending') return false;
        if (!item.openedAt) {
            item.openedAt = new Date().toISOString();
            persistSoon(owner);
        }
        return true;
    });
}

function markClicked(id, clickId) {
    const owner = ownerForTrack(id);
    if (!owner) return null;
    return withOwner(owner, () => {
        const store = getStore(owner);
        const item = store.byId.get(id);
        if (!item || item.status === 'pending') return null;
        const url = item.links && item.links[clickId];
        if (!url || !/^https?:\/\//i.test(url)) return null;
        const now = new Date().toISOString();
        if (!item.openedAt) item.openedAt = now;
        if (!item.clickedAt) item.clickedAt = now;
        persistSoon(owner);
        return url;
    });
}

function markWhatsAppAck(waId, ack, userId) {
    const owner = userId || ownerForWa(waId);
    if (!owner) return;
    withOwner(owner, () => {
        const store = getStore(owner);
        const item = store.byWaId.get(waId);
        if (!item) return;
        const now = new Date().toISOString();
        const level = safeNumber(ack, 0);
        if (level >= 2 && !item.deliveredAt) item.deliveredAt = now;
        if (level >= 3 && !item.readAt) item.readAt = now;
        persistSoon(owner);
    });
}

function markTelegramRead(peerId, maxId, userId) {
    const owner = userId || getUserId();
    if (!owner) return;
    withOwner(owner, () => {
        const store = getStore(owner);
        const peer = String(peerId || '');
        const max = safeNumber(maxId, -1);
        if (!peer || max < 0) return;
        let changed = false;
        const now = new Date().toISOString();
        for (const item of store.items) {
            if (item.channel !== 'telegram') continue;
            if (String(item.peerId || '') !== peer) continue;
            if (safeNumber(item.msgId, 0) > max) continue;
            if (!item.deliveredAt) {
                item.deliveredAt = now;
                changed = true;
            }
            if (!item.readAt) {
                item.readAt = now;
                changed = true;
            }
        }
        if (changed) persistSoon(owner);
    });
}

function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 1000) / 10;
}

function summarizeChannel(channel, list) {
    const rows = list.filter((item) => item.channel === channel && item.status !== 'pending');
    const sent = rows.length;
    const opened = rows.filter((item) => item.openedAt).length;
    const clicked = rows.filter((item) => item.clickedAt).length;
    const delivered = rows.filter((item) => item.deliveredAt).length;
    const read = rows.filter((item) => item.readAt).length;
    return {
        sent,
        opened,
        clicked,
        delivered,
        read,
        openRate: pct(opened, sent),
        clickRate: pct(clicked, sent),
        deliveryRate: pct(delivered, sent),
        readRate: pct(read, sent)
    };
}

function getEngagement(userId) {
    const uid = userId || currentUserId();
    const store = getStore(uid);
    return {
        publicTracking: isPublicUrl(getPublicBaseUrl()),
        publicBaseUrl: getPublicBaseUrl(),
        email: summarizeChannel('email', store.items),
        whatsapp: summarizeChannel('whatsapp', store.items),
        telegram: summarizeChannel('telegram', store.items)
    };
}

function rebuildGlobalIndex() {
    loadIndex();
    for (const uid of tenantStore.listTenantUserIds()) {
        caches.delete(uid);
        getStore(uid);
    }
    persistIndexSoon();
}

module.exports = {
    PIXEL_GIF,
    createEmailTrack,
    confirmSent,
    discard,
    recordOutbound,
    markOpened,
    markClicked,
    markWhatsAppAck,
    markTelegramRead,
    getEngagement,
    getPublicBaseUrl,
    resolvePublicBaseUrl,
    rememberPublicBaseFromRequest,
    rebuildGlobalIndex
};
