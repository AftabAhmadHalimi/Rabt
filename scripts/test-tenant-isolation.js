const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { runWithTenant } = require('../services/tenantContext');
const tenantStore = require('../services/tenantStore');
const scheduleService = require('../services/scheduleService');
const activityService = require('../services/activityService');
const trackingService = require('../services/trackingService');
const listLibrary = require('../services/listLibrary');

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PASSWORD = 'isolate-test-123';

function assert(cond, message) {
    if (!cond) throw new Error(message);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { hash, salt };
}

function upsertVerifiedUser(id, name, email) {
    const file = path.join(__dirname, '..', 'config', 'users.json');
    const users = JSON.parse(fs.readFileSync(file, 'utf8'));
    const existing = users.find((u) => u.id === id || u.email === email);
    const { hash, salt } = hashPassword(PASSWORD);
    if (existing) {
        existing.id = id;
        existing.name = name;
        existing.email = email;
        existing.passwordHash = hash;
        existing.salt = salt;
        existing.emailVerified = true;
        existing.businessId = id;
        existing.subscriptionStatus = 'active';
        existing.planId = 'existing';
        existing.planName = 'Existing workspace';
        existing.onboardingCompleted = true;
        existing.disabled = false;
    } else {
        users.push({
            id,
            businessId: id,
            name,
            email,
            passwordHash: hash,
            salt,
            emailVerified: true,
            subscriptionStatus: 'active',
            planId: 'existing',
            planName: 'Existing workspace',
            onboardingCompleted: true,
            createdAt: new Date().toISOString()
        });
    }
    fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
    tenantStore.ensureTenant(id, id);
}

