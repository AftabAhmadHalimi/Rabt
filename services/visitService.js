const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'config', 'platform-visits.json');
const recentHits = new Map();

function empty() {
    return {
        totalVisits: 0,
        totalPageviews: 0,
        uniqueVisitors: 0,
        todayDate: '',
        todayVisits: 0,
        todayPageviews: 0,
        updatedAt: null
    };
}

function readStore() {
    try {
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        return parsed && typeof parsed === 'object' ? { ...empty(), ...parsed } : empty();
    } catch (_) {
        return empty();
    }
}

function writeStore(data) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function todayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function rollToday(store, now = new Date()) {
    const day = todayKey(now);
    if (store.todayDate !== day) {
        store.todayDate = day;
        store.todayVisits = 0;
        store.todayPageviews = 0;
    }
    return store;
}

function isBot(ua) {
    return /bot|crawl|spider|slurp|preview|httpclient|curl|wget|python-requests|headless/i.test(String(ua || ''));
}

function record(req, body) {
    const ua = String((req && req.headers && req.headers['user-agent']) || '');
    if (isBot(ua)) {
        return getSummary();
    }
    const payload = body && typeof body === 'object' ? body : {};
    const visitorId = String(payload.visitorId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const rateKey = visitorId || String((req && req.ip) || 'anon');
    const now = Date.now();
    const last = recentHits.get(rateKey) || 0;
    if (now - last < 1200) return getSummary();
    recentHits.set(rateKey, now);
    if (recentHits.size > 5000) {
        for (const [key, at] of recentHits) {
            if (now - at > 60000) recentHits.delete(key);
        }
    }

    const store = rollToday(readStore());
    store.totalPageviews += 1;
    store.todayPageviews += 1;
    if (payload.newVisitor) {
        store.uniqueVisitors += 1;
    }
    if (payload.newVisit) {
        store.totalVisits += 1;
        store.todayVisits += 1;
    }
    store.updatedAt = new Date().toISOString();
    writeStore(store);
    return getSummary(store);
}

function getSummary(store) {
    const data = rollToday(store || readStore());
    return {
        totalVisits: Number(data.totalVisits) || 0,
        totalPageviews: Number(data.totalPageviews) || 0,
        uniqueVisitors: Number(data.uniqueVisitors) || 0,
        todayVisits: Number(data.todayVisits) || 0,
        todayPageviews: Number(data.todayPageviews) || 0
    };
}

function newId() {
    return crypto.randomBytes(12).toString('hex');
}

module.exports = {
    record,
    getSummary,
    newId
};
