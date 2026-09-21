const fs = require('fs');
const path = require('path');
const tenantStore = require('./tenantStore');

const AVATAR_DIR = path.join(__dirname, '..', 'storage', 'onboarding-avatars');
const FILE = 'onboarding.json';

const OPTIONS = {
    hearAbout: [
        { id: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook' },
        { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
        { id: 'telegram', label: 'Telegram', icon: 'fa-brands fa-telegram' },
        { id: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
        { id: 'google', label: 'Google / Search', icon: 'fa-solid fa-magnifying-glass' },
        { id: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
        { id: 'friend', label: 'Friend or colleague', icon: 'fa-solid fa-user-group' },
        { id: 'partner', label: 'Business partner', icon: 'fa-solid fa-handshake' },
        { id: 'ad', label: 'Advertisement', icon: 'fa-solid fa-bullhorn' },
        { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis' }
    ],
    interests: [
        { id: 'email', label: 'Email Marketing', icon: 'fa-solid fa-envelope' },
        { id: 'whatsapp', label: 'WhatsApp Marketing', icon: 'fa-brands fa-whatsapp' },
        { id: 'telegram', label: 'Telegram Marketing', icon: 'fa-brands fa-telegram' },
        { id: 'campaigns', label: 'Campaign Management', icon: 'fa-solid fa-layer-group' },
        { id: 'automation', label: 'Automation', icon: 'fa-solid fa-robot' },
        { id: 'scheduling', label: 'Scheduling', icon: 'fa-solid fa-calendar-check' },
        { id: 'analytics', label: 'Analytics', icon: 'fa-solid fa-chart-line' },
        { id: 'contacts', label: 'Customer / Contact Management', icon: 'fa-solid fa-address-book' },
        { id: 'growth', label: 'Business Growth', icon: 'fa-solid fa-arrow-trend-up' },
        { id: 'communication', label: 'Communication Management', icon: 'fa-solid fa-comments' },
        { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis' }
    ],
    hobbies: [
        { id: 'technology', label: 'Technology', icon: 'fa-solid fa-microchip' },
        { id: 'business', label: 'Business', icon: 'fa-solid fa-briefcase' },
        { id: 'marketing', label: 'Marketing', icon: 'fa-solid fa-megaphone' },
        { id: 'design', label: 'Design', icon: 'fa-solid fa-palette' },
        { id: 'education', label: 'Education', icon: 'fa-solid fa-graduation-cap' },
        { id: 'sports', label: 'Sports', icon: 'fa-solid fa-futbol' },
        { id: 'travel', label: 'Travel', icon: 'fa-solid fa-plane' },
        { id: 'content', label: 'Content Creation', icon: 'fa-solid fa-clapperboard' },
        { id: 'entrepreneurship', label: 'Entrepreneurship', icon: 'fa-solid fa-lightbulb' },
        { id: 'finance', label: 'Finance', icon: 'fa-solid fa-chart-pie' },
        { id: 'programming', label: 'Programming', icon: 'fa-solid fa-code' },
        { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis' }
    ],
    roles: [
        { id: 'owner', label: 'Business Owner', icon: 'fa-solid fa-building' },
        { id: 'founder', label: 'Founder', icon: 'fa-solid fa-flag' },
        { id: 'ceo', label: 'CEO', icon: 'fa-solid fa-crown' },
        { id: 'marketing', label: 'Marketing Manager', icon: 'fa-solid fa-bullseye' },
        { id: 'sales', label: 'Sales Manager', icon: 'fa-solid fa-handshake' },
        { id: 'freelancer', label: 'Freelancer', icon: 'fa-solid fa-laptop' },
        { id: 'developer', label: 'Developer', icon: 'fa-solid fa-code' },
        { id: 'agency', label: 'Agency', icon: 'fa-solid fa-people-group' },
        { id: 'employee', label: 'Employee', icon: 'fa-solid fa-id-badge' },
        { id: 'student', label: 'Student', icon: 'fa-solid fa-user-graduate' },
        { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis' }
    ],
    goals: [
        { id: 'marketing', label: 'Marketing', icon: 'fa-solid fa-bullhorn' },
        { id: 'communication', label: 'Customer communication', icon: 'fa-solid fa-comments' },
        { id: 'leads', label: 'Lead generation', icon: 'fa-solid fa-filter' },
        { id: 'campaigns', label: 'Campaign management', icon: 'fa-solid fa-layer-group' },
        { id: 'automation', label: 'Automation', icon: 'fa-solid fa-robot' },
        { id: 'notifications', label: 'Business notifications', icon: 'fa-solid fa-bell' },
        { id: 'support', label: 'Customer support', icon: 'fa-solid fa-headset' },
        { id: 'sales', label: 'Sales', icon: 'fa-solid fa-chart-line' },
        { id: 'personal', label: 'Personal projects', icon: 'fa-solid fa-star' },
        { id: 'other', label: 'Other', icon: 'fa-solid fa-ellipsis' }
    ]
};

function emptyRecord(user) {
    return {
        userId: user && user.id,
        businessId: user && (user.businessId || user.id),
        completed: false,
        skipped: false,
        hearAbout: '',
        hearAboutOther: '',
        interests: [],
        hobbies: [],
        hobbyOther: '',
        role: '',
        roleOther: '',
        goals: '',
        goalOther: '',
        company: '',
        jobTitle: '',
        country: '',
        website: '',
        hasAvatar: false,
        avatarMime: '',
        updatedAt: null,
        completedAt: null
    };
}

function clampText(value, max) {
    return String(value || '').trim().slice(0, max);
}

function pickKnown(id, list) {
    const value = String(id || '').trim();
    return list.some((item) => item.id === value) ? value : '';
}

function pickMany(ids, list) {
    const known = new Set(list.map((item) => item.id));
    return (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter((id, index, arr) => id && known.has(id) && arr.indexOf(id) === index)
        .slice(0, list.length);
}

function loadRecord(user) {
    if (!user || !user.id) return emptyRecord(user);
    tenantStore.ensureTenant(user.id, user.businessId || user.id);
    const stored = tenantStore.readJson(user.id, FILE, null);
    if (!stored || typeof stored !== 'object') return emptyRecord(user);
    return { ...emptyRecord(user), ...stored, userId: user.id, businessId: user.businessId || user.id };
}

function saveRecord(user, record) {
    tenantStore.ensureTenant(user.id, user.businessId || user.id);
    const next = {
        ...emptyRecord(user),
        ...record,
        userId: user.id,
        businessId: user.businessId || user.id,
        updatedAt: new Date().toISOString()
    };
    tenantStore.writeJson(user.id, FILE, next);
    return next;
}

function publicRecord(record) {
    if (!record) return null;
    return {
        completed: !!record.completed,
        skipped: !!record.skipped,
        hearAbout: record.hearAbout || '',
        hearAboutOther: record.hearAboutOther || '',
        interests: Array.isArray(record.interests) ? record.interests : [],
        hobbies: Array.isArray(record.hobbies) ? record.hobbies : [],
        hobbyOther: record.hobbyOther || '',
        role: record.role || '',
        roleOther: record.roleOther || '',
        goals: record.goals || '',
        goalOther: record.goalOther || '',
        company: record.company || '',
        jobTitle: record.jobTitle || '',
        country: record.country || '',
        website: record.website || '',
        hasAvatar: !!record.hasAvatar,
        updatedAt: record.updatedAt || null,
        completedAt: record.completedAt || null
    };
}

function applyAnswers(record, body) {
    const next = { ...record };
    if (body.hearAbout !== undefined) next.hearAbout = pickKnown(body.hearAbout, OPTIONS.hearAbout);
    if (body.hearAboutOther !== undefined) next.hearAboutOther = clampText(body.hearAboutOther, 80);
    if (body.interests !== undefined) next.interests = pickMany(body.interests, OPTIONS.interests);
    if (body.hobbies !== undefined) next.hobbies = pickMany(body.hobbies, OPTIONS.hobbies);
    if (body.hobbyOther !== undefined) next.hobbyOther = clampText(body.hobbyOther, 80);
    if (body.role !== undefined) next.role = pickKnown(body.role, OPTIONS.roles);
    if (body.roleOther !== undefined) next.roleOther = clampText(body.roleOther, 80);
    if (body.goals !== undefined) next.goals = pickKnown(body.goals, OPTIONS.goals);
    if (body.goalOther !== undefined) next.goalOther = clampText(body.goalOther, 80);
    if (body.company !== undefined) next.company = clampText(body.company, 120);
    if (body.jobTitle !== undefined) next.jobTitle = clampText(body.jobTitle, 80);
    if (body.country !== undefined) next.country = clampText(body.country, 80);
    if (body.website !== undefined) {
        let site = clampText(body.website, 180);
        if (site && !/^https?:\/\//i.test(site)) site = 'https://' + site;
        if (site && !/^https?:\/\/[^\s]+$/i.test(site)) site = '';
        next.website = site;
    }
    return next;
}

function markCompleted(user, body, skipped) {
    const current = loadRecord(user);
    const next = applyAnswers(current, body || {});
    next.completed = true;
    next.skipped = !!skipped;
    next.completedAt = new Date().toISOString();
    const saved = saveRecord(user, next);
    const authService = require('./authService');
    authService.patchUser(user.id, { onboardingCompleted: true });
    return saved;
}

function saveProgress(user, body) {
    const saved = saveRecord(user, applyAnswers(loadRecord(user), body || {}));
    return saved;
}

function avatarAbsPath(userId, mime) {
    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    return path.join(AVATAR_DIR, String(userId) + ext);
}

function findAvatarPath(userId) {
    const uid = String(userId || '');
    if (!uid) return '';
    return ['.jpg', '.jpeg', '.png', '.webp'].map((ext) => path.join(AVATAR_DIR, uid + ext)).find((file) => {
        try { return fs.existsSync(file); } catch (_) { return false; }
    }) || '';
}

function saveAvatar(user, file) {
    if (!file || !file.buffer || !file.buffer.length) throw new Error('Choose a profile image to upload.');
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const allowed = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    if (!allowed[ext]) throw new Error('Profile image must be a PNG, JPG, or WEBP file.');
    if (file.buffer.length > 2 * 1024 * 1024) throw new Error('Profile image must be 2MB or smaller.');
    if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
    try {
        fs.readdirSync(AVATAR_DIR).forEach((name) => {
            if (name.indexOf(String(user.id)) === 0) {
                try { fs.unlinkSync(path.join(AVATAR_DIR, name)); } catch (_) {}
            }
        });
    } catch (_) {}
    const mime = allowed[ext];
    fs.writeFileSync(avatarAbsPath(user.id, mime), file.buffer);
    const record = loadRecord(user);
    record.hasAvatar = true;
    record.avatarMime = mime;
    saveRecord(user, record);
    return publicRecord(record);
}

function labelOf(id, list, otherText) {
    const item = (list || []).find((row) => row.id === id);
    if (!item) return '';
    if (id === 'other' && otherText) return item.label + ': ' + otherText;
    return item.label;
}

function labelsOf(ids, list, otherText) {
    return (Array.isArray(ids) ? ids : [])
        .map((id) => labelOf(id, list, id === 'other' ? otherText : ''))
        .filter(Boolean);
}

function adminSummary(user) {
    const record = loadRecord(user);
    const photo = findAvatarPath(user && user.id);
    return {
        completed: !!record.completed,
        skipped: !!record.skipped,
        hasAvatar: !!photo || !!record.hasAvatar,
        hearAbout: labelOf(record.hearAbout, OPTIONS.hearAbout, record.hearAboutOther),
        interests: labelsOf(record.interests, OPTIONS.interests),
        hobbies: labelsOf(record.hobbies, OPTIONS.hobbies, record.hobbyOther),
        role: labelOf(record.role, OPTIONS.roles, record.roleOther),
        goals: labelOf(record.goals, OPTIONS.goals, record.goalOther),
        company: record.company || '',
        website: record.website || '',
        completedAt: record.completedAt || null
    };
}

function aggregate() {
    const authService = require('./authService');
    const users = authService.adminListUsers();
    const counts = { completed: 0, skipped: 0, pending: 0, hearAbout: {}, roles: {}, goals: {} };
    users.forEach((user) => {
        const row = loadRecord(user);
        if (row.completed && row.skipped) counts.skipped += 1;
        else if (row.completed) counts.completed += 1;
        else counts.pending += 1;
        if (row.hearAbout) counts.hearAbout[row.hearAbout] = (counts.hearAbout[row.hearAbout] || 0) + 1;
        if (row.role) counts.roles[row.role] = (counts.roles[row.role] || 0) + 1;
        if (row.goals) counts.goals[row.goals] = (counts.goals[row.goals] || 0) + 1;
    });
    return counts;
}

module.exports = {
    OPTIONS,
    loadRecord,
    publicRecord,
    saveProgress,
    markCompleted,
    saveAvatar,
    findAvatarPath,
    adminSummary,
    aggregate
};
