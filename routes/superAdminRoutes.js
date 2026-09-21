const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const superAdmin = require('../services/superAdminService');
const authService = require('../services/authService');
const tenantStore = require('../services/tenantStore');
const scheduleService = require('../services/scheduleService');
const listLibrary = require('../services/listLibrary');
const activityService = require('../services/activityService');
const trackingService = require('../services/trackingService');
const whatsappService = require('../services/whatsappService');
const telegramService = require('../services/telegramService');
const supportChat = require('../services/supportChatService');
const contactMessages = require('../services/contactMessageService');
const geoIp = require('../services/geoIpService');
const marketingDb = require('../services/marketingDatabaseService');
const visitService = require('../services/visitService');
const multer = require('multer');
const { sendPlatformBroadcast, sendProfessionalEmail, htmlToText, sendActivationEmail, sendContactReplyEmail } = require('../services/authMailer');
const billing = require('../services/billingService');
const backupService = require('../services/backupService');
const { decodeHtmlBuffer } = require('../utils/emailTemplates');
const { sendPrivateFile } = require('../utils/safeSendFile');
const {
    isConfigured,
    getEmailConfig,
    getPlatformEmailConfig,
    maskPlatformEmailConfig,
    setPlatformEmailConfig,
    isPlatformConfigured
} = require('../config/emailConfig');
const { loadApiConfigFromFile, isTelegramApiConfigured } = require('../config/apiConfigStore');

router.post('/login', (req, res) => {
    try {
        const result = superAdmin.login(req.body || {}, req);
        res.setHeader('Set-Cookie', superAdmin.cookieHeader(result.token));
        res.json({ success: true, message: 'Signed in to platform control.', admin: result.admin });
    } catch (err) {
        res.status(err.statusCode || 401).json({ success: false, message: err.message || 'Sign in failed' });
    }
});

router.post('/logout', (req, res) => {
    superAdmin.destroySession(superAdmin.getTokenFromRequest(req));
    res.setHeader('Set-Cookie', superAdmin.clearCookieHeader());
    res.json({ success: true, message: 'Signed out.' });
});

router.use(superAdmin.requireAdmin);

router.get('/me', (req, res) => {
    res.json({ success: true, admin: req.superAdmin });
});

