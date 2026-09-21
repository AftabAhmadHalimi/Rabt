const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    parseEmailBuffer,
    parsePhoneBuffer,
    buildCleanPhoneBuffer,
    formatIntlPhone
} = require('../utils/recipients');

const STORAGE_ROOT = path.join(__dirname, '..', 'storage', 'marketing-database');
const INDEX_FILE = path.join(__dirname, '..', 'config', 'marketing-database.json');
const ALLOWED_EXTS = ['.txt', '.xls', '.xlsx'];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_LISTS = 50;

class MarketingDbError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'MarketingDbError';
        this.status = status || 400;
    }
}

function sanitizeKind(kind) {
    const value = String(kind || '').trim().toLowerCase();
    if (value === 'email') return 'email';
    if (value === 'messaging' || value === 'whatsapp' || value === 'telegram') return 'messaging';
    throw new MarketingDbError('Lists are either email or messaging (WhatsApp / Telegram).');
}

function sanitizeName(name, fallback) {
    const cleaned = String(name || '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    return cleaned || fallback || 'Untitled list';
}

function sanitizeDescription(text) {
    return String(text || '').trim().slice(0, 500);
}

function extFromName(filename) {
    const ext = path.extname(String(filename || '')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
        throw new MarketingDbError('Upload a .txt, .xls, or .xlsx file.');
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
        invalidCount: 0,
        duplicateCount: 0
    };
    try {
        if (kind === 'email') {
            const parsed = parseEmailBuffer(buffer, originalName);
            return {
                contacts: parsed.valid,
                recordCount: parsed.valid.length,
                invalidCount: parsed.invalid.length,
                duplicateCount: parsed.duplicates.length
            };
        }
        const parsed = parsePhoneBuffer(buffer, originalName);
        return {
            contacts: parsed.valid.map((digits) => formatIntlPhone(digits) || ('+' + digits)),
            recordCount: parsed.valid.length,
            invalidCount: parsed.invalid.length,
            duplicateCount: parsed.duplicates.length
        };
    } catch (_) {
        return empty;
    }
}

function readIndex() {
    try {
        if (!fs.existsSync(INDEX_FILE)) return { lists: [] };
        const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        return parsed && Array.isArray(parsed.lists) ? parsed : { lists: [] };
    } catch (_) {
        return { lists: [] };
    }
}

function writeIndex(data) {
    fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
    fs.writeFileSync(INDEX_FILE, JSON.stringify({ lists: Array.isArray(data.lists) ? data.lists : [] }, null, 2), 'utf8');
}

function listsDir(kind) {
    const k = sanitizeKind(kind);
    const dir = path.join(STORAGE_ROOT, k);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function filePathFor(entry) {
    const dir = listsDir(entry.kind);
    const stored = path.basename(String(entry.storedName || ''));
    if (!stored) throw new MarketingDbError('List file is missing.', 404);
    const full = path.resolve(dir, stored);
    if (path.dirname(full) !== path.resolve(dir)) {
        throw new MarketingDbError('Invalid list path.', 400);
    }
    return full;
}

function inspectEntry(entry) {
    try {
        const filePath = filePathFor(entry);
        if (!fs.existsSync(filePath)) {
            return inspectListBuffer(Buffer.alloc(0), entry.originalName || '', entry.kind);
        }
        return inspectListBuffer(fs.readFileSync(filePath), entry.originalName || entry.storedName, entry.kind);
    } catch (_) {
        return inspectListBuffer(Buffer.alloc(0), '', entry && entry.kind);
    }
}

function publicList(entry, inspected, opts) {
    const options = opts || {};
    const extra = inspected || inspectEntry(entry);
    const active = entry.active !== false;
    return {
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        description: entry.description || '',
        originalName: entry.originalName,
        ext: entry.ext,
        recordCount: extra.recordCount != null ? extra.recordCount : (entry.recordCount || 0),
        size: entry.size || 0,
        active,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        contacts: options.includeContacts ? (extra.contacts || []) : undefined
    };
}

function listAll(opts) {
    const options = opts || {};
    const onlyActive = options.onlyActive !== false;
    return readIndex().lists
        .filter((entry) => !onlyActive || entry.active !== false)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .map((entry) => publicList(entry, inspectEntry(entry), {
            includeContacts: !!options.includeContacts
        }));
}

function getList(id) {
    const listId = String(id || '').trim();
    if (!listId) return null;
    return readIndex().lists.find((item) => item.id === listId) || null;
}

function saveList({ kind, name, description, originalName, buffer, active }) {
    const k = sanitizeKind(kind);
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new MarketingDbError('The uploaded file is empty.');
    }
    if (buffer.length > MAX_FILE_BYTES) {
        throw new MarketingDbError('File is too large. Maximum size is 20 MB.');
    }

    const ext = extFromName(originalName);
    const index = readIndex();
    if (index.lists.length >= MAX_LISTS) {
        throw new MarketingDbError('Maximum of 50 marketing lists reached. Delete one to upload another.');
    }

    let storeBuffer = buffer;
    if (k === 'messaging') {
        const cleaned = buildCleanPhoneBuffer(buffer, originalName);
        if (!cleaned.validCount) {
            throw new MarketingDbError('No valid international phone numbers found. Use a full number such as +98..., not a short or local format.');
        }
        storeBuffer = cleaned.buffer;
    }

    const id = crypto.randomUUID();
    const storedName = id + ext;
    const fallbackName = path.basename(String(originalName || 'list'), ext) || 'list';
    const inspected = inspectListBuffer(storeBuffer, originalName, k);
    if (!inspected.recordCount) {
        throw new MarketingDbError(k === 'email'
            ? 'No valid email addresses found in this file.'
            : 'No valid phone numbers found in this file.');
    }

    const now = new Date().toISOString();
    const entry = {
        id,
        kind: k,
        name: sanitizeName(name, sanitizeName(fallbackName, 'Marketing list')),
        description: sanitizeDescription(description),
        originalName: path.basename(String(originalName || storedName)).slice(0, 180),
        storedName,
        ext,
        recordCount: inspected.recordCount,
        size: storeBuffer.length,
        active: active !== false,
        createdAt: now,
        updatedAt: now
    };

    fs.writeFileSync(filePathFor(entry), storeBuffer);
    index.lists.push(entry);
    writeIndex(index);
    return publicList(entry, inspected, { includeContacts: true });
}

function updateList(id, patch) {
    const entry = getList(id);
    if (!entry) throw new MarketingDbError('Marketing list not found.', 404);
    if (patch && patch.name != null) entry.name = sanitizeName(patch.name, entry.name);
    if (patch && patch.description != null) entry.description = sanitizeDescription(patch.description);
    if (patch && patch.active != null) entry.active = !!patch.active;
    entry.updatedAt = new Date().toISOString();

    const index = readIndex();
    const idx = index.lists.findIndex((item) => item.id === entry.id);
    if (idx === -1) throw new MarketingDbError('Marketing list not found.', 404);
    index.lists[idx] = entry;
    writeIndex(index);
    return publicList(entry, inspectEntry(entry), { includeContacts: true });
}

function deleteList(id) {
    const entry = getList(id);
    if (!entry) return false;
    try {
        const filePath = filePathFor(entry);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
    const index = readIndex();
    index.lists = index.lists.filter((item) => item.id !== entry.id);
    writeIndex(index);
    return true;
}

function getDownload(id) {
    const entry = getList(id);
    if (!entry || entry.active === false) return null;
    const filePath = filePathFor(entry);
    if (!fs.existsSync(filePath)) {
        throw new MarketingDbError('The file is no longer on disk. Delete this list and upload it again.', 404);
    }
    return {
        entry: publicList(entry, inspectEntry(entry), { includeContacts: true }),
        filePath,
        mime: mimeForExt(entry.ext),
        downloadName: sanitizeName(entry.name, 'marketing-list') + entry.ext
    };
}

function getListBuffer(id) {
    const entry = getList(id);
    if (!entry || entry.active === false) return null;
    const filePath = filePathFor(entry);
    if (!fs.existsSync(filePath)) return null;
    return {
        entry,
        buffer: fs.readFileSync(filePath),
        inspected: inspectEntry(entry)
    };
}

module.exports = {
    listAll,
    getList,
    saveList,
    updateList,
    deleteList,
    getDownload,
    getListBuffer,
    MarketingDbError
};
