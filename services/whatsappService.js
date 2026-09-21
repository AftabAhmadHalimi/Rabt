const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const activityService = require('./activityService');
const trackingService = require('./trackingService');
const { createUserScopedHub } = require('./tenantContext');
const tenantStore = require('./tenantStore');
const { classifyPhones, normalizePhoneDigits, formatIntlPhone } = require('../utils/recipients');

function resolveBrowserExecutable() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';

    const candidates = [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];

    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

class WhatsAppService {
    constructor(userId) {
        this.userId = String(userId);
        this.clientId = 'rabt';
        this.client = null;
        this.qrCode = null;
        this.status = 'disconnected';
        this.sessionRoot = path.join(os.homedir(), '.mela-whatsapp-sessions');
        this.sessionPath = path.join(this.sessionRoot, this.userId);
        this.ready = false;
        this.currentPhone = null;
        this.authFailure = false;
        this.lastError = null;
        this.initializing = false;
        this.rateLimitDelay = 2000;
        this._readyWatch = null;
        tenantStore.ensureTenant(userId, userId);
        this._migrateLegacySessionFolder();
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }
    }

    _migrateLegacySessionFolder() {
        const oldDir = path.join(this.sessionRoot, `session-${this.userId}`);
        const newDir = path.join(this.sessionPath, `session-${this.clientId}`);
        if (!fs.existsSync(oldDir) || fs.existsSync(newDir)) return;
        try {
            fs.mkdirSync(this.sessionPath, { recursive: true });
            fs.renameSync(oldDir, newDir);
            console.log(`[WhatsApp] Moved session for ${this.userId} into isolated folder`);
        } catch (err) {
            try {
                fs.cpSync(oldDir, newDir, { recursive: true });
                console.log(`[WhatsApp] Copied session for ${this.userId} into isolated folder`);
            } catch (copyErr) {
                console.warn('[WhatsApp] Could not migrate session folder:', copyErr.message);
            }
        }
    }

    async initializeClient() {
        const clientId = this.clientId;
        if (this.ready && this.client && this.status === 'connected') {
            return { status: this.status, message: 'Client already connected' };
        }
        if (this.initializing || this.status === 'scanning' || this.status === 'authenticated') {
            return { status: this.status, message: 'WhatsApp is still connecting. Wait until status says Connected.' };
        }
        this.initializing = true;

        if (this.client) {
            // Keep auth session intact on reconnect attempts (e.g. browser refresh).
            // We only tear down explicitly on disconnect/rescan actions.
            try {
                await this.client.destroy();
            } catch (error) {
                console.error('Error destroying stale client before reinitialize:', error.message);
            }
            this.client = null;
        }

        this.status = 'scanning';
        this.qrCode = null;
        this.ready = false;
        this.authFailure = false;
        this.lastError = null;
        this.currentPhone = null;

        const sessionDir = path.join(this.sessionPath, `session-${clientId}`);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        const executablePath = resolveBrowserExecutable();
        if (!executablePath) {
            this.status = 'disconnected';
            this.initializing = false;
            this.lastError = 'Chrome/Edge was not found. Install Google Chrome or set CHROME_PATH.';
            throw new Error(this.lastError);
        }

        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId,
                    dataPath: this.sessionPath
                }),
                authTimeoutMs: 120000,
                qrMaxRetries: 5,
                takeoverOnConflict: true,
                takeoverTimeoutMs: 10000,
                webVersionCache: { type: 'none' },
                userAgent: false,
                puppeteer: {
                    headless: true,
                    devtools: false,
                    executablePath,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions'
                    ]
                }
            });
            console.log('[WhatsApp] Using browser:', executablePath);
        } catch (error) {
            console.error('[WhatsApp] Error creating client (browser launch failed):', error.message);
            this.status = 'disconnected';
            this.lastError = error.message;
            this.initializing = false;
            throw new Error(`Failed to create WhatsApp client: ${error.message}`);
        }

        this.client.on('qr', async (qr) => {
            this.status = 'scanning';
            this.ready = false;
            this.qrCode = await this.generateQRCodeImage(qr);
        });

        this.client.on('ready', () => {
            this._markReady();
        });

        this.client.on('authenticated', () => {
            this.status = 'authenticated';
            this.lastError = null;
            console.log('[WhatsApp] Authenticated, waiting until client is ready to send...');
            this._startReadyWatch();
        });

        this.client.on('loading_screen', (percent) => {
            console.log('[WhatsApp] Loading', percent + '%');
            if (Number(percent) >= 99) {
                this._startReadyWatch();
            }
        });

        this.client.on('change_state', (state) => {
            const s = String(state || '').toUpperCase();
            if (s === 'CONNECTED' || s === 'OPENING') {
                this._promoteReadyIfPossible();
            }
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'disconnected';
            this.authFailure = true;
            this.ready = false;
            this.lastError = msg || 'Authentication failed while linking device';
            console.error('WhatsApp authentication failed:', msg);
        });

        this.client.on('message_ack', (msg, ack) => {
            try {
                const id = msg && msg.id && msg.id._serialized;
                if (id) trackingService.markWhatsAppAck(id, ack, this.userId);
            } catch (_) {}
        });

        this.client.on('disconnected', (reason) => {
            const r = String(reason || '');
            if (this.ready && (r === 'TIMEOUT' || r === 'NAVIGATION' || r === 'OPENING')) {
                console.warn('[WhatsApp] Transient disconnect ignored:', r);
                return;
            }
            this.status = 'disconnected';
            this.ready = false;
            this.currentPhone = null;
            this.lastError = r || 'Client disconnected';
            console.warn('[WhatsApp] Disconnected:', r);
        });

        try {
            await this.client.initialize();
            
            await this.delay(4000);
            if (!this.ready && !this.qrCode) {
                await this._nudgeReadyIfSynced();
            }

            const deadline = Date.now() + 90000;
            while (Date.now() < deadline && !this.ready && !this.qrCode && this.status !== 'disconnected') {
                if (this.client && this.client.info) {
                    this._markReady();
                    break;
                }
                await this.delay(1000);
            }
        } catch (error) {
            console.error('Error initializing WhatsApp client:', error);
            this.status = 'disconnected';
            const msg = String(error.message || error);
            this.lastError = msg.includes('Could not find Chrome')
                ? 'Could not start Chrome to generate the WhatsApp QR code. Please try Connect again.'
                : msg;
            try {
                if (this.client) {
                    await this.client.destroy();
                }
            } catch (_) {}
            this.client = null;
            throw new Error(this.lastError);
        } finally {
            this.initializing = false;
            if (!this.ready && this.client && this.status !== 'disconnected') {
                this._startReadyWatch();
            }
        }

        return { status: this.status, message: 'Client initialized' };
    }

    _stopReadyWatch() {
        if (this._readyWatch) {
            clearInterval(this._readyWatch);
            this._readyWatch = null;
        }
    }

    _startReadyWatch() {
        if (this.ready || this._readyWatch) return;
        this._readyWatch = setInterval(() => {
            if (this.ready || this.status === 'disconnected') {
                this._stopReadyWatch();
                return;
            }
            this._promoteReadyIfPossible();
            this._nudgeReadyIfSynced().catch(() => {});
            this._tryMarkReadyFromPage().catch(() => {});
        }, 1500);
        setTimeout(() => this._stopReadyWatch(), 120000);
    }

    _promoteReadyIfPossible() {
        if (this.ready) return true;
        if (this.client && this.client.info) {
            this._markReady();
            return true;
        }
        return false;
    }

    async _tryMarkReadyFromPage() {
        if (this.ready || !this.client || !this.client.pupPage) return;
        try {
            const me = await this.client.pupPage.evaluate(() => {
                try {
                    const user =
                        (window.Store && window.Store.User && typeof window.Store.User.getMeUser === 'function'
                            && window.Store.User.getMeUser()) ||
                        (window.AuthStore && window.AuthStore.User && window.AuthStore.User.get);
                    if (!user) return null;
                    const id = user.id || user.wid || null;
                    return id ? String(id._serialized || id.user || id) : 'linked';
                } catch (_) {
                    return null;
                }
            });
            if (me) {
                if (!this.currentPhone && me !== 'linked') this.currentPhone = String(me);
                this._markReady();
            }
        } catch (_) {}
    }

    async promoteReady(waitMs = 0) {
        this._promoteReadyIfPossible();
        if (this.ready) return this.getStatus();
        if (this.status === 'authenticated' || this.status === 'scanning' || this.status === 'connected') {
            this._startReadyWatch();
            await this._nudgeReadyIfSynced();
            await this._tryMarkReadyFromPage();
        }
        const deadline = Date.now() + Math.max(0, waitMs);
        while (Date.now() < deadline && !this.ready) {
            if (this._promoteReadyIfPossible()) break;
            await this.delay(250);
        }
        return this.getStatus();
    }

    _markReady() {
        this.status = 'connected';
        this.ready = true;
        this.authFailure = false;
        this.lastError = null;
        this.qrCode = null;
        this._stopReadyWatch();
        try {
            this.currentPhone =
                this.client?.info?.wid?._serialized ||
                this.client?.info?.id?._serialized ||
                this.currentPhone;
        } catch (_) {}
        console.log('[WhatsApp] Client is ready to send', this.currentPhone || '');
    }

    async _nudgeReadyIfSynced() {
        if (this.ready || !this.client || !this.client.pupPage) return;
        try {
            console.log('[WhatsApp] Checking if session already synced...');
            await this.client.pupPage.evaluate(() => {
                if (typeof window.onAppStateHasSyncedEvent !== 'function') return;
                const synced = !!(window.AuthStore && window.AuthStore.AppState && window.AuthStore.AppState.hasSynced);
                if (synced) {
                    window.onAppStateHasSyncedEvent();
                }
            });
        } catch (err) {
            console.warn('[WhatsApp] Ready nudge failed:', err.message);
        }
    }

    async ensureReady(timeoutMs = 25000) {
        if (this.ready && this.client) return;
        if (this.client && this.client.info) {
            this._markReady();
            return;
        }

        if (this.status === 'authenticated' || this.status === 'scanning') {
            await this._nudgeReadyIfSynced();
        }

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (this.ready && this.client) return;
            if (this.client && this.client.info) {
                this._markReady();
                return;
            }
            await this._tryMarkReadyFromPage();
            if (this.ready && this.client) return;
            if (this.status === 'disconnected' && !this.initializing && !this.client) {
                break;
            }
            await this.delay(400);
        }

        if (!(this.ready && this.client)) {
            throw new Error('WhatsApp is still finishing login. Wait until the status says Connected, then send again.');
        }
    }

    async generateQRCodeImage(qr) {
        const QRCode = require('qrcode');
        try {
            const dataUrl = await QRCode.toDataURL(qr, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            return dataUrl;
        } catch (error) {
            console.error('Error generating QR code image:', error);
            return null;
        }
    }

    getQRCode() {
        this._promoteReadyIfPossible();
        return {
            qrCode: this.qrCode,
            status: this.status,
            hasQR: this.qrCode !== null,
            ready: this.ready,
            connected: !!(this.ready && this.client)
        };
    }

    getStatus() {
        this._promoteReadyIfPossible();
        return {
            status: this.status,
            ready: this.ready,
            connected: !!(this.ready && this.client),
            phone: this.currentPhone,
            authFailure: this.authFailure,
            initializing: this.initializing,
            lastError: this.lastError
        };
    }

    async destroySession() {
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (error) {
                console.error('Error destroying client:', error);
            }
            this.client = null;
        }
        
        this.qrCode = null;
        this.status = 'disconnected';
        this.ready = false;
        this.currentPhone = null;
        this.authFailure = false;
        this.initializing = false;
        this._stopReadyWatch();

        return { status: 'disconnected', message: 'Session destroyed successfully' };
    }

    async rescan() {
        const sessionDir = path.join(this.sessionPath, `session-${this.clientId}`);
        try {
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.error('Error clearing session folder:', error.message);
        }
        return await this.initializeClient();
    }

    chatIdFromNumberId(numberId) {
        if (!numberId) return '';
        if (typeof numberId === 'string') return numberId;
        if (numberId._serialized) return String(numberId._serialized);
        if (numberId.serialized) return String(numberId.serialized);
        if (numberId.user) {
            return `${numberId.user}@${numberId.server || 'c.us'}`;
        }
        return '';
    }

    async resolveWhatsAppRecipient(phoneNumber) {
        const digits = normalizePhoneDigits(phoneNumber);
        const display = digits ? formatIntlPhone(digits) : String(phoneNumber || '').trim();
        if (!digits) {
            return { ok: false, digits: '', display, chatId: '', error: 'Invalid phone number' };
        }
        try {
            const numberId = await this.client.getNumberId(digits);
            const chatId = this.chatIdFromNumberId(numberId);
            if (!chatId) {
                return { ok: false, digits, display, chatId: '', error: 'Not registered on WhatsApp' };
            }
            return { ok: true, digits, display, chatId, error: '' };
        } catch (error) {
            const message = (error && error.message) ? error.message : String(error || 'Could not verify WhatsApp number');
            return { ok: false, digits, display, chatId: '', error: message };
        }
    }

    async sendToWhatsAppChat(chatId, message, media) {
        if (media && message) {
            return this.client.sendMessage(chatId, media, { caption: message });
        }
        if (media) {
            return this.client.sendMessage(chatId, media);
        }
        if (message) {
            return this.client.sendMessage(chatId, message);
        }
        throw new Error('Either message or media is required');
    }

    async sendMessage(phoneNumber, message) {
        await this.ensureReady();

        if (!phoneNumber || !message) {
            throw new Error('Phone number and message are required');
        }

        const resolved = await this.resolveWhatsAppRecipient(phoneNumber);
        if (!resolved.ok) {
            throw new Error(resolved.error || 'Not registered on WhatsApp');
        }

        try {
            await this.sendToWhatsAppChat(resolved.chatId, message, null);
            return {
                success: true,
                to: resolved.chatId,
                phone: resolved.display,
                message: 'Message sent successfully'
            };
        } catch (error) {
            console.error('Error sending message:', error);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    async sendMessageWithMedia(phoneNumber, message, mediaPath) {
        await this.ensureReady();

        if (!phoneNumber) {
            throw new Error('Phone number is required');
        }

        const resolved = await this.resolveWhatsAppRecipient(phoneNumber);
        if (!resolved.ok) {
            throw new Error(resolved.error || 'Not registered on WhatsApp');
        }

        try {
            let media;
            if (mediaPath) {
                if (!fs.existsSync(mediaPath)) {
                    throw new Error('Media file not found');
                }
                media = await MessageMedia.fromFilePath(mediaPath);
            }

            await this.sendToWhatsAppChat(resolved.chatId, message, media || null);

            return {
                success: true,
                to: resolved.chatId,
                phone: resolved.display,
                message: 'Message with media sent successfully',
                mediaId: media ? media.mimetype : null
            };
        } catch (error) {
            console.error('Error sending message with media:', error);
            throw new Error(`Failed to send message with media: ${error.message}`);
        }
    }

    async sendBulkMessages(phoneNumbers, message, delayMs = 2000, mediaPath = null, personalizeCallback = null, onStatus = null) {
        await this.ensureReady();

        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            throw new Error('Phone numbers array is required');
        }

        const classified = classifyPhones(phoneNumbers);
        const sendList = classified.valid;
        const results = {
            total: classified.valid.length + classified.invalid.length + classified.duplicates.length,
            sent: 0,
            failed: 0,
            details: []
        };

        let media = null;
        if (mediaPath) {
            if (!fs.existsSync(mediaPath)) {
                throw new Error('Media file not found');
            }
            media = await MessageMedia.fromFilePath(mediaPath);
        }

        const markFailed = (phone, error, index) => {
            results.failed++;
            results.details.push({ phone, status: 'failed', error, index });
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

        classified.invalid.forEach((phone, idx) => {
            markFailed(String(phone), 'Invalid phone number', idx);
        });
        classified.duplicates.forEach((digits, idx) => {
            markFailed(formatIntlPhone(digits), 'Duplicate number', classified.invalid.length + idx);
        });

        const effectiveDelay = Math.max(delayMs, this.rateLimitDelay);

        if (onStatus) {
            onStatus({ type: 'start', total: results.total, message: `Starting to send ${results.total} messages…` });
        }

        for (let i = 0; i < sendList.length; i++) {
            const digits = sendList[i];
            const display = formatIntlPhone(digits);

            try {
                const resolved = await this.resolveWhatsAppRecipient(digits);
                if (!resolved.ok) {
                    markFailed(display, resolved.error || 'Not registered on WhatsApp', i);
                } else {
                let personalizedMessage = message;
                if (personalizeCallback && typeof personalizeCallback === 'function') {
                        personalizedMessage = personalizeCallback(message, digits, i);
                    }

                    const sentMsg = await this.sendToWhatsAppChat(resolved.chatId, personalizedMessage, media);

                    const ack = sentMsg && typeof sentMsg.ack === 'number' ? sentMsg.ack : 1;
                    trackingService.recordOutbound({
                        channel: 'whatsapp',
                        to: resolved.chatId,
                        waId: sentMsg && sentMsg.id && sentMsg.id._serialized,
                        delivered: ack >= 2,
                        read: ack >= 3,
                        userId: this.userId,
                        businessId: this.userId
                    });

                results.sent++;
                    results.details.push({
                        phone: display,
                        status: 'sent',
                        chatId: resolved.chatId,
                        index: i
                    });

                    if (onStatus) {
                        onStatus({
                            type: 'sent',
                            recipient: display,
                            progress: results.sent + results.failed,
                            total: results.total,
                            sentCount: results.sent,
                            failedCount: results.failed
                        });
                    }
                }
            } catch (error) {
                markFailed(display, error.message, i);
                console.error(`Failed to send message to ${display}:`, error.message);
            }

            if (i < sendList.length - 1) {
                if (onStatus) {
                    onStatus({
                        type: 'delay',
                        delay: effectiveDelay,
                        nextRecipient: formatIntlPhone(sendList[i + 1])
                    });
                }
                await this.delay(effectiveDelay);
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

        activityService.recordSend('whatsapp', results, { userId: this.userId });

        return results;
    }

    isReady() {
        return this.ready && this.client && this.status === 'connected';
    }

    formatPhoneNumber(phoneNumber) {
        const digits = normalizePhoneDigits(phoneNumber) || String(phoneNumber || '').replace(/[^\d]/g, '');
        if (!digits) return '';
        return digits + '@c.us';
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getContacts() {
        await this.ensureReady();

        try {
            const contacts = await this.client.getContacts();
            return contacts.map(contact => ({
                id: contact.id._serialized,
                name: contact.pushname || contact.name || 'Unknown',
                number: contact.number
            }));
        } catch (error) {
            console.error('Error getting contacts:', error);
            throw new Error(`Failed to get contacts: ${error.message}`);
        }
    }

    async getChats() {
        await this.ensureReady();

        try {
            const chats = await this.client.getChats();
            return chats.map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                lastMessage: chat.lastMessage ? chat.lastMessage.body : null,
                timestamp: chat.lastMessage ? chat.lastMessage.timestamp : null
            }));
        } catch (error) {
            console.error('Error getting chats:', error);
            throw new Error(`Failed to get chats: ${error.message}`);
        }
    }

    async getChatByPhoneNumber(phoneNumber) {
        await this.ensureReady();

        try {
            const resolved = await this.resolveWhatsAppRecipient(phoneNumber);
            if (!resolved.ok) {
                throw new Error(resolved.error || 'Not registered on WhatsApp');
            }
            const chat = await this.client.getChatById(resolved.chatId);
            return {
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                participants: chat.isGroup ? chat.participants.map(p => p.id._serialized) : []
            };
        } catch (error) {
            console.error('Error getting chat:', error);
            throw new Error(`Failed to get chat: ${error.message}`);
        }
    }

    setRateLimitDelay(delayMs) {
        if (delayMs >= 500) {
            this.rateLimitDelay = delayMs;
            return { success: true, delay: this.rateLimitDelay };
        }
        return { success: false, error: 'Delay must be at least 500ms' };
    }

    getRateLimitDelay() {
        return this.rateLimitDelay;
    }
}

module.exports = createUserScopedHub(WhatsAppService);
