require('dotenv').config();
const express = require('express');
const cors = require('cors');
const emailRoutes = require('./routes/emailRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const listRoutes = require('./routes/listRoutes');
const marketingDatabaseRoutes = require('./routes/marketingDatabaseRoutes');
const supportRoutes = require('./routes/supportRoutes');
const authRoutes = require('./routes/authRoutes');
const authService = require('./services/authService');
const tenantStore = require('./services/tenantStore');
const { requirePaid, ensureTenant } = require('./middleware/auth');
const { applySecurityHeaders, corsOrigin, blockPublicPrivatePaths } = require('./middleware/securityHeaders');
const {
    isProduction,
    listenHost,
    listenPort,
    validateProductionEnv,
    logProductionCheck
} = require('./config/runtimeEnv');
const { sendPrivateFile } = require('./utils/safeSendFile');
const {
    loadApiConfigFromFile,
    saveApiConfigToFile,
    normalizeApiConfig,
    maskKey,
    isTelegramApiConfigured
} = require('./config/apiConfigStore');
const { getEmailConfig, isConfigured, stripSharedDefaultSmtp } = require('./config/emailConfig');
const activityService = require('./services/activityService');
const trackingService = require('./services/trackingService');
const whatsappService = require('./services/whatsappService');
const telegramService = require('./services/telegramService');
const scheduleService = require('./services/scheduleService');
const path = require('path');
const os = require('os');
const superAdminService = require('./services/superAdminService');
const superAdminRoutes = require('./routes/superAdminRoutes');
const { ensurePrivateDirs } = require('./scripts/secure-permissions');

const app = express();
const PORT = listenPort();
if (isProduction()) {
    app.set('trust proxy', 1);
}

const PROTECTED_PAGES = [
    '/email.html',
    '/whatsapp.html',
    '/telegram.html',
    '/apiConfig.html',
    '/schedule.html',
    '/import-export.html',
    '/verified-contact.html',
    '/marketing-database.html',
    '/templates.html',
    '/settings.html',
    '/support.html',
    '/invite.html'
];
const AUTH_BILLING_PAGES = [
    '/payment.html',
    '/billing-status.html'
];

authService.migrateUsers();
tenantStore.migrateLegacyData(authService.resolveLegacyOwnerId());
stripSharedDefaultSmtp();
ensurePrivateDirs();
scheduleService.reloadAll();
trackingService.rebuildGlobalIndex();
superAdminService.bootstrap();
logProductionCheck(validateProductionEnv());

// Middleware
app.use(applySecurityHeaders);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(blockPublicPrivatePaths);
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
});

app.use((req, res, next) => {
    const page = (req.path || '').toLowerCase();
    const isPageGet = req.method === 'GET' || req.method === 'HEAD';
    if (isPageGet && page === '/apiconfig.html') {
        const user = authService.getUserFromRequest(req);
        if (!user) {
            return res.redirect('/login.html');
        }
        return res.redirect('/telegram.html');
    }
    if (isPageGet && (page === '/' || page === '/index.html')) {
        const user = authService.getUserFromRequest(req);
        if (user && user.emailVerified !== false && !user.platformAccess) {
            return res.redirect(user.nextPath || '/pricing.html');
        }
        if (user && user.platformAccess && !user.onboardingCompleted) {
            return res.redirect('/onboarding.html');
        }
    }
    if (isPageGet && page === '/onboarding.html') {
        const user = authService.getUserFromRequest(req);
        if (!user) return res.redirect('/login.html');
        if (user.emailVerified === false) return res.redirect('/verify.html');
        if (!user.platformAccess) return res.redirect(user.nextPath || '/pricing.html');
    }
    if (isPageGet && PROTECTED_PAGES.includes(page)) {
        const user = authService.getUserFromRequest(req);
        if (!user) {
            return res.redirect('/login.html');
        }
        if (user.emailVerified === false) {
            return res.redirect('/verify.html');
        }
        if (!user.platformAccess) {
            return res.redirect(user.nextPath || '/pricing.html');
        }
        if (!user.onboardingCompleted) {
            return res.redirect('/onboarding.html');
        }
    }
    if (isPageGet && AUTH_BILLING_PAGES.includes(page)) {
        const user = authService.getUserFromRequest(req);
        if (!user) {
            return res.redirect('/login.html');
        }
        if (user.emailVerified === false) {
            return res.redirect('/verify.html');
        }
    }
    if (isPageGet && PROTECTED_PAGES.concat(AUTH_BILLING_PAGES, ['/onboarding.html']).includes(page)) {
        res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
    }
    next();
});

function sendTrackingPixel(res) {
    res.set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        Expires: '0'
    });
    res.end(trackingService.PIXEL_GIF);
}

app.get('/m/:file', (req, res) => {
    require('./services/emailAssetService').servePublic(req, res);
});