router.post('/password', (req, res) => {
    try {
        const body = req.body || {};
        const admin = superAdmin.changePassword({
            currentPassword: body.currentPassword,
            newPassword: body.newPassword
        });
        res.setHeader('Set-Cookie', superAdmin.clearCookieHeader());
        res.json({
            success: true,
            message: 'Password updated. Sign in again.',
            admin
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not update password' });
    }
});

function listsForUser(userId) {
    try {
        const stored = tenantStore.readJson(userId, 'lists.json', { lists: [] });
        const lists = Array.isArray(stored) ? stored : (stored && stored.lists) || [];
        return lists.map((item) => ({
            id: item.id,
            kind: item.kind,
            name: item.name,
            recordCount: item.recordCount || 0,
            createdAt: item.createdAt || null
        }));
    } catch (_) {
        return [];
    }
}

function channelStatus(userId) {
    let wa = { connected: false, ready: false, status: 'unknown', phone: null };
    let tg = { connected: false, ready: false, status: 'unknown', phone: null, username: null };
    try { wa = whatsappService.forUser(userId).getStatus(); } catch (_) {}
    try { tg = telegramService.forUser(userId).getStatus(); } catch (_) {}
    const api = loadApiConfigFromFile(userId);
    return {
        emailConfigured: isConfigured(userId),
        emailUser: ((getEmailConfig(userId).auth || {}).user) || '',
        whatsapp: {
            connected: !!wa.connected,
            ready: !!wa.ready,
            status: wa.status || 'disconnected',
            phone: wa.phone || null,
            lastError: wa.lastError || null
        },
        telegram: {
            connected: !!tg.connected,
            ready: !!tg.ready,
            status: tg.status || 'disconnected',
            phone: tg.phone || null,
            username: tg.username || null,
            apiConfigured: isTelegramApiConfigured(api, userId),
            lastError: tg.lastError || null
        }
    };
}

function attachProfile(user, allUsers, threadsById) {
    const summary = userSummary(user);
    const invitedCount = (allUsers || []).filter((item) => item.invitedBy === user.id).length;
    const inviter = user.invitedBy
        ? (allUsers || []).find((item) => item.id === user.invitedBy)
        : null;
    const support = threadsById && threadsById.get ? threadsById.get(user.id) : null;
    let engagement = {};
    try { engagement = trackingService.getEngagement(user.id); } catch (_) {}
    return {
        ...summary,
        engagement,
        note: superAdmin.getUserNote(user.id),
        storageBytes: storageBytes(user.id),
        invitedCount,
        invitedByName: inviter ? inviter.name : '',
        invitedByEmail: inviter ? inviter.email : '',
        onboarding: (() => {
            try { return require('../services/onboardingService').adminSummary(user); } catch (_) { return null; }
        })(),
        support: support
            ? {
                messageCount: support.messageCount || 0,
                unread: support.unread || 0,
                updatedAt: support.updatedAt || null
            }
            : { messageCount: 0, unread: 0, updatedAt: null }
    };
}

function threadMap() {
    const map = new Map();
    try {
        (supportChat.listThreads() || []).forEach((row) => {
            if (row && row.userId) map.set(row.userId, row);
        });
    } catch (_) {}
    return map;
}

function userSummary(user) {
    const lists = listsForUser(user.id);
    const schedules = scheduleService.getSchedules(user.id);
    const channels = channelStatus(user.id);
    let activity = { totals: { sent: 0, failed: 0, jobs: 0 } };
    try {
        activity = activityService.getOverview({
            email: { configured: channels.emailConfigured },
            whatsapp: channels.whatsapp,
            telegram: channels.telegram,
            schedules,
            engagement: trackingService.getEngagement(user.id)
        }, { userId: user.id, range: 'day' });
    } catch (_) {}
    return {
        ...user,
        listCount: lists.length,
        contactCount: lists.reduce((sum, item) => sum + (item.recordCount || 0), 0),
        scheduleCount: schedules.length,
        waitingSchedules: schedules.filter((s) => s.status === 'waiting').length,
        channels,
        today: activity.today || activity.totals || {},
        week: activity.last7Days || {}
    };
}

function logAdmin(req, action, detail) {
    try {
        superAdmin.recordAudit(action, detail, req.superAdmin && req.superAdmin.email);
    } catch (_) {}
}

function folderBytes(dir) {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    const walk = (current) => {
        let entries = [];
        try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (_) { return; }
        entries.forEach((entry) => {
            const full = path.join(current, entry.name);
            try {
                if (entry.isDirectory()) walk(full);
                else total += fs.statSync(full).size;
            } catch (_) {}
        });
    };
    walk(dir);
    return total;
}

function storageBytes(userId) {
    const tenantDir = path.join(__dirname, '..', 'config', 'tenants', String(userId || ''));
    const listDir = path.join(__dirname, '..', 'storage', 'lists', String(userId || ''));
    return folderBytes(tenantDir) + folderBytes(listDir);
}

function csvCell(value) {
    const text = String(value == null ? '' : value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

router.get('/overview', (req, res) => {
    try {
        const users = authService.adminListUsers().map(userSummary);
        const schedules = scheduleService.getAllSchedules();
        const platform = maskPlatformEmailConfig();
        const settings = superAdmin.getSettings();
        const recentActivity = [];
        const allEvents = [];
        const now = new Date();
        let weekSent = 0;
        let weekFailed = 0;
        let opens = 0;
        let clicks = 0;
        users.forEach((user) => {
            activityService.listEvents(user.id).forEach((event) => {
                const row = {
                    ...event,
                    userName: user.name,
                    userEmail: user.email
                };
                allEvents.push(row);
                recentActivity.push(row);
            });
            weekSent += (user.week && user.week.sent) || 0;
            weekFailed += (user.week && user.week.failed) || 0;
            try {
                const eng = trackingService.getEngagement(user.id);
                opens += ((eng.email && eng.email.opened) || 0) + ((eng.whatsapp && eng.whatsapp.opened) || 0);
                clicks += ((eng.email && eng.email.clicked) || 0) + ((eng.whatsapp && eng.whatsapp.clicked) || 0);
            } catch (_) {}
        });
        const visits = visitService.getSummary();
        recentActivity.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
        const chart = activityService.buildChart(allEvents, req.query.range, req.query.from, req.query.to, now);
        const revenueRange = req.query.revenueRange || req.query.range;
        const revenueFrom = req.query.revenueFrom || req.query.from;
        const revenueTo = req.query.revenueTo || req.query.to;
        const revenue = billing.revenueOverview(revenueRange, revenueFrom, revenueTo, now);
        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            health: {
                uptimeSec: Math.round(process.uptime()),
                memoryMb: Math.round((process.memoryUsage().rss || 0) / (1024 * 1024)),
                node: process.version,
                platformSmtp: platform.configured || isPlatformConfigured(),
                signupEnabled: settings.signupEnabled !== false,
                maintenanceMode: !!settings.maintenanceMode
            },
            totals: {
                users: users.length,
                verified: users.filter((u) => u.emailVerified).length,
                unverified: users.filter((u) => !u.emailVerified).length,
                disabled: users.filter((u) => u.disabled).length,
                pendingPayments: billing.pendingCount(),
                activeSubscriptions: users.filter((u) => u.subscriptionStatus === 'active' || (u.subscription && u.subscription.status === 'active')).length,
                sessions: users.reduce((sum, u) => sum + (u.sessionCount || 0), 0),
                lists: users.reduce((sum, u) => sum + (u.listCount || 0), 0),
                contacts: users.reduce((sum, u) => sum + (u.contactCount || 0), 0),
                schedules: schedules.length,
                waiting: schedules.filter((s) => s.status === 'waiting').length,
                whatsappConnected: users.filter((u) => u.channels.whatsapp.connected).length,
                telegramConnected: users.filter((u) => u.channels.telegram.connected).length,
                emailConfigured: users.filter((u) => u.channels.emailConfigured).length,
                sentToday: users.reduce((sum, u) => sum + ((u.today && u.today.sent) || 0), 0),
                failedToday: users.reduce((sum, u) => sum + ((u.today && u.today.failed) || 0), 0),
                sentWeek: weekSent,
                failedWeek: weekFailed,
                opens,
                clicks,
                visits: visits.totalVisits,
                visitPageviews: visits.totalPageviews,
                visitsToday: visits.todayVisits,
                totalRevenue: revenue.totalRevenue,
                revenueThisMonth: revenue.revenueThisMonth,
                revenueInRange: revenue.revenueInRange,
                approvedPayments: revenue.approvedCount,
                pendingPaymentAmount: revenue.pendingAmount,
                monthlyPlanRevenue: revenue.monthlyPlanRevenue,
                quarterlyPlanRevenue: revenue.quarterlyPlanRevenue
            },
            weekChart: (chart.buckets || []).map((bucket) => ({
                day: bucket.at,
                sent: bucket.sent || 0,
                failed: bucket.failed || 0,
                jobs: bucket.jobs || 0
            })),
            chart,
            revenue,
            platform: {
                authSmtpConfigured: platform.configured || isPlatformConfigured(),
                host: platform.host,
                user: platform.user
            },
            recentUsers: users.slice(0, 8),
            recentActivity: recentActivity.slice(0, 24)
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load overview' });
    }
});

router.get('/users', (req, res) => {
    try {
        const q = String(req.query.q || '').trim().toLowerCase();
        const listed = authService.adminListUsers();
        const threads = threadMap();
        let users = listed.map((user) => attachProfile(user, listed, threads));
        if (q) {
            users = users.filter((u) =>
                String(u.name || '').toLowerCase().includes(q) ||
                String(u.email || '').toLowerCase().includes(q) ||
                String(u.id || '').toLowerCase().includes(q) ||
                String(u.inviteCode || '').toLowerCase().includes(q)
            );
        }
        res.json({ success: true, count: users.length, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load users' });
    }
});

router.get('/users/:id/location', async (req, res) => {
    try {
        const listed = authService.adminListUsers().find((u) => u.id === String(req.params.id || '').trim());
        if (!listed) return res.status(404).json({ success: false, message: 'User not found' });
        const ip = listed.lastLoginIp || listed.signupIp || '';
        const geo = await geoIp.lookup(ip);
        const online = (listed.sessionCount || 0) > 0;
        let locationStatus = 'No IP recorded';
        if (geo.local) locationStatus = 'Local / private IP';
        else if (geo.found) locationStatus = 'Last Known IP Location';
        else if (ip) locationStatus = 'IP recorded, place unknown';
        const place = geo.place || (geo.local ? 'Local or private network' : '');
        res.json({
            success: true,
            data: {
                id: listed.id,
                name: listed.name,
                email: listed.email,
                presence: online ? 'Online' : 'Offline',
                online,
                locationStatus,
                ip: geo.ip || ip || '',
                place,
                city: geo.city || '',
                region: geo.region || '',
                country: geo.country || '',
                isp: geo.isp || '',
                lastSeen: listed.lastLoginAt || listed.createdAt || null,
                lat: geo.lat,
                lon: geo.lon,
                approximate: true,
                disclaimer: 'Approximate location from the member’s IP address (not GPS).'
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load location' });
    }
});

router.get('/users/:id', (req, res) => {
    try {
        const listed = authService.adminListUsers();
        const found = listed.find((u) => u.id === String(req.params.id || '').trim());
        if (!found) return res.status(404).json({ success: false, message: 'User not found' });
        const lists = listsForUser(found.id);
        const schedules = scheduleService.getSchedules(found.id);
        res.json({
            success: true,
            data: {
                ...attachProfile(found, listed, threadMap()),
                lists,
                schedules,
                activity: activityService.listRecent(found.id, 30),
                sessions: authService.adminListSessions().filter((s) => s.userId === found.id)
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Failed to load user' });
    }
});

router.patch('/users/:id', (req, res) => {
    try {
        const user = authService.adminUpdateUser(req.params.id, req.body || {});
        logAdmin(req, 'user.update', { id: user.id, email: user.email });
        res.json({ success: true, message: 'User updated.', data: userSummary(user) });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not update user' });
    }
});

router.post('/users/:id/password', (req, res) => {
    try {
        const user = authService.adminSetPassword(req.params.id, (req.body || {}).password);
        res.json({ success: true, message: 'Password reset. The user must sign in again.', data: user });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not reset password' });
    }
});

router.get('/users/:id/avatar', (req, res) => {
    const user = authService.adminFindUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const onboarding = require('../services/onboardingService');
    const file = onboarding.findAvatarPath(user.id);
    if (!file) return res.status(404).json({ success: false, message: 'No profile image' });
    res.setHeader('Cache-Control', 'private, no-store');
    return sendPrivateFile(res, file, path.join(__dirname, '..', 'storage', 'onboarding-avatars'), {
        inline: true,
        notFound: 'No profile image'
    });
});

router.post('/users/:id/sessions/revoke', (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const removed = authService.destroySessionsForUser(user.id);
        res.json({ success: true, message: `Revoked ${removed} session(s).`, removed });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not revoke sessions' });
    }
});

router.delete('/users/:id', (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const uid = user.id;
        try { listLibrary.deleteLists(uid, listsForUser(uid).map((item) => item.id)); } catch (_) {}
        scheduleService.removeUserSchedules(uid);
        try { tenantStore.removeTenant(uid); } catch (_) {}
        try {
            const listDir = path.join(__dirname, '..', 'storage', 'lists', uid);
            if (fs.existsSync(listDir)) fs.rmSync(listDir, { recursive: true, force: true });
        } catch (_) {}
        authService.adminDeleteUser(uid);
        logAdmin(req, 'user.delete', { id: uid, email: user.email });
        res.json({ success: true, message: 'User and workspace data deleted.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not delete user' });
    }
});

router.get('/schedules', (req, res) => {
    try {
        const users = authService.adminListUsers();
        const byId = new Map(users.map((u) => [u.id, u]));
        const data = scheduleService.getAllSchedules().map((s) => {
            const owner = byId.get(s.userId);
            return {
                ...s,
                userName: owner ? owner.name : 'Unknown',
                userEmail: owner ? owner.email : ''
            };
        }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load schedules' });
    }
});

router.post('/schedules/:id/cancel', (req, res) => {
    const result = scheduleService.adminCancel(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, message: 'Schedule cancelled.', data: result });
});

router.post('/schedules/:id/run-now', (req, res) => {
    const started = scheduleService.adminRunNow(req.params.id);
    if (!started) return res.status(404).json({ success: false, message: 'Schedule not found' });
    if (started && typeof started.catch === 'function') {
        started.catch((err) => console.error('[SuperAdmin] runNow', err.message));
    }
    res.json({ success: true, message: 'Schedule is running.' });
});

router.delete('/schedules/:id', (req, res) => {
    const deleted = scheduleService.adminDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, message: 'Schedule deleted.' });
});

router.get('/lists', (req, res) => {
    try {
        const users = authService.adminListUsers();
        const data = [];
        users.forEach((user) => {
            listsForUser(user.id).forEach((list) => {
                data.push({
                    ...list,
                    userId: user.id,
                    userName: user.name,
                    userEmail: user.email
                });
            });
        });
        data.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load lists' });
    }
});

router.delete('/lists/:userId/:id', (req, res) => {
    try {
        const ok = listLibrary.deleteList(req.params.userId, req.params.id);
        if (!ok) return res.status(404).json({ success: false, message: 'List not found' });
        res.json({ success: true, message: 'List deleted.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not delete list' });
    }
});

const marketingUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = (file.originalname || '').toLowerCase();
        const okTxt = file.mimetype === 'text/plain' || ext.endsWith('.txt');
        const okXls = ext.endsWith('.xls') || file.mimetype === 'application/vnd.ms-excel';
        const okXlsx = ext.endsWith('.xlsx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (okTxt || okXls || okXlsx) return cb(null, true);
        return cb(new Error('Upload a .txt, .xls, or .xlsx file.'));
    }
});

router.get('/marketing-database', (req, res) => {
    try {
        const data = marketingDb.listAll({ onlyActive: false, includeContacts: false });
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load marketing database' });
    }
});

router.post('/marketing-database', (req, res, next) => {
    marketingUpload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
        next();
    });
}, (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'Choose a file to upload.' });
        }
        const body = req.body || {};
        const saved = marketingDb.saveList({
            kind: body.kind,
            name: body.name,
            description: body.description,
            originalName: req.file.originalname,
            buffer: req.file.buffer,
            active: body.active !== 'false' && body.active !== '0'
        });
        logAdmin(req, 'marketing-database.upload', { id: saved.id, kind: saved.kind, name: saved.name });
        res.json({ success: true, message: 'Marketing list uploaded. Users can view and use it from Marketing Database.', data: saved });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message || 'Could not upload marketing list' });
    }
});

