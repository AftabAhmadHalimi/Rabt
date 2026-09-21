const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'config', 'contact-messages.json');
const MAX_MESSAGES = 2000;
const MAX_NAME = 120;
const MAX_EMAIL = 180;
const MAX_SUBJECT = 40;
const MAX_TEXT = 4000;
const MAX_REPLY = 4000;

const SUBJECT_LABELS = {
    general: 'General Inquiry',
    support: 'Technical Support',
    sales: 'Sales Question',
    partnership: 'Partnership Opportunity',
    feedback: 'Feedback'
};

function readStore() {
    try {
        if (!fs.existsSync(FILE)) return { messages: [] };
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
            return { messages: [] };
        }
        return parsed;
    } catch (err) {
        console.error('[Contact] Failed to read messages', err.message);
        return { messages: [] };
    }
}

function writeStore(data) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function cleanName(value) {
    const text = String(value || '').trim().slice(0, MAX_NAME);
    if (text.length < 2) throw new Error('Enter your name.');
    return text;
}

function cleanEmail(value) {
    const text = String(value || '').trim().toLowerCase().slice(0, MAX_EMAIL);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('Enter a valid email address.');
    return text;
}

function cleanSubject(value) {
    const key = String(value || '').trim().toLowerCase().slice(0, MAX_SUBJECT);
    if (!SUBJECT_LABELS[key]) throw new Error('Choose a subject.');
    return key;
}

function cleanMessage(value) {
    const text = String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT);
    if (text.length < 10) throw new Error('Write a message with at least 10 characters.');
    return text;
}

function cleanReply(value) {
    const text = String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_REPLY);
    if (!text) throw new Error('Write a reply.');
    return text;
}

function publicReply(reply) {
    return {
        id: reply.id,
        from: 'admin',
        text: reply.text,
        at: reply.at,
        by: reply.by || 'super admin'
    };
}

function publicMessage(row, includeReplies) {
    if (!row) return null;
    const out = {
        id: row.id,
        name: row.name,
        email: row.email,
        subject: row.subject,
        subjectLabel: row.subjectLabel || SUBJECT_LABELS[row.subject] || row.subject,
        message: row.message,
        status: row.status || 'new',
        submittedAt: row.submittedAt,
        readAt: row.readAt || null,
        updatedAt: row.updatedAt || row.submittedAt,
        unread: !!row.unreadAdmin,
        replyCount: (row.replies || []).length
    };
    if (includeReplies) {
        out.replies = (row.replies || []).map(publicReply);
    }
    return out;
}

function findMessage(store, id) {
    return store.messages.find((row) => row && row.id === String(id || '').trim()) || null;
}

function submitMessage(body) {
    const store = readStore();
    const now = new Date().toISOString();
    const subject = cleanSubject(body && body.subject);
    const row = {
        id: 'cm-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
        name: cleanName(body && body.name),
        email: cleanEmail(body && body.email),
        subject,
        subjectLabel: SUBJECT_LABELS[subject],
        message: cleanMessage(body && body.message),
        status: 'new',
        submittedAt: now,
        readAt: null,
        updatedAt: now,
        unreadAdmin: true,
        replies: []
    };
    store.messages.unshift(row);
    if (store.messages.length > MAX_MESSAGES) store.messages = store.messages.slice(0, MAX_MESSAGES);
    writeStore(store);
    return publicMessage(row, false);
}

