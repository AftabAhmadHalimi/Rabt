/* Lightweight channel setup checks for compose pages. */
(function () {
    if (window.RabtChannelStatus) return;

    async function jsonGet(url) {
        var res = await fetch(url, { credentials: 'same-origin' });
        return res.json().catch(function () { return {}; });
    }

    window.RabtChannelStatus = {
        async email: async function () {
            var data = await jsonGet('/api/settings/smtp/status');
            return !!(data && data.configured);
        },
        async whatsapp: async function () {
            var data = await jsonGet('/api/whatsapp/status');
            var status = data.data || data;
            return !!(status.ready || status.connected || status.status === 'connected');
        },
        async telegram: async function () {
            var data = await jsonGet('/api/telegram/status');
            var status = data.data || data;
            return !!(status.connected || status.status === 'connected' || status.status === 'authenticated');
        },
        bindBanner: function (opts) {
            var banner = document.getElementById(opts.id || 'channelSetupBanner');
            if (!banner) return;
            var text = banner.querySelector('[data-setup-text]') || banner;
            this[opts.channel]().then(function (ok) {
                if (ok) {
                    banner.classList.add('hidden');
                    return;
                }
                banner.classList.remove('hidden');
                if (text && text !== banner) text.textContent = opts.needText;
            }).catch(function () {
                banner.classList.remove('hidden');
            });
        }
    };
})();
