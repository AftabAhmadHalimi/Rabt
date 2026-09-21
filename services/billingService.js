const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'billing.settings.json');
const PAYMENTS_FILE = path.join(__dirname, '..', 'config', 'payments.json');
const QR_DIR = path.join(__dirname, '..', 'storage', 'billing');
const RECEIPT_DIR = path.join(__dirname, '..', 'storage', 'billing', 'receipts');

const DEFAULT_PLANS = {
    monthly: {
        id: 'monthly',
        name: '1 Month',
        amount: 14,
        months: 1,
        periodLabel: '$14 / 1 Month',
        features: [
            'Email campaigns',
            'WhatsApp campaigns',
            'Telegram campaigns',
            'Contact management',
            'Campaign scheduling',
            'Basic automation',
            'Analytics & KPI dashboard',
            'Delivery and engagement tracking',
            'Multi-channel campaign management',
            'Secure personal workspace',
            'Regular platform updates'
        ]
    },
    quarterly: {
        id: 'quarterly',
        name: '3 Months',
        amount: 29,
        months: 3,
        periodLabel: '$29 / 3 Months',
        features: [
            'Everything in the Monthly plan',
            '3-month access',
            'Better value compared with monthly billing',
            'Full Email + WhatsApp + Telegram access',
            'Scheduling & automation',
            'Analytics & KPI dashboard',
            'Engagement tracking',
            'Personal isolated workspace',
            'Priority access to new platform features'
        ]
    }
};

const ACCESS_MESSAGES = {
    UNAUTH: 'Please sign in to continue.',
    DISABLED: 'This account has been disabled by the platform administrator.',
    UNVERIFIED: 'Please verify your email before continuing.',
    NEED_PLAN: 'Choose a plan to continue using Rabط.',
    PAYMENT_PENDING: 'Your account is waiting for payment verification.',
    PAYMENT_REJECTED: 'Your payment verification was rejected. Please submit a new payment request.',
    EXPIRED: 'Your subscription has expired. Please renew your plan to continue using Rabط.'
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = raw ? JSON.parse(raw) : fallback;
        return parsed == null ? fallback : parsed;
    } catch (_) {
        return fallback;
    }
}

function writeJson(file, data) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function defaultSettings() {
    return {
        currency: 'USD',
        monthlyAmount: 14,
        quarterlyAmount: 29,
        accountName: '',
        accountNumber: '',
        bankName: '',
        instructions: 'Send the exact package amount to the account below, then upload a clear photo or PDF of your payment receipt.',
        siteUrl: '',
        qr: null
    };
}

function getSettings() {
    const stored = readJson(SETTINGS_FILE, {});
    return { ...defaultSettings(), ...(stored && typeof stored === 'object' ? stored : {}) };
}

function setSettings(patch) {
    const current = getSettings();
    const next = { ...current };
    if (patch.accountName !== undefined) next.accountName = String(patch.accountName || '').trim().slice(0, 180);
    if (patch.accountNumber !== undefined) next.accountNumber = String(patch.accountNumber || '').trim().slice(0, 80);
    if (patch.bankName !== undefined) next.bankName = String(patch.bankName || '').trim().slice(0, 180);
    if (patch.instructions !== undefined) next.instructions = String(patch.instructions || '').trim().slice(0, 1200);
    if (patch.siteUrl !== undefined) next.siteUrl = String(patch.siteUrl || '').trim().replace(/\/$/, '').slice(0, 240);
    if (patch.monthlyAmount !== undefined) {
        const n = Number(patch.monthlyAmount);
        if (!Number.isFinite(n) || n < 0) throw new Error('Monthly price must be a valid number.');
        next.monthlyAmount = Math.round(n * 100) / 100;
    }
    if (patch.quarterlyAmount !== undefined) {
        const n = Number(patch.quarterlyAmount);
        if (!Number.isFinite(n) || n < 0) throw new Error('3-month price must be a valid number.');
        next.quarterlyAmount = Math.round(n * 100) / 100;
    }
    next.updatedAt = new Date().toISOString();
    writeJson(SETTINGS_FILE, next);
    return next;
}

