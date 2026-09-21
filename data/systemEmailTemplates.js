'use strict';

const engine = require('../public/email-template-engine.js');

function theme(accent) {
    return Object.assign(engine.defaultTheme(), { accent: accent });
}

function b(type, props) {
    return Object.assign(engine.newBlock(type), props || {});
}

function template(spec) {
    return {
        id: spec.id,
        name: spec.name,
        description: spec.description,
        category: spec.category,
        icon: spec.icon,
        accent: spec.accent,
        subject: spec.subject,
        preheader: spec.preheader,
        system: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        theme: theme(spec.accent),
        blocks: spec.blocks
    };
}

const SYSTEM_TEMPLATES = [
    template({
        id: 'sys-welcome',
        name: 'Welcome Email',
        description: 'Greet a new subscriber and show them where to start.',
        category: 'transactional',
        icon: 'fa-solid fa-hand-sparkles',
        accent: '#5B4FFF',
        subject: 'Welcome to {{company_name}}, {{first_name}}',
        preheader: 'Your account is ready. Here is how to get started in the next few minutes.',
        blocks: [
            b('logo', { text: '{{company_name}}' }),
            b('heading', { text: 'Welcome aboard, {{first_name}}' }),
            b('text', { text: 'Thanks for joining {{company_name}}. You now have a workspace to send email, WhatsApp, and Telegram campaigns from one place.\n\nStart with a short first message. A clear offer and a single call to action outperform a long introduction.' }),
            b('columns', {
                leftHeading: 'Import contacts',
                leftText: 'Upload a list once, then reuse it every time you compose.',
                rightHeading: 'Send the first campaign',
                rightText: 'Keep the first send small, useful, and easy to reply to.'
            }),
            b('button', { label: 'Open your workspace', href: '{{website_url}}' }),
            b('divider'),
            b('footer', { text: '{{company_name}} · You received this because you created an account.' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-new-customer',
        name: 'New Customer Welcome',
        description: 'A polished first message after someone becomes a customer.',
        category: 'business',
        icon: 'fa-solid fa-user-check',
        accent: '#0F766E',
        subject: '{{first_name}}, your {{company_name}} order is confirmed',
        preheader: 'What happens next, and how to reach us if you need help.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#0F766E' }),
            b('heading', { text: 'You are all set', color: '#134E4A' }),
            b('text', { text: 'Hi {{first_name}},\n\nThank you for choosing {{company_name}}. We have received your details and our team is preparing the next step.\n\nYou will get a second note if anything else is needed from you. Until then, keep this email so you have our contact path in one place.' }),
            b('columns', {
                leftHeading: 'Need a change?',
                leftText: 'Reply to this email with your order details and we will help.',
                rightHeading: 'Account access',
                rightText: 'Sign in anytime to review invoices, files, or campaign history.'
            }),
            b('button', { label: 'View your account', href: '{{website_url}}', bg: '#0F766E' }),
            b('footer', { text: '{{company_name}} customer desk' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-product-promotion',
        name: 'Product Promotion',
        description: 'Highlight one product with benefits and a single shop button.',
        category: 'promotion',
        icon: 'fa-solid fa-bag-shopping',
        accent: '#EA580C',
        subject: '{{first_name}}, a better way to {{product_name}}',
        preheader: 'See what is new, why it matters, and how to get it this week.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#EA580C' }),
            b('heading', { text: 'Meet {{product_name}}', color: '#9A3412' }),
            b('image', { alt: '{{product_name}} product photo', href: '{{website_url}}' }),
            b('text', { text: 'Hi {{first_name}},\n\n{{product_name}} is built for teams that want a cleaner workflow and fewer tools. It is ready to use today, with support included.' }),
            b('columns', {
                leftHeading: 'Faster setup',
                leftText: 'Go live in minutes with a guided first campaign.',
                rightHeading: 'Clear reporting',
                rightText: 'See sent, delivered, and replies without exporting spreadsheets.'
            }),
            b('button', { label: 'See {{product_name}}', href: '{{website_url}}', bg: '#EA580C' }),
            b('footer', { text: '{{company_name}} · Product update' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-special-offer',
        name: 'Special Offer / Discount',
        description: 'A time-limited offer with a discount code and a strong CTA.',
        category: 'promotion',
        icon: 'fa-solid fa-tags',
        accent: '#DC2626',
        subject: '{{discount_code}} — your {{company_name}} offer ends soon',
        preheader: 'Use your exclusive code before this promotion closes.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#DC2626' }),
            b('heading', { text: 'A limited offer for you', color: '#7F1D1D' }),
            b('text', { text: 'Hi {{first_name}},\n\nThis week we are opening a short promotion for existing customers. Use the code below at checkout. It cannot be combined with other offers.' }),
            b('columns', {
                leftHeading: 'Your code',
                leftText: '{{discount_code}}',
                rightHeading: 'Valid through',
                rightText: 'This weekend, while supplies last.'
            }),
            b('button', { label: 'Redeem the offer', href: '{{website_url}}', bg: '#DC2626' }),
            b('text', { text: 'If the code does not apply, reply with your account email and we will check it.', size: 13, color: '#6B7389' }),
            b('footer', { text: '{{company_name}} · Promotional message' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-newsletter',
        name: 'Newsletter',
        description: 'A monthly round-up with three stories and a read-more button.',
        category: 'newsletter',
        icon: 'fa-solid fa-newspaper',
        accent: '#4338CA',
        subject: '{{company_name}} briefing: this month in three notes',
        preheader: 'Product news, a customer story, and one practical tip.',
        blocks: [
            b('logo', { text: '{{company_name}} briefing', color: '#4338CA' }),
            b('heading', { text: 'This month, in brief', color: '#312E81' }),
            b('text', { text: 'Hi {{first_name}},\n\nA short briefing from {{company_name}}. Skim the three notes below, then open the full story if one of them is useful to your team.' }),
            b('divider'),
            b('heading', { text: '1. What we shipped', size: 20 }),
            b('text', { text: 'We improved campaign scheduling, contact import, and the live send log. The goal is fewer clicks between a list and a finished send.' }),
            b('heading', { text: '2. A customer story', size: 20 }),
            b('text', { text: 'A retail team cut follow-up time by sending the same announcement over email and WhatsApp from one workspace.' }),
            b('heading', { text: '3. A practical tip', size: 20 }),
            b('text', { text: 'Keep one offer per email. If readers need two actions, send two short messages instead of one long page.' }),
            b('button', { label: 'Read the full briefing', href: '{{website_url}}', bg: '#4338CA' }),
            b('social'),
            b('footer', { text: '{{company_name}} · Monthly newsletter' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-product-launch',
        name: 'Product Launch',
        description: 'Announce a launch date, who it is for, and how to get early access.',
        category: 'marketing',
        icon: 'fa-solid fa-rocket',
        accent: '#7C3AED',
        subject: '{{product_name}} is live — early access for {{first_name}}',
        preheader: 'The wait is over. See the launch offer and reserve your spot.',
        blocks: [
            b('logo', { text: '{{company_name}} launch', color: '#7C3AED' }),
            b('heading', { text: '{{product_name}} is ready', color: '#5B21B6' }),
            b('text', { text: 'Hi {{first_name}},\n\nToday we open {{product_name}} to customers. It is designed for operators who need a professional send flow without hiring a full marketing desk.' }),
            b('image', { alt: '{{product_name}} launch still', href: '{{website_url}}' }),
            b('columns', {
                leftHeading: 'Who it is for',
                leftText: 'Founders, sales teams, and agencies who send to their own lists.',
                rightHeading: 'What you get',
                rightText: 'Ready templates, saved lists, scheduling, and channel status in one login.'
            }),
            b('button', { label: 'Get early access', href: '{{website_url}}', bg: '#7C3AED' }),
            b('footer', { text: '{{company_name}} · Launch announcement' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-event-invitation',
        name: 'Event Invitation',
        description: 'Invite people to an in-person or hybrid event with date and RSVP.',
        category: 'event',
            icon: 'fa-solid fa-calendar-days',
        accent: '#2563EB',
        subject: 'You are invited: {{company_name}} customer evening',
        preheader: 'Date, place, and a one-click RSVP for our next gathering.',
        blocks: [
            b('logo', { text: '{{company_name}} events', color: '#2563EB' }),
            b('heading', { text: 'Join us next week', color: '#1E3A8A' }),
            b('text', { text: 'Hi {{first_name}},\n\nWe are hosting a small customer evening for teams who want to see how other operators run campaigns. Space is limited so we can keep the conversation useful.' }),
            b('columns', {
                leftHeading: 'When',
                leftText: 'Thursday, 6:30–8:30 pm. Doors open at 6:15.',
                rightHeading: 'Where',
                rightText: 'Our studio. Full address is in the RSVP page.'
            }),
            b('button', { label: 'RSVP now', href: '{{website_url}}', bg: '#2563EB' }),
            b('text', { text: 'Cannot attend? Forward this to a colleague or reply and we will send the recap.', size: 13, color: '#6B7389' }),
            b('footer', { text: '{{company_name}} · Event invitation' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-webinar',
        name: 'Webinar Invitation',
        description: 'Promote a live session with agenda, time, and a register button.',
        category: 'event',
        icon: 'fa-solid fa-video',
        accent: '#0891B2',
        subject: 'Live session: grow replies without buying more ads',
        preheader: '45 minutes, one playbook, and a recording for registered guests.',
        blocks: [
            b('logo', { text: '{{company_name}} academy', color: '#0891B2' }),
            b('heading', { text: 'A live working session', color: '#155E75' }),
            b('text', { text: 'Hi {{first_name}},\n\nJoin our 45-minute webinar on writing messages people actually answer. We will walk through a real campaign, then take questions.' }),
            b('columns', {
                leftHeading: 'Agenda',
                leftText: 'Subject lines, first paragraph, one CTA, and a simple follow-up.',
                rightHeading: 'Details',
                rightText: 'Online · 45 minutes · recording sent to registered guests.'
            }),
            b('button', { label: 'Register for the webinar', href: '{{website_url}}', bg: '#0891B2' }),
            b('footer', { text: '{{company_name}} · Webinar invitation' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-abandoned-cart',
        name: 'Abandoned Cart',
        description: 'A polite reminder to finish checkout without sounding pushy.',
        category: 'ecommerce',
        icon: 'fa-solid fa-cart-shopping',
        accent: '#D97706',
        subject: '{{first_name}}, your {{product_name}} is still in the cart',
        preheader: 'Finish checkout when you are ready. Your selection is saved.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#D97706' }),
            b('heading', { text: 'Your cart is waiting', color: '#92400E' }),
            b('text', { text: 'Hi {{first_name}},\n\nYou left {{product_name}} in your cart. Nothing has been charged. If you still want it, checkout takes about a minute. If plans changed, you can ignore this email.' }),
            b('image', { alt: '{{product_name}} in your cart', href: '{{website_url}}' }),
            b('button', { label: 'Return to checkout', href: '{{website_url}}', bg: '#D97706' }),
            b('text', { text: 'Questions about shipping or size? Reply and a person will answer.', size: 13, color: '#6B7389' }),
            b('footer', { text: '{{company_name}} · Cart reminder' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-thank-you',
        name: 'Customer Thank You',
        description: 'A sincere thank-you note after a purchase or completed project.',
        category: 'transactional',
        icon: 'fa-solid fa-heart',
        accent: '#16A34A',
        subject: 'Thank you, {{first_name}} — we appreciate the trust',
        preheader: 'A short note from the team, and a way to stay in touch.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#16A34A' }),
            b('heading', { text: 'Thank you for working with us', color: '#14532D' }),
            b('text', { text: 'Hi {{first_name}},\n\nWe wanted to say thank you properly. Customers like you make it possible to keep {{company_name}} careful, private, and useful.\n\nIf something was missing, reply to this email. If everything went well, a short review helps other teams decide.' }),
            b('button', { label: 'Share feedback', href: '{{website_url}}', bg: '#16A34A' }),
            b('social'),
            b('footer', { text: '{{company_name}} · Thank you note' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-announcement',
        name: 'Business Announcement',
        description: 'Share a company update, policy change, or new location.',
        category: 'business',
        icon: 'fa-solid fa-bullhorn',
        accent: '#334155',
        subject: '{{company_name}} update: what is changing and why',
        preheader: 'A direct note from the team about an important business change.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#334155' }),
            b('heading', { text: 'A short company update', color: '#0F172A' }),
            b('text', { text: 'Hi {{first_name}},\n\nWe are writing to share a change at {{company_name}}. The details are below so you do not have to hunt through a blog post.\n\nThis does not require action unless you use the feature mentioned. If you do, the new path is already live.' }),
            b('columns', {
                leftHeading: 'What changed',
                leftText: 'We simplified how saved lists connect to Email, WhatsApp, and Telegram.',
                rightHeading: 'What you should do',
                rightText: 'No action needed. Open your workspace the next time you send.'
            }),
            b('button', { label: 'Read the full note', href: '{{website_url}}', bg: '#334155' }),
            b('footer', { text: '{{company_name}} · Company announcement' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-holiday',
        name: 'Holiday / Seasonal Promotion',
        description: 'A seasonal campaign with gift language and a shopping window.',
        category: 'marketing',
        icon: 'fa-solid fa-gift',
        accent: '#E11D48',
        subject: 'Seasonal picks from {{company_name}} for {{first_name}}',
        preheader: 'A short holiday list, ready to send or shop before the date.',
        blocks: [
            b('logo', { text: '{{company_name}} seasons', color: '#E11D48' }),
            b('heading', { text: 'A season of useful gifts', color: '#9F1239' }),
            b('text', { text: 'Hi {{first_name}},\n\nIf you are buying for a team or a client this season, we put together a short list. Every item ships in time when you order this week.' }),
            b('image', { alt: 'Seasonal collection', href: '{{website_url}}' }),
            b('columns', {
                leftHeading: 'For operators',
                leftText: 'Tools that save time on the next campaign, not shelf decorations.',
                rightHeading: 'For clients',
                rightText: 'A clean gift note is included. Add a name at checkout.'
            }),
            b('button', { label: 'Shop the seasonal list', href: '{{website_url}}', bg: '#E11D48' }),
            b('footer', { text: '{{company_name}} · Seasonal promotion' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-feedback',
        name: 'Feedback Request',
        description: 'Ask for a review or survey after a successful delivery.',
        category: 'business',
        icon: 'fa-solid fa-clipboard-check',
        accent: '#0284C7',
        subject: 'Two minutes, {{first_name}} — how did we do?',
        preheader: 'A short survey so we can improve the next campaign with you.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#0284C7' }),
            b('heading', { text: 'May we ask one question?', color: '#0C4A6E' }),
            b('text', { text: 'Hi {{first_name}},\n\nYou recently worked with {{company_name}}. If you have two minutes, tell us what felt clear and what felt slow. We read every reply and use it in the next product pass.' }),
            b('button', { label: 'Share a short review', href: '{{website_url}}', bg: '#0284C7' }),
            b('text', { text: 'If you prefer not to use the form, just reply to this email with a sentence.', size: 13, color: '#6B7389' }),
            b('footer', { text: '{{company_name}} · Feedback request' }),
            b('unsubscribe')
        ]
    }),
    template({
        id: 'sys-reengagement',
        name: 'Re-engagement',
        description: 'Win back quiet contacts with a simple “still interested?” note.',
        category: 'marketing',
        icon: 'fa-solid fa-rotate',
        accent: '#C026D3',
        subject: 'Still want updates from {{company_name}}, {{first_name}}?',
        preheader: 'Stay on the list, or leave in one click. Either choice is respected.',
        blocks: [
            b('logo', { text: '{{company_name}}', color: '#C026D3' }),
            b('heading', { text: 'Should we keep writing?', color: '#86198F' }),
            b('text', { text: 'Hi {{first_name}},\n\nWe noticed it has been a while since you opened a {{company_name}} email. We would rather send fewer messages than keep a list that is not useful.\n\nIf you still want product notes and offers, tap below. If not, unsubscribe and we will stop.' }),
            b('button', { label: 'Keep me on the list', href: '{{website_url}}', bg: '#C026D3' }),
            b('footer', { text: '{{company_name}} · Preference check' }),
            b('unsubscribe')
        ]
    })
];

function listSystemTemplates() {
    return SYSTEM_TEMPLATES.map(summarize);
}

function getSystemTemplate(id) {
    const found = SYSTEM_TEMPLATES.find((item) => item.id === String(id || ''));
    return found ? hydrate(found) : null;
}

function hydrate(item) {
    const copy = JSON.parse(JSON.stringify(item));
    copy.html = engine.compile(copy);
    copy.htmlPreview = engine.compile(copy, { preview: true });
    copy.previewHeading = engine.firstHeading(copy.blocks);
    return copy;
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
        system: true,
        previewHeading: engine.firstHeading(item.blocks),
        htmlPreview: engine.compile(item, { preview: true }),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
}

module.exports = {
    SYSTEM_TEMPLATES,
    listSystemTemplates,
    getSystemTemplate,
    hydrate,
    summarize
};
