const xlsx = require('xlsx');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

function normalizeString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function normalizeEmail(raw) {
    let value = normalizeString(raw).toLowerCase();
    if (!value) return '';
    value = value.replace(/^mailto:/i, '');
    const angled = value.match(/<([^>]+)>/);
    if (angled) value = normalizeString(angled[1]).toLowerCase();
    value = value.replace(/\s+/g, '');
    return value;
}

function isValidEmail(raw) {
    const email = normalizeEmail(raw);
    if (!email || email.includes('..')) return false;
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    const local = parts[0];
    const domain = parts[1];
    if (!local || !domain) return false;
    if (local.startsWith('.') || local.endsWith('.')) return false;
    if (domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) return false;
    if (!domain.includes('.')) return false;
    return true;
}

function classifyEmails(values) {
    const valid = [];
    const invalid = [];
    const duplicates = [];
    const seen = new Set();
    (values || []).forEach((raw) => {
        const trimmed = normalizeString(raw);
        if (!trimmed) return;
        const email = normalizeEmail(trimmed);
        if (!isValidEmail(email)) {
            invalid.push(trimmed);
            return;
        }
        if (seen.has(email)) {
            duplicates.push(email);
            return;
        }
        seen.add(email);
        valid.push(email);
    });
    return { valid, invalid, duplicates };
}

function extractColumnValues(buffer, looksLikeTarget) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames && workbook.SheetNames[0];
    if (!sheetName) return [];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length) return [];
    const firstRow = rows[0] || [];
    const firstHasTarget = firstRow.some((cell) => looksLikeTarget(cell));
    const start = firstHasTarget ? 0 : 1;
    const maxCols = Math.max(...rows.map((row) => (row ? row.length : 0)), 0);
    if (!maxCols) return [];
    const counts = new Array(maxCols).fill(0);
    const sampleEnd = Math.min(rows.length, start + 30);
    for (let r = start; r < sampleEnd; r++) {
        const row = rows[r] || [];
        for (let c = 0; c < maxCols; c++) {
            if (looksLikeTarget(row[c])) counts[c] += 1;
        }
    }
    let bestCol = 0;
    let bestCount = -1;
    counts.forEach((count, idx) => {
        if (count > bestCount) {
            bestCount = count;
            bestCol = idx;
        }
    });
    const values = [];
    for (let r = start; r < rows.length; r++) {
        const cell = normalizeString((rows[r] || [])[bestCol]);
        if (cell) values.push(cell);
    }
    return values;
}

function parseEmailBuffer(buffer, originalName, emailColumn) {
    const ext = String(originalName || '').toLowerCase();
    let values = [];
    if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
        if (emailColumn != null && String(emailColumn).trim() !== '') {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames && workbook.SheetNames[0];
            if (!sheetName) return classifyEmails([]);
            const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            const firstRow = rows[0] || [];
            const firstLooksLikeHeader = firstRow.some((cell) => normalizeString(cell)) &&
                !firstRow.some((cell) => isValidEmail(cell));
            const headers = firstLooksLikeHeader ? firstRow.map((cell) => normalizeString(cell)) : null;
            const start = firstLooksLikeHeader ? 1 : 0;
            const raw = String(emailColumn).trim().toLowerCase();
            let col = 0;
            const asNumber = parseInt(raw, 10);
            if (!Number.isNaN(asNumber)) col = Math.max(0, asNumber);
            else if (headers) {
                const exact = headers.findIndex((h) => h && h.toLowerCase() === raw);
                col = exact !== -1 ? exact : Math.max(0, headers.findIndex((h) => h && h.toLowerCase().includes(raw)));
            }
            for (let r = start; r < rows.length; r++) {
                const cell = normalizeString((rows[r] || [])[col]);
                if (cell) values.push(cell);
            }
        } else {
            values = extractColumnValues(buffer, isValidEmail);
        }
    } else {
        values = buffer.toString('utf8').split(/\r?\n/);
    }
    return classifyEmails(values);
}

function rawPhoneText(cell) {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) return '';
        return String(Math.trunc(cell));
    }
    const value = String(cell).trim();
    if (!value) return '';
    if (/e[+-]?\d+/i.test(value) && !value.includes('@')) {
        const n = Number(value);
        if (Number.isFinite(n)) return String(Math.trunc(n));
    }
    return value;
}

function toE164(raw) {
    const text = rawPhoneText(raw);
    if (!text) return '';
    const compact = text.replace(/[\s\-().]/g, '');
    if (!compact) return '';
    if (/^\+0/.test(compact)) return '';

    let candidate = compact;
    if (candidate.startsWith('00')) candidate = '+' + candidate.slice(2);
    if (/^\+0/.test(candidate)) return '';

    let parsed = parsePhoneNumberFromString(candidate);
    if ((!parsed || !parsed.isValid()) && !candidate.startsWith('+')) {
        const digits = candidate.replace(/[^\d]/g, '');
        if (!digits || digits.startsWith('0')) return '';
        parsed = parsePhoneNumberFromString('+' + digits);
    }
    if (!parsed || !parsed.isValid()) return '';

    const e164 = String(parsed.number || '');
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) return '';
    return e164;
}

function normalizePhoneDigits(cell) {
    const e164 = toE164(cell);
    return e164 ? e164.slice(1) : '';
}

function classifyPhones(values) {
    const valid = [];
    const invalid = [];
    const duplicates = [];
    const seen = new Set();
    (values || []).forEach((raw) => {
        const trimmed = normalizeString(raw);
        if (!trimmed) return;
        const digits = normalizePhoneDigits(trimmed);
        if (!digits) {
            invalid.push(trimmed);
            return;
        }
        if (seen.has(digits)) {
            duplicates.push(digits);
            return;
        }
        seen.add(digits);
        valid.push(digits);
    });
    return { valid, invalid, duplicates };
}

function extractPhoneValues(buffer, originalName) {
    const ext = String(originalName || '').toLowerCase();
    if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
        return extractColumnValues(buffer, (cell) => !!toE164(cell));
    }
    return buffer.toString('utf8').split(/[\n,]/);
}

function parsePhoneBuffer(buffer, originalName) {
    return classifyPhones(extractPhoneValues(buffer, originalName));
}

function formatIntlPhone(value) {
    return toE164(value);
}

function writeValueColumnBuffer(values, originalName) {
    const rows = Array.isArray(values) ? values.filter(Boolean) : [];
    const ext = String(originalName || '').toLowerCase();
    if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
        const workbook = xlsx.utils.book_new();
        const sheet = xlsx.utils.aoa_to_sheet(rows.map((value) => [value]));
        xlsx.utils.book_append_sheet(workbook, sheet, 'Contacts');
        const bookType = ext.endsWith('.xls') ? 'xls' : 'xlsx';
        return Buffer.from(xlsx.write(workbook, { type: 'buffer', bookType }));
    }
    const text = rows.length ? (rows.join('\n') + '\n') : '';
    return Buffer.from(text, 'utf8');
}

function buildCleanPhoneBuffer(buffer, originalName) {
    const parsed = parsePhoneBuffer(buffer, originalName);
    const numbers = parsed.valid.map((digits) => '+' + digits);
    return {
        buffer: writeValueColumnBuffer(numbers, originalName),
        validCount: numbers.length,
        parsed
    };
}

module.exports = {
    normalizeEmail,
    isValidEmail,
    classifyEmails,
    parseEmailBuffer,
    normalizePhoneDigits,
    classifyPhones,
    extractPhoneValues,
    parsePhoneBuffer,
    formatIntlPhone,
    toE164,
    buildCleanPhoneBuffer,
    writeValueColumnBuffer
};