function plans() {
    const settings = getSettings();
    const monthly = {
        ...DEFAULT_PLANS.monthly,
        amount: Number(settings.monthlyAmount) || DEFAULT_PLANS.monthly.amount
    };
    monthly.periodLabel = '$' + monthly.amount + ' / 1 Month';
    const quarterly = {
        ...DEFAULT_PLANS.quarterly,
        amount: Number(settings.quarterlyAmount) || DEFAULT_PLANS.quarterly.amount
    };
    quarterly.periodLabel = '$' + quarterly.amount + ' / 3 Months';
    return { monthly, quarterly };
}

function getPlan(id) {
    const all = plans();
    return all[String(id || '').trim()] || null;
}

function qrPath() {
    const settings = getSettings();
    const name = path.basename(String((settings.qr && settings.qr.storedName) || ''));
    return name ? path.join(QR_DIR, name) : '';
}

function saveQr(file) {
    if (!file || !file.buffer || !file.buffer.length) {
        throw new Error('Choose a QR code image to upload.');
    }
    const ext = path.extname(String(file.originalname || '')).toLowerCase() || '.png';
    const allowed = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    if (!allowed[ext]) throw new Error('QR code must be a PNG, JPG, WEBP, or GIF image.');
    ensureDir(QR_DIR);
    const storedName = 'payment-qr' + ext;
    const dest = path.join(QR_DIR, storedName);
    try {
        fs.readdirSync(QR_DIR).forEach((item) => {
            if (item.indexOf('payment-qr') === 0 && item !== storedName) {
                try { fs.unlinkSync(path.join(QR_DIR, item)); } catch (_) {}
            }
        });
    } catch (_) {}
    fs.writeFileSync(dest, file.buffer);
    const settings = getSettings();
    settings.qr = {
        storedName,
        mime: allowed[ext],
        originalName: String(file.originalname || storedName).slice(0, 120),
        size: file.buffer.length,
        uploadedAt: new Date().toISOString()
    };
    writeJson(SETTINGS_FILE, settings);
    return publicPaymentConfig();
}

function removeQr() {
    const dest = qrPath();
    if (dest) try { fs.unlinkSync(dest); } catch (_) {}
    const settings = getSettings();
    settings.qr = null;
    writeJson(SETTINGS_FILE, settings);
    return publicPaymentConfig();
}

function publicPaymentConfig() {
    const settings = getSettings();
    const all = plans();
    const qrFile = qrPath();
    let qrAvailable = false;
    try { qrAvailable = !!(qrFile && fs.existsSync(qrFile)); } catch (_) {}
    return {
        currency: settings.currency || 'USD',
        accountName: settings.accountName || '',
        accountNumber: settings.accountNumber || '',
        bankName: settings.bankName || '',
        instructions: settings.instructions || '',
        qrAvailable,
        plans: [all.monthly, all.quarterly]
    };
}

function adminPaymentConfig() {
    const settings = getSettings();
    return {
        ...publicPaymentConfig(),
        siteUrl: settings.siteUrl || '',
        monthlyAmount: settings.monthlyAmount,
        quarterlyAmount: settings.quarterlyAmount,
        qr: settings.qr || null
    };
}

function siteOrigin(req) {
    const settings = getSettings();
    if (settings.siteUrl) return String(settings.siteUrl).replace(/\/$/, '');
    if (req) {
        const proto = String((req.headers && (req.headers['x-forwarded-proto'] || req.protocol)) || 'http').split(',')[0];
        const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
        if (host) return proto + '://' + String(host).split(',')[0].trim();
    }
    return 'http://localhost:' + (process.env.PORT || 3005);
}

function addMonths(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + Number(months || 0));
    if (next.getDate() !== day) next.setDate(0);
    return next;
}

