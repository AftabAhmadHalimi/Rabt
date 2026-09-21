const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tenantStore = require('./tenantStore');
const {
    parseEmailBuffer,
    parsePhoneBuffer,
    buildCleanPhoneBuffer,
    formatIntlPhone,
    normalizeEmail,
    normalizePhoneDigits,
    writeValueColumnBuffer
} = require('../utils/recipients');

const STORAGE_ROOT = path.join(__dirname, '..', 'storage', 'lists');
const INDEX_FILE = 'lists.json';
const ALLOWED_EXTS = ['.txt', '.xls', '.xlsx'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_LISTS_PER_USER = 100;

class ListError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ListError';
        this.status = status || 400;
    }
}

function userIdSafe(userId) {
    const value = String(userId || '').trim();
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new ListError('Invalid user', 400);
    }
    return value;
}

function sanitizeKind(kind) {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'email') return 'email';
    if (value === 'messaging' || value === 'whatsapp' || value === 'telegram') return 'messaging';
    throw new ListError('Lists are either email or messaging (WhatsApp / Telegram).', 400);
}

function sanitizeName(name, fallback) {
    const cleaned = String(name || '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    return cleaned || fallback || 'Untitled list';
}

function extFromName(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
        throw new ListError('Upload a .txt, .xls, or .xlsx file.', 400);
    }
    return ext;
}