function listMessages(options) {
    const opts = options || {};
    const q = String(opts.q || '').trim().toLowerCase();
    const status = String(opts.status || 'all').trim().toLowerCase();
    return readStore().messages
        .filter((row) => {
            if (!row) return false;
            if (status !== 'all' && String(row.status || 'new') !== status) return false;
            if (!q) return true;
            return String(row.name || '').toLowerCase().includes(q)
                || String(row.email || '').toLowerCase().includes(q)
                || String(row.subjectLabel || '').toLowerCase().includes(q)
                || String(row.message || '').toLowerCase().includes(q);
        })
        .map((row) => publicMessage(row, false))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function getMessage(id, markRead) {
    const store = readStore();
    const row = findMessage(store, id);
    if (!row) throw new Error('Contact message not found.');
    if (markRead && row.unreadAdmin) {
        row.unreadAdmin = false;
        row.readAt = row.readAt || new Date().toISOString();
        if (row.status === 'new') row.status = 'read';
        row.updatedAt = new Date().toISOString();
        writeStore(store);
    }
    return publicMessage(row, true);
}

function addReply(id, text, adminEmail) {
    const store = readStore();
    const row = findMessage(store, id);
    if (!row) throw new Error('Contact message not found.');
    const reply = {
        id: 'cmr-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
        from: 'admin',
        text: cleanReply(text),
        at: new Date().toISOString(),
        by: String(adminEmail || 'super admin').trim().slice(0, 180) || 'super admin'
    };
    row.replies = row.replies || [];
    row.replies.push(reply);
    row.status = 'replied';
    row.unreadAdmin = false;
    row.readAt = row.readAt || new Date().toISOString();
    row.updatedAt = reply.at;
    writeStore(store);
    return publicMessage(row, true);
}

function setStatus(id, status) {
    const allowed = { new: true, read: true, replied: true, archived: true };
    const next = String(status || '').trim().toLowerCase();
    if (!allowed[next]) throw new Error('Invalid status.');
    const store = readStore();
    const row = findMessage(store, id);
    if (!row) throw new Error('Contact message not found.');
    row.status = next;
    if (next !== 'new') row.unreadAdmin = false;
    if ((next === 'read' || next === 'replied' || next === 'archived') && !row.readAt) {
        row.readAt = new Date().toISOString();
    }
    row.updatedAt = new Date().toISOString();
    writeStore(store);
    return publicMessage(row, true);
}

function removeMessage(id) {
    const store = readStore();
    const before = store.messages.length;
    store.messages = store.messages.filter((row) => row && row.id !== String(id || '').trim());
    if (store.messages.length === before) throw new Error('Contact message not found.');
    writeStore(store);
    return { removed: true };
}

function unreadCount() {
    return readStore().messages.filter((row) => row && row.unreadAdmin).length;
}

function normalizeIds(ids) {
    return Array.from(new Set((Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)));
}

function bulkAction(ids, action) {
    const list = normalizeIds(ids);
    if (!list.length) throw new Error('Select at least one message.');
    const nextAction = String(action || '').trim();
    const store = readStore();
    let changed = 0;

    if (nextAction === 'delete') {
        const before = store.messages.length;
        store.messages = store.messages.filter((row) => row && !list.includes(row.id));
        changed = before - store.messages.length;
        if (!changed) throw new Error('No matching messages found.');
        writeStore(store);
        return { action: nextAction, changed, unread: unreadCount() };
    }

    list.forEach((id) => {
        const row = findMessage(store, id);
        if (!row) return;
        if (nextAction === 'markUnread') {
            row.unreadAdmin = true;
            row.status = 'new';
        } else if (nextAction === 'markRead') {
            row.unreadAdmin = false;
            if (row.status === 'new') row.status = 'read';
            row.readAt = row.readAt || new Date().toISOString();
        } else if (nextAction === 'archive') {
            row.status = 'archived';
            row.unreadAdmin = false;
            row.readAt = row.readAt || new Date().toISOString();
        } else {
            return;
        }
        row.updatedAt = new Date().toISOString();
        changed += 1;
    });

    if (!changed) throw new Error('Invalid action or no matching messages found.');
    writeStore(store);
    return { action: nextAction, changed, unread: unreadCount() };
}

module.exports = {
    SUBJECT_LABELS,
    submitMessage,
    listMessages,
    getMessage,
    addReply,
    setStatus,
    removeMessage,
    unreadCount,
    bulkAction
};
