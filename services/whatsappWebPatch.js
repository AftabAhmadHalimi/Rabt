const { Client } = require('whatsapp-web.js');

function isRetryableInjectError(err) {
    const msg = String((err && err.message) || err || '');
    return /auth timeout|Execution context was destroyed|detached Frame|Target closed|Protocol error|most likely because of a navigation/i.test(msg);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function patchWhatsAppClient() {
    if (Client.prototype._rabtPatched) return;
    Client.prototype._rabtPatched = true;

    const originalInject = Client.prototype.inject;
    Client.prototype.inject = async function rabtInject() {
        let lastError;
        for (let attempt = 1; attempt <= 4; attempt++) {
            try {
                return await originalInject.call(this);
            } catch (err) {
                lastError = err;
                if (!isRetryableInjectError(err) || attempt === 4) throw err;
                console.warn('[WhatsApp] Inject retry', attempt, String(err.message || err));
                await sleep(1200 * attempt);
            }
        }
        throw lastError;
    };
}

patchWhatsAppClient();

module.exports = { patchWhatsAppClient };
