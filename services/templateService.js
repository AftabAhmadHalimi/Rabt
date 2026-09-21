'use strict';

const crypto = require('crypto');
const tenantStore = require('./tenantStore');
const engine = require('../public/email-template-engine.js');
const catalog = require('../data/systemEmailTemplates');
const emailAssetService = require('./emailAssetService');

const STORE_FILE = 'email-templates.json';
const MAX_USER_TEMPLATES = 80;
const MAX_NAME = 120;
const MAX_TEXT = 8000;
const MAX_IMAGE_SRC = 1200000;
const CATEGORY_IDS = new Set(engine.CATEGORIES.map((item) => item.id));

class TemplateError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'TemplateError';
        this.status = status || 400;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
}

function readStore(userId) {
    const parsed = tenantStore.readJson(userId, STORE_FILE, { items: [] });
    const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
    return { items };
}

function writeStore(userId, store) {
    tenantStore.writeJson(userId, STORE_FILE, { items: store.items || [] });
    return store;
}

function sanitizeName(value) {
    const cleaned = String(value || '')
        .replace(/[\r\n<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_NAME);
    if (cleaned.length < 2) throw new TemplateError('Give the template a name.', 400);
    return cleaned;
}

function sanitizeDescription(value) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
}

function sanitizeCategory(value) {
    const id = String(value || '').trim().toLowerCase();
    if (CATEGORY_IDS.has(id)) return id;
    return 'marketing';
}

function sanitizeSubject(value) {
    const cleaned = String(value || '').replace(/[\r\n]/g, ' ').trim().slice(0, 180);
    if (cleaned.length < 3) throw new TemplateError('Subject must be at least 3 characters.', 400);
    return cleaned;
}

function sanitizeImageSrc(value) {
    const src = String(value || '').trim();
    if (!src) return '';
    if (engine.isSafeImageSrc && engine.isSafeImageSrc(src)) return src.slice(0, MAX_IMAGE_SRC);
    return '';
}

function sanitizeTheme(input) {
    const base = engine.defaultTheme();
    const raw = input && typeof input === 'object' ? input : {};
    const hex = (value, fallback) => {
        const text = String(value || '').trim();
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
    };
    const fontIds = new Set((engine.FONTS || []).map((item) => item.id));
    const font = fontIds.has(String(raw.font || '').trim()) ? String(raw.font).trim() : base.font;
    let width = parseInt(raw.width, 10);
    if (!isFinite(width)) width = base.width || 640;
    if (width < 480) width = 480;
    if (width > 720) width = 720;
    return {
        pageBg: hex(raw.pageBg, base.pageBg),
        cardBg: hex(raw.cardBg, base.cardBg),
        accent: hex(raw.accent, base.accent),
        text: hex(raw.text, base.text),
        muted: hex(raw.muted, base.muted),
        linkColor: hex(raw.linkColor, base.linkColor),
        buttonColor: hex(raw.buttonColor, base.buttonColor),
        font,
        width
    };
}

function sanitizeBlock(block) {
    if (!block || typeof block !== 'object') return null;
    const type = String(block.type || '').trim();
    const allowed = engine.BLOCK_TYPES.some((item) => item.type === type);
    if (!allowed) return null;
    const next = engine.newBlock(type);
    Object.keys(next).forEach((key) => {
        if (key === 'type' || key === 'id') return;
        if (block[key] == null) return;
        const value = block[key];
        if (typeof value === 'number') {
            next[key] = value;
            return;
        }
        if (key === 'src') {
            next.src = sanitizeImageSrc(value);
            return;
        }
        next[key] = String(value).slice(0, MAX_TEXT);
    });
    next.id = String(block.id || next.id).slice(0, 64);
    [
        'padTop', 'padBottom', 'padLeft', 'padRight', 'font', 'weight', 'lineHeight',
        'radius', 'btnPad', 'width', 'count', 'midHeading', 'midText', 'html'
    ].forEach((key) => {
        if (block[key] == null || block[key] === '') return;
        if (typeof block[key] === 'number') next[key] = block[key];
        else next[key] = String(block[key]).slice(0, MAX_TEXT);
    });
    if (next.html) next.html = engine.sanitizeInlineHtml(next.html);
    if (next.href) next.href = engine.sanitizeUrl(next.href);
    if (next.src) next.src = sanitizeImageSrc(next.src);
    ['website', 'linkedin', 'instagram', 'facebook'].forEach((key) => {
        if (next[key]) next[key] = engine.sanitizeUrl(next[key]);
    });
    return next;
}

function sanitizeBlocks(blocks) {
    const list = Array.isArray(blocks) ? blocks : [];
    const cleaned = list.map(sanitizeBlock).filter(Boolean).slice(0, 40);
    if (!cleaned.length) throw new TemplateError('Add at least one content block.', 400);
    return cleaned;
}

function persistBlockImages(userId, blocks) {
    return (blocks || []).map((block) => {
        if (!block || !block.src) return block;
        if (String(block.src).indexOf('data:image/') !== 0) return block;
        try {
            const asset = emailAssetService.saveDataUri(userId, block.src);
            if (asset) block.src = asset.path;
        } catch (_) {}
        return block;
    });
}