function mimeForExt(ext) {
    if (ext === '.txt') return 'text/plain';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function inspectListBuffer(buffer, originalName, kind) {
    const empty = {
        contacts: [],
        recordCount: 0,
        invalid: [],
        duplicates: [],
        invalidCount: 0,
        duplicateCount: 0
    };
    try {
        if (kind === 'email') {
            const parsed = parseEmailBuffer(buffer, originalName);
            return {
                contacts: parsed.valid,
                recordCount: parsed.valid.length,
                invalid: parsed.invalid,
                duplicates: parsed.duplicates,
                invalidCount: parsed.invalid.length,
                duplicateCount: parsed.duplicates.length
            };
        }
        const parsed = parsePhoneBuffer(buffer, originalName);
        return {
            contacts: parsed.valid.map((digits) => formatIntlPhone(digits) || ('+' + digits)),
            recordCount: parsed.valid.length,
            invalid: parsed.invalid,
            duplicates: parsed.duplicates.map((digits) => formatIntlPhone(digits) || ('+' + digits)),
            invalidCount: parsed.invalid.length,
            duplicateCount: parsed.duplicates.length
        };
    } catch (_) {
        return empty;
    }
}

function inspectEntry(userId, entry) {
    try {
        const filePath = filePathFor(userId, entry);
        if (!fs.existsSync(filePath)) {
            return inspectListBuffer(Buffer.alloc(0), entry.originalName || '', entry.kind);
        }
        return inspectListBuffer(fs.readFileSync(filePath), entry.originalName || entry.storedName, entry.kind);
    } catch (_) {
        return inspectListBuffer(Buffer.alloc(0), '', entry && entry.kind);
    }
}

function emptyIndex() {
    return { lists: [] };
}

function readIndex(userId) {
    const data = tenantStore.readJson(userId, INDEX_FILE, emptyIndex());
    if (!data || !Array.isArray(data.lists)) return emptyIndex();
    return data;
}

function writeIndex(userId, data) {
    return tenantStore.writeJson(userId, INDEX_FILE, {
        lists: Array.isArray(data && data.lists) ? data.lists : []
    });
}

function listsDir(userId, kind) {
    const uid = userIdSafe(userId);
    const k = sanitizeKind(kind);
    tenantStore.ensureTenant(uid);
    const dir = path.join(STORAGE_ROOT, uid, k);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function filePathFor(userId, entry) {
    const dir = listsDir(userId, entry.kind);
    const stored = path.basename(String(entry.storedName || ''));
    if (!stored) throw new ListError('List file is missing.', 404);
    const full = path.resolve(dir, stored);
    if (path.dirname(full) !== path.resolve(dir)) {
        throw new ListError('Invalid list path.', 400);
    }
    return full;
}

function publicList(entry, inspected) {
    const extra = inspected || {};
    return {
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        originalName: entry.originalName,
        ext: entry.ext,
        recordCount: extra.recordCount != null ? extra.recordCount : (entry.recordCount || 0),
        size: entry.size || 0,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        contacts: Array.isArray(extra.contacts) ? extra.contacts : [],
        invalid: Array.isArray(extra.invalid) ? extra.invalid : [],
        duplicates: Array.isArray(extra.duplicates) ? extra.duplicates : [],
        invalidCount: extra.invalidCount || 0,
        duplicateCount: extra.duplicateCount || 0
    };
}

function listLists(userId, kind) {
    const uid = userIdSafe(userId);
    tenantStore.ensureTenant(uid);
    const wanted = kind ? sanitizeKind(kind) : null;
    const index = readIndex(uid);
    return index.lists
        .filter((entry) => !wanted || entry.kind === wanted)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((entry) => publicList(entry, inspectEntry(uid, entry)));
}

function getList(userId, id) {
    const uid = userIdSafe(userId);
    const listId = String(id || '').trim();
    if (!listId) return null;
    const index = readIndex(uid);
    const entry = index.lists.find((item) => item.id === listId);
    return entry || null;
}

function saveList(userId, { kind, name, originalName, buffer }) {
    const uid = userIdSafe(userId);
    const k = sanitizeKind(kind);
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new ListError('The uploaded file is empty.', 400);
    }
    if (buffer.length > MAX_FILE_BYTES) {
        throw new ListError('File is too large. Maximum size is 20 MB.', 400);
    }

    const ext = extFromName(originalName);
    const index = readIndex(uid);
    if (index.lists.length >= MAX_LISTS_PER_USER) {
        throw new ListError('You have reached the maximum of 100 saved lists. Delete one to upload another.', 400);
    }

    let storeBuffer = buffer;
    let storeName = originalName;
    if (k === 'messaging') {
        const cleaned = buildCleanPhoneBuffer(buffer, originalName);
        if (!cleaned.validCount) {
            throw new ListError('No valid international phone numbers found. Use a full number such as +98..., not a short or local format.', 400);
        }
        storeBuffer = cleaned.buffer;
        storeName = originalName;
    }

    const id = crypto.randomUUID();
    const storedName = id + ext;
    const fallbackName = path.basename(String(originalName || 'list'), ext) || 'list';
    const inspected = inspectListBuffer(storeBuffer, storeName, k);
    const now = new Date().toISOString();
    const entry = {
        id,
        kind: k,
        name: sanitizeName(name, sanitizeName(fallbackName, 'Untitled list')),
        originalName: path.basename(String(originalName || storedName)).slice(0, 180),
        storedName,
        ext,
        recordCount: inspected.recordCount,
        size: storeBuffer.length,
        createdAt: now,
        updatedAt: now
    };

    const dest = filePathFor(uid, entry);
    fs.writeFileSync(dest, storeBuffer);
    index.lists.push(entry);
    writeIndex(uid, index);
    return publicList(entry, inspected);
}

function getDownload(userId, id) {
    const entry = getList(userId, id);
    if (!entry) return null;
    const filePath = filePathFor(userId, entry);
    if (!fs.existsSync(filePath)) {
        throw new ListError('The file is no longer on disk. Delete this list and upload it again.', 404);
    }
    const downloadName = sanitizeName(entry.name, 'list') + entry.ext;
    return {
        entry: publicList(entry, inspectEntry(userId, entry)),
        filePath,
        mime: mimeForExt(entry.ext),
        downloadName
    };
}

function unlinkEntry(uid, entry) {
    try {
        const filePath = filePathFor(uid, entry);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* keep going */ }
}

function rewriteEntry(uid, entry, values) {
    const buffer = writeValueColumnBuffer(values, entry.originalName || entry.storedName);
    const dest = filePathFor(uid, entry);
    fs.writeFileSync(dest, buffer);
    const inspected = inspectListBuffer(buffer, entry.originalName || entry.storedName, entry.kind);
    entry.recordCount = inspected.recordCount;
    entry.size = buffer.length;
    entry.updatedAt = new Date().toISOString();
    return entry;
}

function removeContacts(userId, payload) {
    const uid = userIdSafe(userId);
    tenantStore.ensureTenant(uid);
    const emailSet = new Set(
        (payload && Array.isArray(payload.emails) ? payload.emails : [])
            .map((value) => normalizeEmail(value))
            .filter(Boolean)
    );
    const phoneSet = new Set(
        (payload && Array.isArray(payload.phones) ? payload.phones : [])
            .map((value) => normalizePhoneDigits(value))
            .filter(Boolean)
    );
    if (!emailSet.size && !phoneSet.size) return 0;

    const index = readIndex(uid);
    const next = [];
    let changed = 0;
    index.lists.forEach((entry) => {
        if (entry.kind === 'email' && emailSet.size) {
            try {
                const buffer = fs.readFileSync(filePathFor(uid, entry));
                const parsed = parseEmailBuffer(buffer, entry.originalName || entry.storedName);
                const remaining = parsed.valid.filter((email) => !emailSet.has(email));
                if (remaining.length === parsed.valid.length) {
                    next.push(entry);
                    return;
                }
                changed += 1;
                if (!remaining.length) {
                    unlinkEntry(uid, entry);
                    return;
                }
                next.push(rewriteEntry(uid, entry, remaining));
                return;
            } catch (_) {
                next.push(entry);
                return;
            }
        }
        if (entry.kind === 'messaging' && phoneSet.size) {
            try {
                const buffer = fs.readFileSync(filePathFor(uid, entry));
                const parsed = parsePhoneBuffer(buffer, entry.originalName || entry.storedName);
                const remaining = parsed.valid.filter((digits) => !phoneSet.has(digits));
                if (remaining.length === parsed.valid.length) {
                    next.push(entry);
                    return;
                }
                changed += 1;
                if (!remaining.length) {
                    unlinkEntry(uid, entry);
                    return;
                }
                next.push(rewriteEntry(uid, entry, remaining.map((digits) => formatIntlPhone(digits) || ('+' + digits))));
                return;
            } catch (_) {
                next.push(entry);
                return;
            }
        }
        next.push(entry);
    });
    writeIndex(uid, { lists: next });
    return changed;
}

function deleteLists(userId, ids) {
    const wanted = new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean));
    if (!wanted.size) return 0;
    const uid = userIdSafe(userId);
    const index = readIndex(uid);
    let removed = 0;
    const next = [];
    index.lists.forEach((entry) => {
        if (!wanted.has(entry.id)) {
            next.push(entry);
            return;
        }
        unlinkEntry(uid, entry);
        removed += 1;
    });
    writeIndex(uid, { lists: next });
    return removed;
}

function deleteList(userId, id) {
    const uid = userIdSafe(userId);
    const index = readIndex(uid);
    const idx = index.lists.findIndex((item) => item.id === String(id || '').trim());
    if (idx === -1) return false;
    const entry = index.lists[idx];
    try {
        const filePath = filePathFor(uid, entry);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* keep index cleanup even if file is already gone */ }
    index.lists.splice(idx, 1);
    writeIndex(uid, index);
    return true;
}

module.exports = {
    ListError,
    sanitizeKind,
    listLists,
    getList,
    saveList,
    getDownload,
    deleteList,
    deleteLists,
    removeContacts
};