router.put('/marketing-database/:id', (req, res) => {
    try {
        const body = req.body || {};
        const saved = marketingDb.updateList(req.params.id, {
            name: body.name,
            description: body.description,
            active: body.active
        });
        logAdmin(req, 'marketing-database.update', { id: saved.id, active: saved.active });
        res.json({ success: true, message: 'Marketing list updated.', data: saved });
    } catch (err) {
        res.status(err.status || 400).json({ success: false, message: err.message || 'Could not update marketing list' });
    }
});

router.delete('/marketing-database/:id', (req, res) => {
    try {
        const ok = marketingDb.deleteList(req.params.id);
        if (!ok) return res.status(404).json({ success: false, message: 'Marketing list not found' });
        logAdmin(req, 'marketing-database.delete', { id: req.params.id });
        res.json({ success: true, message: 'Marketing list deleted.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not delete marketing list' });
    }
});

function broadcastRecipients(audience) {
    const mode = String(audience || 'verified').trim().toLowerCase();
    return authService.adminListUsers().filter((user) => {
        if (!user || !user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) return false;
        if (mode === 'all') return true;
        if (user.disabled) return false;
        if (mode === 'verified') return user.emailVerified !== false;
        return true;
    }).map((user) => ({ id: user.id, name: user.name, email: user.email }));
}

router.get('/platform-smtp', (req, res) => {
    const users = authService.adminListUsers();
    res.json({
        success: true,
        data: maskPlatformEmailConfig(),
        recipients: {
            verified: broadcastRecipients('verified').length,
            active: broadcastRecipients('active').length,
            all: broadcastRecipients('all').length,
            totalUsers: users.length
        }
    });
});

router.post('/platform-smtp', (req, res) => {
    try {
        const body = req.body || {};
        const existing = getPlatformEmailConfig();
        const pass = String(body.password || '').trim() || ((existing.auth && existing.auth.pass) || '');
        setPlatformEmailConfig({
            host: body.host,
            port: body.port,
            secure: body.secure,
            fromName: body.fromName,
            auth: {
                user: body.user,
                pass
            }
        });
        res.json({ success: true, message: 'Platform SMTP saved.', data: maskPlatformEmailConfig() });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save platform SMTP' });
    }
});