function daysRemaining(expiresAt) {
    if (!expiresAt) return null;
    const ms = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(ms)) return null;
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function planDisplayName(planId, planName) {
    const id = String(planId || '').trim();
    if (id === 'monthly') return '1 Month';
    if (id === 'quarterly') return '3 Months';
    const name = String(planName || '').trim();
    if (/^monthly$/i.test(name)) return '1 Month';
    return name || id || '';
}

function isSubscriptionCovered(user) {
    if (!user || !user.subscriptionExpiresAt) return false;
    const expiresMs = Date.parse(user.subscriptionExpiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return false;
    const status = String(user.subscriptionStatus || '');
    return status === 'active' || status === 'pending';
}

function accessFromUser(user) {
    if (!user) {
        return {
            ok: false,
            code: 'UNAUTH',
            message: ACCESS_MESSAGES.UNAUTH,
            nextPath: '/login.html',
            subscription: null
        };
    }
    if (user.disabled) {
        return {
            ok: false,
            code: 'DISABLED',
            message: ACCESS_MESSAGES.DISABLED,
            nextPath: '/login.html',
            subscription: snapshot(user, 'disabled')
        };
    }
    if (user.emailVerified === false) {
        return {
            ok: false,
            code: 'UNVERIFIED',
            message: ACCESS_MESSAGES.UNVERIFIED,
            nextPath: '/verify.html',
            subscription: snapshot(user, 'unverified')
        };
    }
    let status = String(user.subscriptionStatus || 'none');
    const expiresAt = user.subscriptionExpiresAt || null;
    if (status === 'active' && expiresAt && Date.parse(expiresAt) < Date.now()) {
        status = 'expired';
    }
    const subscription = snapshot(user, status);
    if (status === 'pending') {
        return { ok: false, code: 'PAYMENT_PENDING', message: ACCESS_MESSAGES.PAYMENT_PENDING, nextPath: '/billing-status.html', subscription };
    }
    if (status === 'rejected') {
        return { ok: false, code: 'PAYMENT_REJECTED', message: ACCESS_MESSAGES.PAYMENT_REJECTED, nextPath: '/billing-status.html', subscription };
    }
    if (status === 'expired') {
        return { ok: false, code: 'EXPIRED', message: ACCESS_MESSAGES.EXPIRED, nextPath: '/billing-status.html', subscription };
    }
    if (status === 'active') {
        return { ok: true, code: 'ACTIVE', message: '', nextPath: '/', subscription };
    }
    return { ok: false, code: 'NEED_PLAN', message: ACCESS_MESSAGES.NEED_PLAN, nextPath: '/pricing.html', subscription };
}

function snapshot(user, status) {
    if (!user) return null;
    const resolved = status || user.subscriptionStatus || 'none';
    const expiresAt = user.subscriptionExpiresAt || null;
    return {
        status: resolved,
        planId: user.planId || '',
        planName: planDisplayName(user.planId, user.planName),
        amount: Number(user.subscriptionAmount || 0) || 0,
        startedAt: user.subscriptionStartedAt || null,
        expiresAt,
        verifiedAt: user.paymentVerifiedAt || null,
        daysRemaining: resolved === 'active' ? daysRemaining(expiresAt) : (expiresAt ? daysRemaining(expiresAt) : null)
    };
}

function loadPayments() {
    const data = readJson(PAYMENTS_FILE, []);
    return Array.isArray(data) ? data : [];
}

function savePayments(items) {
    writeJson(PAYMENTS_FILE, items);
}

function publicPayment(row, extra) {
    if (!row) return null;
    const plan = getPlan(row.planId);
    return Object.assign({
        id: row.id,
        userId: row.userId,
        businessId: row.businessId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        company: row.company || '',
        country: row.country || '',
        notes: row.notes || '',
        planId: row.planId,
        planName: planDisplayName(row.planId, row.planName),
        months: plan ? plan.months : (row.planId === 'quarterly' ? 3 : 1),
        amount: row.amount,
        currency: row.currency || 'USD',
        status: row.status,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt || null,
        reviewedBy: row.reviewedBy || null,
        rejectReason: row.rejectReason || '',
        receiptName: row.receiptOriginalName || '',
        hasReceipt: !!row.receiptStoredName,
        activationStartedAt: row.activationStartedAt || null,
        activationExpiresAt: row.activationExpiresAt || null
    }, extra || {});
}

function listPayments() {
    return loadPayments()
        .slice()
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
        .map((row) => publicPayment(row));
}

function listPaymentsForUser(userId) {
    const uid = String(userId || '');
    return loadPayments()
        .filter((row) => row && row.userId === uid)
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
        .map((row) => publicPayment(row));
}

function pendingCount() {
    return loadPayments().filter((row) => row && row.status === 'pending').length;
}

function getPayment(id) {
    return loadPayments().find((row) => row.id === String(id || '').trim()) || null;
}

function latestForUser(userId) {
    const uid = String(userId || '');
    return loadPayments()
        .filter((row) => row.userId === uid)
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))[0] || null;
}

