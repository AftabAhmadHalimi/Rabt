const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tenantStore = require('./tenantStore');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./authMailer');
const { cookieSecurityAttrs } = require('../utils/cookieFlags');
const { assertAllowed, recordFailure, recordSuccess } = require('../utils/rateLimit');

const USERS_FILE = path.join(__dirname, '..', 'config', 'users.json');
const SESSIONS_FILE = path.join(__dirname, '..', 'config', 'sessions.json');
const SESSION_DAYS = 7;
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 45;
const COOKIE_NAME = 'rabt_auth';
const LEGACY_COOKIE_NAME = 'mela_auth';
const LEGACY_OWNER_EMAIL = 'ceomrfaridcontact@gmail.com';

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf-8');
            return fallback;
        }
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = raw ? JSON.parse(raw) : fallback;
        return parsed || fallback;
    } catch (err) {
        console.error('[Auth] Failed to read', file, err.message);
        return fallback;
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function loadUsers() {
    const data = readJson(USERS_FILE, []);
    return Array.isArray(data) ? data : [];
}

function saveUsers(users) {
    writeJson(USERS_FILE, users);
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
    if (changed) {
        writeJson(SESSIONS_FILE, sessions);
    }
    return sessions;
}

function saveSessions(sessions) {
    writeJson(SESSIONS_FILE, sessions);
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

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function publicUser(user) {
    if (!user) return null;
    let access = {
        ok: false,
        code: 'NEED_PLAN',
        message: '',
        nextPath: '/pricing.html',
        subscription: null
    };
    try {
        access = require('./billingService').accessFromUser(user);
    } catch (_) {}
    const onboarded = !!user.onboardingCompleted;
    const nextPath = access.ok
        ? (onboarded ? '/' : '/onboarding.html')
        : (access.nextPath || '/pricing.html');
    let hasAvatar = false;
    try {
        hasAvatar = !!require('./onboardingService').findAvatarPath(user.id);
    } catch (_) {}
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId || user.id,
        emailVerified: user.emailVerified !== false,
        disabled: !!user.disabled,
        phone: user.phone || '',
        platformAccess: !!access.ok,
        onboardingCompleted: onboarded,
        hasAvatar,
        accessCode: access.code || '',
        accessMessage: access.message || '',
        nextPath,
        subscription: access.subscription
    };
}

function clientIp(req) {
    if (!req) return '';
    const xf = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '')
        .split(',')[0]
        .trim();
    const raw = xf || (req.socket && req.socket.remoteAddress) || req.ip || '';
    return String(raw).replace(/^::ffff:/, '').slice(0, 64);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function resolveLegacyOwnerId() {
    const users = loadUsers();
    const preferred = users.find((u) => String(u.email || '').toLowerCase() === LEGACY_OWNER_EMAIL);
    if (preferred) return preferred.id;
    try {
        const smtpPath = path.join(__dirname, '..', 'config', 'email.settings.json');
        if (fs.existsSync(smtpPath)) {
            const smtp = JSON.parse(fs.readFileSync(smtpPath, 'utf-8'));
            const smtpUser = String((smtp.auth && smtp.auth.user) || smtp.user || '').trim().toLowerCase();
            if (smtpUser) {
                const match = users.find((u) => String(u.email || '').toLowerCase() === smtpUser);
                if (match) return match.id;
            }
        }
    } catch (_) {}
    const sorted = [...users].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    return sorted[0] ? sorted[0].id : null;
}

function migrateUsers() {
    const users = loadUsers();
    let changed = false;
    for (const user of users) {
        if (!user.businessId) {
            user.businessId = user.id;
            changed = true;
        }
        if (user.emailVerified === undefined) {
            user.emailVerified = true;
            changed = true;
        }
        if (!user.subscriptionStatus) {
            if (user.emailVerified !== false) {
                user.subscriptionStatus = 'active';
                user.planId = user.planId || 'existing';
                user.planName = user.planName || 'Existing workspace';
                user.subscriptionAmount = Number(user.subscriptionAmount || 0);
                user.subscriptionStartedAt = user.subscriptionStartedAt || user.verifiedAt || user.createdAt || new Date().toISOString();
            } else {
                user.subscriptionStatus = 'none';
            }
            changed = true;
        }
        if (user.onboardingCompleted === undefined) {
            user.onboardingCompleted = user.planId === 'existing';
            changed = true;
        }
        if (!user.inviteCode) {
            user.inviteCode = makeInviteCode(users);
            changed = true;
        }
        tenantStore.ensureTenant(user.id, user.businessId || user.id);
    }
    if (changed) saveUsers(users);
    return users;
}

function normalizeInviteCode(code) {
    return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
}

function makeInviteCode(users) {
    const used = new Set(
        (users || []).map((user) => normalizeInviteCode(user.inviteCode)).filter(Boolean)
    );
    let code = '';
    for (let i = 0; i < 24; i += 1) {
        code = crypto.randomBytes(5).toString('hex');
        if (!used.has(code)) return code;
    }
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

function findUserByInviteCode(code, users) {
    const clean = normalizeInviteCode(code);
    if (!clean) return null;
    return (users || loadUsers()).find((user) => normalizeInviteCode(user.inviteCode) === clean) || null;
}

function ensureUserInviteCode(user, users) {
    if (user && user.inviteCode) return user.inviteCode;
    if (!user) return '';
    user.inviteCode = makeInviteCode(users);
    return user.inviteCode;
}

function getInviteSummary(userId) {
    const users = loadUsers();
    const owner = users.find((user) => user.id === String(userId || ''));
    if (!owner) throw new Error('Account not found.');
    const code = ensureUserInviteCode(owner, users);
    saveUsers(users);
    const invited = users
        .filter((user) => user.invitedBy === owner.id)
        .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt || null,
            emailVerified: user.emailVerified !== false
        }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return {
        code,
        path: '/signup.html?invite=' + encodeURIComponent(code),
        invitedCount: invited.length,
        invited
    };
}

function issueOtp(user) {
    const code = String(crypto.randomInt(100000, 1000000));
    user.verifyTokenHash = hashToken(code);
    user.verifyExpires = Date.now() + OTP_MINUTES * 60 * 1000;
    user.verifyAttempts = 0;
    user.otpSentAt = Date.now();
    return code;
}

function issueVerifyLink(user) {
    const token = crypto.randomBytes(24).toString('hex');
    user.verifyLinkHash = hashToken(token);
    user.verifyLinkExpires = Date.now() + 24 * 60 * 60 * 1000;
    return token;
}

function publicOrigin(req) {
    try {
        return require('./billingService').siteOrigin(req);
    } catch (_) {
        return 'http://localhost:' + (process.env.PORT || 3005);
    }
}

async function sendUserVerification(user, req) {
    const code = issueOtp(user);
    const token = issueVerifyLink(user);
    const origin = publicOrigin(req);
    const verifyUrl = origin + '/verify.html?email=' + encodeURIComponent(user.email) + '&token=' + encodeURIComponent(token);
    await sendVerificationEmail({
        to: user.email,
        name: user.name,
        code,
        expiresMinutes: OTP_MINUTES,
        verifyUrl
    });
}

async function signup({ name, email, password, confirmPassword, invite }, req) {
    const signupKey = 'signup:' + clientIp(req);
    assertAllowed(signupKey, 60 * 60 * 1000, 12);
    recordFailure(signupKey);
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    const cleanConfirm = confirmPassword == null ? cleanPassword : String(confirmPassword);

    if (cleanName.length < 2) throw new Error('Please enter your name (at least 2 characters).');
    if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');
    if (cleanPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    if (cleanConfirm !== cleanPassword) throw new Error('Passwords do not match.');

    const users = loadUsers();
    if (users.some((u) => u.email === cleanEmail)) {
        throw new Error('An account with this email already exists. Please sign in.');
    }

    const { hash, salt } = hashPassword(cleanPassword);
    const inviter = findUserByInviteCode(invite, users);
    const user = {
        id: crypto.randomUUID(),
        businessId: null,
        name: cleanName,
        email: cleanEmail,
        passwordHash: hash,
        salt,
        emailVerified: false,
        subscriptionStatus: 'none',
        onboardingCompleted: false,
        inviteCode: makeInviteCode(users),
        createdAt: new Date().toISOString()
    };
    const signupIp = clientIp(req);
    if (signupIp) user.signupIp = signupIp;
    if (inviter && inviter.id !== user.id) {
        user.invitedBy = inviter.id;
    }
    user.businessId = user.id;
    tenantStore.ensureTenant(user.id, user.businessId);

    try {
        await sendUserVerification(user, req);
    } catch (err) {
        users.push(user);
        saveUsers(users);
        const error = new Error(
            'Account created, but the verification code could not be emailed. Use Resend code after checking SMTP settings.'
        );
        error.code = 'MAIL_FAILED';
        error.user = publicUser(user);
        throw error;
    }

    users.push(user);
    saveUsers(users);
    return {
        user: publicUser(user),
        needsVerification: true
    };
}

function login({ email, password }, req) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    const loginKey = 'login:' + clientIp(req) + ':' + cleanEmail;
    assertAllowed(loginKey);
    if (!isValidEmail(cleanEmail) || !cleanPassword) {
        recordFailure(loginKey);
        throw new Error('Email and password are required.');
    }

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user || !verifyPassword(cleanPassword, user.passwordHash, user.salt)) {
        recordFailure(loginKey);
        throw new Error('Incorrect email or password.');
    }
    recordSuccess(loginKey);
    if (user.emailVerified === false) {
        const error = new Error('Please enter the 6-digit code we emailed you before signing in.');
        error.code = 'UNVERIFIED';
        error.user = publicUser(user);
        throw error;
    }
    if (user.disabled) {
        const error = new Error('This account has been disabled by the platform administrator.');
        error.code = 'DISABLED';
        throw error;
    }
    tenantStore.ensureTenant(user.id, user.businessId || user.id);
    user.lastLoginAt = new Date().toISOString();
    const ip = clientIp(req);
    if (ip) user.lastLoginIp = ip;
    saveUsers(users);
    const session = createSession(user.id);
    return { user: publicUser(user), token: session.token };
}