const ALLOWED_ATTACH_EXT = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.csv', '.zip'
]);

const broadcastUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 6 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        if (file.fieldname === 'htmlTemplate') {
            const mime = String(file.mimetype || '');
            const okMime = !mime || mime === 'text/html' || mime === 'application/octet-stream' || mime === 'text/plain';
            if (okMime && ext === '.html') return cb(null, true);
            return cb(new Error('HTML template must be a .html file.'));
        }
        if (!ALLOWED_ATTACH_EXT.has(ext)) {
            return cb(new Error('That file type cannot be attached. Use PDF, Office, image, text, or zip.'));
        }
        cb(null, true);
    }
}).fields([
    { name: 'attachments', maxCount: 5 },
    { name: 'htmlTemplate', maxCount: 1 }
]);

function mapAttachments(files) {
    const list = Array.isArray(files) ? files : ((files && files.attachments) || []);
    return list.map((file) => ({
        filename: String(file.originalname || 'attachment').replace(/[/\\]/g, '').slice(0, 180),
        content: file.buffer,
        contentType: file.mimetype || 'application/octet-stream'
    }));
}

function readHtmlTemplate(files) {
    const file = files && files.htmlTemplate && files.htmlTemplate[0];
    if (!file || !file.buffer) return '';
    return decodeHtmlBuffer(file.buffer).trim();
}

router.post('/broadcast', (req, res) => {
    broadcastUpload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not attach files' });
        }
        try {
            if (!isPlatformConfigured()) {
                return res.status(400).json({ success: false, message: 'Save platform SMTP first, then send.' });
            }
            const body = req.body || {};
            const subject = String(body.subject || '').trim();
            const heading = String(body.heading || '').trim() || subject;
            const templateHtml = readHtmlTemplate(req.files);
            const useRawHtml = templateHtml.length > 0;
            const htmlMessage = useRawHtml ? templateHtml : String(body.htmlMessage || '').trim();
            const message = String(body.message || htmlToText(htmlMessage) || '').trim();
            if (subject.length < 3) {
                return res.status(400).json({ success: false, message: 'Subject must be at least 3 characters.' });
            }
            if (useRawHtml && htmlMessage.length < 20) {
                return res.status(400).json({ success: false, message: 'The HTML template is empty or too short.' });
            }
            if (!useRawHtml && message.length < 10) {
                return res.status(400).json({ success: false, message: 'Write a message of at least 10 characters, or upload an HTML template.' });
            }
            const attachments = mapAttachments(req.files);

            const testTo = String(body.testTo || '').trim().toLowerCase();
            if (testTo) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
                    return res.status(400).json({ success: false, message: 'Enter a valid test email address.' });
                }
                await sendProfessionalEmail({
                    to: testTo,
                    name: body.testName || 'there',
                    subject,
                    heading,
                    htmlMessage,
                    message,
                    attachments,
                    useRawHtml
                });
                superAdmin.saveBroadcastRecord({
                    subject,
                    heading,
                    audience: 'test',
                    test: true,
                    sent: 1,
                    failed: 0,
                    attachmentCount: attachments.length,
                    htmlTemplate: useRawHtml,
                    admin: req.superAdmin && req.superAdmin.email
                });
                logAdmin(req, 'broadcast.test', { subject, to: testTo });
                return res.json({
                    success: true,
                    test: true,
                    sent: 1,
                    failed: 0,
                    message: `Test email sent to ${testTo}.`
                });
            }

            const recipients = broadcastRecipients(body.audience || 'verified');
            if (!recipients.length) {
                return res.status(400).json({ success: false, message: 'No matching users to email.' });
            }
            const result = await sendPlatformBroadcast({
                users: recipients,
                subject,
                heading,
                htmlMessage,
                message,
                attachments,
                useRawHtml
            });
            superAdmin.saveBroadcastRecord({
                subject,
                heading,
                audience: body.audience || 'verified',
                test: false,
                sent: result.sent,
                failed: result.failed,
                attachmentCount: attachments.length,
                htmlTemplate: useRawHtml,
                admin: req.superAdmin && req.superAdmin.email
            });
            logAdmin(req, 'broadcast.send', { subject, sent: result.sent, failed: result.failed, audience: body.audience || 'verified' });
            res.json({
                success: true,
                test: false,
                ...result,
                total: recipients.length,
                message: `Sent ${result.sent} of ${recipients.length} professional emails.`
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || 'Could not send platform email' });
        }
    });
});

router.get('/health', (req, res) => {
    const platform = maskPlatformEmailConfig();
    const settings = superAdmin.getSettings();
    res.json({
        success: true,
        data: {
            uptimeSec: Math.round(process.uptime()),
            memoryMb: Math.round((process.memoryUsage().rss || 0) / (1024 * 1024)),
            node: process.version,
            pid: process.pid,
            platformSmtp: platform.configured || isPlatformConfigured(),
            signupEnabled: settings.signupEnabled !== false,
            maintenanceMode: !!settings.maintenanceMode,
            adminSessions: superAdmin.listAdminSessions().length
        }
    });
});

