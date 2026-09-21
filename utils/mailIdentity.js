const crypto = require('crypto');

function emailDomain(address) {
    const value = String(address || '').trim();
    const at = value.lastIndexOf('@');
    if (at < 0 || at === value.length - 1) return '';
    return value.slice(at + 1).toLowerCase();
}

function sanitizeDisplayName(name) {
    const cleaned = String(name || '')
        .replace(/[\r\n"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || 'Rabط';
}

function formattedFrom(fromName, fromAddress) {
    return `"${sanitizeDisplayName(fromName)}" <${fromAddress}>`;
}

function uniqueMessageId(fromAddress) {
    const domain = emailDomain(fromAddress) || 'localhost';
    return `<${crypto.randomUUID()}@${domain}>`;
}

function maskEmail(address) {
    const value = String(address || '').trim();
    const at = value.lastIndexOf('@');
    if (at <= 0) return value ? '***' : '';
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const keep = local.slice(0, 1);
    return `${keep}***@${domain}`;
}

function outboundIdentity(config, options = {}) {
    const fromUser = String((config && config.auth && config.auth.user) || '').trim();
    if (!fromUser) {
        throw new Error('SMTP username (From address) is missing.');
    }
    const fromName = (config && config.fromName) || 'Rabط';
    const replyTo = String(options.replyTo || fromUser).trim() || fromUser;
    const headers = {};
    if (options.listUnsubscribe) {
        headers['List-Unsubscribe'] = `<mailto:${fromUser}?subject=unsubscribe>`;
    }
    if (options.autoSubmitted) {
        headers['Auto-Submitted'] = 'auto-generated';
    }
    return {
        fromUser,
        domain: emailDomain(fromUser),
        from: formattedFrom(fromName, fromUser),
        replyTo,
        messageId: uniqueMessageId(fromUser),
        envelope: { from: fromUser },
        headers
    };
}

module.exports = {
    emailDomain,
    formattedFrom,
    uniqueMessageId,
    maskEmail,
    outboundIdentity
};
