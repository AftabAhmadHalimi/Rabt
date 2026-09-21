const fs = require('fs');
const path = require('path');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const QRCode = require('qrcode');
const {
    loadApiConfigFromFile,
    saveApiConfigToFile,
    normalizeApiConfig,
    isTelegramApiConfigured,
    resolveTelegramAppCredentials
} = require('../config/apiConfigStore');
const tenantStore = require('./tenantStore');
const { createUserScopedHub } = require('./tenantContext');
const { seal, open } = require('../utils/secretBox');
const activityService = require('./activityService');
const trackingService = require('./trackingService');
const bigInt = require('big-integer');
const { classifyPhones, normalizePhoneDigits, formatIntlPhone } = require('../utils/recipients');

function telegramPeerKey(peer) {
    if (!peer) return '';
    if (peer.userId != null) return 'u' + String(peer.userId);
    if (peer.channelId != null) return 'c' + String(peer.channelId);
    if (peer.chatId != null) return 'g' + String(peer.chatId);
    return String(peer);
}

function floodWaitMs(err) {
    if (!err) return 0;
    if (Number.isFinite(err.seconds)) return Math.max(0, Number(err.seconds) * 1000);
    const msg = String(err.errorMessage || err.message || '');
    const match = msg.match(/FLOOD_WAIT_?(\d+)/i) || msg.match(/wait of (\d+) seconds/i);
    return match && match[1] ? Number(match[1]) * 1000 : 0;
}

class TelegramUserService {
    constructor(userId) {
        this.userId = userId;
        this.client = null;
        this.status = 'disconnected'; // disconnected | scanning | waiting_code | need_password | connected
        this.qrCode = null;
        this.ready = false;
        this.lastError = null;
        this.initializing = false;
        this.authPromise = null;
        this.rateLimitDelay = 1200;
        this.currentUser = null;
        this.pendingPhone = null; // { phoneNumber, phoneCodeHash }
        this.passwordHint = null;
        this._passwordResolve = null;
        this._trackingBound = false;
        tenantStore.ensureTenant(userId, userId);
        this.config = this._loadConfig();
        this._migrateLegacyTelegramCredentialsToApiConfig();
    }

    /** Copy api_id/api_hash from a tenant's leftover telegramConfig into that tenant's apiConfig. */
    _migrateLegacyTelegramCredentialsToApiConfig() {
        try {
            if (isTelegramApiConfigured(null, this.userId)) return;
            const lid = this.config.legacyApiId;
            const lhash = this.config.legacyApiHash;
            if (!lid || !lhash || lhash.length < 16) return;
            const existing = loadApiConfigFromFile(this.userId);
            saveApiConfigToFile(
                normalizeApiConfig({
                    ...existing,
                    telegramApiId: lid,
                    telegramApiHash: lhash
                }),
                this.userId
            );
            this.config.legacyApiId = 0;
            this.config.legacyApiHash = '';
            this.persistConfig();
        } catch (e) {
            console.error('[Telegram] legacy API migration:', e.message);
        }
    }

    _loadConfig() {
        try {
            const parsed = tenantStore.readJson(this.userId, 'telegramConfig.json', { sessionString: '' }) || {};
            if (parsed.botToken && !parsed.apiId) {
                delete parsed.botToken;
            }
            return {
                sessionString: open(String(parsed.sessionString || '').trim()),
                legacyApiId: parseInt(parsed.apiId, 10) || 0,
                legacyApiHash: String(parsed.apiHash || '').trim()
            };
        } catch (e) {
            console.error('[Telegram] config load error:', e.message);
            return { sessionString: '', legacyApiId: 0, legacyApiHash: '' };
        }
    }

    persistConfig() {
        tenantStore.writeJson(this.userId, 'telegramConfig.json', {
            sessionString: this.config.sessionString ? seal(this.config.sessionString) : ''
        });
    }

    _resolveApiCredentials() {
        const resolved = resolveTelegramAppCredentials(this.userId);
        let apiId = resolved.telegramApiId || 0;
        let apiHash = resolved.telegramApiHash || '';
        if ((!apiId || !apiHash) && this.config.legacyApiId && this.config.legacyApiHash) {
            apiId = this.config.legacyApiId;
            apiHash = this.config.legacyApiHash;
        }
        return {
            apiId: parseInt(apiId, 10) || 0,
            apiHash: String(apiHash || '').trim()
        };
    }

