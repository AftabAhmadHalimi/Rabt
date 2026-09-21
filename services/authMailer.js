const nodemailer = require('nodemailer');
const { getPlatformEmailConfig, isPlatformConfigured } = require('../config/emailConfig');
const cmsService = require('./cmsService');
const { prepareOutboundEmail } = require('../utils/emailTemplates');

function createPlatformTransporter() {
    const config = getPlatformEmailConfig();
    if (!config.host || !config.auth || !config.auth.user || !config.auth.pass) {
        throw new Error('Platform SMTP is not configured. Cannot send authentication emails.');
    }
    return nodemailer.createTransport({
        host: config.host,
        port: parseInt(config.port, 10) || 465,
        secure: config.secure === true || config.secure === 'true',
        auth: {
            user: config.auth.user,
            pass: config.auth.pass
        },
        family: 4,
        tls: {
            rejectUnauthorized: false,
            servername: config.host
        },
        dnsTimeout: 60000,
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });
}

function wrapHtml(title, bodyHtml) {
    const config = getPlatformEmailConfig();
    const brand = config.fromName || config.systemName || 'Rabط';
    const bg = config.backgroundColor || '#5B4FFF';
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${bg};color:#fff;padding:22px 28px;font-size:22px;font-weight:700;">${brand}</td></tr>
        <tr><td style="padding:28px;color:#12203a;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function personalize(template, user) {
    return String(template || '')
        .replace(/\{\{\s*name\s*\}\}/gi, user.name || 'there')
        .replace(/\{\{\s*email\s*\}\}/gi, user.email || '');
}

