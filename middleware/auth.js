const authService = require('../services/authService');
const { runWithTenant, getTenant } = require('../services/tenantContext');

function tenantFromUser(user) {
    if (!user || !user.id) return null;
    return {
        userId: user.id,
        businessId: user.businessId || user.id
    };
}

function sendUnauthorized(req, res, message) {
    if (req.method === 'GET' && (req.path || '').toLowerCase().endsWith('.html')) {
        return res.redirect('/login.html');
    }
    return res.status(401).json({
        success: false,
        message: message || 'Please sign in to access this tool.'
    });
}

function denyAccess(req, res, user, fallbackCode, fallbackMessage) {
    const code = (user && user.accessCode) || fallbackCode;
    const message = (user && user.accessMessage) || fallbackMessage;
    const nextPath = (user && user.nextPath) || '/login.html';
    if (req.method === 'GET' && (req.path || '').toLowerCase().endsWith('.html')) {
        return res.redirect(nextPath);
    }
    const httpStatus = code === 'UNVERIFIED' || code === 'DISABLED' ? 403 : 402;
    return res.status(httpStatus).json({
        success: false,
        code,
        message,
        next: nextPath
    });
}

function attachUser(req, user) {
    req.user = user;
    req.tenant = tenantFromUser(user);
}

function requireAuth(req, res, next) {
    const user = authService.getUserFromRequest(req);
    if (!user) {
        return sendUnauthorized(req, res);
    }
    attachUser(req, user);
    runWithTenant(req.tenant, () => next());
}

function requireVerified(req, res, next) {
    const user = authService.getUserFromRequest(req);
    if (!user) {
        return sendUnauthorized(req, res);
    }
    if (user.emailVerified === false) {
        return denyAccess(req, res, user, 'UNVERIFIED', 'Please enter the 6-digit code we emailed you before using Rabط.');
    }
    attachUser(req, user);
    runWithTenant(req.tenant, () => next());
}

function requirePaid(req, res, next) {
    let user = authService.getUserFromRequest(req);
    if (!user) {
        return sendUnauthorized(req, res);
    }
    try {
        const billing = require('../services/billingService');
        const raw = authService.getRawUserById(user.id);
        const refreshed = billing.expireIfNeeded(raw) || raw;
        if (refreshed) {
            user = authService.publicUser(refreshed) || user;
        }
    } catch (_) {}
    if (user.emailVerified === false || !user.platformAccess) {
        return denyAccess(
            req,
            res,
            user,
            user.emailVerified === false ? 'UNVERIFIED' : (user.accessCode || 'NEED_PLAN'),
            user.accessMessage || 'Please complete payment verification before using Rabط.'
        );
    }
    attachUser(req, user);
    runWithTenant(req.tenant, () => next());
}

function ensureTenant(req, res, next) {
    const tenant = req.tenant || tenantFromUser(req.user);
    if (!tenant) return next();
    const current = getTenant();
    if (current && current.userId === tenant.userId) return next();
    runWithTenant(tenant, () => next());
}

function optionalAuth(req, res, next) {
    const user = authService.getUserFromRequest(req);
    if (!user || user.emailVerified === false) {
        return next();
    }
    attachUser(req, user);
    runWithTenant(req.tenant, () => next());
}

module.exports = {
    requireAuth,
    requireVerified,
    requirePaid,
    ensureTenant,
    optionalAuth
};
