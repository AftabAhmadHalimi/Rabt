const fs = require('fs');
const path = require('path');

const CMS_FILE = path.join(__dirname, '..', 'config', 'cms.json');
const I18N_FILE = path.join(__dirname, '..', 'public', 'i18n.js');
const TERMS_FILE = path.join(__dirname, '..', 'public', 'terms.html');
const PRIVACY_FILE = path.join(__dirname, '..', 'public', 'privacy.html');
const LANGS = ['en', 'ar', 'fa', 'ps'];

const GROUPS = [
    { id: 'home', label: 'Home page' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'about', label: 'About' },
    { id: 'contact', label: 'Contact' }
];

const ADMIN_GROUP_IDS = new Set(GROUPS.map((g) => g.id));

const FIELDS = [
    { key: 'brand.productName', group: 'brand', label: 'Product name', type: 'text', def: 'Rabط' },
    { key: 'brand.tagline', group: 'brand', label: 'Navbar tagline', type: 'text', def: 'One platform', i18n: 'nav.tagline' },
    { key: 'brand.guestHint', group: 'brand', label: 'Guest sidebar hint', type: 'textarea', def: 'Sign in to use Email, WhatsApp, and Telegram in one workspace.', i18n: 'nav.guestHint' },

    { key: 'home.kicker', group: 'home', label: 'Hero kicker', type: 'text', def: 'Premium multi-channel SaaS' },
    { key: 'home.headline', group: 'home', label: 'Hero headline', type: 'textarea', def: 'Rabط is your complete Email, WhatsApp, and Telegram marketing platform' },
    { key: 'home.lead', group: 'home', label: 'Hero lead', type: 'textarea', def: 'Run email marketing, WhatsApp messaging, Telegram messaging, campaign management, contact management, scheduling, automation, analytics, and a live KPI dashboard — all from one secure workspace.' },
    { key: 'home.sub', group: 'home', label: 'Hero subtext', type: 'textarea', def: 'Each account gets an isolated workspace: your own SMTP, WhatsApp session, Telegram session, contacts, campaigns, schedules, automations, analytics, and KPIs. Sign up, verify your email, choose a plan, and start after payment is approved.' },
    { key: 'home.ctaSignup', group: 'home', label: 'Hero Sign up button', type: 'text', def: 'Get Started / Sign Up' },
    { key: 'home.ctaSignin', group: 'home', label: 'Hero Sign in button', type: 'text', def: 'Sign in' },
    { key: 'home.intro', group: 'home', label: 'Intro paragraph', type: 'textarea', def: 'Rabط (ربط) means connection. We connect your mailbox, WhatsApp, and Telegram into one workspace so you can launch promotions, reminders, and announcements faster — with live logs and a KPI Overview that shows what actually got delivered, opened, clicked, and read.' },
    { key: 'home.whyTitle', group: 'home', label: 'Why section title', type: 'text', def: 'Why teams choose Rabط' },
    { key: 'home.why1Title', group: 'home', label: 'Why card 1 title', type: 'text', def: 'Three channels, one login' },
    { key: 'home.why1Body', group: 'home', label: 'Why card 1 text', type: 'textarea', def: 'Email, WhatsApp, and Telegram sit side by side. Import a list, write the message, and send. No extra apps, no copy-paste chaos.' },
    { key: 'home.why2Title', group: 'home', label: 'Why card 2 title', type: 'text', def: 'Real KPIs, not guesses' },
    { key: 'home.why2Body', group: 'home', label: 'Why card 2 text', type: 'textarea', def: 'See sent vs failed, email open and click rate, WhatsApp delivery and read receipts, and Telegram delivery — filtered by day, week, month, year, or a custom date.' },
    { key: 'home.why3Title', group: 'home', label: 'Why card 3 title', type: 'text', def: 'Send now or schedule later' },
    { key: 'home.why3Body', group: 'home', label: 'Why card 3 text', type: 'textarea', def: 'Run a campaign immediately or pick a time. Repeat daily if you need. Watch the live log while it runs so you always know what happened.' },
    { key: 'pricing.title', group: 'pricing', label: 'Page title', type: 'text', def: 'Simple, Transparent Pricing' },
    { key: 'pricing.lead', group: 'pricing', label: 'Intro paragraph', type: 'textarea', def: 'Choose the package that fits your needs. Every plan includes your own isolated workspace with Email, WhatsApp, and Telegram marketing tools.' },
    { key: 'pricing.faqTitle', group: 'pricing', label: 'FAQ section title', type: 'text', def: 'Frequently Asked Questions' },
    { key: 'pricing.faq1Title', group: 'pricing', label: 'FAQ 1 question', type: 'text', def: 'How do I buy a plan?' },
    { key: 'pricing.faq1Body', group: 'pricing', label: 'FAQ 1 answer', type: 'textarea', def: 'Select a package, create an account (or sign in), send the exact amount using the payment details shown, then upload your receipt for admin verification.' },
    { key: 'pricing.faq2Title', group: 'pricing', label: 'FAQ 2 question', type: 'text', def: 'Can I renew or switch plans later?' },
    { key: 'pricing.faq2Body', group: 'pricing', label: 'FAQ 2 answer', type: 'textarea', def: 'Yes. You can submit a new payment request to renew your subscription or switch between the 1 Month and 3 Months packages at any time.' },
    { key: 'pricing.faq3Title', group: 'pricing', label: 'FAQ 3 question', type: 'text', def: 'What payment methods do you accept?' },
    { key: 'pricing.faq3Body', group: 'pricing', label: 'FAQ 3 answer', type: 'textarea', def: 'Rabط uses manual payment verification. Send the package amount to the account or QR code shown on the payment page, then upload a clear photo or PDF of your receipt.' },
    { key: 'pricing.faq4Title', group: 'pricing', label: 'FAQ 4 question', type: 'text', def: 'When does my workspace unlock?' },
    { key: 'pricing.faq4Body', group: 'pricing', label: 'FAQ 4 answer', type: 'textarea', def: 'After you submit payment, a Super Admin reviews your receipt. Once approved, your subscription activates and full platform access is restored immediately.' },

    { key: 'about.title', group: 'about', label: 'Page title', type: 'text', def: 'About Rabط' },
    { key: 'about.lead', group: 'about', label: 'Intro paragraph', type: 'textarea', def: "We're on a mission to simplify multi-channel marketing for businesses of all sizes." },
    { key: 'about.missionTitle', group: 'about', label: 'Mission title', type: 'text', def: 'Our Mission' },
    { key: 'about.missionBody1', group: 'about', label: 'Mission paragraph 1', type: 'textarea', def: 'Rabط (ربط) means "connection" in Dari/Persian. We believe that connecting with your audience should be simple, powerful, and accessible. Our platform brings together email, WhatsApp, and Telegram into one unified workspace, eliminating the complexity of managing multiple tools and platforms.' },
    { key: 'about.missionBody2', group: 'about', label: 'Mission paragraph 2', type: 'textarea', def: "Founded in 2025, we've helped thousands of businesses streamline their marketing efforts, improve engagement rates, and build stronger relationships with their customers across multiple channels." },
    { key: 'about.storyTitle', group: 'about', label: 'Story title', type: 'text', def: 'Our Story' },
    { key: 'about.storyBody1', group: 'about', label: 'Story paragraph 1', type: 'textarea', def: 'Rabط was born from a simple observation: businesses were struggling to manage their marketing across multiple platforms. Email marketing tools, WhatsApp business APIs, Telegram bots – each required separate logins, separate interfaces, and separate strategies.' },
    { key: 'about.storyBody2', group: 'about', label: 'Story paragraph 2', type: 'textarea', def: 'We set out to change that. Our team of marketing professionals and software engineers built Rabط to be the first truly unified multi-channel marketing platform. One login, one interface, one powerful solution for reaching your audience wherever they are.' },
    { key: 'about.valuesTitle', group: 'about', label: 'Values section title', type: 'text', def: 'Our Values' },
    { key: 'about.value1Title', group: 'about', label: 'Value 1 title', type: 'text', def: 'Innovation' },
    { key: 'about.value1Body', group: 'about', label: 'Value 1 text', type: 'textarea', def: 'We constantly push boundaries to deliver cutting-edge marketing solutions.' },
    { key: 'about.value2Title', group: 'about', label: 'Value 2 title', type: 'text', def: 'Customer Success' },
    { key: 'about.value2Body', group: 'about', label: 'Value 2 text', type: 'textarea', def: "Your success is our success. We're committed to helping you achieve your goals." },
    { key: 'about.value3Title', group: 'about', label: 'Value 3 title', type: 'text', def: 'Security' },
    { key: 'about.value3Body', group: 'about', label: 'Value 3 text', type: 'textarea', def: 'We take data protection seriously and implement industry-leading security measures.' },
    { key: 'about.value4Title', group: 'about', label: 'Value 4 title', type: 'text', def: 'Community' },
    { key: 'about.value4Body', group: 'about', label: 'Value 4 text', type: 'textarea', def: 'We believe in building a supportive community of marketers and businesses.' },
    { key: 'about.ctaTitle', group: 'about', label: 'Bottom CTA title', type: 'text', def: 'Ready to Transform Your Marketing?' },
    { key: 'about.ctaBody', group: 'about', label: 'Bottom CTA text', type: 'textarea', def: 'Join thousands of businesses already using Rabط to connect with their audience across multiple channels.' },
    { key: 'about.ctaButton', group: 'about', label: 'Bottom CTA button', type: 'text', def: 'Get Started Today' },

    { key: 'contact.title', group: 'contact', label: 'Page title', type: 'text', def: 'Contact Us' },
    { key: 'contact.lead', group: 'contact', label: 'Intro paragraph', type: 'textarea', def: "Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible." },
    { key: 'contact.touchTitle', group: 'contact', label: 'Get in touch title', type: 'text', def: 'Get in Touch' },
    { key: 'contact.formTitle', group: 'contact', label: 'Form title', type: 'text', def: 'Send us a Message' },
    { key: 'contact.faqTitle', group: 'contact', label: 'FAQ section title', type: 'text', def: 'Frequently Asked Questions' },
    { key: 'contact.faq1Title', group: 'contact', label: 'FAQ 1 question', type: 'text', def: 'How quickly do you respond to inquiries?' },
    { key: 'contact.faq1Body', group: 'contact', label: 'FAQ 1 answer', type: 'textarea', def: 'We typically respond to all inquiries within 24 hours during business days. For urgent matters, please call our support line.' },
    { key: 'contact.faq2Title', group: 'contact', label: 'FAQ 2 question', type: 'text', def: 'Do you offer phone support?' },
    { key: 'contact.faq2Body', group: 'contact', label: 'FAQ 2 answer', type: 'textarea', def: 'Yes, we offer phone support during business hours for all paid plans. Enterprise customers have access to 24/7 phone support.' },
    { key: 'contact.faq3Title', group: 'contact', label: 'FAQ 3 question', type: 'text', def: 'Can I schedule a demo?' },
    { key: 'contact.faq3Body', group: 'contact', label: 'FAQ 3 answer', type: 'textarea', def: "Absolutely! Contact us to schedule a personalized demo of our platform. We'll show you how Rabط can transform your marketing." },
    { key: 'contact.faq4Title', group: 'contact', label: 'FAQ 4 question', type: 'text', def: "What's your refund policy?" },
    { key: 'contact.faq4Body', group: 'contact', label: 'FAQ 4 answer', type: 'textarea', def: "We offer a 14-day money-back guarantee for all new subscriptions. If you're not satisfied, contact us within 14 days for a full refund." },

    { key: 'auth.loginTitle', group: 'auth', label: 'Sign in title', type: 'text', def: 'Sign in', i18n: 'login.title' },
    { key: 'auth.loginHint', group: 'auth', label: 'Sign in hint', type: 'textarea', def: 'Sign in to the Rabط workspace — Email, WhatsApp, Telegram, and scheduling in one place.', i18n: 'login.hint' },
    { key: 'auth.loginSubmit', group: 'auth', label: 'Sign in button', type: 'text', def: 'Sign in', i18n: 'login.submit' },
    { key: 'auth.signupTitle', group: 'auth', label: 'Sign up title', type: 'text', def: 'Sign up', i18n: 'signup.title' },
    { key: 'auth.signupHint', group: 'auth', label: 'Sign up hint', type: 'textarea', def: 'Create an account with your email. We will send a 6-digit code, then you can sign in to your own workspace.', i18n: 'signup.hint' },
    { key: 'auth.signupSubmit', group: 'auth', label: 'Sign up button', type: 'text', def: 'Create account', i18n: 'signup.submit' },
    { key: 'auth.verifyTitle', group: 'auth', label: 'Verify title', type: 'text', def: 'Enter code', i18n: 'verify.title' },
    { key: 'auth.verifyHint', group: 'auth', label: 'Verify hint', type: 'textarea', def: 'We emailed a 6-digit code to your address. Enter it here to verify your account. The code expires in 10 minutes.', i18n: 'verify.hint' },

    { key: 'support.title', group: 'support', label: 'Support title', type: 'text', def: 'Open support chat', i18n: 'support.title' },
    { key: 'support.lead', group: 'support', label: 'Support intro', type: 'textarea', def: 'Message the Rabط platform team. Super admin will reply here.', i18n: 'support.lead' },
    { key: 'support.empty', group: 'support', label: 'Empty chat text', type: 'textarea', def: 'Start a conversation with the platform team. Ask about your account, channels, or how to use Rabط.', i18n: 'support.empty' },

    { key: 'legal.termsTitle', group: 'legal', label: 'Terms page title', type: 'text', def: 'Terms of Service', i18n: 'nav.terms' },
    { key: 'legal.termsLead', group: 'legal', label: 'Terms intro', type: 'textarea', def: 'Read the full terms of service. These terms cover accounts, manual plan payment (1 Month / 3 Months), subscription expiration and renewal, campaigns, templates, and support on this Rabط platform.', i18n: 'legal.termsLead' },
    { key: 'legal.termsUpdated', group: 'legal', label: 'Terms dates line', type: 'text', def: 'Effective date: 18 September 2026 · Last updated: 18 September 2026' },
    { key: 'legal.termsHtml', group: 'legal', label: 'Terms body (HTML). Leave blank to keep the built-in page.', type: 'html', def: '' },
    { key: 'legal.privacyTitle', group: 'legal', label: 'Privacy page title', type: 'text', def: 'Privacy Policy', i18n: 'nav.privacyPolicy' },
    { key: 'legal.privacyLead', group: 'legal', label: 'Privacy intro', type: 'textarea', def: 'Read the full privacy policy. This page explains what Rabط collects for accounts, manual payments, subscriptions, campaigns, templates, and support — and how that information is used and stored.', i18n: 'legal.privacyLead' },
    { key: 'legal.privacyUpdated', group: 'legal', label: 'Privacy dates line', type: 'text', def: 'Effective date: 18 September 2026 · Last updated: 18 September 2026' },
    { key: 'legal.privacyHtml', group: 'legal', label: 'Privacy body (HTML). Leave blank to keep the built-in page.', type: 'html', def: '' },

    { key: 'email.otpSubject', group: 'email', label: 'OTP email subject', type: 'text', def: '{{code}} is your {{brand}} verification code', hint: 'Tokens: {{code}} {{brand}} {{name}} {{minutes}}' },
    { key: 'email.otpIntro', group: 'email', label: 'OTP email intro', type: 'textarea', def: 'Use this code to finish creating your {{brand}} account. Your workspace stays private to this login.' },
    { key: 'email.otpExpire', group: 'email', label: 'OTP email expiry line', type: 'textarea', def: 'Enter this 6-digit code on the verification page. It expires in {{minutes}} minutes. Do not share it with anyone.' },
    { key: 'email.broadcastFooter', group: 'email', label: 'Broadcast email footer', type: 'textarea', def: 'This message was sent by the {{brand}} platform team.' }
];

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function parseLangBlock(src, lang) {
    const marker = '\n        ' + lang + ': {';
    const start = src.indexOf(marker);
    if (start < 0) return {};
    const from = start + marker.length;
    const end = src.indexOf('\n        }', from);
    const block = end > from ? src.slice(from, end) : '';
    const out = {};
    const re = /'((?:\\'|[^'])*)'\s*:\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")/g;
    let match;
    while ((match = re.exec(block))) {
        const key = match[1].replace(/\\'/g, "'");
        const raw = match[2] != null ? match[2] : match[3];
        out[key] = String(raw || '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
    return out;
}

let i18nCache = null;
function builtinI18n() {
    if (i18nCache) return i18nCache;
    try {
        const src = fs.readFileSync(I18N_FILE, 'utf8');
        i18nCache = {};
        LANGS.forEach((lang) => {
            i18nCache[lang] = parseLangBlock(src, lang);
        });
    } catch (_) {
        i18nCache = { en: {}, ar: {}, fa: {}, ps: {} };
    }
    return i18nCache;
}

function extractLegalBody(file, id) {
    try {
        const html = fs.readFileSync(file, 'utf8');
        const re = new RegExp('id="' + id + '"\\s*>([\\s\\S]*?)</div>\\s*</article>');
        const match = html.match(re);
        return match && match[1] ? match[1].trim() : '';
    } catch (_) {
        return '';
    }
}

function legalDefaults() {
    return {
        'legal.termsHtml': extractLegalBody(TERMS_FILE, 'cmsLegalBody'),
        'legal.privacyHtml': extractLegalBody(PRIVACY_FILE, 'cmsPrivacyBody')
    };
}

function emptyStore() {
    return { fields: {}, strings: { en: {}, ar: {}, fa: {}, ps: {} }, updatedAt: null };
}

function loadStore() {
    const stored = readJson(CMS_FILE, {});
    const next = emptyStore();
    if (stored.fields && typeof stored.fields === 'object') next.fields = stored.fields;
    LANGS.forEach((lang) => {
        const bag = stored.strings && stored.strings[lang];
        next.strings[lang] = bag && typeof bag === 'object' ? bag : {};
    });
    next.updatedAt = stored.updatedAt || null;
    return next;
}

function fieldByKey(key) {
    return FIELDS.find((f) => f.key === key) || null;
}

function clip(value, type) {
    const text = String(value == null ? '' : value);
    if (type === 'html') return text.slice(0, 120000);
    if (type === 'textarea') return text.slice(0, 8000);
    return text.slice(0, 400);
}

function sanitizeHtml(input) {
    let html = String(input || '');
    html = html.replace(/<(script|style|iframe|object|embed|form|link|meta|svg|math)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/<(script|style|iframe|object|embed|form|link|meta|svg|math)[^>]*\/?>/gi, '');
    html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    html = html.replace(/javascript:/gi, '');
    html = html.replace(/<(?!\/?(p|br|div|span|b|strong|i|em|u|a|ul|ol|li|h1|h2|h3|h4|blockquote)\b)[^>]+>/gi, '');
    html = html.replace(/\shref\s*=\s*(["'])([^"']*)\1/gi, (_, q, href) => {
        const clean = String(href || '').trim();
        if (/^(https?:|mailto:|#|\/)/i.test(clean)) return ` href=${q}${clean}${q}`;
        return '';
    });
    return html;
}

function resolvedField(store, field) {
    const raw = store.fields[field.key];
    if (raw == null || String(raw).trim() === '') return field.def;
    return String(raw);
}

function getPublic() {
    const store = loadStore();
    const pages = {};
    const brand = {
        productName: 'Rabط',
        tagline: 'One platform'
    };
    FIELDS.forEach((field) => {
        const has = Object.prototype.hasOwnProperty.call(store.fields, field.key) &&
            String(store.fields[field.key] || '').trim() !== '';
        const value = has ? String(store.fields[field.key]) : field.def;
        if (field.key === 'brand.productName') brand.productName = value || field.def;
        if (field.key === 'brand.tagline') brand.tagline = value || field.def;
        if (has) pages[field.key] = field.type === 'html' ? sanitizeHtml(value) : value;
    });
    const strings = {};
    LANGS.forEach((lang) => {
        const bag = store.strings[lang] || {};
        const clean = {};
        Object.keys(bag).forEach((key) => {
            if (String(bag[key] || '').trim()) clean[key] = String(bag[key]);
        });
        if (Object.keys(clean).length) strings[lang] = clean;
    });
    FIELDS.forEach((field) => {
        if (!field.i18n) return;
        const has = Object.prototype.hasOwnProperty.call(store.fields, field.key) &&
            String(store.fields[field.key] || '').trim() !== '';
        if (has) {
            strings.en = strings.en || {};
            strings.en[field.i18n] = String(store.fields[field.key]);
        }
    });
    return { brand, pages, strings };
}

function i18nGroups(dict) {
    const groups = {};
    Object.keys(dict || {}).sort().forEach((key) => {
        const prefix = key.split('.')[0] || 'other';
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push({ key, def: dict[key] });
    });
    return groups;
}

function adminFields() {
    return FIELDS.filter((field) => ADMIN_GROUP_IDS.has(field.group));
}

function getAdmin() {
    const store = loadStore();
    const values = {};
    const defaults = {};
    const extra = legalDefaults();
    adminFields().forEach((field) => {
        const def = extra[field.key] != null ? extra[field.key] : field.def;
        defaults[field.key] = def;
        values[field.key] = Object.prototype.hasOwnProperty.call(store.fields, field.key)
            ? String(store.fields[field.key] ?? '')
            : '';
    });
    return {
        groups: GROUPS,
        fields: adminFields().map((f) => ({
            key: f.key,
            group: f.group,
            label: f.label,
            type: f.type,
            hint: f.hint || '',
            i18n: f.i18n || ''
        })),
        values,
        defaults,
        updatedAt: store.updatedAt
    };
}

function saveCms(body) {
    const incoming = body && typeof body === 'object' ? body : {};
    const fieldsIn = incoming.fields && typeof incoming.fields === 'object' ? incoming.fields : {};
    const store = loadStore();
    const fields = { ...(store.fields || {}) };
    const extraDef = legalDefaults();
    adminFields().forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(fieldsIn, field.key)) return;
        let next = clip(fieldsIn[field.key], field.type);
        if (field.type === 'html') next = sanitizeHtml(next);
        const def = extraDef[field.key] != null ? extraDef[field.key] : field.def;
        if (String(next).trim() === '' || String(next) === String(def)) {
            delete fields[field.key];
            return;
        }
        fields[field.key] = next;
    });
    const next = { fields, strings: store.strings || { en: {}, ar: {}, fa: {}, ps: {} }, updatedAt: new Date().toISOString() };
    writeJson(CMS_FILE, next);
    i18nCache = null;
    return getAdmin();
}

function fieldValue(key) {
    const field = fieldByKey(key);
    if (!field) return '';
    return resolvedField(loadStore(), field);
}

function applyTokens(template, tokens) {
    let out = String(template || '');
    Object.keys(tokens || {}).forEach((name) => {
        out = out.replace(new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}', 'gi'), String(tokens[name] ?? ''));
    });
    return out;
}

function otpCopy(tokens) {
    return {
        subject: applyTokens(fieldValue('email.otpSubject'), tokens),
        intro: applyTokens(fieldValue('email.otpIntro'), tokens),
        expire: applyTokens(fieldValue('email.otpExpire'), tokens)
    };
}

function broadcastFooter(tokens) {
    return applyTokens(fieldValue('email.broadcastFooter'), tokens);
}

function productName() {
    return fieldValue('brand.productName') || 'Rabط';
}

module.exports = {
    GROUPS,
    FIELDS,
    getPublic,
    getAdmin,
    saveCms,
    fieldValue,
    otpCopy,
    broadcastFooter,
    productName,
    applyTokens
};