function verifyEmail({ email, code, token } = {}) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const rawCode = String(code || '').replace(/\s+/g, '');
    const rawToken = String(token || '').trim();
    if (!isValidEmail(cleanEmail)) throw new Error('Please enter the email you signed up with.');

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user) throw new Error('This verification is invalid or has expired. Request a new one.');
    if (user.emailVerified !== false) {
        throw new Error('This email is already verified. Please sign in.');
    }

    let matches = false;
    if (rawToken) {
        if (!user.verifyLinkHash) throw new Error('No verification link is active. Request a new email.');
        if (user.verifyLinkExpires && user.verifyLinkExpires < Date.now()) {
            throw new Error('This verification link has expired. Request a new one.');
        }
        try {
            const left = Buffer.from(hashToken(rawToken), 'hex');
            const right = Buffer.from(String(user.verifyLinkHash), 'hex');
            matches = left.length === right.length && crypto.timingSafeEqual(left, right);
        } catch (_) {
            matches = false;
        }
        if (!matches) throw new Error('This verification link is invalid. Request a new one.');
    } else {
        if (!/^\d{6}$/.test(rawCode)) throw new Error('Enter the 6-digit code from your email.');
        if (!user.verifyTokenHash) {
            throw new Error('No verification code is active. Request a new code.');
        }
        if (user.verifyExpires && user.verifyExpires < Date.now()) {
            throw new Error('This code has expired. Request a new one.');
        }
        const attempts = parseInt(user.verifyAttempts, 10) || 0;
        if (attempts >= OTP_MAX_ATTEMPTS) {
            user.verifyTokenHash = null;
            saveUsers(users);
            throw new Error('Too many incorrect attempts. Request a new code.');
        }
        try {
            const left = Buffer.from(hashToken(rawCode), 'hex');
            const right = Buffer.from(String(user.verifyTokenHash), 'hex');
            matches = left.length === right.length && crypto.timingSafeEqual(left, right);
        } catch (_) {
            matches = false;
        }
        if (!matches) {
            user.verifyAttempts = attempts + 1;
            const locked = user.verifyAttempts >= OTP_MAX_ATTEMPTS;
            if (locked) user.verifyTokenHash = null;
            saveUsers(users);
            const left = OTP_MAX_ATTEMPTS - user.verifyAttempts;
            throw new Error(locked
                ? 'Too many incorrect attempts. Request a new code.'
                : `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`);
        }
    }

    user.emailVerified = true;
    user.verifyTokenHash = null;
    user.verifyExpires = null;
    user.verifyAttempts = 0;
    user.otpSentAt = null;
    user.verifyLinkHash = null;
    user.verifyLinkExpires = null;
    user.verifiedAt = new Date().toISOString();
    if (!user.subscriptionStatus) user.subscriptionStatus = 'none';
    saveUsers(users);
    tenantStore.ensureTenant(user.id, user.businessId || user.id);
    const session = createSession(user.id);
    return { user: publicUser(user), token: session.token };
}

