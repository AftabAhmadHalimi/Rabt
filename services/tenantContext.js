const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function normalizeTenant(input) {
    if (!input) return null;
    const userId = String(input.userId || input.id || '').trim();
    if (!userId) return null;
    const businessId = String(input.businessId || input.business_id || userId).trim() || userId;
    return { userId, businessId };
}

function runWithTenant(tenant, fn) {
    const normalized = normalizeTenant(tenant);
    if (!normalized) {
        throw new Error('A user/business context is required');
    }
    return storage.run(normalized, fn);
}

function getTenant() {
    return storage.getStore() || null;
}

function getUserId(explicit) {
    if (explicit) return String(explicit);
    const tenant = getTenant();
    return tenant ? tenant.userId : null;
}

function getBusinessId(explicitUserId) {
    if (explicitUserId) {
        const tenant = getTenant();
        if (tenant && tenant.userId === String(explicitUserId)) return tenant.businessId;
        return String(explicitUserId);
    }
    const tenant = getTenant();
    return tenant ? tenant.businessId : null;
}

function requireTenant() {
    const tenant = getTenant();
    if (!tenant || !tenant.userId) {
        throw new Error('No authenticated user context');
    }
    return tenant;
}

function assertChannelUserId(userId) {
    const uid = String(userId || '').trim();
    if (!uid || uid === 'default' || uid === 'anon') {
        throw new Error('Channel client requires an authenticated user id');
    }
    return uid;
}

/**
 * Per-user in-memory clients. Callers MUST pass the authenticated user id.
 * There is no Proxy / ALS fallback — that previously let one request reuse
 * another user's WhatsApp or Telegram session.
 */
function createUserScopedHub(Factory) {
    const byUser = new Map();

    function forUser(userId) {
        const uid = assertChannelUserId(userId);
        if (!byUser.has(uid)) {
            byUser.set(uid, new Factory(uid));
        }
        return byUser.get(uid);
    }

    return { forUser };
}

module.exports = {
    runWithTenant,
    getTenant,
    getUserId,
    getBusinessId,
    requireTenant,
    assertChannelUserId,
    createUserScopedHub
};