router.get('/activity', (req, res) => {
    try {
        const channel = String(req.query.channel || '').trim().toLowerCase();
        const q = String(req.query.q || '').trim().toLowerCase();
        const users = authService.adminListUsers();
        let events = [];
        users.forEach((user) => {
            activityService.listRecent(user.id, 80).forEach((event) => {
                events.push({
                    ...event,
                    userName: user.name,
                    userEmail: user.email
                });
            });
        });
        if (channel && channel !== 'all') {
            events = events.filter((event) => String(event.channel || '') === channel);
        }
        if (q) {
            events = events.filter((event) =>
                String(event.userName || '').toLowerCase().includes(q) ||
                String(event.userEmail || '').toLowerCase().includes(q) ||
                String(event.label || '').toLowerCase().includes(q) ||
                String(event.error || '').toLowerCase().includes(q)
            );
        }
        events.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
        res.json({ success: true, count: events.length, data: events.slice(0, 250) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load activity' });
    }
});

router.get('/channels', (req, res) => {
    try {
        const data = authService.adminListUsers().map((user) => {
            const channels = channelStatus(user.id);
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                disabled: !!user.disabled,
                ...channels
            };
        });
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load channels' });
    }
});

router.post('/channels/:userId/whatsapp/disconnect', async (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const result = await whatsappService.forUser(user.id).destroySession();
        logAdmin(req, 'channel.whatsapp.disconnect', { id: user.id, email: user.email });
        res.json({ success: true, message: 'WhatsApp session disconnected.', data: result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not disconnect WhatsApp' });
    }
});

router.post('/channels/:userId/telegram/disconnect', async (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const result = await telegramService.forUser(user.id).destroySession();
        logAdmin(req, 'channel.telegram.disconnect', { id: user.id, email: user.email });
        res.json({ success: true, message: 'Telegram session disconnected.', data: result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not disconnect Telegram' });
    }
});

router.get('/engagement', (req, res) => {
    try {
        const data = authService.adminListUsers().map((user) => {
            const engagement = trackingService.getEngagement(user.id);
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                emailStats: engagement.email,
                whatsappStats: engagement.whatsapp,
                telegramStats: engagement.telegram
            };
        });
        const sum = (pick) => data.reduce((total, row) => total + Number(pick(row) || 0), 0);
        res.json({
            success: true,
            totals: {
                emailOpened: sum((row) => row.emailStats && row.emailStats.opened),
                emailClicked: sum((row) => row.emailStats && row.emailStats.clicked),
                emailSent: sum((row) => row.emailStats && row.emailStats.sent),
                whatsappRead: sum((row) => row.whatsappStats && row.whatsappStats.read),
                whatsappDelivered: sum((row) => row.whatsappStats && row.whatsappStats.delivered),
                telegramSent: sum((row) => row.telegramStats && row.telegramStats.sent)
            },
            data
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load engagement' });
    }
});

router.get('/sessions', (req, res) => {
    try {
        const data = authService.adminListSessions();
        res.json({
            success: true,
            count: data.length,
            data,
            adminSessions: superAdmin.listAdminSessions().length
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load sessions' });
    }
});

router.delete('/sessions/:id', (req, res) => {
    try {
        const removed = authService.adminRevokeSession(req.params.id);
        if (!removed) return res.status(404).json({ success: false, message: 'Session not found' });
        logAdmin(req, 'session.revoke', { id: req.params.id });
        res.json({ success: true, message: 'Session revoked.', removed });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not revoke session' });
    }
});

router.post('/sessions/revoke-all', (req, res) => {
    try {
        const removed = authService.adminRevokeAllSessions();
        logAdmin(req, 'session.revoke_all', { removed });
        res.json({
            success: true,
            message: `Revoked ${removed} workspace session(s). Super admin stays signed in.`,
            removed
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not revoke sessions' });
    }
});

router.get('/audit', (req, res) => {
    res.json({ success: true, data: superAdmin.listAudit(req.query.limit) });
});

router.get('/settings', (req, res) => {
    res.json({ success: true, data: superAdmin.getSettings() });
});

router.get('/cms', (req, res) => {
    try {
        res.json({ success: true, data: cmsService.getAdmin() });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load CMS' });
    }
});

router.put('/cms', (req, res) => {
    try {
        const data = cmsService.saveCms(req.body || {});
        logAdmin(req, 'cms.update', { updatedAt: data.updatedAt });
        res.json({ success: true, message: 'CMS text saved. Public pages will use the new copy.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save CMS' });
    }
});

router.post('/settings', (req, res) => {
    try {
        const data = superAdmin.setSettings(req.body || {});
        logAdmin(req, 'settings.update', {
            signupEnabled: data.signupEnabled,
            maintenanceMode: data.maintenanceMode
        });
        res.json({ success: true, message: 'Platform settings saved.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save settings' });
    }
});

router.get('/social-media', (req, res) => {
    try {
        const settings = superAdmin.getSettings();
        res.json({ 
            success: true, 
            socialMedia: settings.socialMedia || {
                contactEmail: 'contact@raabt.app',
                twitter: '',
                linkedin: '',
                facebook: '',
                instagram: ''
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load social media settings' });
    }
});

router.post('/social-media', (req, res) => {
    try {
        const body = req.body || {};
        const socialMedia = {
            contactEmail: body.contactEmail || 'contact@raabt.app',
            twitter: body.twitter || '',
            linkedin: body.linkedin || '',
            facebook: body.facebook || '',
            instagram: body.instagram || ''
        };
        console.log('Saving social media settings:', socialMedia);
        console.log('Request body:', body);
        
        const settings = superAdmin.getSettings();
        console.log('Current settings before update:', settings);
        
        settings.socialMedia = socialMedia;
        const updated = superAdmin.setSettings(settings);
        console.log('Updated settings:', updated);
        
        logAdmin(req, 'socialMedia.update', socialMedia);
        res.json({ success: true, message: 'Social media links saved.', socialMedia });
    } catch (err) {
        console.error('Error saving social media settings:', err);
        res.status(400).json({ success: false, message: err.message || 'Could not save social media settings' });
    }
});

const apkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const okMime = !mime || mime === 'application/vnd.android.package-archive' ||
            mime === 'application/octet-stream' || mime === 'application/zip';
        if (ext !== '.apk' || !okMime) {
            return cb(new Error('Upload an Android .apk file.'));
        }
        cb(null, true);
    }
}).single('apk');

router.get('/onboarding-stats', (req, res) => {
    try {
        const onboarding = require('../services/onboardingService');
        res.json({ success: true, data: onboarding.aggregate() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Could not load onboarding stats' });
    }
});

router.get('/android-app', (req, res) => {
    res.json({ success: true, data: superAdmin.androidAppPublic() });
});

router.post('/android-app', (req, res) => {
    apkUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not upload APK' });
        }
        try {
            const extra = {
                appName: req.body && req.body.appName,
                version: req.body && req.body.version,
                releaseNotes: req.body && req.body.releaseNotes
            };
            const data = superAdmin.saveAndroidApp(req.file, extra);
            logAdmin(req, 'android-app.upload', { name: data.originalName, size: data.size, version: data.version });
            res.json({ success: true, message: 'Android app uploaded.', data });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save APK' });
        }
    });
});

router.post('/android-app/meta', (req, res) => {
    try {
        const data = superAdmin.updateAndroidAppMeta(req.body || {});
        logAdmin(req, 'android-app.meta', { version: data.version });
        res.json({ success: true, message: 'Android app details saved.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save Android app details' });
    }
});

router.post('/android-app/toggle', (req, res) => {
    try {
        const data = superAdmin.setAndroidAppEnabled(!!(req.body || {}).enabled);
        logAdmin(req, 'android-app.toggle', { enabled: data.enabled });
        res.json({
            success: true,
            message: data.enabled ? 'Android app download is on.' : 'Android app download is off.',
            data
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not update Android app' });
    }
});

router.delete('/android-app', (req, res) => {
    try {
        const data = superAdmin.removeAndroidApp();
        logAdmin(req, 'android-app.remove', {});
        res.json({ success: true, message: 'Android app file removed.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not remove APK' });
    }
});

const homeVideoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 120 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const okExt = ext === '.mp4' || ext === '.webm' || ext === '.mov';
        const okMime = !mime || mime.indexOf('video/') === 0 || mime === 'application/octet-stream';
        if (!okExt || !okMime) {
            return cb(new Error('Upload an MP4, WEBM, or MOV landscape video.'));
        }
        cb(null, true);
    }
}).single('video');

router.get('/home-videos', (req, res) => {
    res.json({ success: true, data: { items: superAdmin.listHomeVideos({ admin: true }) } });
});

router.post('/home-videos', (req, res) => {
    homeVideoUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not upload video' });
        }
        try {
            const body = req.body || {};
            superAdmin.createHomeVideo(req.file, {
                description: body.description,
                order: body.order,
                active: body.active
            });
            const items = superAdmin.listHomeVideos({ admin: true });
            logAdmin(req, 'home-video.create', { count: items.length });
            res.json({ success: true, message: 'Showcase video added.', data: { items } });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save video' });
        }
    });
});

router.put('/home-videos/:id', (req, res) => {
    const contentType = String(req.headers['content-type'] || '');
    const finish = (file) => {
        try {
            const body = req.body || {};
            superAdmin.updateHomeVideo(req.params.id, {
                description: body.description,
                order: body.order,
                active: body.active
            }, file || null);
            const items = superAdmin.listHomeVideos({ admin: true });
            logAdmin(req, 'home-video.update', { id: req.params.id });
            res.json({ success: true, message: 'Showcase video updated.', data: { items } });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not update video' });
        }
    };
    if (contentType.indexOf('multipart/form-data') !== -1) {
        return homeVideoUpload(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'Could not upload video' });
            }
            finish(req.file || null);
        });
    }
    finish(null);
});