function issueResetOtp(user) {
    const code = String(crypto.randomInt(100000, 1000000));
    user.resetTokenHash = hashToken(code);
    user.resetExpires = Date.now() + OTP_MINUTES * 60 * 1000;
    user.resetAttempts = 0;
    user.resetOtpSentAt = Date.now();
    return code;
}

async function sendPasswordResetOtp(user) {
    const code = issueResetOtp(user);
    await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        code,
        expiresMinutes: OTP_MINUTES
    });
}

async function requestPasswordReset({ email }, req) {
    const resetKey = 'forgot:' + clientIp(req);
    assertAllowed(resetKey, 60 * 60 * 1000, 10);
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user || user.disabled) {
        return { sent: true };
    }

    const lastSent = parseInt(user.resetOtpSentAt, 10) || 0;
    const waitMs = OTP_RESEND_SECONDS * 1000 - (Date.now() - lastSent);
    if (waitMs > 0) {
        const secs = Math.max(1, Math.ceil(waitMs / 1000));
        throw new Error(`Please wait ${secs} second${secs === 1 ? '' : 's'} before requesting another code.`);
    }

    try {
        await sendPasswordResetOtp(user);
        saveUsers(users);
    } catch (_) {
        throw new Error('Could not send reset code. Check SMTP settings or try again later.');
    }
    return { sent: true };
}