app.get('/t/o/:id.gif', (req, res) => {
    trackingService.markOpened(req.params.id);
    sendTrackingPixel(res);
});

app.get('/t/o/:id', (req, res) => {
    trackingService.markOpened(req.params.id);
    sendTrackingPixel(res);
});

app.get('/t/c/:id/:clickId', (req, res) => {
    const url = trackingService.markClicked(req.params.id, req.params.clickId);
    if (!url) {
        return res.status(404).send('Not found');
    }
    res.redirect(302, url);
});

const SUPER_LOGIN = '/super/admin/platform/login';
const SUPER_HOME = '/super/admin/platform';
const SUPER_LOGIN_FILE = path.join(__dirname, 'admin-pages', 'login.html');
const SUPER_DASH_FILE = path.join(__dirname, 'admin-pages', 'dashboard.html');

function sendSuperPage(res, file) {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.sendFile(file);
}

app.get([SUPER_LOGIN, SUPER_LOGIN + '/'], (req, res) => {
    if (superAdminService.getAdminFromRequest(req)) {
        return res.redirect(SUPER_HOME);
    }
    sendSuperPage(res, SUPER_LOGIN_FILE);
});

app.get([SUPER_HOME, SUPER_HOME + '/'], (req, res) => {
    if (!superAdminService.getAdminFromRequest(req)) {
        return res.redirect(SUPER_LOGIN);
    }
    sendSuperPage(res, SUPER_DASH_FILE);
});

app.post('/api/visit', (req, res) => {
    try {
        const visitService = require('./services/visitService');
        visitService.record(req, req.body || {});
        res.json({ success: true });
    } catch (_) {
        res.json({ success: true });
    }
});

app.get('/api/cms', (req, res) => {
    try {
        const cmsService = require('./services/cmsService');
        res.json({ success: true, data: cmsService.getPublic() });
    } catch (err) {
        res.json({ success: true, data: { brand: { productName: 'Rabط', tagline: 'One platform' }, pages: {}, strings: {} } });
    }
});

app.use('/api/super-admin', superAdminRoutes);

app.use(express.static('public'));

app.use('/api/auth', authRoutes);
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/onboarding', require('./routes/onboardingRoutes'));

app.get('/api/android-app/download', requirePaid, (req, res) => {
    const info = superAdminService.androidAppPublic();
    if (!info.enabled || !info.available) {
        return res.status(404).json({
            success: false,
            message: 'The Android app is not available for download.'
        });
    }
    try { superAdminService.recordAndroidDownload(); } catch (_) {}
    return sendPrivateFile(res, superAdminService.androidAppPath(), path.join(__dirname, 'storage', 'android'), {
        contentType: 'application/vnd.android.package-archive',
        filename: String(info.originalName || 'Rabt.apk'),
        notFound: 'The Android app is not available for download.'
    });
});

app.get('/api/home-video', (req, res) => {
    const items = superAdminService.listHomeVideos({ publicOnly: true });
    const first = items[0] || null;
    res.json({
        success: true,
        data: {
            enabled: items.length > 0,
            available: items.length > 0,
            originalName: first ? first.originalName : '',
            mime: first ? first.mime : 'video/mp4',
            size: first ? first.size : 0,
            uploadedAt: first ? first.uploadedAt : null,
            url: first ? first.url : '',
            items
        }
    });
});

app.get('/api/home-video/file/:id', (req, res) => {
    const item = superAdminService.getHomeVideoById(req.params.id);
    if (!item || !item.active || !item.available) {
        return res.status(404).json({
            success: false,
            message: 'Home page video is not available.'
        });
    }
    const filePath = superAdminService.homeVideoPathById(item.id);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendPrivateFile(res, filePath, path.join(__dirname, 'storage', 'home'), {
        contentType: item.mime || 'video/mp4',
        filename: String(item.originalName || 'intro.mp4'),
        inline: true,
        notFound: 'Home page video is not available.'
    });
});

app.get('/api/home-video/file', (req, res) => {
    const items = superAdminService.listHomeVideos({ publicOnly: true });
    const first = items[0];
    if (!first) {
        return res.status(404).json({
            success: false,
            message: 'Home page video is not available.'
        });
    }
    return res.redirect(302, first.url);
});

app.get('/api/trusted-by', (req, res) => {
    res.json({ success: true, data: superAdminService.listTrustedBy({ publicOnly: true }) });
});

app.get('/api/trusted-by/file/:id', (req, res) => {
    const item = superAdminService.getTrustedByById(req.params.id);
    if (!item || !item.active || !item.available) {
        return res.status(404).json({
            success: false,
            message: 'Logo is not available.'
        });
    }
    const filePath = superAdminService.trustedByPathById(item.id);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return sendPrivateFile(res, filePath, path.join(__dirname, 'storage', 'trusted-by'), {
        contentType: item.mime || 'image/png',
        filename: String(item.originalName || 'logo.png'),
        inline: true,
        notFound: 'Logo is not available.'
    });
});

