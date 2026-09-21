const tenantStore = require('./tenantStore');
const { requireTenant, getUserId, getTenant } = require('./tenantContext');
const trackingService = require('./trackingService');

const MAX_EVENTS = 800;
const caches = new Map();

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function currentUserId(explicit) {
    return explicit || getUserId() || requireTenant().userId;
}

function getCache(userId) {
    const uid = currentUserId(userId);
    if (!caches.has(uid)) {
        const loaded = tenantStore.readJson(uid, 'activity.json', []);
        const events = Array.isArray(loaded) ? loaded : [];
        caches.set(uid, { events });
        seedFromSchedulesIfEmpty(uid);
    }
    return caches.get(uid);
}

function persist(userId) {
    const uid = currentUserId(userId);
    const cache = getCache(uid);
    tenantStore.writeJson(uid, 'activity.json', cache.events);
}

function countsFromResult(result) {
    const r = result || {};
    const sent = safeNumber(r.sentCount != null ? r.sentCount : r.sent);
    const failed = safeNumber(r.failedCount != null ? r.failedCount : r.failed);
    const total = safeNumber(r.recipientsCount != null ? r.recipientsCount : r.total, sent + failed);
    return { sent, failed, total };
}

function seedFromSchedulesIfEmpty(userId) {
    const cache = getCache(userId);
    if (cache.events.length) return;
    try {
        const schedules = tenantStore.readJson(userId, 'schedules.json', []);
        if (!Array.isArray(schedules)) return;
        const seeded = [];
        for (const schedule of schedules) {
            if (!schedule || (!schedule.lastResult && !schedule.lastError && !schedule.lastRun)) continue;
            const counts = countsFromResult(schedule.lastResult);
            seeded.push({
                id: `seed-${schedule.id || seeded.length}`,
                at: schedule.lastRun || schedule.createdAt || new Date().toISOString(),
                channel: schedule.type || 'email',
                action: schedule.lastError ? 'schedule-error' : 'schedule',
                sent: counts.sent,
                failed: counts.failed,
                total: counts.total,
                label: schedule.name || 'Scheduled campaign',
                error: schedule.lastError || null,
                userId,
                businessId: schedule.businessId || userId,
                user_id: userId,
                business_id: schedule.businessId || userId
            });
        }
        seeded.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        cache.events = seeded.slice(0, MAX_EVENTS);
        if (cache.events.length) persist(userId);
    } catch (err) {
        console.warn('[KPI] Failed to seed activity from schedules:', err.message);
    }
}

function record(entry, userId) {
    const tenant = getTenant();
    const uid = userId || (tenant && tenant.userId) || requireTenant().userId;
    const bid = (tenant && tenant.businessId) || uid;
    const cache = getCache(uid);
    const counts = countsFromResult(entry);
    const event = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: entry.at || new Date().toISOString(),
        channel: entry.channel || 'email',
        action: entry.action || 'send',
        sent: counts.sent,
        failed: counts.failed,
        total: counts.total,
        label: entry.label || null,
        error: entry.error || null,
        userId: uid,
        businessId: bid,
        user_id: uid,
        business_id: bid
    };
    cache.events.unshift(event);
    if (cache.events.length > MAX_EVENTS) cache.events = cache.events.slice(0, MAX_EVENTS);
    persist(uid);
    return event;
}

function recordSend(channel, result, extra) {
    try {
        const counts = countsFromResult(result);
        return record({
            channel,
            action: (extra && extra.action) || 'send',
            sent: counts.sent,
            failed: counts.failed,
            total: counts.total,
            label: extra && extra.label
        }, extra && extra.userId);
    } catch (err) {
        console.warn('[KPI] Failed to record send activity:', err.message);
        return null;
    }
}

function emptyChannelStats() {
    return { jobs: 0, sent: 0, failed: 0, attempted: 0, successRate: 0 };
}

function summarize(list) {
    const channels = {
        email: emptyChannelStats(),
        whatsapp: emptyChannelStats(),
        telegram: emptyChannelStats()
    };
    let sent = 0;
    let failed = 0;
    for (const event of list) {
        const eventSent = safeNumber(event.sent);
        const eventFailed = safeNumber(event.failed);
        sent += eventSent;
        failed += eventFailed;
        const channel = channels[event.channel];
        if (channel) {
            channel.jobs += 1;
            channel.sent += eventSent;
            channel.failed += eventFailed;
        }
    }
    const attempted = sent + failed;
    const decorate = (stats) => {
        stats.attempted = stats.sent + stats.failed;
        stats.successRate = stats.attempted
            ? Math.round((stats.sent / stats.attempted) * 1000) / 10
            : 0;
        return stats;
    };
    Object.keys(channels).forEach((key) => decorate(channels[key]));
    return {
        jobs: list.length,
        sent,
        failed,
        attempted,
        successRate: attempted ? Math.round((sent / attempted) * 1000) / 10 : 0,
        channels
    };
}