function resetPasswordWithOtp({ email, code, password, confirmPassword }, req) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const resetKey = 'reset:' + clientIp(req) + ':' + cleanEmail;
    assertAllowed(resetKey);
    const rawCode = String(code || '').replace(/\s+/g, '');
    const cleanPassword = String(password || '');
    const cleanConfirm = confirmPassword == null ? cleanPassword : String(confirmPassword);

    if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');
    if (!/^\d{6}$/.test(rawCode)) throw new Error('Enter the 6-digit code from your email.');
    if (cleanPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    if (cleanConfirm !== cleanPassword) throw new Error('Passwords do not match.');

    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user || !user.resetTokenHash) {
        recordFailure(resetKey);
        throw new Error('This reset is invalid or has expired. Request a new code.');
    }
    if (user.resetExpires && user.resetExpires < Date.now()) {
        recordFailure(resetKey);
        throw new Error('This code has expired. Request a new one.');
    }

    const attempts = parseInt(user.resetAttempts, 10) || 0;
    if (attempts >= OTP_MAX_ATTEMPTS) {
        user.resetTokenHash = null;
        saveUsers(users);
        recordFailure(resetKey);
        throw new Error('Too many incorrect attempts. Request a new code.');
    }

    let matches = false;
    try {
        const left = Buffer.from(hashToken(rawCode), 'hex');
        const right = Buffer.from(String(user.resetTokenHash), 'hex');
        matches = left.length === right.length && crypto.timingSafeEqual(left, right);
    } catch (_) {
        matches = false;
    }
    if (!matches) {
        user.resetAttempts = attempts + 1;
        const locked = user.resetAttempts >= OTP_MAX_ATTEMPTS;
        if (locked) user.resetTokenHash = null;
        saveUsers(users);
        recordFailure(resetKey);
        const left = OTP_MAX_ATTEMPTS - user.resetAttempts;
        throw new Error(locked
            ? 'Too many incorrect attempts. Request a new code.'
            : `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }

    const { hash, salt } = hashPassword(cleanPassword);
    user.passwordHash = hash;
    user.salt = salt;
    user.resetTokenHash = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
    user.resetOtpSentAt = null;
    saveUsers(users);
    destroySessionsForUser(user.id);
    recordSuccess(resetKey);
    return { success: true };
}

async function resendVerification({ email }, req) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');
    const users = loadUsers();
    const user = users.find((u) => u.email === cleanEmail);
    if (!user) {
        return { sent: true };
    }
    if (user.emailVerified !== false) {
        throw new Error('This email is already verified. Please sign in.');
    }
    const lastSent = parseInt(user.otpSentAt, 10) || 0;
    const waitMs = OTP_RESEND_SECONDS * 1000 - (Date.now() - lastSent);
    if (waitMs > 0) {
        const secs = Math.max(1, Math.ceil(waitMs / 1000));
        throw new Error(`Please wait ${secs} second${secs === 1 ? '' : 's'} before requesting another code.`);
    }
    await sendUserVerification(user, req);
    saveUsers(users);
    return { sent: true };
}

function createSession(userId) {
    const sessions = loadSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const session = {
        tokenHash: hashToken(token),
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    };
    sessions.push(session);
    saveSessions(sessions);
    return { token, userId, createdAt: session.createdAt, expiresAt: session.expiresAt };
}

function destroySession(token) {
    if (!token) return;
    const hashed = hashToken(token);
    const sessions = loadSessions().filter((s) => s.tokenHash !== hashed);
    saveSessions(sessions);
}

function getUserByToken(token) {
    if (!token) return null;
    const hashed = hashToken(token);
    const session = loadSessions().find((s) => s.tokenHash === hashed && s.expiresAt > Date.now());
    if (!session) return null;
    let user = loadUsers().find((u) => u.id === session.userId);
    if (!user || user.disabled) return null;
    try {
        user = require('./billingService').expireIfNeeded(user) || user;
    } catch (_) {}
    return publicUser(user);
}

function getRawUserById(id) {
    return loadUsers().find((u) => u.id === String(id || '').trim()) || null;
}

function patchUser(id, patch) {
    const users = loadUsers();
    const user = users.find((u) => u.id === String(id || '').trim());
    if (!user) throw new Error('User not found.');
    const allowed = [
        'phone', 'subscriptionStatus', 'planId', 'planName', 'subscriptionAmount',
        'subscriptionStartedAt', 'subscriptionExpiresAt', 'paymentVerifiedAt', 'paymentVerifiedBy',
        'onboardingCompleted'
    ];
    (allowed).forEach((key) => {
        if (patch && patch[key] !== undefined) user[key] = patch[key];
    });
    saveUsers(users);
    return user;
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
    const cookies = parseCookies(req);
    return cookies[COOKIE_NAME] || cookies[LEGACY_COOKIE_NAME] || '';
}

function getUserFromRequest(req) {
    return getUserByToken(getTokenFromRequest(req));
}

function cookieHeader(token) {
    const maxAge = SESSION_DAYS * 24 * 60 * 60;
    return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieSecurityAttrs()}; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
    const attrs = cookieSecurityAttrs();
    return [
        `${COOKIE_NAME}=; ${attrs}; Max-Age=0`,
        `${LEGACY_COOKIE_NAME}=; ${attrs}; Max-Age=0`
    ];
}

function destroySessionsForUser(userId) {
    const uid = String(userId || '');
    if (!uid) return 0;
    const sessions = loadSessions();
    const next = sessions.filter((s) => s.userId !== uid);
    const removed = sessions.length - next.length;
    if (removed) saveSessions(next);
    return removed;
}

function adminPublicUser(user) {
    if (!user) return null;
    const pub = publicUser(user);
    let paymentHistory = [];
    let paymentStatus = 'none';
    let daysLeft = null;
    let liveStatus = (pub.subscription && pub.subscription.status) || user.subscriptionStatus || 'none';
    try {
        const billing = require('./billingService');
        paymentHistory = billing.listPaymentsForUser(user.id);
        const latest = paymentHistory[0] || null;
        paymentStatus = latest ? latest.status : 'none';
        daysLeft = billing.daysRemaining(user.subscriptionExpiresAt);
        if (pub.subscription && pub.subscription.status) liveStatus = pub.subscription.status;
    } catch (_) {}
    return {
        ...pub,
        createdAt: user.createdAt || null,
        verifiedAt: user.verifiedAt || null,
        lastLoginAt: user.lastLoginAt || null,
        lastLoginIp: user.lastLoginIp || null,
        signupIp: user.signupIp || null,
        inviteCode: user.inviteCode || '',
        invitedBy: user.invitedBy || null,
        otpPending: user.emailVerified === false && Number(user.verifyExpires || 0) > Date.now(),
        disabled: !!user.disabled,
        subscriptionStatus: liveStatus,
        planId: user.planId || '',
        planName: (pub.subscription && pub.subscription.planName) || user.planName || '',
        subscriptionStartedAt: user.subscriptionStartedAt || null,
        subscriptionExpiresAt: user.subscriptionExpiresAt || null,
        daysRemaining: liveStatus === 'active' ? daysLeft : (daysLeft === 0 ? 0 : null),
        paymentStatus,
        paymentVerifiedAt: user.paymentVerifiedAt || null,
        paymentHistory,
        onboardingCompleted: !!pub.onboardingCompleted
    };
}

function adminListUsers() {
    const sessions = loadSessions();
    return loadUsers().map((user) => {
        const sessionCount = sessions.filter((s) => s.userId === user.id).length;
        return { ...adminPublicUser(user), sessionCount };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function adminFindUser(id) {
    return loadUsers().find((u) => u.id === String(id || '').trim()) || null;
}

function adminCreateUser({ name, email, password, verified }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    if (cleanName.length < 2) throw new Error('Please enter a name (at least 2 characters).');
    if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');
    if (cleanPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    const users = loadUsers();
    if (users.some((u) => u.email === cleanEmail)) {
        throw new Error('An account with this email already exists.');
    }
    const { hash, salt } = hashPassword(cleanPassword);
    const user = {
        id: crypto.randomUUID(),
        businessId: null,
        name: cleanName,
        email: cleanEmail,
        passwordHash: hash,
        salt,
        emailVerified: verified !== false,
        disabled: false,
        inviteCode: makeInviteCode(users),
        createdAt: new Date().toISOString()
    };
    user.businessId = user.id;
    if (user.emailVerified) user.verifiedAt = new Date().toISOString();
    tenantStore.ensureTenant(user.id, user.businessId);
    users.push(user);
    saveUsers(users);
    return adminPublicUser(user);
}

function adminUpdateUser(id, patch) {
    const users = loadUsers();
    const user = users.find((u) => u.id === String(id || '').trim());
    if (!user) throw new Error('User not found.');
    if (patch.name !== undefined) {
        const cleanName = String(patch.name || '').trim();
        if (cleanName.length < 2) throw new Error('Please enter a name (at least 2 characters).');
        user.name = cleanName;
    }
    if (patch.email !== undefined) {
        const cleanEmail = String(patch.email || '').trim().toLowerCase();
        if (!isValidEmail(cleanEmail)) throw new Error('Please enter a valid email address.');
        if (users.some((u) => u.email === cleanEmail && u.id !== user.id)) {
            throw new Error('Another account already uses that email.');
        }
        user.email = cleanEmail;
    }
    if (patch.emailVerified !== undefined) {
        user.emailVerified = !!patch.emailVerified;
        if (user.emailVerified) {
            user.verifiedAt = user.verifiedAt || new Date().toISOString();
            user.verifyTokenHash = null;
            user.verifyExpires = null;
            user.verifyAttempts = 0;
        }
    }
    if (patch.disabled !== undefined) {
        user.disabled = !!patch.disabled;
        if (user.disabled) destroySessionsForUser(user.id);
    }
    saveUsers(users);
    return adminPublicUser(user);
}

function adminSetPassword(id, password) {
    const cleanPassword = String(password || '');
    if (cleanPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    const users = loadUsers();
    const user = users.find((u) => u.id === String(id || '').trim());
    if (!user) throw new Error('User not found.');
    const { hash, salt } = hashPassword(cleanPassword);
    user.passwordHash = hash;
    user.salt = salt;
    saveUsers(users);
    destroySessionsForUser(user.id);
    return adminPublicUser(user);
}

function adminDeleteUser(id) {
    const uid = String(id || '').trim();
    const users = loadUsers();
    const index = users.findIndex((u) => u.id === uid);
    if (index === -1) throw new Error('User not found.');
    users.splice(index, 1);
    saveUsers(users);
    destroySessionsForUser(uid);
    return true;
}

function sessionShortId(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex').slice(0, 16);
}

function adminListSessions() {
    const users = loadUsers();
    const byId = new Map(users.map((user) => [user.id, user]));
    return loadSessions().map((session) => {
        const owner = byId.get(session.userId);
        return {
            id: sessionShortId(session.token),
            userId: session.userId,
            userName: owner ? owner.name : 'Unknown',
            userEmail: owner ? owner.email : '',
            createdAt: session.createdAt,
            expiresAt: session.expiresAt
        };
    }).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function adminRevokeSession(shortId) {
    const id = String(shortId || '').trim();
    const sessions = loadSessions();
    const next = sessions.filter((session) => sessionShortId(session.token) !== id);
    const removed = sessions.length - next.length;
    if (removed) saveSessions(next);
    return removed;
}

function adminRevokeAllSessions() {
    const sessions = loadSessions();
    const removed = sessions.length;
    if (removed) saveSessions([]);
    return removed;
}

module.exports = {
    COOKIE_NAME,
    signup,
    login,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    resetPasswordWithOtp,
    destroySession,
    destroySessionsForUser,
    getUserFromRequest,
    getRawUserById,
    patchUser,
    getTokenFromRequest,
    cookieHeader,
    clearCookieHeader,
    migrateUsers,
    getInviteSummary,
    resolveLegacyOwnerId,
    publicUser,
    createSession,
    adminListUsers,
    adminFindUser,
    adminCreateUser,
    adminUpdateUser,
    adminSetPassword,
    adminDeleteUser,
    adminListSessions,
    adminRevokeSession,
    adminRevokeAllSessions
};
