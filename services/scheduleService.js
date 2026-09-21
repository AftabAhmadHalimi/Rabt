const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const tenantStore = require('./tenantStore');
const { getUserId, requireTenant, runWithTenant } = require('./tenantContext');

// Grace window: if a one-time schedule's nextRun is within this many ms in the past, still execute it.
const GRACE_MS = 10 * 60 * 1000; // 10 minutes

// How often we poll to check if any schedule is due
const TICK_INTERVAL_MS = 30 * 1000; // 30 seconds

class ScheduleService extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100); // allow many SSE clients per schedule
        this.schedules = [];
        this.running = new Set(); // ids currently executing (prevents double-fire)
        this.logBuffers = {};    // scheduleId → [event, ...]  (ring buffer, max 500)
        this.loadSchedules();
        this._startPoller();
    }

    // ── Persistence ─────────────────────────────────────────────────────────

    loadSchedules() {
        try {
            const all = [];
            for (const uid of tenantStore.listTenantUserIds()) {
                const list = tenantStore.readJson(uid, 'schedules.json', []);
                if (!Array.isArray(list)) continue;
                for (const schedule of list) {
                    if (!schedule) continue;
                    schedule.userId = schedule.userId || schedule.user_id || uid;
                    schedule.businessId = schedule.businessId || schedule.business_id || uid;
                    schedule.user_id = schedule.userId;
                    schedule.business_id = schedule.businessId;
                    all.push(schedule);
                }
            }
            this.schedules = all;
        } catch (e) {
            console.error('[Schedule] Failed to load schedules:', e.message);
            this.schedules = [];
        }
    }

    reloadAll() {
        this.loadSchedules();
        console.log(`[Schedule] Reloaded ${this.schedules.length} schedule(s) across tenants.`);
    }

    saveSchedules(userId) {
        try {
            const ids = userId
                ? [userId]
                : [...new Set(this.schedules.map((s) => s.userId).filter(Boolean))];
            for (const uid of ids) {
                const list = this.schedules.filter((s) => s.userId === uid);
                tenantStore.writeJson(uid, 'schedules.json', list);
            }
        } catch (e) {
            console.error('[Schedule] Failed to persist schedules to disk:', e.message);
        }
    }

    _owned(id, userId) {
        const uid = userId || getUserId();
        if (!uid) return null;
        return this.schedules.find((s) => s.id === id && s.userId === uid) || null;
    }

    // ── Live Log ─────────────────────────────────────────────────────────────

    /** Emit a structured log event for a running schedule, and buffer it. */
    _emitLog(id, event) {
        if (!this.logBuffers[id]) this.logBuffers[id] = [];
        this.logBuffers[id].push(event);
        // Keep only the last 500 events to avoid unbounded memory
        if (this.logBuffers[id].length > 500) this.logBuffers[id].shift();
        this.emit(`log:${id}`, event);
    }

    /** Return buffered events since the schedule started (for late SSE subscribers). */
    getLogBuffer(id, userId) {
        if (userId && !this._owned(id, userId)) return [];
        return this.logBuffers[id] || [];
    }

    /** Clear the log buffer for a schedule (called at the start of each run). */
    _clearLogBuffer(id) {
        this.logBuffers[id] = [];
    }

    // ── Poller ────────────────────────────────────────────────────────────────

    _startPoller() {
        this._tick();
        this._pollHandle = setInterval(() => this._tick(), TICK_INTERVAL_MS);
        console.log(`[Schedule] Poller started (every ${TICK_INTERVAL_MS / 1000}s). Loaded ${this.schedules.length} schedule(s).`);
    }

    _tick() {
        const now = Date.now();
        const due = this.schedules.filter(s => {
            if (s.status !== 'waiting') return false;
            if (!s.nextRun) return false;
            if (this.running.has(s.id)) return false;
            const runAt = new Date(s.nextRun).getTime();
            return runAt <= now + 1000 && now - runAt < GRACE_MS;
        });

        for (const schedule of due) {
            this.running.add(schedule.id);
            this.executeSchedule(schedule.id).finally(() => {
                this.running.delete(schedule.id);
            });
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _parseDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
        if (!m) return null;
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        const check = new Date(year, month - 1, day);
        if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
        return { year, month, day, ymd: `${m[1]}-${m[2]}-${m[3]}` };
    }

    _computeNextRun(hour, minute, dateParts, opts) {
        const allowPastBump = !opts || opts.allowPastBump !== false;
        const now = new Date();
        const target = new Date();
        if (dateParts) {
            target.setFullYear(dateParts.year, dateParts.month - 1, dateParts.day);
        }
        target.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
        if (target.getTime() <= now.getTime()) {
            if (!allowPastBump) {
                const err = new Error('Pick a date and time in the future.');
                err.statusCode = 400;
                throw err;
            }
            target.setDate(target.getDate() + 1);
        }
        return target;
    }

    // ── Execution ─────────────────────────────────────────────────────────────

    async executeSchedule(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (!schedule) {
            console.warn(`[Schedule] executeSchedule: id="${id}" not found. Was it deleted?`);
            return;
        }
        if (!schedule.userId) {
            console.warn(`[Schedule] executeSchedule: id="${id}" has no userId`);
            return;
        }
        return runWithTenant(
            { userId: schedule.userId, businessId: schedule.businessId || schedule.userId },
            () => this._executeOwnedSchedule(schedule)
        );
    }

    async _executeOwnedSchedule(schedule) {
        const id = schedule.id;
        console.log(`\n[Schedule] ▶ Running "${schedule.name}" (type=${schedule.type}, repeat=${schedule.repeat}, user=${schedule.userId})`);

        // Clear the previous run's log buffer so SSE clients get a fresh stream
        this._clearLogBuffer(id);
        this._emitLog(id, { type: 'scheduleStart', name: schedule.name, scheduleType: schedule.type });

        try {
            this.updateSchedule(id, { status: 'running', lastRun: new Date().toISOString() });

            let result;
            if (schedule.type === 'email') {
                result = await this._runEmailSchedule(schedule);
            } else if (schedule.type === 'whatsapp') {
                result = await this._runWhatsappSchedule(schedule);
            } else if (schedule.type === 'telegram') {
                result = await this._runTelegramSchedule(schedule);
            } else {
                throw new Error(`Unknown schedule type: "${schedule.type}"`);
            }

            console.log(`[Schedule] ✅ "${schedule.name}" completed successfully.`);
            if (result) {
                const safe = {
                    sent: result.sent,
                    failed: result.failed,
                    total: result.total,
                    sentCount: result.sentCount,
                    failedCount: result.failedCount
                };
                console.log('[Schedule] Result:', JSON.stringify(safe));
            }

            if (schedule.repeat === 'daily') {
                const next = this._computeNextRun(schedule.hour, schedule.minute);
                this.updateSchedule(id, {
                    status: 'waiting',
                    nextRun: next.toISOString(),
                    lastError: null,
                    lastResult: result
                });
                console.log(`[Schedule] Next run for "${schedule.name}": ${next.toLocaleString()}`);
            } else {
                this.updateSchedule(id, {
                    status: 'completed',
                    nextRun: null,
                    lastError: null,
                    lastResult: result
                });
            }

            this._emitLog(id, { type: 'scheduleComplete', status: schedule.repeat === 'daily' ? 'waiting' : 'completed' });

        } catch (error) {
            console.error(`[Schedule] ❌ "${schedule.name}" FAILED: ${error.message}`);
            if (error.stack) console.error(error.stack);

            this._emitLog(id, { type: 'scheduleError', error: error.message });

            if (schedule.repeat === 'daily') {
                const next = this._computeNextRun(schedule.hour, schedule.minute);
                this.updateSchedule(id, {
                    status: 'waiting',
                    nextRun: next.toISOString(),
                    lastError: error.message
                });
            } else {
                this.updateSchedule(id, {
                    status: 'failed',
                    nextRun: null,
                    lastError: error.message
                });
            }
        }
    }

    async _runEmailSchedule(schedule) {
        const emailService = require('./NamecheapEmailService');
        const { recipients, subject, htmlContent, delayMs } = schedule.config;

        if (!recipients || recipients.length === 0) {
            throw new Error('No recipients stored in this scheduled campaign.');
        }
        if (!htmlContent || !htmlContent.trim()) {
            throw new Error('No email content stored in this scheduled campaign.');
        }

        const isFullDocument = /^\s*(<!DOCTYPE|<html)/i.test(htmlContent);
        console.log(`[Schedule] Emailing ${recipients.length} recipient(s). useRawHtml=${isFullDocument}`);

        const trackingService = require('./trackingService');
        return await emailService.sendBulkEmail(
            recipients,
            subject,
            htmlContent,
            null,
            [],
            {
                delayMs: delayMs || 5000,
                useRawHtml: isFullDocument,
                publicBaseUrl: trackingService.getPublicBaseUrl(),
                onStatus: (evt) => this._emitLog(schedule.id, evt),
                userId: schedule.userId,
                businessId: schedule.businessId || schedule.userId
            }
        );
    }

    async _runWhatsappSchedule(schedule) {
        const whatsappService = require('./whatsappService');
        const { phoneNumbers, message, delayMs } = schedule.config;

        if (!phoneNumbers || phoneNumbers.length === 0) {
            throw new Error('No phone numbers stored in this scheduled campaign.');
        }
        if (!message || !message.trim()) {
            throw new Error('No message stored in this scheduled campaign.');
        }
        const wa = whatsappService.forUser(schedule.userId);
        if (!wa.isReady()) {
            throw new Error(
                'WhatsApp is not connected. Please connect your device on the WhatsApp page before the scheduled time.'
            );
        }

        console.log(`[Schedule] Messaging ${phoneNumbers.length} number(s) via WhatsApp.`);

        return await wa.sendBulkMessages(
            phoneNumbers,
            message,
            delayMs || 2000,
            null, // mediaPath
            null, // personalizeCallback
            (evt) => this._emitLog(schedule.id, evt)
        );
    }

    async _runTelegramSchedule(schedule) {
        const telegramService = require('./telegramService');
        let { phoneNumbers, message, delayMs, chatIds } = schedule.config;

        if ((!phoneNumbers || !phoneNumbers.length) && Array.isArray(chatIds) && chatIds.length) {
            phoneNumbers = chatIds;
        }

        if (!phoneNumbers || phoneNumbers.length === 0) {
            throw new Error('No phone numbers stored in this scheduled campaign.');
        }
        if (!message || !message.trim()) {
            throw new Error('No message stored in this scheduled campaign.');
        }

        const tg = telegramService.forUser(schedule.userId);
        if (!tg.isReady()) {
            throw new Error(
                'Telegram is not connected. Log in with QR or phone on the Telegram page before the scheduled time.'
            );
        }

        return await tg.sendBulkMessages(
            phoneNumbers,
            message,
            delayMs || 2000,
            null,
            null,
            (evt) => this._emitLog(schedule.id, evt)
        );
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────

    createSchedule(data, userId) {
        const hour = parseInt(data.hour);
        const minute = parseInt(data.minute);
        const rawDate = data.date != null ? String(data.date).trim() : '';
        const dateParts = this._parseDate(rawDate);
        if (rawDate && !dateParts) {
            const err = new Error('Invalid schedule date');
            err.statusCode = 400;
            throw err;
        }
        const nextRun = this._computeNextRun(hour, minute, dateParts, { allowPastBump: !dateParts });

        const tenant = userId
            ? { userId: String(userId), businessId: String((data && data.businessId) || userId) }
            : requireTenant();
        const schedule = {
            id: uuidv4(),
            name: (data.name || 'Unnamed Schedule').trim(),
            type: data.type,
            hour,
            minute,
            date: dateParts ? dateParts.ymd : null,
            repeat: data.repeat || 'once',
            config: data.config,
            status: 'waiting',
            createdAt: new Date().toISOString(),
            lastRun: null,
            nextRun: nextRun.toISOString(),
            lastError: null,
            lastResult: null,
            userId: tenant.userId,
            businessId: tenant.businessId,
            user_id: tenant.userId,
            business_id: tenant.businessId
        };

        this.schedules.push(schedule);
        this.saveSchedules(tenant.userId);

        const mins = Math.round((nextRun.getTime() - Date.now()) / 60000);
        console.log(`[Schedule] Created "${schedule.name}" → next run at ${nextRun.toLocaleString()} (in ${mins} min)`);

        return schedule;
    }

    updateSchedule(id, updates) {
        const index = this.schedules.findIndex(s => s.id === id);
        if (index !== -1) {
            this.schedules[index] = { ...this.schedules[index], ...updates };
            this.saveSchedules(this.schedules[index].userId);
            return this.schedules[index];
        }
        return null;
    }

    cancelSchedule(id, userId) {
        const owned = this._owned(id, userId);
        if (!owned) return null;
        const updated = this.updateSchedule(id, { status: 'cancelled', nextRun: null });
        return updated ? this._publicSchedule(updated) : null;
    }

    deleteSchedule(id, userId) {
        const owned = this._owned(id, userId);
        if (!owned) return false;
        const index = this.schedules.findIndex(s => s.id === id && s.userId === owned.userId);
        if (index !== -1) {
            const uid = this.schedules[index].userId;
            this.schedules.splice(index, 1);
            this.saveSchedules(uid);
            return true;
        }
        return false;
    }

    async runNow(id, userId) {
        const owned = this._owned(id, userId);
        if (!owned) return null;
        this.running.delete(id);
        return this.executeSchedule(id);
    }

    getSchedules(userId) {
        const uid = userId || getUserId();
        const mine = uid ? this.schedules.filter((s) => s.userId === uid) : [];
        return mine.map((s) => this._publicSchedule(s));
    }

    getSchedule(id, userId) {
        const owned = this._owned(id, userId);
        return owned ? this._publicSchedule(owned) : null;
    }

    _publicSchedule(s) {
        const { config, ...rest } = s;
        const safeConfig = { ...(config || {}) };
        if (safeConfig.recipients) safeConfig.recipientCount = safeConfig.recipients.length;
        if (safeConfig.phoneNumbers) safeConfig.phoneCount = safeConfig.phoneNumbers.length;
        delete safeConfig.recipients;
        delete safeConfig.phoneNumbers;
        delete safeConfig.htmlContent;
        delete safeConfig.message;
        if (rest.lastResult && typeof rest.lastResult === 'object') {
            rest.lastResult = {
                sent: rest.lastResult.sent,
                failed: rest.lastResult.failed,
                total: rest.lastResult.total,
                sentCount: rest.lastResult.sentCount,
                failedCount: rest.lastResult.failedCount
            };
        }
        return { ...rest, config: safeConfig };
    }

    getAllSchedules() {
        return this.schedules.map((s) => this._publicSchedule(s));
    }

    adminCancel(id) {
        const found = this.schedules.find((s) => s.id === id);
        if (!found) return null;
        return this.updateSchedule(id, { status: 'cancelled', nextRun: null });
    }

    adminDelete(id) {
        const index = this.schedules.findIndex((s) => s.id === id);
        if (index === -1) return false;
        const uid = this.schedules[index].userId;
        this.schedules.splice(index, 1);
        if (uid) this.saveSchedules(uid);
        return true;
    }

    adminRunNow(id) {
        const found = this.schedules.find((s) => s.id === id);
        if (!found) return null;
        this.running.delete(id);
        return this.executeSchedule(id);
    }

    removeUserSchedules(userId) {
        const uid = String(userId || '');
        if (!uid) return 0;
        const before = this.schedules.length;
        this.schedules = this.schedules.filter((s) => s.userId !== uid);
        return before - this.schedules.length;
    }
}

module.exports = new ScheduleService();