function isSameLocalDay(iso, now) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

function startOfLocalDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
}

function endOfLocalDay(value) {
    const date = startOfLocalDay(value);
    date.setHours(23, 59, 59, 999);
    return date;
}

function parseLocalDate(value, endOfDay) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    let date;
    if (match) {
        date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    } else {
        date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return null;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
}

function addGrain(date, grain) {
    const next = new Date(date);
    if (grain === 'hour') next.setHours(next.getHours() + 1);
    else if (grain === 'month') next.setMonth(next.getMonth() + 1);
    else next.setDate(next.getDate() + 1);
    return next;
}

function emptyChannelCounts() {
    return {
        email: { sent: 0, failed: 0 },
        whatsapp: { sent: 0, failed: 0 },
        telegram: { sent: 0, failed: 0 }
    };
}

function resolveChartWindow(range, from, to, now) {
    const key = String(range || 'day').toLowerCase();
    if (key === 'week' || key === 'weekly') {
        const start = startOfLocalDay(now);
        start.setDate(start.getDate() - 6);
        return { range: 'week', grain: 'day', start, end: endOfLocalDay(now), label: 'Last 7 days' };
    }
    if (key === 'month' || key === 'monthly') {
        const start = startOfLocalDay(now);
        start.setDate(1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { range: 'month', grain: 'day', start, end, label: 'This month' };
    }
    if (key === 'year') {
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { range: 'year', grain: 'month', start, end, label: 'This year' };
    }
    if (key === 'custom') {
        let start = parseLocalDate(from, false) || startOfLocalDay(now);
        let end = parseLocalDate(to, true) || new Date(now);
        if (end.getTime() < start.getTime()) {
            const swappedStart = parseLocalDate(to, false) || start;
            end = parseLocalDate(from, true) || end;
            start = swappedStart;
        }
        if (end.getTime() > now.getTime()) end = new Date(now);
        const span = Math.max(0, end.getTime() - start.getTime());
        let grain = 'day';
        if (span <= 2 * 24 * 60 * 60 * 1000) grain = 'hour';
        else if (span > 92 * 24 * 60 * 60 * 1000) grain = 'month';
        return { range: 'custom', grain, start, end, label: 'Custom range' };
    }
    return {
        range: 'day',
        grain: 'hour',
        start: startOfLocalDay(now),
        end: endOfLocalDay(now),
        label: 'Today'
    };
}

function buildChart(list, range, from, to, now) {
    const window = resolveChartWindow(range, from, to, now);
    let cursor = new Date(window.start);
    if (window.grain === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    else if (window.grain === 'day') cursor = startOfLocalDay(cursor);
    else {
        cursor.setMinutes(0, 0, 0);
    }

    const buckets = [];
    const endMs = window.end.getTime();
    let guard = 0;
    while (cursor.getTime() <= endMs && guard < 400) {
        const start = new Date(cursor);
        const next = addGrain(cursor, window.grain);
        buckets.push({
            at: start.toISOString(),
            end: next.toISOString(),
            sent: 0,
            failed: 0,
            jobs: 0,
            channels: emptyChannelCounts()
        });
        cursor = next;
        guard += 1;
    }

    const startMs = window.start.getTime();
    for (const event of list) {
        const ts = new Date(event.at).getTime();
        if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
        for (let i = 0; i < buckets.length; i += 1) {
            const bucket = buckets[i];
            const bStart = new Date(bucket.at).getTime();
            const bEnd = new Date(bucket.end).getTime();
            if (ts >= bStart && ts < bEnd) {
                bucket.jobs += 1;
                bucket.sent += safeNumber(event.sent);
                bucket.failed += safeNumber(event.failed);
                const channel = bucket.channels[event.channel];
                if (channel) {
                    channel.sent += safeNumber(event.sent);
                    channel.failed += safeNumber(event.failed);
                }
                break;
            }
        }
    }

    const inRange = list.filter((event) => {
        const ts = new Date(event.at).getTime();
        return !Number.isNaN(ts) && ts >= startMs && ts <= endMs;
    });

    return {
        range: window.range,
        grain: window.grain,
        label: window.label,
        from: window.start.toISOString(),
        to: window.end.toISOString(),
        buckets,
        summary: summarize(inRange)
    };
}

function publicEvent(event) {
    return {
        id: event.id,
        at: event.at,
        channel: event.channel,
        action: event.action,
        sent: safeNumber(event.sent),
        failed: safeNumber(event.failed),
        total: safeNumber(event.total),
        label: event.label || null,
        error: event.error || null
    };
}

function compactSchedule(schedule) {
    const counts = countsFromResult(schedule.lastResult);
    return {
        id: schedule.id,
        name: schedule.name,
        type: schedule.type,
        status: schedule.status,
        lastRun: schedule.lastRun || null,
        nextRun: schedule.nextRun || null,
        lastError: schedule.lastError || null,
        lastSent: counts.sent,
        lastFailed: counts.failed
    };
}

function buildTools(live) {
    const email = live.email || {};
    const whatsapp = live.whatsapp || {};
    const telegram = live.telegram || {};
    const schedules = Array.isArray(live.schedules) ? live.schedules : [];
    const statusCounts = { waiting: 0, running: 0, completed: 0, failed: 0 };
    schedules.forEach((schedule) => {
        const key = schedule.status || 'waiting';
        statusCounts[key] = (statusCounts[key] || 0) + 1;
    });
    const upcoming = schedules
        .filter((schedule) => schedule.nextRun && schedule.status === 'waiting')
        .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun))[0] || null;
    const last = schedules
        .filter((schedule) => schedule.lastRun)
        .sort((a, b) => new Date(b.lastRun) - new Date(a.lastRun))[0] || null;

    return {
        email: {
            name: 'Email',
            href: '/email.html',
            connected: !!email.configured,
            detail: email.configured
                ? (email.host || email.user || 'SMTP ready')
                : 'SMTP not configured',
            host: email.host || '',
            user: email.user || ''
        },
        whatsapp: {
            name: 'WhatsApp',
            href: '/whatsapp.html',
            connected: !!whatsapp.connected,
            detail: whatsapp.connected
                ? (whatsapp.phone || 'Connected')
                : (whatsapp.status || 'Disconnected'),
            status: whatsapp.status || 'disconnected',
            phone: whatsapp.phone || null,
            lastError: whatsapp.lastError || null
        },
        telegram: {
            name: 'Telegram',
            href: '/telegram.html',
            connected: !!telegram.connected,
            apiConfigured: !!telegram.apiConfigured,
            detail: telegram.connected
                ? (telegram.username || telegram.phone || 'Connected')
                : (telegram.status || 'Disconnected'),
            status: telegram.status || 'disconnected',
            phone: telegram.phone || null,
            username: telegram.username || null,
            lastError: telegram.lastError || null
        },
        schedule: {
            name: 'Schedule',
            href: '/schedule.html',
            connected: schedules.length > 0,
            total: schedules.length,
            waiting: statusCounts.waiting || 0,
            running: statusCounts.running || 0,
            completed: statusCounts.completed || 0,
            failed: statusCounts.failed || 0,
            detail: schedules.length
                ? `${schedules.length} campaign${schedules.length === 1 ? '' : 's'}`
                : 'No campaigns yet',
            upcoming: upcoming ? compactSchedule(upcoming) : null,
            last: last ? compactSchedule(last) : null,
            recent: schedules
                .filter((schedule) => schedule.lastRun)
                .sort((a, b) => new Date(b.lastRun) - new Date(a.lastRun))
                .slice(0, 6)
                .map(compactSchedule)
        }
    };
}