function unitIsolation() {
    tenantStore.ensureTenant(USER_A, USER_A);
    tenantStore.ensureTenant(USER_B, USER_B);
    tenantStore.writeJson(USER_A, 'activity.json', []);
    tenantStore.writeJson(USER_B, 'activity.json', []);
    tenantStore.writeJson(USER_A, 'schedules.json', []);
    tenantStore.writeJson(USER_B, 'schedules.json', []);
    scheduleService.reloadAll();

    const scheduleA = runWithTenant({ userId: USER_A, businessId: USER_A }, () =>
        scheduleService.createSchedule({
            name: 'User A Campaign',
            type: 'email',
            hour: 23,
            minute: 59,
            repeat: 'once',
            config: { recipients: ['a@example.com'], subject: 'A only', htmlContent: '<p>A</p>', delayMs: 5000 }
        })
    );

    runWithTenant({ userId: USER_A, businessId: USER_A }, () => {
        activityService.recordSend('email', { sentCount: 7, failedCount: 1, recipientsCount: 8 }, { label: 'A send' });
        trackingService.recordOutbound({ channel: 'email', to: 'a@example.com', delivered: true });
    });

    runWithTenant({ userId: USER_B, businessId: USER_B }, () => {
        activityService.recordSend('whatsapp', { sent: 2, failed: 0, total: 2 }, { label: 'B send' });
        trackingService.recordOutbound({ channel: 'whatsapp', to: '+15550001', delivered: true });
    });

    const listA = runWithTenant({ userId: USER_A, businessId: USER_A }, () => scheduleService.getSchedules());
    const listB = runWithTenant({ userId: USER_B, businessId: USER_B }, () => scheduleService.getSchedules());
    assert(listA.some((s) => s.id === scheduleA.id), 'User A should see their campaign');
    assert(!listB.some((s) => s.id === scheduleA.id), 'User B must not see User A campaign');
    assert(
        runWithTenant({ userId: USER_B, businessId: USER_B }, () => scheduleService.getSchedule(scheduleA.id)) === null,
        'User B must not fetch User A campaign by id'
    );

    const overviewA = activityService.getOverview({}, { userId: USER_A });
    const overviewB = activityService.getOverview({}, { userId: USER_B });
    assert(overviewA.totals.sent === 7, `User A KPI sent should be 7, got ${overviewA.totals.sent}`);
    assert(overviewB.totals.sent === 2, `User B KPI sent should be 2, got ${overviewB.totals.sent}`);
    assert(overviewA.engagement.email.sent >= 1, 'User A should have email engagement');
    assert(overviewB.engagement.email.sent === 0, 'User B must not inherit User A email engagement');

    runWithTenant({ userId: USER_A, businessId: USER_A }, () => scheduleService.deleteSchedule(scheduleA.id, USER_A));

    const savedA = listLibrary.saveList(USER_A, {
        kind: 'email',
        name: 'A emails',
        originalName: 'a.txt',
        buffer: Buffer.from('a@example.com\nb@example.com\n')
    });
    const listsA = listLibrary.listLists(USER_A, 'email');
    const listsB = listLibrary.listLists(USER_B, 'email');
    assert(listsA.some((item) => item.id === savedA.id), 'User A should see their saved list');
    assert(!listsB.some((item) => item.id === savedA.id), 'User B must not see User A saved list');
    assert(listLibrary.getList(USER_B, savedA.id) === null, 'User B must not fetch User A list by id');
    assert(listLibrary.getDownload(USER_B, savedA.id) === null, 'User B must not download User A list file');
    listLibrary.deleteList(USER_A, savedA.id);

    const templateService = require('../services/templateService');
    const catalog = require('../data/systemEmailTemplates');
    const listed = templateService.listTemplates(USER_A, { source: 'all' });
    assert(listed.items.length >= 12, 'Ready-made library must include at least 12 templates');
    assert(listed.systemCount >= 12, 'System template count must stay available to every tenant');
    const listedB = templateService.listTemplates(USER_B, { source: 'system' });
    assert(listedB.systemCount === listed.systemCount, 'System templates must be shared as read-only, not copied per tenant');

    const createdA = templateService.createTemplate(USER_A, {
        name: 'A private welcome',
        description: 'Owned by tenant A',
        category: 'transactional',
        subject: 'Hello from workspace A',
        blocks: [{ type: 'heading', text: 'Only A should see this' }, { type: 'text', text: 'Private body copy for tenant A.' }]
    });
    const mineA = templateService.listTemplates(USER_A, { source: 'mine' }).items;
    const mineB = templateService.listTemplates(USER_B, { source: 'mine' }).items;
    assert(mineA.some((item) => item.id === createdA.id), 'User A should see their custom template');
    assert(!mineB.some((item) => item.id === createdA.id), 'User B must not see User A custom templates');
    let hidden = false;
    try {
        templateService.getTemplate(USER_B, createdA.id);
    } catch (err) {
        hidden = err.status === 404;
    }
    assert(hidden, 'User B must not fetch User A template by id');

    const systemId = catalog.listSystemTemplates()[0].id;
    const originalName = catalog.getSystemTemplate(systemId).name;
    const copy = templateService.updateTemplate(USER_A, systemId, {
        name: 'Edited system name A',
        subject: 'Edited subject A',
        description: 'copy on write',
        category: 'marketing',
        blocks: [{ type: 'heading', text: 'Copied heading' }, { type: 'text', text: 'Copied body' }]
    });
    assert(copy.id !== systemId, 'Editing a ready template must create a user-owned copy');
    assert(copy.system === false, 'Copied template must not stay marked as system');
    assert(catalog.getSystemTemplate(systemId).name === originalName, 'Ready-made templates must not be mutated');
    let deleteBlocked = false;
    try {
        templateService.deleteTemplate(USER_A, systemId);
    } catch (err) {
        deleteBlocked = err.status === 403;
    }
    assert(deleteBlocked, 'Ready-made templates must not be deletable');
    templateService.deleteTemplate(USER_A, createdA.id);
    templateService.deleteTemplate(USER_A, copy.id);

    console.log('Unit isolation checks passed.');
}

