function envFlag(name) {
    return String(process.env[name] || '').trim().toLowerCase();
}

function isProduction() {
    return envFlag('NODE_ENV') === 'production';
}

function cookiesSecure() {
    return envFlag('COOKIE_SECURE') === 'true';
}

function listenHost() {
    const override = String(process.env.BIND_HOST || '').trim();
    if (override) return override;
    return isProduction() ? '127.0.0.1' : '0.0.0.0';
}

function listenPort() {
    return parseInt(process.env.PORT, 10) || 3005;
}

function telegramEnabled() {
    return envFlag('TELEGRAM_ENABLED') !== 'false';
}

function envSet(name, minLength) {
    const value = String(process.env[name] || '').trim();
    if (!value) return false;
    if (minLength && value.length < minLength) return false;
    return true;
}

function cookieSecurityAttrs() {
    return 'HttpOnly; Path=/; SameSite=Lax' + (cookiesSecure() ? '; Secure' : '');
}

function validateProductionEnv() {
    if (!isProduction()) {
        return { ok: true, errors: [], warnings: [] };
    }
    const errors = [];
    const warnings = [];

    if (!cookiesSecure()) {
        errors.push('COOKIE_SECURE must be true in production so auth cookies are Secure; HttpOnly; SameSite=Lax over HTTPS.');
    }
    if (!envSet('RABT_SECRET_KEY', 16)) {
        errors.push('RABT_SECRET_KEY is missing or shorter than 16 characters.');
    }
    if (!envSet('RABT_BACKUP_KEY', 16)) {
        errors.push('RABT_BACKUP_KEY is missing or shorter than 16 characters.');
    }
    const secret = String(process.env.RABT_SECRET_KEY || '').trim();
    const backup = String(process.env.RABT_BACKUP_KEY || '').trim();
    if (secret && backup && secret === backup) {
        errors.push('RABT_SECRET_KEY and RABT_BACKUP_KEY must be different keys.');
    }
    if (!envSet('AUTH_SMTP_HOST') || !envSet('AUTH_SMTP_USER') || !envSet('AUTH_SMTP_PASS')) {
        errors.push('AUTH_SMTP_HOST, AUTH_SMTP_USER, and AUTH_SMTP_PASS are required for verification email in production.');
    }
    if (telegramEnabled()) {
        const id = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
        if (!(Number.isFinite(id) && id > 0) || !envSet('TELEGRAM_API_HASH', 16)) {
            warnings.push('TELEGRAM_API_ID / TELEGRAM_API_HASH are not set. Telegram login will stay unavailable until they are added. Set TELEGRAM_ENABLED=false to silence this.');
        }
    }
    if (!envSet('ALLOWED_ORIGINS')) {
        warnings.push('ALLOWED_ORIGINS is empty. Set it to https://YOUR_DOMAIN for production CORS.');
    }

    return { ok: errors.length === 0, errors, warnings };
}

function logProductionCheck(result) {
    result.warnings.forEach((msg) => {
        console.warn('[Production] ' + msg);
    });
    if (!result.ok) {
        result.errors.forEach((msg) => {
            console.error('[Production] ' + msg);
        });
        const err = new Error('Production environment is incomplete. Secrets were not printed.');
        err.statusCode = 500;
        throw err;
    }
}

module.exports = {
    isProduction,
    cookiesSecure,
    listenHost,
    listenPort,
    telegramEnabled,
    envSet,
    cookieSecurityAttrs,
    validateProductionEnv,
    logProductionCheck
};