function getOverview(live = {}, query = {}) {
    const uid = (query && query.userId) || currentUserId();
    const events = getCache(uid).events;
    const now = new Date();
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const todayEvents = events.filter((event) => isSameLocalDay(event.at, now));
    const weekEvents = events.filter((event) => new Date(event.at).getTime() >= weekAgo);
    const chart = buildChart(events, query.range, query.from, query.to, now);

    return {
        generatedAt: now.toISOString(),
        totals: summarize(events),
        today: summarize(todayEvents),
        last7Days: summarize(weekEvents),
        chart,
        hourly: chart.buckets,
        activity: events.slice(0, 40).map(publicEvent),
        tools: buildTools(live),
        engagement: live.engagement || trackingService.getEngagement(uid)
    };
}

function listEvents(userId) {
    if (!userId) return [];
    try {
        return getCache(userId).events.map((event) => ({
            ...publicEvent(event),
            userId
        }));
    } catch (_) {
        return [];
    }
}

function listRecent(userId, limit) {
    if (!userId) return [];
    try {
        const n = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
        return getCache(userId).events.slice(0, n).map((event) => ({
            ...publicEvent(event),
            userId
        }));
    } catch (_) {
        return [];
    }
}

module.exports = {
    record,
    recordSend,
    getOverview,
    buildChart,
    resolveChartWindow,
    listEvents,
    listRecent
};