router.delete('/home-videos/:id', (req, res) => {
    try {
        superAdmin.removeHomeVideoById(req.params.id);
        const items = superAdmin.listHomeVideos({ admin: true });
        logAdmin(req, 'home-video.remove', { id: req.params.id });
        res.json({ success: true, message: 'Showcase video removed.', data: { items } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not remove video' });
    }
});

router.get('/home-videos/:id/file', (req, res) => {
    const item = superAdmin.getHomeVideoById(req.params.id);
    if (!item || !item.available) {
        return res.status(404).json({ success: false, message: 'No home page video uploaded.' });
    }
    const filePath = superAdmin.homeVideoPathById(item.id);
    res.setHeader('Accept-Ranges', 'bytes');
    return sendPrivateFile(res, filePath, path.join(__dirname, '..', 'storage', 'home'), {
        contentType: item.mime || 'video/mp4',
        filename: String(item.originalName || 'intro.mp4'),
        inline: true,
        notFound: 'No home page video uploaded.'
    });
});

// Legacy single-video endpoints (compat)
router.get('/home-video', (req, res) => {
    res.json({
        success: true,
        data: {
            ...superAdmin.homeVideoPublic(),
            items: superAdmin.listHomeVideos({ admin: true })
        }
    });
});

router.post('/home-video', (req, res) => {
    homeVideoUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not upload video' });
        }
        try {
            superAdmin.createHomeVideo(req.file, req.body || {});
            const items = superAdmin.listHomeVideos({ admin: true });
            logAdmin(req, 'home-video.upload', { count: items.length });
            res.json({
                success: true,
                message: 'Home page video uploaded.',
                data: { ...superAdmin.homeVideoPublic(), items }
            });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save video' });
        }
    });
});

router.post('/home-video/toggle', (req, res) => {
    try {
        superAdmin.setHomeVideoEnabled(!!(req.body || {}).enabled);
        const items = superAdmin.listHomeVideos({ admin: true });
        const enabled = items.some((item) => item.active);
        logAdmin(req, 'home-video.toggle', { enabled });
        res.json({
            success: true,
            message: enabled ? 'Home page videos are visible.' : 'Home page videos are hidden.',
            data: { items, enabled }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not update home video' });
    }
});

router.delete('/home-video', (req, res) => {
    try {
        superAdmin.removeHomeVideo();
        logAdmin(req, 'home-video.remove', {});
        res.json({ success: true, message: 'Home page videos removed.', data: { items: [] } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not remove video' });
    }
});

router.get('/home-video/file', (req, res) => {
    const info = superAdmin.homeVideoPublic();
    if (!info.available) {
        return res.status(404).json({ success: false, message: 'No home page video uploaded.' });
    }
    res.setHeader('Accept-Ranges', 'bytes');
    return sendPrivateFile(res, superAdmin.homeVideoPath(), path.join(__dirname, '..', 'storage', 'home'), {
        contentType: info.mime || 'video/mp4',
        filename: String(info.originalName || 'intro.mp4'),
        inline: true,
        notFound: 'No home page video uploaded.'
    });
});

const trustedByUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const okExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].indexOf(ext) !== -1;
        const okMime = !mime || mime.indexOf('image/') === 0;
        if (!okExt || !okMime) {
            return cb(new Error('Upload a PNG, JPG, WEBP, SVG, or GIF logo.'));
        }
        cb(null, true);
    }
}).single('logo');

router.get('/trusted-by', (req, res) => {
    res.json({ success: true, data: superAdmin.listTrustedBy({ admin: true }) });
});

router.post('/trusted-by/title', (req, res) => {
    try {
        const data = superAdmin.setTrustedByTitle((req.body || {}).title);
        logAdmin(req, 'trusted-by.title', { title: data.title });
        res.json({ success: true, message: 'Trusted by title saved.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save title' });
    }
});

router.post('/trusted-by', (req, res) => {
    trustedByUpload(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, message: err.message || 'Could not upload logo' });
        }
        try {
            const body = req.body || {};
            const data = superAdmin.createTrustedBy(req.file, {
                name: body.name,
                order: body.order,
                active: body.active
            });
            logAdmin(req, 'trusted-by.create', { count: data.items.length });
            res.json({ success: true, message: 'Trusted company added.', data });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save logo' });
        }
    });
});

router.put('/trusted-by/:id', (req, res) => {
    const contentType = String(req.headers['content-type'] || '');
    const finish = (file) => {
        try {
            const body = req.body || {};
            const data = superAdmin.updateTrustedBy(req.params.id, {
                name: body.name,
                order: body.order,
                active: body.active
            }, file || null);
            logAdmin(req, 'trusted-by.update', { id: req.params.id });
            res.json({ success: true, message: 'Trusted company updated.', data });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not update company' });
        }
    };
    if (contentType.indexOf('multipart/form-data') !== -1) {
        return trustedByUpload(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'Could not upload logo' });
            }
            finish(req.file || null);
        });
    }
    finish(null);
});

router.delete('/trusted-by/:id', (req, res) => {
    try {
        const data = superAdmin.removeTrustedByById(req.params.id);
        logAdmin(req, 'trusted-by.remove', { id: req.params.id });
        res.json({ success: true, message: 'Trusted company removed.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not remove company' });
    }
});

router.get('/trusted-by/:id/file', (req, res) => {
    const item = superAdmin.getTrustedByById(req.params.id);
    if (!item || !item.available) {
        return res.status(404).json({ success: false, message: 'Logo not found.' });
    }
    const filePath = superAdmin.trustedByPathById(item.id);
    return sendPrivateFile(res, filePath, path.join(__dirname, '..', 'storage', 'trusted-by'), {
        contentType: item.mime || 'image/png',
        filename: String(item.originalName || 'logo.png'),
        inline: true,
        notFound: 'Logo not found.'
    });
});

router.get('/broadcasts', (req, res) => {
    res.json({ success: true, data: superAdmin.listBroadcasts() });
});