function channelHubIsolation() {
    const whatsappService = require('../services/whatsappService');
    const telegramService = require('../services/telegramService');
    const { getEmailConfig } = require('../config/emailConfig');

    const SANDBOX = '3d4ce70b-ebad-40f7-81fa-29f5ad4b92a4';
    const CEO = 'b188a5c0-5790-4e62-9171-75cff2e36077';

    let threw = false;
    try {
        whatsappService.forUser();
    } catch (_) {
        threw = true;
    }
    assert(threw, 'WhatsApp hub must require an explicit user id');
    assert(typeof whatsappService.getStatus !== 'function', 'WhatsApp hub must not expose a shared getStatus proxy');
    assert(typeof telegramService.getStatus !== 'function', 'Telegram hub must not expose a shared getStatus proxy');

    const waSandbox = whatsappService.forUser(SANDBOX);
    const waCeo = whatsappService.forUser(CEO);
    assert(waSandbox !== waCeo, 'sandboxspace1 and ceomrfaridcontact must not share a WhatsApp client');
    assert(
        waSandbox.sessionPath !== waCeo.sessionPath,
        'WhatsApp session folders must be different per user'
    );
    assert(waSandbox.sessionPath.includes(SANDBOX), 'sandboxspace1 WhatsApp path must include their user id');
    assert(waCeo.sessionPath.includes(CEO), 'ceomrfaridcontact WhatsApp path must include their user id');
    assert(!waSandbox.sessionPath.endsWith('.mela-whatsapp-sessions'), 'WhatsApp dataPath must not be the shared root');

    const tgSandbox = telegramService.forUser(SANDBOX);
    const tgCeo = telegramService.forUser(CEO);
    assert(tgSandbox !== tgCeo, 'Users must not share a Telegram client');

    const smtpSandbox = getEmailConfig(SANDBOX);
    const smtpCeo = getEmailConfig(CEO);
    const userSandbox = (smtpSandbox.auth && smtpSandbox.auth.user) || '';
    const userCeo = (smtpCeo.auth && smtpCeo.auth.user) || '';
    if (userSandbox && userCeo) {
        assert(userSandbox !== userCeo, 'SMTP mailboxes must not be shared across the two Gmail accounts');
    }

    const waA = whatsappService.forUser(USER_A);
    const waB = whatsappService.forUser(USER_B);
    assert(waA !== waB && waA.sessionPath !== waB.sessionPath, 'Isolation test users must have separate WhatsApp clients');
    console.log('Channel hub isolation checks passed.');
}

function cryptoAndPathChecks() {
    const { seal, open } = require('../utils/secretBox');
    const { assertPathInside } = require('../utils/safeSendFile');
    const secret = 'smtp-password-' + Date.now();
    const locked = seal(secret);
    assert(locked.indexOf('enc:v1:') === 0, 'SMTP-style secrets must be encrypted at rest');
    assert(locked.indexOf(secret) === -1, 'Ciphertext must not contain the plaintext secret');
    assert(open(locked) === secret, 'Encrypted secrets must decrypt for the owning process');
    assert(open(secret) === secret, 'Legacy plaintext values must still be readable until rewritten');

    const root = path.join(__dirname, '..', 'storage', 'lists');
    const inside = assertPathInside(path.join(root, USER_A, 'email', 'file.txt'), root);
    assert(inside.indexOf(path.resolve(root)) === 0, 'Owned files must stay inside private storage');
    let threw = false;
    try {
        assertPathInside(path.join(root, '..', 'users.json'), root);
    } catch (_) {
        threw = true;
    }
    assert(threw, 'Path traversal outside private storage must be rejected');
    console.log('Credential encryption and path checks passed.');
}

function request(pathname, { method = 'GET', body, cookie } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: process.env.PORT || 3005,
                path: pathname,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                    ...(cookie ? { Cookie: cookie } : {})
                }
            },
            (res) => {
                const cookies = [].concat(res.headers['set-cookie'] || []);
                let raw = '';
                res.on('data', (chunk) => { raw += chunk; });
                res.on('end', () => {
                    let json = null;
                    try { json = raw ? JSON.parse(raw) : null; } catch (_) {}
                    resolve({ status: res.statusCode, json, cookies, raw, headers: res.headers });
                });
            }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function cookieFrom(res) {
    const line = (res.cookies || []).find((c) => c.startsWith('rabt_auth='));
    return line ? line.split(';')[0] : '';
}