// Routes
app.use('/api/email', requirePaid, ensureTenant, emailRoutes);
app.use('/api/settings', requirePaid, ensureTenant, settingsRoutes);
app.use('/api/whatsapp', requirePaid, ensureTenant, whatsappRoutes);
app.use('/api/telegram', requirePaid, ensureTenant, telegramRoutes);
app.use('/api/schedule', requirePaid, ensureTenant, scheduleRoutes);
app.use('/api/lists', requirePaid, ensureTenant, listRoutes);
app.use('/api/marketing-database', requirePaid, ensureTenant, marketingDatabaseRoutes);
app.use('/api/templates', requirePaid, ensureTenant, require('./routes/templateRoutes'));
app.use('/api/files', requirePaid, ensureTenant, require('./routes/fileRoutes'));
app.use('/api/support', requirePaid, ensureTenant, supportRoutes);

// Telegram API credentials (api_id / api_hash) — not the data-controller contact API
app.get('/api/external-api/config', requirePaid, (req, res) => {
    const cfg = loadApiConfigFromFile(req.user.id);
    res.json({
        success: true,
        configured: isTelegramApiConfigured(cfg),
        config: {
            telegramApiId: cfg.telegramApiId || 0,
            telegramApiHash: maskKey(cfg.telegramApiHash)
        }
    });
});

app.post('/api/external-api/config', requirePaid, (req, res) => {
    try {
        const body = req.body || {};
        const existing = loadApiConfigFromFile(req.user.id);
        const next = normalizeApiConfig({
            ...existing,
            telegramApiId:
                body.telegramApiId !== undefined ? body.telegramApiId : existing.telegramApiId,
            telegramApiHash:
                body.telegramApiHash !== undefined ? body.telegramApiHash : existing.telegramApiHash
        });
        saveApiConfigToFile(next, req.user.id);
        res.json({
            success: true,
            message: 'Telegram API config saved'
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: err.message || 'Failed to save Telegram API config'
        });
    }
});

app.get('/api/external-api/config/status', requirePaid, (req, res) => {
    const cfg = loadApiConfigFromFile(req.user.id);
    const configured = isTelegramApiConfigured(cfg);
    res.json({
        success: true,
        configured,
        message: configured
            ? 'Telegram API credentials are set'
            : 'Telegram API credentials are not set'
    });
});

app.get('/api/kpi/overview', requirePaid, (req, res) => {
    try {
        const userId = req.user.id;
        const emailCfg = getEmailConfig(userId);
        const wa = whatsappService.forUser(userId).getStatus();
        const tg = telegramService.forUser(userId).getStatus();
        const api = loadApiConfigFromFile(userId);
        const overview = activityService.getOverview({
            email: {
                configured: isConfigured(userId),
                host: emailCfg.host || '',
                user: emailCfg.auth && emailCfg.auth.user ? emailCfg.auth.user : '',
                fromName: emailCfg.fromName || ''
            },
            whatsapp: {
                connected: !!wa.connected,
                ready: !!wa.ready,
                status: wa.status,
                phone: wa.phone || null,
                lastError: wa.lastError || null
            },
            telegram: {
                connected: !!tg.connected,
                ready: !!tg.ready,
                status: tg.status,
                phone: tg.phone || null,
                username: tg.username || null,
                apiConfigured: isTelegramApiConfigured(api, userId),
                lastError: tg.lastError || null
            },
            schedules: scheduleService.getSchedules(userId),
            engagement: trackingService.getEngagement(userId)
        }, {
            range: req.query.range,
            from: req.query.from,
            to: req.query.to,
            userId
        });
        trackingService.rememberPublicBaseFromRequest(req);
        res.json({ success: true, ...overview });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message || 'Failed to load KPI overview'
        });
    }
});

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Rabط',
        provider: 'Namecheap Private Email'
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('[Server]', err && err.message ? err.message : err);
    const status = err && err.statusCode ? err.statusCode : 500;
    res.status(status).json({
        success: false,
        message: status === 500 ? 'Internal server error' : (err.message || 'Request failed')
    });
});

app.listen(PORT, listenHost(), () => {
    const host = listenHost();
    console.log(`✅ Rabط running on ${host}:${PORT}`);
    if (isProduction()) {
        console.log('🔒 Production bind is loopback only. Put Nginx TLS in front (see PRODUCTION-DEPLOYMENT.md).');
        return;
    }
    console.log(`💻 This PC:     http://localhost:${PORT}`);
    const lan = Object.values(os.networkInterfaces())
        .flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal)
        .map((n) => n.address);
    lan.forEach((ip) => {
        console.log(`📱 Phone / LAN: http://${ip}:${PORT}`);
    });
});
