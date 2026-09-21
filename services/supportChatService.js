const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'config', 'support-chats.json');
const MAX_MESSAGES = 500;
const MAX_TEXT = 2000;

function readStore() {
    try {
        if (!fs.existsSync(FILE)) return { threads: {} };
        const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        if (!parsed || typeof parsed !== 'object' || !parsed.threads || typeof parsed.threads !== 'object') {
            return { threads: {} };
        }
        return parsed;
    } catch (err) {
        console.error('[Support] Failed to read chats', err.message);
        return { threads: {} };
    }
}

function writeStore(data) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function cleanText(value) {
    const text = String(value || '').replace(/\r\n/g, '\n').trim();
    if (!text) throw new Error('Write a message.');
    if (text.length > MAX_TEXT) throw new Error('Message is too long (max 2000 characters).');
    return text;
}

function emptyThread(userId) {
    return {
        userId: String(userId),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unreadAdmin: 0,
        unreadUser: 0,
        messages: []
    };
}

function ensureThread(store, userId) {
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('User is required.');
    if (!store.threads[uid]) store.threads[uid] = emptyThread(uid);
    return store.threads[uid];
}

function publicMessage(message) {
    return {
        id: message.id,
        from: message.from === 'admin' ? 'admin' : 'user',
        text: message.text,
        at: message.at
    };
}

function publicThread(thread) {
    if (!thread) {
        return {
            userId: null,
            createdAt: null,
            updatedAt: null,
            unreadAdmin: 0,
            unreadUser: 0,
            messages: []
        };
    }
    return {
        userId: thread.userId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        unreadAdmin: thread.unreadAdmin || 0,
        unreadUser: thread.unreadUser || 0,
        messages: (thread.messages || []).map(publicMessage)
    };
}

function lastMessage(thread) {
    const list = (thread && thread.messages) || [];
    return list.length ? publicMessage(list[list.length - 1]) : null;
}

function getUserThread(userId) {
    const store = readStore();
    const thread = store.threads[String(userId || '')];
    if (!thread) return publicThread(emptyThread(userId));
    thread.unreadUser = 0;
    writeStore(store);
    return publicThread(thread);
}

function getAdminThread(userId) {
    const store = readStore();
    const thread = store.threads[String(userId || '')];
    if (!thread) return publicThread(emptyThread(userId));
    thread.unreadAdmin = 0;
    writeStore(store);
    return publicThread(thread);
}

function addUserMessage(userId, text) {
    const store = readStore();
    const thread = ensureThread(store, userId);
    thread.messages.push({
        id: `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        from: 'user',
        text: cleanText(text),
        at: new Date().toISOString()
    });
    if (thread.messages.length > MAX_MESSAGES) thread.messages = thread.messages.slice(-MAX_MESSAGES);
    thread.updatedAt = new Date().toISOString();
    thread.unreadAdmin = (thread.unreadAdmin || 0) + 1;
    thread.unreadUser = 0;
    writeStore(store);
    return publicThread(thread);
}

function addAdminMessage(userId, text) {
    const store = readStore();
    const thread = ensureThread(store, userId);
    thread.messages.push({
        id: `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        from: 'admin',
        text: cleanText(text),
        at: new Date().toISOString()
    });
    if (thread.messages.length > MAX_MESSAGES) thread.messages = thread.messages.slice(-MAX_MESSAGES);
    thread.updatedAt = new Date().toISOString();
    thread.unreadUser = (thread.unreadUser || 0) + 1;
    thread.unreadAdmin = 0;
    writeStore(store);
    return publicThread(thread);
}

function listThreads() {
    const store = readStore();
    return Object.keys(store.threads).map((userId) => {
        const thread = store.threads[userId];
        return {
            userId,
            updatedAt: thread.updatedAt,
            createdAt: thread.createdAt,
            unread: thread.unreadAdmin || 0,
            messageCount: (thread.messages || []).length,
            lastMessage: lastMessage(thread)
        };
    }).filter((row) => row.messageCount > 0)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function unreadForUser(userId) {
    const store = readStore();
    const thread = store.threads[String(userId || '')];
    return thread ? (thread.unreadUser || 0) : 0;
}

function unreadForAdmin() {
    const store = readStore();
    return Object.keys(store.threads).reduce((sum, id) => sum + (store.threads[id].unreadAdmin || 0), 0);
}

function normalizeIds(ids) {
    return Array.from(new Set((Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)));
}

function bulkAction(ids, action) {
    const list = normalizeIds(ids);
    if (!list.length) throw new Error('Select at least one chat.');
    const nextAction = String(action || '').trim();
    const store = readStore();
    let changed = 0;

    if (nextAction === 'delete') {
        list.forEach((userId) => {
            if (store.threads[userId]) {
                delete store.threads[userId];
                changed += 1;
            }
        });
    } else if (nextAction === 'markUnread') {
        list.forEach((userId) => {
            const thread = store.threads[userId];
            if (!thread || !(thread.messages || []).length) return;
            const userMsgs = thread.messages.filter((msg) => msg.from === 'user').length;
            thread.unreadAdmin = Math.max(1, userMsgs);
            thread.updatedAt = new Date().toISOString();
            changed += 1;
        });
    } else {
        throw new Error('Invalid bulk action.');
    }

    if (!changed) throw new Error('No matching chats found.');
    writeStore(store);
    return { action: nextAction, changed, unread: unreadForAdmin() };
}

module.exports = {
    getUserThread,
    getAdminThread,
    addUserMessage,
    addAdminMessage,
    listThreads,
    unreadForUser,
    unreadForAdmin,
    bulkAction
};
