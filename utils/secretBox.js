const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_FILE = path.join(__dirname, '..', 'config', 'secret.key');
const PREFIX = 'enc:v1:';

function getKey() {
    const env = String(process.env.RABT_SECRET_KEY || '').trim();
    if (env.length >= 16) {
        return crypto.createHash('sha256').update(env).digest();
    }
    if (!fs.existsSync(KEY_FILE)) {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { encoding: 'utf8', mode: 0o600 });
    }
    return crypto.createHash('sha256').update(fs.readFileSync(KEY_FILE, 'utf8').trim()).digest();
}

function encrypt(text) {
    const value = String(text || '');
    if (!value) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
    const raw = String(payload || '');
    if (!raw) return '';
    if (raw.indexOf(PREFIX) !== 0) return raw;
    const buf = Buffer.from(raw.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function seal(text) {
    const value = String(text || '');
    if (!value || value.indexOf(PREFIX) === 0) return value;
    return encrypt(value);
}

function open(text) {
    return decrypt(text);
}

module.exports = { encrypt, decrypt, seal, open, PREFIX };