router.post('/platform-smtp/test', async (req, res) => {
    try {
        if (!isPlatformConfigured()) {
            return res.status(400).json({ success: false, message: 'Save platform SMTP first, then send a test.' });
        }
        const to = String((req.body || {}).to || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return res.status(400).json({ success: false, message: 'Enter a valid test email address.' });
        }
        await sendProfessionalEmail({
            to,
            name: 'there',
            subject: 'Rabط platform SMTP test',
            heading: 'Your platform mailbox works',
            message: 'This is a test email from Super Admin. Platform SMTP is ready to send professional messages.'
        });
        logAdmin(req, 'smtp.test', { to });
        res.json({ success: true, message: `Test email sent to ${to}.` });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'SMTP test failed' });
    }
});

router.post('/users/bulk', (req, res) => {
    try {
        const body = req.body || {};
        const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
        const action = String(body.action || '').trim().toLowerCase();
        if (!ids.length) return res.status(400).json({ success: false, message: 'Select at least one user.' });
        let done = 0;
        const errors = [];
        ids.slice(0, 250).forEach((id) => {
            try {
                if (action === 'verify') authService.adminUpdateUser(id, { emailVerified: true });
                else if (action === 'unverify') authService.adminUpdateUser(id, { emailVerified: false });
                else if (action === 'disable') authService.adminUpdateUser(id, { disabled: true });
                else if (action === 'enable') authService.adminUpdateUser(id, { disabled: false });
                else if (action === 'revoke') authService.destroySessionsForUser(id);
                else throw new Error('Unknown bulk action.');
                done += 1;
            } catch (err) {
                errors.push({ id, error: err.message || 'Failed' });
            }
        });
        logAdmin(req, 'user.bulk', { action, done, requested: ids.length });
        res.json({
            success: true,
            message: `Updated ${done} user${done === 1 ? '' : 's'}.`,
            done,
            errors
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Bulk update failed' });
    }
});

router.get('/export/users', (req, res) => {
    try {
        const users = authService.adminListUsers().map(userSummary);
        const header = ['id', 'name', 'email', 'verified', 'disabled', 'createdAt', 'lastLoginAt', 'lists', 'contacts', 'schedules', 'sessions', 'emailSmtp', 'whatsapp', 'telegram'];
        const rows = users.map((user) => [
            user.id,
            user.name,
            user.email,
            user.emailVerified ? 'yes' : 'no',
            user.disabled ? 'yes' : 'no',
            user.createdAt || '',
            user.lastLoginAt || '',
            user.listCount || 0,
            user.contactCount || 0,
            user.scheduleCount || 0,
            user.sessionCount || 0,
            user.channels && user.channels.emailConfigured ? 'yes' : 'no',
            user.channels && user.channels.whatsapp && user.channels.whatsapp.connected ? 'yes' : 'no',
            user.channels && user.channels.telegram && user.channels.telegram.connected ? 'yes' : 'no'
        ].map(csvCell).join(','));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="rabt-users.csv"');
        res.send(`${header.join(',')}\n${rows.join('\n')}\n`);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Could not export users' });
    }
});

router.post('/users/:id/note', (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const note = superAdmin.setUserNote(user.id, (req.body || {}).note);
        logAdmin(req, 'user.note', { id: user.id });
        res.json({ success: true, message: 'Note saved.', note });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save note' });
    }
});

router.post('/users/:id/resend-otp', async (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        await authService.resendVerification({ email: user.email });
        logAdmin(req, 'user.resend_otp', { id: user.id, email: user.email });
        res.json({ success: true, message: 'Verification code sent.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not resend code' });
    }
});

router.post('/users/:id/email', async (req, res) => {
    try {
        if (!isPlatformConfigured()) {
            return res.status(400).json({ success: false, message: 'Save platform SMTP first, then send.' });
        }
        const user = authService.adminFindUser(req.params.id);
        if (!user || !user.email) return res.status(404).json({ success: false, message: 'User not found' });
        const body = req.body || {};
        const subject = String(body.subject || '').trim();
        const heading = String(body.heading || '').trim() || subject;
        const htmlMessage = String(body.htmlMessage || '').trim();
        const message = String(body.message || htmlToText(htmlMessage) || '').trim();
        if (subject.length < 3) return res.status(400).json({ success: false, message: 'Subject must be at least 3 characters.' });
        if (message.length < 10) return res.status(400).json({ success: false, message: 'Write a message of at least 10 characters.' });
        await sendProfessionalEmail({
            to: user.email,
            name: user.name,
            subject,
            heading,
            htmlMessage,
            message
        });
        logAdmin(req, 'user.email', { id: user.id, email: user.email, subject });
        res.json({ success: true, message: `Email sent to ${user.email}.` });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not send email' });
    }
});

router.get('/support/unread', (req, res) => {
    res.json({ success: true, unread: supportChat.unreadForAdmin() });
});