    setApiCredentials(apiId, apiHash) {
        const id = parseInt(apiId, 10);
        const hash = String(apiHash || '').trim();
        if (!id || id <= 0) throw new Error('apiId must be a positive number from https://my.telegram.org');
        if (!hash || hash.length < 16) throw new Error('apiHash is invalid');
        const existing = loadApiConfigFromFile(this.userId);
        saveApiConfigToFile(normalizeApiConfig({ ...existing, telegramApiId: id, telegramApiHash: hash }), this.userId);
        this._resetClient();
        return { apiId: id, apiHashConfigured: true };
    }

    getApiStatus() {
        const { apiId, apiHash } = this._resolveApiCredentials();
        return {
            configured: !!(apiId && apiId > 0 && apiHash && apiHash.length >= 16),
            apiId: apiId || null
        };
    }

    _getApiCredentials() {
        const { apiId, apiHash } = this._resolveApiCredentials();
        if (!apiId || !apiHash) {
            throw new Error('Telegram login is not available right now.');
        }
        return { apiId, apiHash };
    }

    _resetClient() {
        this.client = null;
        this.ready = false;
        this.qrCode = null;
        this.status = 'disconnected';
        this.pendingPhone = null;
        this.passwordHint = null;
        this._passwordResolve = null;
        this._trackingBound = false;
    }

    async _ensureClient() {
        const { apiId, apiHash } = this._getApiCredentials();
        if (!this.client) {
            const session = new StringSession(this.config.sessionString || '');
            this.client = new TelegramClient(session, apiId, apiHash, {
                connectionRetries: 5,
                deviceModel: 'Rabط',
                appVersion: '1.0',
                langCode: 'en',
                systemLangCode: 'en'
            });
            this._bindDeliveryTracking();
        }
        if (!this.client.connected) {
            await this.client.connect();
        }
    }

    _bindDeliveryTracking() {
        if (!this.client || this._trackingBound) return;
        this._trackingBound = true;
        this.client.addEventHandler((update) => {
            try {
                if (update instanceof Api.UpdateReadHistoryOutbox && update.peer && update.maxId != null) {
                    trackingService.markTelegramRead(telegramPeerKey(update.peer), update.maxId, this.userId);
                } else if (update instanceof Api.UpdateReadChannelOutbox && update.maxId != null) {
                    trackingService.markTelegramRead('c' + String(update.channelId), update.maxId, this.userId);
                }
            } catch (_) {}
        });
    }

    async _refreshSelf() {
        try {
            if (!this.client) return null;
            if (!(await this.client.checkAuthorization())) {
                this.currentUser = null;
                return null;
            }
            const me = await this.client.getMe();
            this.currentUser = me;
            return me;
        } catch (e) {
            this.currentUser = null;
            return null;
        }
    }

    _saveSessionFromClient() {
        if (!this.client || !this.client.session) return;
        const saved = this.client.session.save();
        if (typeof saved === 'string') {
            this.config.sessionString = saved;
            this.persistConfig();
        }
    }

    formatIntlPhone(phoneNumber) {
        if (!phoneNumber && phoneNumber !== 0) return '';
        let s = String(phoneNumber).trim().replace(/[^\d+]/g, '');
        if (!s) return '';
        s = s.replace(/^\+/, '');
        if (s.startsWith('0')) s = s.substring(1);
        if (!s) return '';
        return `+${s}`;
    }

    getQRCode() {
        return {
            qrCode: this.qrCode,
            status: this.status,
            hasQR: !!this.qrCode
        };
    }

    getStatus() {
        const api = this.getApiStatus();
        return {
            status: this.status,
            ready: this.ready,
            connected: this.status === 'connected' && this.ready,
            phone: this.currentUser && this.currentUser.phone ? `+${this.currentUser.phone}` : null,
            username: this.currentUser && this.currentUser.username ? `@${this.currentUser.username}` : null,
            userId: this.currentUser ? String(this.currentUser.id) : null,
            qrCode: this.qrCode,
            initializing: this.initializing,
            lastError: this.lastError,
            waitingCode: this.status === 'waiting_code',
            needPassword: this.status === 'need_password',
            passwordHint: this.passwordHint,
            ...api
        };
    }