function toUserRecord(item, userId) {
    const theme = sanitizeTheme(item.theme);
    const blocks = persistBlockImages(userId, sanitizeBlocks(item.blocks));
    const record = {
        id: item.id,
        name: sanitizeName(item.name),
        description: sanitizeDescription(item.description),
        category: sanitizeCategory(item.category),
        icon: 'fa-solid fa-file-lines',
        accent: theme.accent,
        subject: sanitizeSubject(item.subject),
        preheader: sanitizeDescription(item.preheader || item.description),
        system: false,
        ownerId: userId,
        copiedFrom: item.copiedFrom || null,
        theme,
        blocks,
        createdAt: item.createdAt || nowIso(),
        updatedAt: nowIso()
    };
    record.html = engine.compile(record);
    record.previewHeading = engine.firstHeading(record.blocks);
    return record;
}

function summarize(item) {
    return {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        icon: item.icon,
        accent: item.accent,
        subject: item.subject,
        system: !!item.system,
        copiedFrom: item.copiedFrom || null,
        previewHeading: item.previewHeading || engine.firstHeading(item.blocks),
        htmlPreview: engine.compile(item, { preview: true }),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
}

function publicRecord(item) {
    const html = item.html || engine.compile(item);
    const htmlPreview = item.htmlPreview || engine.compile(item, { preview: true });
    return Object.assign({}, item, {
        html,
        htmlPreview,
        previewHeading: item.previewHeading || engine.firstHeading(item.blocks)
    });
}

function listTemplates(userId, query) {
    const q = String((query && query.q) || '').trim().toLowerCase();
    const category = String((query && query.category) || '').trim().toLowerCase();
    const source = String((query && query.source) || 'all').trim().toLowerCase();
    const mine = readStore(userId).items.map(summarize);
    const system = catalog.listSystemTemplates();
    let rows = [];
    if (source === 'mine') rows = mine;
    else if (source === 'system') rows = system;
    else rows = system.concat(mine);
    if (category && category !== 'all' && CATEGORY_IDS.has(category)) {
        rows = rows.filter((item) => item.category === category);
    }
    if (q) {
        rows = rows.filter((item) => {
            const blob = (item.name + ' ' + item.description + ' ' + item.subject + ' ' + item.category).toLowerCase();
            return blob.indexOf(q) !== -1;
        });
    }
    return {
        categories: engine.CATEGORIES,
        systemCount: system.length,
        mineCount: mine.length,
        items: rows
    };
}

function getTemplate(userId, id) {
    const key = String(id || '');
    const system = catalog.getSystemTemplate(key);
    if (system) return publicRecord(system);
    const found = readStore(userId).items.find((item) => item.id === key);
    if (!found) throw new TemplateError('Template not found.', 404);
    return publicRecord(found);
}

function createTemplate(userId, payload) {
    const store = readStore(userId);
    if (store.items.length >= MAX_USER_TEMPLATES) {
        throw new TemplateError('You have reached the template limit for this workspace.', 400);
    }
    const record = toUserRecord(Object.assign({}, payload, { id: newId(), createdAt: nowIso() }), userId);
    store.items.unshift(record);
    writeStore(userId, store);
    return publicRecord(record);
}

function copyTemplate(userId, id, overrides) {
    const source = getTemplate(userId, id);
    const name = (overrides && overrides.name) || (source.name + ' copy');
    return createTemplate(userId, {
        name,
        description: source.description,
        category: source.category,
        subject: source.subject,
        preheader: source.preheader,
        theme: source.theme,
        blocks: engine.cloneBlocks(source.blocks),
        copiedFrom: source.system ? source.id : (source.copiedFrom || source.id)
    });
}

function updateTemplate(userId, id, payload) {
    const key = String(id || '');
    const system = catalog.getSystemTemplate(key);
    if (system) {
        return createTemplate(userId, {
            name: (payload && payload.name) || system.name,
            description: (payload && payload.description) || system.description,
            category: (payload && payload.category) || system.category,
            subject: (payload && payload.subject) || system.subject,
            preheader: (payload && payload.preheader) || system.preheader,
            theme: (payload && payload.theme) || system.theme,
            blocks: (payload && payload.blocks) || engine.cloneBlocks(system.blocks),
            copiedFrom: system.id
        });
    }
    const store = readStore(userId);
    const index = store.items.findIndex((item) => item.id === key);
    if (index < 0) throw new TemplateError('Template not found.', 404);
    const current = store.items[index];
    const merged = Object.assign({}, current, payload || {}, {
        id: current.id,
        createdAt: current.createdAt,
        copiedFrom: current.copiedFrom || null
    });
    const record = toUserRecord(merged, userId);
    store.items[index] = record;
    writeStore(userId, store);
    return publicRecord(record);
}

function deleteTemplate(userId, id) {
    const key = String(id || '');
    if (catalog.getSystemTemplate(key)) {
        throw new TemplateError('Ready-made templates cannot be deleted.', 403);
    }
    const store = readStore(userId);
    const next = store.items.filter((item) => item.id !== key);
    if (next.length === store.items.length) throw new TemplateError('Template not found.', 404);
    writeStore(userId, { items: next });
    return { ok: true, id: key };
}

function compilePreview(payload) {
    const theme = sanitizeTheme(payload && payload.theme);
    const blocks = sanitizeBlocks(payload && payload.blocks);
    const subject = String((payload && payload.subject) || 'Preview').slice(0, 180);
    const preheader = sanitizeDescription((payload && payload.preheader) || '');
    return engine.compile({ subject, preheader, theme, blocks }, { preview: true });
}

module.exports = {
    TemplateError,
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    copyTemplate,
    compilePreview,
    CATEGORIES: engine.CATEGORIES
};
