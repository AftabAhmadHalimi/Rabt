#!/usr/bin/env node
'use strict';

require('dotenv').config();

const dns = require('dns').promises;
const nodemailer = require('nodemailer');
const {
    getPlatformEmailConfig,
    isPlatformConfigured,
    isConfigured,
    maskPlatformEmailConfig
} = require('../config/emailConfig');
const tenantStore = require('../services/tenantStore');
const { emailDomain, maskEmail, uniqueMessageId, outboundIdentity } = require('../utils/mailIdentity');

const SECRET_KEYS = [
    'AUTH_SMTP_PASS',
    'TELEGRAM_API_HASH',
    'RABT_SECRET_KEY',
    'RABT_BACKUP_KEY',
    'SUPER_ADMIN_PASSWORD'
];

function argValue(name) {
    const argv = process.argv.slice(2);
    const prefix = `--${name}=`;
    for (let i = 0; i < argv.length; i += 1) {
        const item = String(argv[i] || '');
        if (item.startsWith(prefix)) {
            return item.slice(prefix.length).trim();
        }
        if (item === `--${name}`) {
            const next = String(argv[i + 1] || '').trim();
            if (!next || next.startsWith('--')) return '';
            return next;
        }
    }
    return '';
}

function isEmailAddress(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function envPresent(name) {
    return !!String(process.env[name] || '').trim();
}

function line(label, value) {
    console.log(`${label}: ${value}`);
}

function section(title) {
    console.log('');
    console.log(`== ${title} ==`);
}

async function lookupTxt(name) {
    try {
        const records = await dns.resolveTxt(name);
        return records.map((chunks) => chunks.join(''));
    } catch (err) {
        return [`NOT VERIFIED (${err.code || err.message})`];
    }
}

async function lookupA(name) {
    try {
        return await dns.resolve4(name);
    } catch (err) {
        return [`NOT VERIFIED (${err.code || err.message})`];
    }
}

async function lookupMx(name) {
    try {
        const records = await dns.resolveMx(name);
        return records
            .sort((a, b) => a.priority - b.priority)
            .map((row) => `${row.priority} ${row.exchange}`);
    } catch (err) {
        return [`NOT VERIFIED (${err.code || err.message})`];
    }
}

function summarizeSpf(records) {
    const spf = records.filter((row) => /^v=spf1\b/i.test(row));
    if (!spf.length) return { exists: false, count: 0, value: 'NONE' };
    return {
        exists: true,
        count: spf.length,
        value: spf.join(' | '),
        multiple: spf.length > 1
    };
}

function summarizeDmarc(records) {
    const dmarc = records.filter((row) => /^v=DMARC1\b/i.test(row));
    if (!dmarc.length) return { exists: false, value: 'NONE' };
    const value = dmarc[0];
    const policy = (value.match(/\bp=([^;]+)/i) || [])[1] || 'NOT VERIFIED';
    const adkim = (value.match(/\badkim=([^;]+)/i) || [])[1] || 'default (r)';
    const aspf = (value.match(/\baspf=([^;]+)/i) || [])[1] || 'default (r)';
    return { exists: true, value, policy: policy.trim(), adkim, aspf };
}

function tenantSmtpSummary() {
    const rows = [];
    for (const uid of tenantStore.listTenantUserIds()) {
        if (!isConfigured(uid)) continue;
        const stored = tenantStore.readJson(uid, 'email.settings.json', null) || {};
        const host = String(stored.host || '').trim();
        const user = String((stored.auth && stored.auth.user) || '').trim();
        rows.push({
            tenant: String(uid).slice(0, 8) + '…',
            host: host || 'NOT VERIFIED',
            user: maskEmail(user),
            domain: emailDomain(user) || 'NOT VERIFIED'
        });
    }
    return rows;
}

function identitySelfCheck() {
    const ids = new Set();
    for (let i = 0; i < 20; i += 1) {
        ids.add(uniqueMessageId('ceo@sandboxholding.com'));
    }
    const sample = outboundIdentity(
        { auth: { user: 'ceo@sandboxholding.com' }, fromName: 'Rabط' },
        { listUnsubscribe: true }
    );
    const authSample = outboundIdentity(
        { auth: { user: 'ceo@sandboxholding.com' }, fromName: 'Rabط' },
        { autoSubmitted: true }
    );
    return {
        uniqueMessageIds: ids.size === 20,
        sampleMessageIdDomain: emailDomain(sample.fromUser),
        sampleHasUnsubscribe: !!sample.headers['List-Unsubscribe'],
        authHasUnsubscribe: !!authSample.headers['List-Unsubscribe'],
        authHasAutoSubmitted: authSample.headers['Auto-Submitted'] === 'auto-generated',
        envelopeFrom: sample.envelope.from
    };
}

async function verifySmtp(config) {
    const transporter = nodemailer.createTransport({
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
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000
    });
    await transporter.verify();
    return true;
}

async function sendPlatformTest(config, to) {
    const identity = outboundIdentity(config, { autoSubmitted: true });
    const transporter = nodemailer.createTransport({
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
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000
    });
    // Nodemailer uses envelope for MAIL FROM / RCPT TO. envelope.from alone
    // produces "No recipients defined" even when mail.to is set.
    await transporter.sendMail({
        from: identity.from,
        replyTo: identity.replyTo,
        to,
        subject: 'Rabط platform deliverability test',
        text: 'This is a platform SMTP test from Rabط. It is transactional and contains no tracking pixel.',
        html: '<p>This is a platform SMTP test from Rabط. It is transactional and contains no tracking pixel.</p>',
        messageId: identity.messageId,
        envelope: {
            from: identity.fromUser,
            to
        },
        headers: identity.headers
    });
}

async function main() {
    section('Runtime');
    line('NODE_ENV', process.env.NODE_ENV || '(unset)');
    line('COOKIE_SECURE', process.env.COOKIE_SECURE || '(unset)');
    line('PORT', process.env.PORT || '3005');

    section('Required environment (presence only)');
    [
        'AUTH_SMTP_HOST',
        'AUTH_SMTP_PORT',
        'AUTH_SMTP_SECURE',
        'AUTH_SMTP_USER',
        'AUTH_SMTP_PASS',
        'AUTH_SMTP_FROM_NAME',
        'AUTH_SMTP_REPLY_TO',
        'RABT_SECRET_KEY',
        'RABT_BACKUP_KEY',
        'TELEGRAM_API_ID',
        'TELEGRAM_API_HASH'
    ].forEach((name) => {
        line(name, envPresent(name) ? 'set' : 'missing');
    });
    SECRET_KEYS.forEach((name) => {
        if (String(process.env[name] || '').trim()) {
            line(`${name} value`, 'REDACTED');
        }
    });

    section('Platform SMTP (application config)');
    const masked = maskPlatformEmailConfig();
    const platform = isPlatformConfigured() ? getPlatformEmailConfig() : null;
    const sourceFile = require('fs').existsSync(require('path').join(__dirname, '..', 'config', 'auth.smtp.json'))
        ? 'config/auth.smtp.json (preferred) then AUTH_SMTP_* env fallback'
        : 'AUTH_SMTP_* environment variables';
    line('Config source', sourceFile);
    line('Configured', masked.configured ? 'yes' : 'no');
    line('SMTP Host', masked.host || 'NOT VERIFIED');
    line('SMTP Port', String(masked.port || 'NOT VERIFIED'));
    line('SMTP Secure', String(!!masked.secure));
    line('SMTP Username', maskEmail(masked.user) || 'NOT VERIFIED');
    line('SMTP Password', masked.passwordSet ? 'REDACTED (set)' : 'missing');
    line('From', platform ? `"${platform.fromName || 'Rabط'}" <${maskEmail(platform.auth.user)}>` : 'NOT VERIFIED');
    line('From Domain', platform ? (emailDomain(platform.auth.user) || 'NOT VERIFIED') : 'NOT VERIFIED');
    line('Reply-To Domain', platform ? (emailDomain(process.env.AUTH_SMTP_REPLY_TO || platform.auth.user) || 'NOT VERIFIED') : 'NOT VERIFIED');
    line('TLS rejectUnauthorized', 'false (current application setting)');
    line('TLS servername', masked.host || 'NOT VERIFIED');
    line('DKIM in application', 'not signed by app; depends on SMTP provider');

    if (platform && platform.host) {
        section('Platform DNS');
        const domain = emailDomain(platform.auth.user);
        const [a, mx, spf, dmarc, dkim, hostA] = await Promise.all([
            lookupA(domain),
            lookupMx(domain),
            lookupTxt(domain),
            lookupTxt(`_dmarc.${domain}`),
            lookupTxt(`default._domainkey.${domain}`),
            lookupA(platform.host)
        ]);
        const spfInfo = summarizeSpf(spf);
        const dmarcInfo = summarizeDmarc(dmarc);
        line('Sending domain', domain || 'NOT VERIFIED');
        line('Domain A', a.join(', '));
        line('SMTP host A', hostA.join(', '));
        line('MX', mx.join(', '));
        line('SPF exists', spfInfo.exists ? 'yes' : 'no');
        line('SPF count', String(spfInfo.count || 0));
        line('SPF value', spfInfo.value);
        line('Multiple SPF records', spfInfo.multiple ? 'YES (invalid)' : 'no');
        line('DKIM default._domainkey', dkim[0] ? (dkim[0].startsWith('v=DKIM1') ? 'present' : dkim[0]) : 'NONE');
        line('DKIM signing on send', 'NOT VERIFIED (requires received message headers)');
        line('DMARC exists', dmarcInfo.exists ? 'yes' : 'no');
        line('DMARC value', dmarcInfo.value || 'NONE');
        line('DMARC p=', dmarcInfo.policy || 'NOT VERIFIED');
        line('DMARC adkim', dmarcInfo.adkim || 'NOT VERIFIED');
        line('DMARC aspf', dmarcInfo.aspf || 'NOT VERIFIED');
        if (spfInfo.exists && Array.isArray(a) && a[0] && !String(a[0]).startsWith('NOT')) {
            line('SPF +a covers domain A', /\+a\b|\ba\b/.test(spfInfo.value) ? 'yes (IP still must match outbound SMTP)' : 'no');
        }
    }

    section('User-side / tenant SMTP');
    const tenants = tenantSmtpSummary();
    line('Configured tenant SMTP mailboxes', String(tenants.length));
    if (!tenants.length) {
        line('Tenant SMTP', 'none configured (campaigns require the user\'s own SMTP)');
    } else {
        tenants.forEach((row, index) => {
            line(`Tenant ${index + 1}`, `id ${row.tenant} host ${row.host} user ${row.user} domain ${row.domain}`);
        });
    }

    section('Identity self-check');
    const check = identitySelfCheck();
    line('Unique Message-IDs', check.uniqueMessageIds ? 'pass' : 'FAIL');
    line('Message-ID domain', check.sampleMessageIdDomain);
    line('Broadcast List-Unsubscribe', check.sampleHasUnsubscribe ? 'present' : 'missing');
    line('Transactional List-Unsubscribe', check.authHasUnsubscribe ? 'incorrectly present' : 'absent (correct)');
    line('Transactional Auto-Submitted', check.authHasAutoSubmitted ? 'present' : 'missing');
    line('Envelope / Return-Path from', maskEmail(check.envelopeFrom));

    if (platform && !hasFlag('skip-smtp-verify')) {
        section('Platform SMTP verify (no message sent)');
        try {
            await verifySmtp(platform);
            line('SMTP AUTH', 'accepted');
        } catch (err) {
            line('SMTP AUTH', `FAILED (${err.message})`);
        }
    }

    const sendTo = argValue('send-platform-test');
    if (sendTo) {
        section('Platform test send');
        line('Recipient', maskEmail(sendTo));
        if (!isEmailAddress(sendTo)) {
            line('Result', 'refused: invalid --send-platform-test address');
        } else if (!platform) {
            line('Result', 'FAILED (platform SMTP is not configured)');
        } else {
            try {
                await sendPlatformTest(platform, sendTo);
                line('Result', `accepted by SMTP for ${maskEmail(sendTo)}`);
                line('Inbox vs Spam', 'NOT VERIFIED (open the mailbox and inspect Authentication-Results)');
            } catch (err) {
                line('Result', `FAILED (${err.message})`);
            }
        }
    } else {
        section('Platform test send');
        line('Result', 'skipped (pass --send-platform-test=you@example.com or --send-platform-test you@example.com)');
        line('Inbox vs Spam', 'NOT VERIFIED');
    }

    section('Notes');
    console.log('Passwords, Telegram API hash, RABT_SECRET_KEY, and RABT_BACKUP_KEY are never printed.');
    console.log('DKIM/SPF/DMARC pass/fail on a live message requires received headers at the destination mailbox.');
    console.log('User-side test send is not performed here; tenants use their own SMTP from Settings.');
}

main().catch((err) => {
    console.error('Diagnostic failed:', err.message);
    process.exitCode = 1;
});