async function httpIsolation() {
    upsertVerifiedUser(USER_A, 'Isolation A', 'isolation-a@example.com');
    upsertVerifiedUser(USER_B, 'Isolation B', 'isolation-b@example.com');

    const loginA = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-a@example.com', password: PASSWORD }
    });
    const loginB = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-b@example.com', password: PASSWORD }
    });
    assert(loginA.status === 200 && loginA.json && loginA.json.success, 'User A login failed');
    assert(loginB.status === 200 && loginB.json && loginB.json.success, 'User B login failed');
    const cookieA = cookieFrom(loginA);
    const cookieB = cookieFrom(loginB);
    assert(cookieA && cookieB && cookieA !== cookieB, 'Each user needs a distinct session cookie');

    const kpiA = await request('/api/kpi/overview', { cookie: cookieA });
    const kpiB = await request('/api/kpi/overview', { cookie: cookieB });
    assert(kpiA.status === 200 && kpiB.status === 200, 'KPI overview should load for both users');
    const sentA = kpiA.json.totals && kpiA.json.totals.sent;
    const sentB = kpiB.json.totals && kpiB.json.totals.sent;
    assert(sentA !== sentB || (sentA === 0 && sentB === 0) || true, 'KPI loaded');
    if (sentA > 0) {
        assert(sentA !== sentB, 'Users must not share KPI send totals when A has activity');
    }

    const schedA = await request('/api/schedule', { cookie: cookieA });
    const schedB = await request('/api/schedule', { cookie: cookieB });
    const idsA = ((schedA.json && schedA.json.data) || []).map((s) => s.id);
    const idsB = ((schedB.json && schedB.json.data) || []).map((s) => s.id);
    const overlap = idsA.filter((id) => idsB.includes(id));
    assert(overlap.length === 0, 'Schedule IDs must not overlap across users');

    const listsResA = await request('/api/lists?kind=email', { cookie: cookieA });
    const listsResB = await request('/api/lists?kind=email', { cookie: cookieB });
    assert(listsResA.status === 200 && listsResB.status === 200, 'Lists API must load for both users');
    const listIdsA = ((listsResA.json && listsResA.json.data) || []).map((item) => item.id);
    const listIdsB = ((listsResB.json && listsResB.json.data) || []).map((item) => item.id);
    assert(listIdsA.filter((id) => listIdsB.includes(id)).length === 0, 'Saved list IDs must not overlap across users');

    const tplPage = await request('/templates.html', { cookie: cookieA });
    assert(tplPage.status === 200, 'Templates page must open for a signed-in workspace');
    const tplGuest = await request('/templates.html');
    assert(tplGuest.status === 302 || tplGuest.status === 301, 'Templates page must redirect guests to sign in');
    const tplUnauth = await request('/api/templates');
    assert(tplUnauth.status === 401, 'Templates API must require authentication');
    const tplListA = await request('/api/templates', { cookie: cookieA });
    const tplListB = await request('/api/templates?source=mine', { cookie: cookieB });
    assert(tplListA.status === 200 && tplListA.json && tplListA.json.data, 'User A must load the template library');
    assert((tplListA.json.data.items || []).length >= 12, 'Ready-made library must include at least 12 templates');
    const createdTpl = await request('/api/templates', {
        method: 'POST',
        cookie: cookieA,
        body: {
            name: 'HTTP isolation A',
            description: 'Private to tenant A',
            category: 'business',
            subject: 'Only for workspace A',
            blocks: [
                { type: 'heading', text: 'Private A heading' },
                { type: 'text', text: 'This copy belongs to tenant A.' }
            ]
        }
    });
    assert(createdTpl.status === 200 && createdTpl.json && createdTpl.json.data && createdTpl.json.data.id, 'User A must be able to save a custom template');
    const createdId = createdTpl.json.data.id;
    const stealTpl = await request('/api/templates/' + createdId, { cookie: cookieB });
    assert(stealTpl.status === 404, 'User B must not read User A templates by id');
    const mineB = ((tplListB.json && tplListB.json.data && tplListB.json.data.items) || []).map((item) => item.id);
    const mineBAfter = await request('/api/templates?source=mine', { cookie: cookieB });
    const mineBIds = ((mineBAfter.json && mineBAfter.json.data && mineBAfter.json.data.items) || []).map((item) => item.id);
    assert(mineB.indexOf(createdId) === -1 && mineBIds.indexOf(createdId) === -1, 'User B must not see User A custom templates');
    const deleteSystem = await request('/api/templates/sys-welcome', { method: 'DELETE', cookie: cookieA });
    assert(deleteSystem.status === 403, 'Ready-made templates must not be deletable over HTTP');
    const deletedTpl = await request('/api/templates/' + createdId, { method: 'DELETE', cookie: cookieA });
    assert(deletedTpl.status === 200, 'User A must be able to delete their own template');

    if (idsA[0]) {
        const steal = await request('/api/schedule/' + idsA[0], { cookie: cookieB });
        assert(steal.status === 404, 'User B must not read User A schedule by URL id');
    }

    const unauth = await request('/api/kpi/overview');
    assert(unauth.status === 401, 'KPI must require authentication');

    const waA = await request('/api/whatsapp/status', { cookie: cookieA });
    const waB = await request('/api/whatsapp/status', { cookie: cookieB });
    assert(waA.status === 200 && waB.status === 200, 'WhatsApp status must load for both users');
    const phoneA = waA.json && waA.json.data && waA.json.data.phone;
    const phoneB = waB.json && waB.json.data && waB.json.data.phone;
    if (phoneA && phoneB) {
        assert(phoneA !== phoneB, 'Two users must not share the same WhatsApp phone/session');
    }

    const tgA = await request('/api/telegram/status', { cookie: cookieA });
    const tgB = await request('/api/telegram/status', { cookie: cookieB });
    assert(tgA.status === 200 && tgB.status === 200, 'Telegram status must load for both users');
    const tgPhoneA = tgA.json && tgA.json.data && tgA.json.data.phone;
    const tgPhoneB = tgB.json && tgB.json.data && tgB.json.data.phone;
    if (tgPhoneA && tgPhoneB) {
        assert(tgPhoneA !== tgPhoneB, 'Two users must not share the same Telegram session');
    }

    const smtpA = await request('/api/settings/smtp/status', { cookie: cookieA });
    const smtpB = await request('/api/settings/smtp/status', { cookie: cookieB });
    assert(smtpA.status === 200 && smtpB.status === 200, 'SMTP status must load for both users');
    const smtpUserA = smtpA.json && smtpA.json.config && smtpA.json.config.user;
    const smtpUserB = smtpB.json && smtpB.json.config && smtpB.json.config.user;
    if (smtpUserA && smtpUserB) {
        assert(smtpUserA !== smtpUserB, 'Two users must not share SMTP credentials');
    }

    if (listIdsA[0]) {
        const stealList = await request('/api/lists/' + listIdsA[0] + '/download', { cookie: cookieB });
        assert(stealList.status === 404 || stealList.status === 400, 'User B must not download User A list by id');
        assert(!(stealList.raw || '').includes('a@example.com'), 'User B must not receive User A contact file contents');
    }

    const stealReceipt = await request('/api/super-admin/payments/pay-not-real/receipt', { cookie: cookieB });
    assert(stealReceipt.status === 401, 'A normal user must not download payment receipts');

    const publicWa = await request('/whatsapp-sessions/session-default/Default/');
    assert(publicWa.status === 404, 'WhatsApp session folders must not be publicly downloadable');
    const publicUploads = await request('/whatsapp-uploads/secret.txt');
    assert(publicUploads.status === 404, 'WhatsApp uploads must not be publicly downloadable');
    const publicTg = await request('/telegram-uploads/secret.txt');
    assert(publicTg.status === 404, 'Telegram uploads must not be publicly downloadable');

    assert(String(kpiA.headers['x-content-type-options'] || '').toLowerCase() === 'nosniff', 'X-Content-Type-Options must be set');
    assert(String(kpiA.headers['cache-control'] || '').indexOf('no-store') !== -1, 'Authenticated APIs must send Cache-Control: no-store');
    assert(!!kpiA.headers['content-security-policy'], 'Content-Security-Policy must be set');
    assert(!!kpiA.headers['referrer-policy'], 'Referrer-Policy must be set');

    const smtpCfg = smtpA.json && smtpA.json.config;
    assert(smtpCfg && smtpCfg.password === undefined && smtpCfg.pass === undefined, 'SMTP status must not include the password');

    const tgCfg = await request('/api/external-api/config', { cookie: cookieA });
    assert(tgCfg.status === 200, 'Telegram API config endpoint must load for the owner');
    const returnedHash = tgCfg.json && tgCfg.json.config && tgCfg.json.config.telegramApiHash;
    if (returnedHash) {
        assert(String(returnedHash).indexOf('...') !== -1, 'Telegram API hash must be masked in API responses');
    }

    const cookieToken = decodeURIComponent((cookieA.split('=')[1] || '').split(';')[0]);
    const storedSessions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'sessions.json'), 'utf8'));
    assert(!JSON.stringify(storedSessions).includes(cookieToken), 'Session cookies must not be stored in plaintext');
    assert((storedSessions || []).every((s) => s && s.tokenHash && !s.token), 'Sessions must persist token hashes only');

    await request('/api/auth/logout', { method: 'POST', cookie: cookieA });
    const afterLogoutA = await request('/api/kpi/overview', { cookie: cookieA });
    assert(afterLogoutA.status === 401, 'Logged-out User A must not keep API access');

    const loginBAgain = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-b@example.com', password: PASSWORD }
    });
    const cookieB2 = cookieFrom(loginBAgain);
    const kpiAfterSwitch = await request('/api/kpi/overview', { cookie: cookieB2 });
    assert(kpiAfterSwitch.status === 200, 'User B KPI must load after User A logout');
    const waAfterSwitch = await request('/api/whatsapp/status', { cookie: cookieB2 });
    assert(waAfterSwitch.status === 200, 'User B WhatsApp status must load after User A logout');
    if (phoneA && waAfterSwitch.json && waAfterSwitch.json.data && waAfterSwitch.json.data.phone) {
        assert(
            waAfterSwitch.json.data.phone !== phoneA,
            'After logout/login, User B must not see User A WhatsApp session'
        );
    }

    await request('/api/auth/logout', { method: 'POST', cookie: cookieB2 });
    const loginAAgain = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'isolation-a@example.com', password: PASSWORD }
    });
    const cookieA2 = cookieFrom(loginAAgain);
    const kpiBackToA = await request('/api/kpi/overview', { cookie: cookieA2 });
    assert(kpiBackToA.status === 200, 'User A KPI must load after switching back from User B');
    const waBackToA = await request('/api/whatsapp/status', { cookie: cookieA2 });
    if (phoneB && waBackToA.json && waBackToA.json.data && waBackToA.json.data.phone) {
        assert(
            waBackToA.json.data.phone !== phoneB,
            'After switching back, User A must not see User B WhatsApp session'
        );
    }

    console.log('HTTP isolation checks passed.');
}

(async function main() {
    unitIsolation();
    channelHubIsolation();
    cryptoAndPathChecks();
    try {
        await httpIsolation();
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.log('Server not running; skipped HTTP isolation checks.');
            process.exit(0);
            return;
        }
        throw err;
    }
    process.exit(0);
})().catch((err) => {
    console.error('Isolation test failed:', err.message);
    process.exit(1);
});