    async syncFromSavedSession() {
        try {
            if (!this.config.sessionString) {
                if (this.status === 'connected' && !this.ready) {
                    this.status = 'disconnected';
                    this.ready = false;
                }
                return this.getStatus();
            }
            await this._ensureClient();
            if (await this.client.checkAuthorization()) {
                await this._afterAuthorized();
            } else if (this.status === 'connected') {
                this.ready = false;
                this.status = 'disconnected';
            }
        } catch (e) {
            this.lastError = e.message;
        }
        return this.getStatus();
    }

    isReady() {
        return !!(this.client && this.ready && this.status === 'connected');
    }

    async _afterAuthorized() {
        this.status = 'connected';
        this.ready = true;
        this.qrCode = null;
        this.pendingPhone = null;
        this.passwordHint = null;
        this.lastError = null;
        await this._refreshSelf();
        this._saveSessionFromClient();
    }

    /**
     * Start QR login (scan with Telegram app → Settings → Devices).
     */
    async startQrLogin() {
        if (this.initializing) return { status: this.status, message: 'Already initializing' };
        this.initializing = true;
        this.lastError = null;
        try {
            await this._ensureClient();
            if (await this.client.checkAuthorization()) {
                await this._afterAuthorized();
                this.initializing = false;
                return { status: this.status, message: 'Already logged in' };
            }

            if (this.authPromise) {
                this.initializing = false;
                return { status: this.status, message: 'Auth in progress' };
            }

            this.status = 'scanning';
            this.qrCode = null;
            const creds = this._getApiCredentials();

            this.authPromise = this.client
                .signInUserWithQrCode(creds, {
                    qrCode: async ({ token }) => {
                        const url = `tg://login?token=${token.toString('base64url')}`;
                        this.qrCode = await QRCode.toDataURL(url, { width: 300, margin: 2 });
                    },
                    password: async (hint) => {
                        this.passwordHint = hint || '';
                        this.status = 'need_password';
                        return await new Promise((resolve, reject) => {
                            this._passwordResolve = resolve;
                            this._passwordReject = reject;
                        });
                    },
                    onError: async (err) => {
                        this.lastError = err && err.message ? err.message : String(err);
                        return false;
                    }
                })
                .then(async () => {
                    await this._afterAuthorized();
                })
                .catch((err) => {
                    this.status = 'disconnected';
                    this.ready = false;
                    this.lastError = err && err.message ? err.message : String(err);
                })
                .finally(() => {
                    this.authPromise = null;
                    this.initializing = false;
                });

            return { status: this.status, message: 'QR login started' };
        } catch (error) {
            this.initializing = false;
            this.status = 'disconnected';
            this.lastError = error.message;
            throw error;
        }
    }

    /**
     * Used when QR flow asks for 2FA password.
     */
    submitPassword(password) {
        if (!this._passwordResolve) {
            throw new Error('No password prompt is active');
        }
        const p = String(password || '').trim();
        if (!p) throw new Error('password is required');
        const fn = this._passwordResolve;
        this._passwordResolve = null;
        this.status = 'scanning';
        fn(p);
        return { ok: true };
    }

    async sendPhoneCode(phoneNumberRaw) {
        await this._ensureClient();
        if (await this.client.checkAuthorization()) {
            await this._afterAuthorized();
            return { alreadyLoggedIn: true };
        }
        const phone = this.formatIntlPhone(phoneNumberRaw);
        if (!phone || phone.length < 8) throw new Error('Invalid phone number (use international format, e.g. +98912...)');

        const creds = this._getApiCredentials();
        const { phoneCodeHash, isCodeViaApp } = await this.client.sendCode(creds, phone, false);
        this.pendingPhone = { phoneNumber: phone, phoneCodeHash };
        this.status = 'waiting_code';
        this.lastError = null;
        return { sent: true, viaApp: !!isCodeViaApp, phoneNumber: phone };
    }