function textToHtml(text) {
    const escaped = escapeHtml(text).replace(/\r\n/g, '\n').trim();
    if (!escaped) return '';
    return escaped
        .split(/\n{2,}/)
        .map((block) => `<p style="margin:0 0 16px;color:#1E2540;font-size:15px;line-height:1.7;">${block.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

function wrapProfessionalHtml({ subject, name, heading, bodyHtml }) {
    const config = getPlatformEmailConfig();
    const brand = config.fromName || config.systemName || 'Rabط';
    const bg = '#5B4FFF';
    const safeName = escapeHtml(name || 'there');
    const safeHeading = escapeHtml(heading || subject || 'A message from Rabط');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject || brand)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F5FA;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F5FA;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E6EAF2;">
        <tr>
          <td style="background:${bg};padding:28px 32px;">
            <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:700;">${escapeHtml(brand)}</div>
            <div style="margin-top:8px;font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;">${safeHeading}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 18px;color:#1E2540;font-size:16px;">Hi ${safeName},</p>
            <div style="color:#1E2540;font-size:15px;line-height:1.7;">
              <style>
                a { color:#5B4FFF !important; font-weight:700; text-decoration:underline; }
                b, strong { font-weight:800; }
                mark { background:#FFF3A3; padding:1px 4px; }
              </style>
              ${bodyHtml}
            </div>
            <p style="margin:28px 0 0;color:#6B7389;font-size:13px;line-height:1.6;">${escapeHtml(cmsService.broadcastFooter({ brand }))}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;background:#F7F8FC;color:#8B93A7;font-size:12px;line-height:1.5;">
            You received this because you have a Rabط workspace. Please do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function htmlToText(html) {
    return String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function sanitizeBroadcastHtml(input) {
    let html = String(input || '');
    html = html.replace(/<\/(?:script|style|iframe|object|embed|form|link|meta|svg|math)[^>]*>/gi, '');
    html = html.replace(/<(script|style|iframe|object|embed|form|link|meta|svg|math)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');
    html = html.replace(/<(script|style|iframe|object|embed|form|link|meta|svg|math)[^>]*\/?>/gi, '');
    html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    html = html.replace(/javascript:/gi, '');
    html = html.replace(/data:/gi, '');
    html = html.replace(/<(?!\/?(p|br|div|span|b|strong|i|em|u|a|ul|ol|li|h1|h2|h3|mark|blockquote|font)\b)[^>]+>/gi, '');
    html = html.replace(/\shref\s*=\s*(["'])([^"']*)\1/gi, (_, q, href) => {
        const clean = String(href || '').trim();
        if (/^(https?:|mailto:|#)/i.test(clean)) return ` href=${q}${clean}${q}`;
        return '';
    });
    html = html.replace(/\sstyle\s*=\s*(["'])([^"']*)\1/gi, (_, q, style) => {
        const allowed = String(style || '')
            .split(';')
            .map((part) => part.trim())
            .filter((part) => /^(background(-color)?|color|padding|font-weight|text-decoration)\s*:/i.test(part))
            .join('; ');
        return allowed ? ` style=${q}${allowed}${q}` : '';
    });
    return html;
}

function decorateBroadcastHtml(html) {
    let out = String(html || '');
    out = out.replace(/<a\b([^>]*?)>/gi, (match, attrs) => {
        let a = attrs;
        if (!/style=/i.test(a)) a += ' style="color:#5B4FFF;font-weight:700;text-decoration:underline;"';
        if (!/target=/i.test(a)) a += ' target="_blank" rel="noopener noreferrer"';
        return `<a${a}>`;
    });
    out = out.replace(/<(b|strong)\b([^>]*?)>/gi, (match, tag, attrs) => {
        if (/style=/i.test(attrs)) return match;
        return `<${tag}${attrs} style="font-weight:800;">`;
    });
    out = out.replace(/<(i|em)\b([^>]*?)>/gi, (match, tag, attrs) => {
        if (/style=/i.test(attrs)) return match;
        return `<${tag}${attrs} style="font-style:italic;">`;
    });
    out = out.replace(/<u\b([^>]*?)>/gi, (match, attrs) => {
        if (/style=/i.test(attrs)) return match;
        return `<u${attrs} style="text-decoration:underline;">`;
    });
    out = out.replace(/<mark\b([^>]*?)>/gi, (match, attrs) => {
        if (/style=/i.test(attrs)) return match;
        return `<mark${attrs} style="background:#FFF3A3;padding:1px 4px;">`;
    });
    return out;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendProfessionalEmail({ to, name, subject, heading, htmlMessage, message, attachments, useRawHtml }) {
    const config = getPlatformEmailConfig();
    const personalizedSubject = personalize(subject, { name, email: to });
    if (useRawHtml) {
        const personalized = personalize(htmlMessage, { name, email: to });
        const prepared = prepareOutboundEmail(personalized, {
            useRawHtml: true,
            wrapOptions: { systemName: config.fromName || config.systemName || 'Rabط' },
            subject: personalizedSubject,
            fromEmail: config.auth && config.auth.user
        });
        await sendAuthEmail({
            to,
            subject: personalizedSubject,
            html: prepared.html,
            text: prepared.text,
            attachments: (prepared.inlineAttachments || []).concat(attachments || [])
        });
        return;
    }
    const rawHtml = htmlMessage
        ? personalize(htmlMessage, { name, email: to })
        : textToHtml(personalize(message, { name, email: to }));
    const bodyHtml = decorateBroadcastHtml(sanitizeBroadcastHtml(rawHtml));
    const bodyText = htmlToText(bodyHtml) || personalize(message || '', { name, email: to });
    const html = wrapProfessionalHtml({
        subject: personalizedSubject,
        name,
        heading,
        bodyHtml
    });
    const text = `Hi ${name || 'there'},\n\n${bodyText}\n\nThis message was sent by the Rabط platform team.`;
    await sendAuthEmail({
        to,
        subject: personalizedSubject,
        html,
        text,
        attachments
    });
}

async function sendPlatformBroadcast({ users, subject, heading, htmlMessage, message, attachments, delayMs, useRawHtml }) {
    const list = Array.isArray(users) ? users : [];
    const wait = Math.max(250, parseInt(delayMs, 10) || 600);
    const results = { sent: 0, failed: 0, errors: [] };
    for (let i = 0; i < list.length; i += 1) {
        const user = list[i];
        try {
            await sendProfessionalEmail({
                to: user.email,
                name: user.name,
                subject,
                heading,
                htmlMessage,
                message,
                attachments,
                useRawHtml
            });
            results.sent += 1;
        } catch (err) {
            results.failed += 1;
            results.errors.push({
                email: user.email,
                error: err.message || 'Send failed'
            });
        }
        if (i < list.length - 1) await sleep(wait);
    }
    return results;
}

async function sendAuthEmail({ to, subject, html, text, attachments }) {
    if (!isPlatformConfigured()) {
        throw new Error('Platform SMTP is not configured. Cannot send authentication emails.');
    }
    const config = getPlatformEmailConfig();
    const transporter = createPlatformTransporter();
    const fromUser = config.auth.user;
    const mail = {
        from: `"${config.fromName || 'Rabط'}" <${fromUser}>`,
        to,
        subject,
        html,
        text
    };
    if (Array.isArray(attachments) && attachments.length) {
        mail.attachments = attachments;
    }
    await transporter.sendMail(mail);
}

async function sendVerificationEmail({ to, name, code, expiresMinutes, verifyUrl }) {
    const safeName = String(name || 'there').trim() || 'there';
    const otp = String(code || '').trim();
    const mins = parseInt(expiresMinutes, 10) || 10;
    const brand = cmsService.productName();
    const copy = cmsService.otpCopy({
        name: safeName,
        code: otp,
        minutes: mins,
        brand
    });
    const linkHtml = verifyUrl
        ? `<p style="margin:24px 0 8px;">Or verify your email with this link:</p>
           <p style="text-align:center;margin:0 0 18px;">
             <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;background:#5B4FFF;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Verify email</a>
           </p>`
        : '';
    const html = wrapHtml(
        'Your verification code',
        `<p>Hi ${escapeHtml(safeName)},</p>
         <p>${escapeHtml(copy.intro)}</p>
         <p style="margin:28px 0;text-align:center;">
           <span style="display:inline-block;letter-spacing:0.35em;font-size:32px;font-weight:800;background:#f4f6fb;border-radius:12px;padding:14px 22px;color:#12203a;">${escapeHtml(otp)}</span>
         </p>
         ${linkHtml}
         <p>${escapeHtml(copy.expire)}</p>`
    );
    await sendAuthEmail({
        to,
        subject: copy.subject,
        html,
        text: `Hi ${safeName},\n\n${copy.intro}\n\n${otp}\n\n${verifyUrl ? 'Verify here: ' + verifyUrl + '\n\n' : ''}${copy.expire}`
    });
}

async function sendPasswordResetEmail({ to, name, code, expiresMinutes }) {
    const safeName = String(name || 'there').trim() || 'there';
    const otp = String(code || '').trim();
    const mins = parseInt(expiresMinutes, 10) || 10;
    const brand = cmsService.productName();
    const html = wrapHtml(
        'Reset your password',
        `<p>Hi ${escapeHtml(safeName)},</p>
         <p>We received a request to reset your ${escapeHtml(brand)} password. Enter this code on the forgot password page:</p>
         <p style="margin:28px 0;text-align:center;">
           <span style="display:inline-block;letter-spacing:0.35em;font-size:32px;font-weight:800;background:#f4f6fb;border-radius:12px;padding:14px 22px;color:#12203a;">${escapeHtml(otp)}</span>
         </p>
         <p>This code expires in ${mins} minute${mins === 1 ? '' : 's'}. If you did not request a password reset, you can ignore this email.</p>`
    );
    await sendAuthEmail({
        to,
        subject: 'Your ' + brand + ' password reset code',
        html,
        text: `Hi ${safeName},\n\nYour ${brand} password reset code is:\n\n${otp}\n\nThis code expires in ${mins} minutes. If you did not request this, ignore this email.`
    });
}

async function sendActivationEmail({ to, name, planName, startedAt, expiresAt, loginUrl }) {
    const safeName = String(name || 'there').trim() || 'there';
    const brand = cmsService.productName();
    const plan = String(planName || 'Rabط plan');
    const start = startedAt ? new Date(startedAt).toLocaleString() : 'now';
    const end = expiresAt ? new Date(expiresAt).toLocaleString() : 'your next renewal';
    const href = loginUrl || '/login.html';
    const html = wrapHtml(
        'Your account is activated',
        `<p>Hi ${escapeHtml(safeName)},</p>
         <p>Your payment was verified. Your ${escapeHtml(brand)} account is now active.</p>
         <p><strong>Plan:</strong> ${escapeHtml(plan)}<br>
         <strong>Activation date:</strong> ${escapeHtml(start)}<br>
         <strong>Expiration date:</strong> ${escapeHtml(end)}</p>
         <p style="text-align:center;margin:28px 0 8px;">
           <a href="${escapeHtml(href)}" style="display:inline-block;background:#5B4FFF;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Login</a>
         </p>
         <p>Sign in to open your private Email, WhatsApp, and Telegram workspace.</p>`
    );
    await sendAuthEmail({
        to,
        subject: 'Your ' + brand + ' account has been verified and activated.',
        html,
        text: `Hi ${safeName},\n\nYour payment was verified and your ${brand} account is active.\nPlan: ${plan}\nActivation date: ${start}\nExpiration date: ${end}\n\nLogin: ${href}`
    });
}

async function sendContactReplyEmail({ to, name, subjectLabel, originalMessage, replyText }) {
    if (!isPlatformConfigured()) {
        throw new Error('Platform SMTP is not configured. Set up Platform SMTP before sending contact replies.');
    }
    const config = getPlatformEmailConfig();
    const brand = config.fromName || config.systemName || 'Rabط';
    const safeName = String(name || 'there').trim() || 'there';
    const topic = String(subjectLabel || 'your inquiry').trim() || 'your inquiry';
    const replyHtml = textToHtml(String(replyText || '').trim());
    const originalHtml = originalMessage
        ? `<div style="margin-top:24px;padding:16px;background:#F7F8FC;border:1px solid #E6EAF2;">
             <p style="margin:0 0 8px;color:#6B7389;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Your original message</p>
             ${textToHtml(String(originalMessage || '').trim())}
           </div>`
        : '';
    const bodyHtml =
        `<p style="margin:0 0 16px;color:#1E2540;font-size:15px;line-height:1.7;">Thank you for contacting ${escapeHtml(brand)} about <strong>${escapeHtml(topic)}</strong>. Here is our reply:</p>` +
        replyHtml +
        originalHtml;
    const subject = 'Re: ' + topic + ' — ' + brand + ' Support';
    const html = wrapProfessionalHtml({
        subject,
        name: safeName,
        heading: 'Reply to your contact message',
        bodyHtml
    }).replace(
        'You received this because you have a Rabط workspace. Please do not reply to this email.',
        'You received this email because you submitted a message on the Rabط contact page.'
    );
    const text =
        'Hi ' + safeName + ',\n\n' +
        'Thank you for contacting ' + brand + ' about ' + topic + '. Here is our reply:\n\n' +
        String(replyText || '').trim() +
        (originalMessage ? '\n\nYour original message:\n' + String(originalMessage || '').trim() : '') +
        '\n\nYou received this email because you submitted a message on the Rabط contact page.';
    await sendAuthEmail({ to, subject, html, text });
}

module.exports = {
    sendAuthEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendProfessionalEmail,
    sendPlatformBroadcast,
    htmlToText,
    sendActivationEmail,
    sendContactReplyEmail
};
