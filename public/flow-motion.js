/* Shared premium motion for signup, survey, pricing, and homepage guest landing */
(function () {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var guestHomeEl = document.getElementById('guestHome');
    var isHomePage = !!guestHomeEl;

    function guestHomeVisible() {
        return guestHomeEl && !guestHomeEl.classList.contains('hidden');
    }

    function setHomeGuestMode(on) {
        document.documentElement.classList.toggle('home-guest', !!on);
    }

    function enableFlowMotion() {
        document.documentElement.classList.add('flow-motion');
    }

    function addOrbs() {
        if (document.querySelector('.flow-orbs')) return;
        var wrap = document.createElement('div');
        wrap.className = 'flow-orbs';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML = '<span class="flow-orb o1"></span><span class="flow-orb o2"></span><span class="flow-orb o3"></span>';
        document.body.insertBefore(wrap, document.body.firstChild);
    }

    function removeOrbs() {
        var wrap = document.querySelector('.flow-orbs');
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    function stagger(root) {
        if (!root || reduce) return;
        var nodes = root.querySelectorAll('label, input, select, textarea, button, .switch, .alert.show');
        nodes.forEach(function (el, i) {
            el.classList.add('flow-stagger');
            el.style.setProperty('--i', String(i));
        });
    }

    function bindOtp() {
        var otp = document.querySelector('.otp-input');
        if (!otp) return;
        function sync() {
            otp.classList.toggle('is-ready', otp.value.replace(/\D/g, '').length === 6);
        }
        otp.addEventListener('input', sync);
        sync();
    }

    function decoratePlans() {
        document.querySelectorAll('.bill-grid .bill-card').forEach(function (card, i) {
            card.style.setProperty('--i', String(i));
        });
    }

    function decorateHome() {
        if (!guestHomeEl || !guestHomeVisible() || reduce) return;
        var selectors = [
            '.why-grid .why-card',
            '.steps-grid .step-card',
            '.tool-grid .tool-card',
            '.how-list .how-card',
            '.cta-banner',
            '.cta-banner-inline',
            '.trusted-by'
        ];
        var offset = 0;
        selectors.forEach(function (sel) {
            guestHomeEl.querySelectorAll(sel).forEach(function (el) {
                el.style.setProperty('--i', String(offset));
                offset += 1;
            });
        });
    }

    function staggerHomeHero() {
        if (!guestHomeEl || !guestHomeVisible() || reduce) return;
        var hero = guestHomeEl.querySelector('.hero-left');
        if (!hero) return;
        hero.querySelectorAll('.land-kicker, h1, .land-lead, .land-sub, .hero-actions > *').forEach(function (el, i) {
            el.classList.add('flow-stagger');
            el.style.setProperty('--i', String(i));
        });
    }

    function syncHomeMotion() {
        if (!isHomePage) return;
        var on = guestHomeVisible();
        setHomeGuestMode(on);
        document.documentElement.classList.toggle('flow-motion', on);
        if (on) {
            addOrbs();
            staggerHomeHero();
            decorateHome();
        } else {
            removeOrbs();
        }
    }

    function observeHome() {
        if (!guestHomeEl) return;
        var obs = new MutationObserver(function () {
            decorateHome();
        });
        obs.observe(guestHomeEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }

    window.RabtFlow = {
        celebrate: function () {
            if (reduce) return Promise.resolve();
            var el = document.createElement('div');
            el.className = 'flow-celebrate';
            el.innerHTML = '<span></span><span></span><span></span>';
            document.body.appendChild(el);
            return new Promise(function (resolve) {
                setTimeout(function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                    resolve();
                }, 720);
            });
        },
        busy: function (btn, on) {
            if (!btn) return;
            btn.classList.toggle('flow-busy', !!on);
        },
        refreshHome: function () {
            syncHomeMotion();
        }
    };

    function boot() {
        if (isHomePage) {
            syncHomeMotion();
            observeHome();
            document.addEventListener('auth-ready', syncHomeMotion);
            return;
        }

        enableFlowMotion();
        addOrbs();
        document.querySelectorAll('.card, .bill-form').forEach(stagger);
        bindOtp();
        decoratePlans();
        var grid = document.getElementById('planGrid');
        if (grid) {
            var obs = new MutationObserver(decoratePlans);
            obs.observe(grid, { childList: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