function receiptAbsPath(row) {
    if (!row || !row.receiptStoredName) return '';
    const uid = String(row.userId || '').replace(/[^A-Za-z0-9_-]/g, '');
    const name = path.basename(String(row.receiptStoredName));
    if (!uid || !name) return '';
    return path.join(RECEIPT_DIR, uid, name);
}

function storeReceipt(userId, paymentId, file) {
    if (!file || !file.buffer || !file.buffer.length) {
        throw new Error('Upload a payment receipt photo or PDF.');
    }
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const allowed = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.pdf': 'application/pdf'
    };
    if (!allowed[ext]) throw new Error('Receipt must be a PNG, JPG, WEBP, GIF, or PDF file.');
    if (file.buffer.length > 8 * 1024 * 1024) throw new Error('Receipt must be 8MB or smaller.');
    const dir = path.join(RECEIPT_DIR, String(userId));
    ensureDir(dir);
    const storedName = paymentId + ext;
    fs.writeFileSync(path.join(dir, storedName), file.buffer);
    return {
        storedName,
        originalName: String(file.originalname || storedName).replace(/[/\\]/g, '').slice(0, 180),
        mime: allowed[ext],
        size: file.buffer.length
    };
}

function submitPayment(user, body, file) {
    if (!user || !user.id) throw new Error('Sign in required.');
    if (user.emailVerified === false) throw new Error('Verify your email before submitting payment.');
    const plan = getPlan(body && body.planId);
    if (!plan) throw new Error('Choose the Monthly or 3 Months package.');
    const name = String((body && body.name) || user.name || '').trim();
    const email = String((body && body.email) || user.email || '').trim().toLowerCase();
    const phone = String((body && body.phone) || '').trim();
    const country = String((body && body.country) || '').trim();
    if (name.length < 2) throw new Error('Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 6) throw new Error('Enter a valid phone number.');
    if (country.length < 2) throw new Error('Choose your country.');

    const existing = latestForUser(user.id);
    if (existing && existing.status === 'pending') {
        throw new Error('A payment verification request is already pending. Please wait for admin review.');
    }

    const id = 'pay-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const receipt = storeReceipt(user.id, id, file);
    const row = {
        id,
        userId: user.id,
        businessId: user.businessId || user.id,
        name,
        email,
        phone,
        company: String((body && body.company) || '').trim().slice(0, 160),
        country,
        notes: String((body && body.notes) || '').trim().slice(0, 800),
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        currency: 'USD',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        receiptStoredName: receipt.storedName,
        receiptOriginalName: receipt.originalName,
        receiptMime: receipt.mime,
        receiptSize: receipt.size
    };
    const items = loadPayments();
    items.unshift(row);
    savePayments(items.slice(0, 2000));

    const authService = require('./authService');
    const stillCovered = isSubscriptionCovered(user);
    authService.patchUser(user.id, {
        phone,
        ...(stillCovered ? {} : { subscriptionStatus: 'pending' }),
        planId: plan.id,
        planName: plan.name,
        subscriptionAmount: plan.amount
    });
    return publicPayment(row);
}

function approvePayment(id, adminEmail) {
    const items = loadPayments();
    const row = items.find((item) => item.id === String(id || '').trim());
    if (!row) throw new Error('Payment request not found.');
    if (row.status === 'approved') throw new Error('This payment is already approved.');
    const plan = getPlan(row.planId);
    if (!plan) throw new Error('This payment has an unknown package.');

    const authService = require('./authService');
    const raw = authService.getRawUserById(row.userId);
    if (!raw) throw new Error('The user account for this payment no longer exists.');

    const now = new Date();
    let periodStart = new Date(now.getTime());
    const prevExpiresMs = raw.subscriptionExpiresAt ? Date.parse(raw.subscriptionExpiresAt) : 0;
    const extending = Number.isFinite(prevExpiresMs) && prevExpiresMs > now.getTime();
    if (extending) {
        periodStart = new Date(prevExpiresMs);
    }
    const expires = addMonths(periodStart, plan.months);
    const subscriptionStartedAt = extending && raw.subscriptionStartedAt
        ? raw.subscriptionStartedAt
        : periodStart.toISOString();

    authService.patchUser(row.userId, {
        subscriptionStatus: 'active',
        planId: plan.id,
        planName: plan.name,
        subscriptionAmount: plan.amount,
        subscriptionStartedAt,
        subscriptionExpiresAt: expires.toISOString(),
        paymentVerifiedAt: now.toISOString(),
        paymentVerifiedBy: adminEmail || 'super admin'
    });

    row.status = 'approved';
    row.reviewedAt = now.toISOString();
    row.reviewedBy = adminEmail || 'super admin';
    row.activationStartedAt = periodStart.toISOString();
    row.activationExpiresAt = expires.toISOString();
    row.months = plan.months;
    savePayments(items);
    return {
        payment: publicPayment(row),
        user: authService.publicUser(authService.getRawUserById(row.userId)),
        startedAt: periodStart.toISOString(),
        expiresAt: expires.toISOString(),
        extended: extending
    };
}

function rejectPayment(id, adminEmail, reason) {
    const items = loadPayments();
    const row = items.find((item) => item.id === String(id || '').trim());
    if (!row) throw new Error('Payment request not found.');
    if (row.status === 'approved') throw new Error('Approved payments cannot be rejected.');
    const authService = require('./authService');
    const raw = authService.getRawUserById(row.userId);
    const keepActive = isSubscriptionCovered(raw);
    if (!keepActive) {
        authService.patchUser(row.userId, { subscriptionStatus: 'rejected' });
    }
    row.status = 'rejected';
    row.reviewedAt = new Date().toISOString();
    row.reviewedBy = adminEmail || 'super admin';
    row.rejectReason = String(reason || '').trim().slice(0, 400);
    savePayments(items);
    return publicPayment(row);
}

function expireIfNeeded(user) {
    if (!user || user.subscriptionStatus !== 'active' || !user.subscriptionExpiresAt) return user;
    if (Date.parse(user.subscriptionExpiresAt) >= Date.now()) return user;
    const authService = require('./authService');
    return authService.patchUser(user.id, { subscriptionStatus: 'expired' }) || user;
}

function paymentTimestamp(row) {
    if (!row) return null;
    return row.reviewedAt || row.submittedAt || null;
}

function revenueOverview(range, from, to, nowDate) {
    const now = nowDate || new Date();
    const activity = require('./activityService');
    const window = activity.resolveChartWindow(range, from, to, now);
    const payments = loadPayments();
    const approved = payments.filter((row) => row && row.status === 'approved');

    const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
    let totalRevenue = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let rejectedCount = 0;
    let revenueInRange = 0;
    let approvedInRange = 0;
    let monthlyPlanRevenue = 0;
    let quarterlyPlanRevenue = 0;

    payments.forEach((row) => {
        const amount = money(row.amount);
        if (row.status === 'pending') {
            pendingCount += 1;
            pendingAmount += amount;
        } else if (row.status === 'rejected') {
            rejectedCount += 1;
        } else if (row.status === 'approved') {
            approvedCount += 1;
            totalRevenue += amount;
            if (row.planId === 'quarterly') quarterlyPlanRevenue += amount;
            else monthlyPlanRevenue += amount;
        }
    });

    const startMs = window.start.getTime();
    const endMs = window.end.getTime();
    let cursor = new Date(window.start);
    if (window.grain === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    else if (window.grain === 'day') {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    } else {
        cursor.setMinutes(0, 0, 0);
    }

    const buckets = [];
    let guard = 0;
    while (cursor.getTime() <= endMs && guard < 400) {
        const start = new Date(cursor);
        const next = new Date(cursor.getTime());
        if (window.grain === 'hour') next.setHours(next.getHours() + 1);
        else if (window.grain === 'month') next.setMonth(next.getMonth() + 1);
        else next.setDate(next.getDate() + 1);
        buckets.push({
            at: start.toISOString(),
            end: next.toISOString(),
            revenue: 0,
            count: 0
        });
        cursor = next;
        guard += 1;
    }

    approved.forEach((row) => {
        const tsRaw = paymentTimestamp(row);
        const ts = tsRaw ? Date.parse(tsRaw) : NaN;
        if (!Number.isFinite(ts)) return;
        if (ts < startMs || ts > endMs) return;
        const amount = money(row.amount);
        revenueInRange += amount;
        approvedInRange += 1;
        for (let i = 0; i < buckets.length; i += 1) {
            const bStart = Date.parse(buckets[i].at);
            const bEnd = Date.parse(buckets[i].end);
            if (ts >= bStart && ts < bEnd) {
                buckets[i].revenue = money(buckets[i].revenue + amount);
                buckets[i].count += 1;
                break;
            }
        }
    });

    const recentApproved = approved
        .slice()
        .sort((a, b) => String(paymentTimestamp(b) || '').localeCompare(String(paymentTimestamp(a) || '')))
        .slice(0, 8)
        .map((row) => publicPayment(row));

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let revenueThisMonth = 0;
    approved.forEach((row) => {
        const ts = Date.parse(paymentTimestamp(row) || '');
        if (Number.isFinite(ts) && ts >= monthStart) revenueThisMonth += money(row.amount);
    });

    return {
        totalRevenue: money(totalRevenue),
        revenueThisMonth: money(revenueThisMonth),
        revenueInRange: money(revenueInRange),
        approvedCount,
        approvedInRange,
        pendingCount,
        pendingAmount: money(pendingAmount),
        rejectedCount,
        monthlyPlanRevenue: money(monthlyPlanRevenue),
        quarterlyPlanRevenue: money(quarterlyPlanRevenue),
        currency: 'USD',
        recentApproved,
        chart: {
            range: window.range,
            grain: window.grain,
            label: window.label,
            from: window.start.toISOString(),
            to: window.end.toISOString(),
            buckets,
            summary: {
                revenue: money(revenueInRange),
                count: approvedInRange
            }
        }
    };
}

module.exports = {
    ACCESS_MESSAGES,
    plans,
    getPlan,
    getSettings,
    setSettings,
    saveQr,
    removeQr,
    qrPath,
    publicPaymentConfig,
    adminPaymentConfig,
    siteOrigin,
    accessFromUser,
    listPayments,
    listPaymentsForUser,
    pendingCount,
    getPayment,
    latestForUser,
    publicPayment,
    receiptAbsPath,
    submitPayment,
    approvePayment,
    rejectPayment,
    expireIfNeeded,
    addMonths,
    daysRemaining,
    planDisplayName,
    isSubscriptionCovered,
    revenueOverview
};
