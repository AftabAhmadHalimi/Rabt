const windows = new Map();

function assertAllowed(key, windowMs = 15 * 60 * 1000, max = 8) {
    const now = Date.now();
    const rec = windows.get(key);
    if (!rec || now - rec.first > windowMs) {
        windows.set(key, { first: now, count: 0 });
        return;
    }
    if (rec.count >= max) {
        const wait = Math.max(1, Math.ceil((windowMs - (now - rec.first)) / 60000));
        const err = new Error('Too many attempts. Try again in ' + wait + ' minute' + (wait === 1 ? '' : 's') + '.');
        err.statusCode = 429;
        throw err;
    }
}

function recordFailure(key) {
    const rec = windows.get(key);
    if (!rec) {
        windows.set(key, { first: Date.now(), count: 1 });
        return;
    }
    rec.count += 1;
}

function recordSuccess(key) {
    windows.delete(key);
}

module.exports = { assertAllowed, recordFailure, recordSuccess };