router.post('/support/chats/bulk', (req, res) => {
    try {
        const body = req.body || {};
        const result = supportChat.bulkAction(body.ids, body.action);
        logAdmin(req, 'support.bulk', result);
        res.json({
            success: true,
            message: 'Updated ' + result.changed + ' chat(s).',
            data: result
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Bulk action failed.' });
    }
});

router.get('/support/chats', (req, res) => {
    try {
        const users = authService.adminListUsers();
        const byId = new Map(users.map((user) => [user.id, user]));
        const onboarding = require('../services/onboardingService');
        const q = String(req.query.q || '').trim().toLowerCase();
        const data = supportChat.listThreads().map((thread) => {
            const owner = byId.get(thread.userId);
            let hasAvatar = !!(owner && owner.hasAvatar);
            if (!hasAvatar && owner) {
                try { hasAvatar = !!onboarding.findAvatarPath(owner.id); } catch (_) {}
            }
            return {
                ...thread,
                userName: owner ? owner.name : 'Unknown user',
                userEmail: owner ? owner.email : '',
                disabled: owner ? !!owner.disabled : false,
                hasAvatar
            };
        }).filter((row) => {
            if (!q) return true;
            return String(row.userName || '').toLowerCase().includes(q)
                || String(row.userEmail || '').toLowerCase().includes(q);
        });
        res.json({ success: true, unread: supportChat.unreadForAdmin(), count: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load chats' });
    }
});

router.get('/support/chats/:userId', (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        let hasAvatar = !!user.hasAvatar;
        try {
            hasAvatar = !!require('../services/onboardingService').findAvatarPath(user.id) || hasAvatar;
        } catch (_) {}
        res.json({
            success: true,
            user: { id: user.id, name: user.name, email: user.email, hasAvatar },
            data: supportChat.getAdminThread(user.id)
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not load chat' });
    }
});

router.post('/support/chats/:userId', (req, res) => {
    try {
        const user = authService.adminFindUser(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const data = supportChat.addAdminMessage(user.id, (req.body || {}).text);
        res.json({
            success: true,
            message: 'Message sent.',
            user: { id: user.id, name: user.name, email: user.email },
            data
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not send message' });
    }
});

router.get('/contact-messages/unread', (req, res) => {
    res.json({ success: true, unread: contactMessages.unreadCount() });
});

router.post('/contact-messages/bulk', (req, res) => {
    try {
        const body = req.body || {};
        const result = contactMessages.bulkAction(body.ids, body.action);
        logAdmin(req, 'contact.bulk', result);
        res.json({
            success: true,
            message: 'Updated ' + result.changed + ' message(s).',
            data: result
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Bulk action failed.' });
    }
});

router.get('/contact-messages', (req, res) => {
    try {
        const data = contactMessages.listMessages({
            q: req.query.q,
            status: req.query.status
        });
        res.json({
            success: true,
            unread: contactMessages.unreadCount(),
            count: data.length,
            data
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Failed to load contact messages' });
    }
});

router.get('/contact-messages/:id', (req, res) => {
    try {
        res.json({
            success: true,
            data: contactMessages.getMessage(req.params.id, true)
        });
    } catch (err) {
        res.status(err.message === 'Contact message not found.' ? 404 : 400).json({
            success: false,
            message: err.message || 'Could not load contact message'
        });
    }
});

router.post('/contact-messages/:id/reply', async (req, res) => {
    try {
        const admin = superAdmin.getAdminFromRequest(req);
        const text = String((req.body || {}).text || '').trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'Write a reply.' });
        }
        const preview = contactMessages.getMessage(req.params.id, false);
        await sendContactReplyEmail({
            to: preview.email,
            name: preview.name,
            subjectLabel: preview.subjectLabel,
            originalMessage: preview.message,
            replyText: text
        });
        const data = contactMessages.addReply(req.params.id, text, admin && admin.email);
        logAdmin(req, 'contact.reply', { id: data.id, email: data.email });
        res.json({ success: true, message: 'Reply sent to the customer email.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not send reply email.' });
    }
});

router.patch('/contact-messages/:id/status', (req, res) => {
    try {
        const data = contactMessages.setStatus(req.params.id, (req.body || {}).status);
        logAdmin(req, 'contact.status', { id: data.id, status: data.status });
        res.json({ success: true, message: 'Status updated.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not update status' });
    }
});

router.delete('/contact-messages/:id', (req, res) => {
    try {
        contactMessages.removeMessage(req.params.id);
        logAdmin(req, 'contact.delete', { id: req.params.id });
        res.json({ success: true, message: 'Contact message deleted.' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not delete message' });
    }
});

const billingQrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 }
}).single('qr');

router.get('/billing', (req, res) => {
    res.json({
        success: true,
        data: billing.adminPaymentConfig(),
        pending: billing.pendingCount()
    });
});

router.put('/billing', (req, res) => {
    try {
        const data = billing.setSettings(req.body || {});
        logAdmin(req, 'billing.settings', { accountNumber: !!data.accountNumber });
        res.json({ success: true, message: 'Payment settings saved.', data: billing.adminPaymentConfig() });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not save payment settings' });
    }
});

router.get('/billing/qr', (req, res) => {
    const file = billing.qrPath();
    const settings = billing.getSettings();
    if (!file || !settings.qr) {
        return res.status(404).json({ success: false, message: 'No payment QR code is configured yet.' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(settings.qr.mime || 'image/png');
    return sendPrivateFile(res, file, path.join(__dirname, '..', 'storage', 'billing'), {
        inline: true,
        contentType: settings.qr.mime || 'image/png',
        notFound: 'No payment QR code is configured yet.'
    });
});

router.post('/billing/qr', (req, res) => {
    billingQrUpload(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message || 'Could not upload QR code' });
        try {
            const data = billing.saveQr(req.file);
            logAdmin(req, 'billing.qr', { name: req.file && req.file.originalname });
            res.json({ success: true, message: 'Payment QR code saved.', data });
        } catch (error) {
            res.status(400).json({ success: false, message: error.message || 'Could not save QR code' });
        }
    });
});

router.delete('/billing/qr', (req, res) => {
    try {
        const data = billing.removeQr();
        logAdmin(req, 'billing.qr-remove', {});
        res.json({ success: true, message: 'Payment QR code removed.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not remove QR code' });
    }
});

router.get('/payments', (req, res) => {
    const status = String(req.query.status || '').trim().toLowerCase();
    let data = billing.listPayments();
    if (status && status !== 'all') data = data.filter((row) => row.status === status);
    res.json({ success: true, pending: billing.pendingCount(), count: data.length, data });
});

router.get('/payments/:id', (req, res) => {
    const row = billing.getPayment(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Payment request not found' });
    res.json({ success: true, data: billing.publicPayment(row) });
});

router.get('/payments/:id/receipt', (req, res) => {
    const row = billing.getPayment(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Payment request not found' });
    const file = billing.receiptAbsPath(row);
    if (!file) return res.status(404).json({ success: false, message: 'No receipt was uploaded' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="' + String(row.receiptOriginalName || 'receipt').replace(/"/g, '') + '"');
    return sendPrivateFile(res, file, path.join(__dirname, '..', 'storage', 'billing', 'receipts'), {
        inline: true,
        filename: row.receiptOriginalName || 'receipt',
        contentType: row.receiptMime || undefined,
        notFound: 'Receipt file is missing'
    });
});

router.post('/payments/:id/approve', async (req, res) => {
    try {
        const result = billing.approvePayment(req.params.id, req.superAdmin && req.superAdmin.email);
        const loginUrl = billing.siteOrigin(req) + '/login.html';
        try {
            await sendActivationEmail({
                to: result.user.email,
                name: result.user.name,
                planName: result.user.subscription && result.user.subscription.planName,
                startedAt: result.startedAt,
                expiresAt: result.expiresAt,
                loginUrl
            });
        } catch (mailErr) {
            logAdmin(req, 'billing.approve-mail-failed', { id: req.params.id, error: mailErr.message });
            return res.json({
                success: true,
                message: 'Account activated, but the confirmation email could not be sent. Check Platform SMTP.',
                data: result.payment,
                user: result.user
            });
        }
        logAdmin(req, 'billing.approve', { id: req.params.id, userId: result.user.id });
        res.json({
            success: true,
            message: 'Payment verified and account activated. Confirmation email sent.',
            data: result.payment,
            user: result.user
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not approve payment' });
    }
});

router.post('/payments/:id/reject', (req, res) => {
    try {
        const data = billing.rejectPayment(req.params.id, req.superAdmin && req.superAdmin.email, (req.body || {}).reason);
        logAdmin(req, 'billing.reject', { id: req.params.id });
        res.json({ success: true, message: 'Payment request rejected.', data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not reject payment' });
    }
});

router.get('/backups', (req, res) => {
    res.json({ success: true, data: backupService.listBackups() });
});

router.post('/backups', (req, res) => {
    try {
        const created = backupService.createBackup();
        logAdmin(req, 'backup.create', { id: created.id, size: created.size });
        res.json({
            success: true,
            message: 'Encrypted backup created.',
            data: {
                id: created.id,
                filename: created.filename,
                size: created.size,
                fileCount: created.fileCount,
                createdAt: created.createdAt
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message || 'Could not create backup' });
    }
});

router.get('/backups/:id/download', (req, res) => {
    const file = backupService.backupAbsPath(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Backup not found' });
    return sendPrivateFile(res, file, backupService.BACKUP_DIR, {
        filename: path.basename(file),
        contentType: 'application/octet-stream',
        notFound: 'Backup not found'
    });
});

module.exports = router;