    async verifyPhoneCode(phoneCode, passwordOpt) {
        if (!this.client) throw new Error('Client not ready');
        if (!this.pendingPhone) throw new Error('No pending phone login — request code first');

        const { phoneNumber, phoneCodeHash } = this.pendingPhone;
        const code = String(phoneCode || '').trim();
        if (!code) throw new Error('phoneCode is required');

        const creds = this._getApiCredentials();

        try {
            const result = await this.client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash,
                    phoneCode: code
                })
            );
            if (result instanceof Api.auth.AuthorizationSignUpRequired) {
                throw new Error('This phone needs signup — complete registration in the official Telegram app first');
            }
        } catch (err) {
            const needPwd =
                (err && err.errorMessage === 'SESSION_PASSWORD_NEEDED') ||
                (err && String(err.message || '').includes('PASSWORD'));
            if (needPwd) {
                const pwd = String(passwordOpt || '').trim();
                if (!pwd) {
                    this.status = 'need_password';
                    this.passwordHint = '(2FA enabled)';
                    throw new Error('Two-factor password required');
                }
                await this.client.signInWithPassword(creds, {
                    password: async () => pwd,
                    onError: async () => true
                });
            } else {
                throw err;
            }
        }

        await this._afterAuthorized();
        return { ok: true };
    }

    async destroySession() {
        if (this.client) {
            try {
                await this.client.disconnect();
            } catch (e) {
                console.error('[Telegram] disconnect error:', e.message);
            }
            try {
                await this.client.destroy();
            } catch (e) {
                console.error('[Telegram] destroy error:', e.message);
            }
        }
        this.client = null;
        this.config.sessionString = '';
        this.persistConfig();
        this._resetClient();
        this.currentUser = null;
        return { status: 'disconnected', message: 'Session cleared' };
    }

    async rescan() {
        await this.destroySession();
        return this.startQrLogin();
    }

    setRateLimitDelay(delayMs) {
        const n = parseInt(delayMs, 10);
        if (n >= 500) {
            this.rateLimitDelay = n;
            return { success: true, delay: this.rateLimitDelay };
        }
        return { success: false, error: 'Delay must be at least 500ms' };
    }

    async invokeWithFloodWait(request) {
        try {
            return await this.client.invoke(request);
        } catch (err) {
            const waitMs = Math.min(floodWaitMs(err), 60000);
            if (!waitMs) throw err;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            return this.client.invoke(request);
        }
    }

    entityUserId(entity) {
        if (!entity) return '';
        if (entity.id != null) return String(entity.id);
        if (entity.userId != null) return String(entity.userId);
        return '';
    }

    async resolveTelegramUsers(digitList) {
        const resolved = new Map();
        const unique = [];
        const seen = new Set();
        (digitList || []).forEach((digits) => {
            if (!digits || seen.has(digits)) return;
            seen.add(digits);
            unique.push(digits);
        });

        const BATCH = 40;
        for (let offset = 0; offset < unique.length; offset += BATCH) {
            const batch = unique.slice(offset, offset + BATCH);
            const contacts = batch.map((digits, idx) => new Api.InputPhoneContact({
                clientId: bigInt(idx + 1),
                phone: '+' + digits,
                firstName: '+' + digits,
                lastName: ''
            }));
            const result = await this.invokeWithFloodWait(new Api.contacts.ImportContacts({ contacts }));
            const users = Array.isArray(result && result.users) ? result.users : [];
            const imported = Array.isArray(result && result.imported) ? result.imported : [];
            const usersById = new Map();
            users.forEach((user) => {
                const id = this.entityUserId(user);
                if (id) usersById.set(id, user);
                const userDigits = normalizePhoneDigits(user.phone);
                if (userDigits && batch.includes(userDigits)) {
                    resolved.set(userDigits, user);
                }
            });
            imported.forEach((item) => {
                const clientId = parseInt(String(item.clientId), 10);
                const phone = batch[clientId - 1];
                const user = usersById.get(String(item.userId));
                if (phone && user) resolved.set(phone, user);
            });
            if (offset + BATCH < unique.length) {
                await new Promise((resolve) => setTimeout(resolve, Math.max(500, Math.min(this.rateLimitDelay || 1200, 2000))));
            }
        }

        return resolved;
    }

    async sendMessage(phoneNumber, message) {
        if (!this.isReady()) throw new Error('Telegram client is not ready');
        const digits = normalizePhoneDigits(phoneNumber);
        const text = String(message || '').trim();
        if (!digits) throw new Error('Invalid phone number');
        if (!text) throw new Error('Message is required');

        const resolved = await this.resolveTelegramUsers([digits]);
        const entity = resolved.get(digits);
        if (!entity) throw new Error('Number is not on Telegram');

        await this.client.sendMessage(entity, { message: text });
        return {
            success: true,
            to: formatIntlPhone(digits),
            userId: this.entityUserId(entity)
        };
    }

    async sendBulkMessages(phoneNumbers, message, delayMs = 2000, mediaPath = null, personalizeCallback = null, onStatus = null) {
        if (!this.isReady()) throw new Error('Telegram client is not ready');
        if (!phoneNumbers || !Array.isArray(phoneNumbers) || !phoneNumbers.length) {
            throw new Error('Phone numbers array is required');
        }
        const useMediaPath = mediaPath && fs.existsSync(mediaPath) ? mediaPath : null;

        const classified = classifyPhones(phoneNumbers);
        const sendList = classified.valid;
        const results = {
            total: classified.valid.length + classified.invalid.length + classified.duplicates.length,
            sent: 0,
            failed: 0,
            details: []
        };
        const effectiveDelay = Math.max(delayMs, this.rateLimitDelay);

        const markFailed = (phone, error, index) => {
            results.failed++;
            results.details.push({
                phone,
                status: 'failed',
                error,
                index
            });
            if (onStatus) {
                onStatus({
                    type: 'failed',
                    recipient: phone,
                    error,
                    progress: results.sent + results.failed,
                    total: results.total,
                    sentCount: results.sent,
                    failedCount: results.failed
                });
            }
        };

        if (onStatus) {
            onStatus({
                type: 'start',
                total: results.total,
                message: `Starting to send ${results.total} Telegram messages…`
            });
        }

        classified.invalid.forEach((phone, idx) => {
            markFailed(String(phone), 'Invalid phone number', idx);
        });
        classified.duplicates.forEach((digits, idx) => {
            markFailed(formatIntlPhone(digits), 'Duplicate number', classified.invalid.length + idx);
        });

        const resolvedUsers = sendList.length ? await this.resolveTelegramUsers(sendList) : new Map();

        for (let i = 0; i < sendList.length; i++) {
            const digits = sendList[i];
            const formatted = formatIntlPhone(digits);
            const entity = resolvedUsers.get(digits);
            if (!entity) {
                markFailed(formatted, 'Not on Telegram', i);
            } else {
            try {
                let personalizedMessage = message;
                if (personalizeCallback && typeof personalizeCallback === 'function') {
                        personalizedMessage = personalizeCallback(message, digits, i);
                }
                    let sentMsg = null;
                if (useMediaPath) {
                        sentMsg = await this.client.sendMessage(entity, {
                        message: personalizedMessage || ' ',
                        file: useMediaPath
                    });
                } else {
                        sentMsg = await this.client.sendMessage(entity, { message: personalizedMessage });
                    }
                    trackingService.recordOutbound({
                        channel: 'telegram',
                        to: this.entityUserId(entity) || formatted,
                        peerId: sentMsg && sentMsg.peerId ? telegramPeerKey(sentMsg.peerId) : ('u' + this.entityUserId(entity)),
                        msgId: sentMsg && sentMsg.id != null ? sentMsg.id : null,
                        delivered: true,
                        userId: this.userId,
                        businessId: this.userId
                    });
                results.sent++;
                    results.details.push({
                        phone: formatted,
                        status: 'sent',
                        userId: this.entityUserId(entity),
                        index: i
                    });
                if (onStatus) {
                    onStatus({
                        type: 'sent',
                        recipient: formatted,
                            progress: results.sent + results.failed,
                            total: results.total,
                        sentCount: results.sent,
                        failedCount: results.failed
                    });
                }
            } catch (error) {
                    markFailed(formatted, error.message || String(error), i);
                }
            }
            if (i < sendList.length - 1) {
                if (onStatus) {
                    onStatus({
                        type: 'delay',
                        delay: effectiveDelay,
                        nextRecipient: formatIntlPhone(sendList[i + 1])
                    });
                }
                await new Promise(r => setTimeout(r, effectiveDelay));
            }
        }

        if (onStatus) {
            onStatus({
                type: 'complete',
                total: results.total,
                sentCount: results.sent,
                failedCount: results.failed,
                message: `Completed! ${results.sent} sent, ${results.failed} failed.`
            });
        }

        activityService.recordSend('telegram', results, { userId: this.userId });

        return results;
    }
}

module.exports = createUserScopedHub(TelegramUserService);
