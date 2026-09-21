const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'config', 'ip-geo-cache.json');
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

function readCache() {
    try {
        const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeCache(cache) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (_) {}
}

function normalizeIp(ip) {
    return String(ip || '').replace(/^::ffff:/i, '').trim();
}

function isPrivateIp(ip) {
    const value = normalizeIp(ip);
    if (!value) return true;
    if (value === '::1' || value.toLowerCase() === 'localhost') return true;
    if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) {
        return true;
    }
    const match = value.match(/^172\.(\d+)\./);
    if (match) {
        const octet = Number(match[1]);
        if (octet >= 16 && octet <= 31) return true;
    }
    if (/^(fc|fd|fe80)/i.test(value)) return true;
    return false;
}

function formatPlace(parts) {
    return [parts.city, parts.region, parts.country].filter(Boolean).join(', ');
}

function privateResult(ip) {
    return {
        found: false,
        local: true,
        ip: ip || '',
        place: 'Local or private network',
        city: '',
        region: '',
        country: '',
        isp: 'N/A',
        lat: null,
        lon: null
    };
}

async function lookup(ip) {
    const query = normalizeIp(ip);
    if (!query) {
        return { found: false, local: false, ip: '', place: '', isp: '', lat: null, lon: null };
    }
    if (isPrivateIp(query)) return privateResult(query);

    const cache = readCache();
    const hit = cache[query];
    if (hit && hit.lookedUpAt && Date.now() - new Date(hit.lookedUpAt).getTime() < CACHE_MS) {
        return hit;
    }

    try {
        const url = 'http://ip-api.com/json/' + encodeURIComponent(query) +
            '?fields=status,message,country,regionName,city,lat,lon,isp,org,query';
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (!data || data.status !== 'success') {
            return {
                found: false,
                local: false,
                ip: query,
                place: '',
                isp: '',
                lat: null,
                lon: null,
                error: (data && data.message) || 'IP lookup failed'
            };
        }
        const result = {
            found: true,
            local: false,
            ip: data.query || query,
            city: data.city || '',
            region: data.regionName || '',
            country: data.country || '',
            place: formatPlace({
                city: data.city,
                region: data.regionName,
                country: data.country
            }),
            isp: data.isp || data.org || '',
            lat: typeof data.lat === 'number' ? data.lat : null,
            lon: typeof data.lon === 'number' ? data.lon : null,
            lookedUpAt: new Date().toISOString()
        };
        cache[query] = result;
        writeCache(cache);
        return result;
    } catch (err) {
        return {
            found: false,
            local: false,
            ip: query,
            place: '',
            isp: '',
            lat: null,
            lon: null,
            error: err.message || 'IP lookup failed'
        };
    }
}

module.exports = {
    lookup,
    isPrivateIp,
    normalizeIp
};
