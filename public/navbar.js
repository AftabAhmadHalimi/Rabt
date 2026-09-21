/* ── Shared Application Navbar ─────────────────────────────────────────── */
(function () {
    var SHELL_KEY = 'rabt_shell';
    var MARKETING_ROOT_PAGES = {
        '/': true,
        '/pricing.html': true,
        '/contact.html': true,
        '/about.html': true
    };

    function readShellAuthed() {
        try { return localStorage.getItem(SHELL_KEY) === '1'; } catch (_) { return false; }
    }

    function writeShellAuthed(on) {
        try {
            if (on) localStorage.setItem(SHELL_KEY, '1');
            else localStorage.removeItem(SHELL_KEY);
        } catch (_) {}
    }

    window.RabtRememberShell = writeShellAuthed;

    document.documentElement.classList.add('app-shell');
    var bootPath = (window.location.pathname || '/');
    var bootNorm = (bootPath === '' || bootPath === '/index.html') ? '/' : bootPath;
    var bootOnboard = bootPath.indexOf('onboarding') !== -1;
    document.documentElement.classList.toggle('guest-mode', !readShellAuthed() || bootOnboard);
    document.documentElement.classList.toggle('marketing-root', !!MARKETING_ROOT_PAGES[bootNorm]);
    document.documentElement.classList.toggle('app-page-email', bootPath.indexOf('email') !== -1);
    document.documentElement.classList.toggle('app-page-whatsapp', bootPath.indexOf('whatsapp') !== -1);
    document.documentElement.classList.toggle('app-page-telegram', bootPath.indexOf('telegram') !== -1);
    document.documentElement.classList.toggle('app-page-schedule', bootPath.indexOf('schedule') !== -1);
    document.documentElement.classList.toggle('app-page-templates', bootPath.indexOf('templates') !== -1);
    document.documentElement.classList.toggle('app-page-contact', bootPath.indexOf('import-export') !== -1);
    document.documentElement.classList.toggle('app-page-verified-contact', bootPath.indexOf('verified-contact') !== -1);
    document.documentElement.classList.toggle('app-page-marketing-database', bootPath.indexOf('marketing-database') !== -1);

    (function loadBrandCss() {
        var existing = document.querySelector('link[data-rabt-brand]');
        if (!existing) {
            existing = document.createElement('link');
            existing.rel = 'stylesheet';
            existing.href = '/brand.css';
            existing.setAttribute('data-rabt-brand', '1');
        }
        document.head.appendChild(existing);
        document.addEventListener('DOMContentLoaded', function () {
            document.head.appendChild(existing);
        });
    })();

    (function loadAppMotionCss() {
        var existing = document.querySelector('link[data-rabt-motion]');
        if (!existing) {
            existing = document.createElement('link');
            existing.rel = 'stylesheet';
            existing.href = '/app-motion.css';
            existing.setAttribute('data-rabt-motion', '1');
        }
        document.head.appendChild(existing);
        document.addEventListener('DOMContentLoaded', function () {
            document.head.appendChild(existing);
        });
    })();

    (function loadSaasCss() {
        var existing = document.querySelector('link[data-rabt-saas]');
        if (!existing) {
            existing = document.createElement('link');
            existing.rel = 'stylesheet';
            existing.href = '/saas.css';
            existing.setAttribute('data-rabt-saas', '1');
        }
        document.head.appendChild(existing);
        document.addEventListener('DOMContentLoaded', function () {
            document.head.appendChild(existing);
        });
    })();

    (function setAppIcon() {
        var icon = document.querySelector('link[rel="icon"]');
        if (!icon) {
            icon = document.createElement('link');
            icon.rel = 'icon';
            document.head.appendChild(icon);
        }
        icon.type = 'image/png';
        icon.href = '/logo.png';
    })();

    var PUBLIC_ITEMS = [
        { href: '/', labelKey: 'nav.kpi', icon: 'fa-solid fa-chart-line' }
    ];
    var GUEST_ITEMS = [
        { href: '/pricing.html', label: 'Pricing', icon: 'fa-solid fa-tags' },
        { href: '/about.html', label: 'About', icon: 'fa-solid fa-info-circle' },
        { href: '/contact.html', label: 'Contact', icon: 'fa-solid fa-envelope' }
    ];
    var CHANNEL_ITEMS = [
        { href: '/email.html',    labelKey: 'nav.email',      icon: 'fa-solid fa-envelope' },
        { href: '/whatsapp.html', labelKey: 'nav.whatsapp',   icon: 'fa-brands fa-whatsapp' },
        { href: '/telegram.html', labelKey: 'nav.telegram',   icon: 'fa-brands fa-telegram' }
    ];
    var WORKSPACE_ITEMS = [
        { href: '/schedule.html', labelKey: 'nav.schedule', icon: 'fa-solid fa-calendar-check' },
        { href: '/templates.html', labelKey: 'nav.templates', icon: 'fa-solid fa-layer-group' },
        { href: '/import-export.html', labelKey: 'nav.import', icon: 'fa-solid fa-file-import' },
        { href: '/verified-contact.html', labelKey: 'nav.verifiedContact', icon: 'fa-solid fa-user-check' },
        { href: '/marketing-database.html', labelKey: 'nav.marketingDatabase', icon: 'fa-solid fa-database' }
    ];
    var SUPPORT_ITEMS = [
        { href: '/support.html', labelKey: 'nav.assistance', icon: 'fa-solid fa-headset', badgeId: 'supportNavBadge' }
    ];
    var SETTINGS_ITEMS = [
        { href: '/settings.html', labelKey: 'nav.settings', icon: 'fa-solid fa-gear' },
        { href: '/invite.html', labelKey: 'nav.shareInvite', hintKey: 'nav.shareInviteHint', icon: 'fa-solid fa-user-plus' }
    ];
    var ACCOUNT_ITEMS = [
        { href: '/privacy.html', labelKey: 'nav.privacyPolicy', hintKey: 'nav.privacyHint', icon: 'fa-solid fa-shield-halved' },
        { href: '/terms.html', labelKey: 'nav.terms', hintKey: 'nav.termsHint', icon: 'fa-solid fa-file-contract' },
        { href: '/language.html', labelKey: 'nav.chooseLanguage', hintKey: 'nav.chooseLanguageHint', icon: 'fa-solid fa-language' }
    ];
    var ACCOUNT_HREFS = {
        '/support.html': true,
        '/privacy.html': true,
        '/terms.html': true,
        '/language.html': true,
        '/invite.html': true,
        '/guide.html': true
    };
    var TOOL_ITEMS = CHANNEL_ITEMS.concat(WORKSPACE_ITEMS).concat(SUPPORT_ITEMS);
    var PROTECTED_PATHS = TOOL_ITEMS.concat([
        { href: '/settings.html' },
        { href: '/invite.html' }
    ]).map(function (i) { return i.href; });
    var NAV_STACK_KEY = 'rabt_nav_stack';

    function t(key) {
        return (window.RabtI18n && window.RabtI18n.t(key)) || key;
    }

    function brandName() {
        return (window.RabtCms && window.RabtCms.brand && window.RabtCms.brand.productName) || 'Rabط';
    }

    function getCurrentPath() {
        var p = window.location.pathname;
        return (p === '' || p === '/index.html') ? '/' : p;
    }

    function isMarketingRootPage(path) {
        return !!MARKETING_ROOT_PAGES[normalizeNavPath(path || getCurrentPath())];
    }

    function syncMarketingRootClass() {
        document.documentElement.classList.toggle('marketing-root', isMarketingRootPage());
    }

    function isActive(href) {
        var cur = getCurrentPath();
        if (href === '/') return cur === '/';
        if (href === '/settings.html' && ACCOUNT_HREFS[cur]) return true;
        return cur === href || cur.endsWith(href);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildNavLinks(items, noIcons) {
        return items.map(function (item) {
            var active = isActive(item.href) ? ' active' : '';
            var badge = item.badgeId
                ? '<span class="app-nav-badge" id="' + item.badgeId + '" hidden>0</span>'
                : '';
            var text = item.label ? item.label : t(item.labelKey);
            var hint = item.hintKey ? t(item.hintKey) : '';
            var label = hint
                ? '<span class="app-sidebar-link-text"><span>' + text + '</span><span class="app-sidebar-hint">' + hint + '</span></span>'
                : '<span>' + text + '</span>';
            var extraId = item.id ? ' id="' + item.id + '"' : '';
            var extra = (item.download ? ' download' : '') + (item.hidden ? ' hidden' : '');
            var iconHtml = (noIcons || item.noIcon) ? '' : '<span class="app-sidebar-icon"><i class="' + item.icon + '"></i></span>';
            return '<a href="' + item.href + '" class="app-sidebar-link' + active + (hint ? ' has-hint' : '') + '"' + extraId + extra + '>' +
                iconHtml +
                label +
                badge +
                '</a>';
        }).join('');
    }

    function authButtonsHTML(user) {
        if (user) {
            var extra = !user.platformAccess
                ? '<a href="' + escapeHtml(user.nextPath || '/pricing.html') + '" class="app-auth-btn app-auth-btn-primary"><i class="fa-solid fa-crown"></i><span>Complete setup</span></a>'
                : '';
            return (
                extra +
                '<button type="button" class="app-auth-btn app-auth-btn-ghost" id="appLogoutBtn">' +
                    '<i class="fa-solid fa-right-from-bracket"></i><span>' + t('nav.signOut') + '</span>' +
                '</button>'
            );
        }
        return (
            '<a href="/login.html" class="app-auth-btn app-auth-btn-ghost"><i class="fa-solid fa-right-to-bracket"></i><span>' + t('nav.signIn') + '</span></a>' +
            '<a href="/signup.html" class="app-auth-btn app-auth-btn-primary"><i class="fa-solid fa-user-plus"></i><span>' + t('nav.signUp') + '</span></a>'
        );
    }

    function sidebarAvatarHTML(user) {
        if (user && user.hasAvatar) {
            return '<div class="app-sidebar-user-avatar has-photo"><img src="/api/onboarding/avatar" alt=""></div>';
        }
        return '<div class="app-sidebar-user-avatar"><i class="fa-solid fa-user"></i></div>';
    }

    function applySidebarAvatar(user) {
        var el = document.querySelector('.app-sidebar-user-avatar');
        if (!el) return;
        if (user && user.hasAvatar) {
            el.classList.add('has-photo');
            el.innerHTML = '<img src="/api/onboarding/avatar" alt="">';
            var img = el.querySelector('img');
            if (img) {
                img.addEventListener('error', function () {
                    el.classList.remove('has-photo');
                    el.innerHTML = '<i class="fa-solid fa-user"></i>';
                });
            }
            return;
        }
        el.classList.remove('has-photo');
        el.innerHTML = '<i class="fa-solid fa-user"></i>';
    }

    function sidebarFooterHTML(user) {
        if (!user) {
            return '<p class="app-sidebar-guest-hint">' + t('nav.guestHint') + '</p>';
        }
        return (
            '<div class="app-sidebar-user" title="' + escapeHtml(user.email || '') + '">' +
                sidebarAvatarHTML(user) +
                '<div class="app-sidebar-user-meta">' +
                    '<span class="app-sidebar-user-name">' + escapeHtml(user.name || user.email || 'Account') + '</span>' +
                    '<span class="app-sidebar-user-email">' + escapeHtml(user.email || '') + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    function getPageTitle(user) {
        if (!user) {
            var path = getCurrentPath();
            if (path === '/login.html') return t('page.login');
            if (path === '/signup.html') return t('page.signup');
            if (path === '/privacy.html') return t('page.privacy');
            if (path === '/terms.html') return t('page.terms');
            if (path === '/language.html') return t('page.language');
            if (path === '/guide.html') return t('page.guide');
            if (path === '/verify.html') return t('page.verify');
            if (path === '/forgot-password.html') return t('page.forgot');
            if (path === '/verified-contact.html') return t('nav.verifiedContact');
            if (path === '/marketing-database.html') return t('nav.marketingDatabase');
            if (path === '/pricing.html') return 'Pricing';
            if (path === '/about.html') return 'About';
            if (path === '/contact.html') return 'Contact';
            if (path === '/payment.html') return 'Payment';
            if (path === '/billing-status.html') return 'Payment status';
            if (path === '/onboarding.html') return 'Welcome';
            return brandName();
        }
        if (getCurrentPath() === '/guide.html') return t('page.guide');
        var extras = [
            { href: '/login.html', labelKey: 'nav.signIn' },
            { href: '/signup.html', labelKey: 'nav.signUp' },
            { href: '/language.html', labelKey: 'page.language' },
            { href: '/guide.html', labelKey: 'page.guide' },
            { href: '/verify.html', labelKey: 'page.verify' }
        ];
        var all = PUBLIC_ITEMS.concat(TOOL_ITEMS).concat(SETTINGS_ITEMS).concat(ACCOUNT_ITEMS).concat(extras);
        for (var i = 0; i < all.length; i++) {
            if (isActive(all[i].href)) return t(all[i].labelKey);
        }
        return brandName();
    }

    function backButtonHTML() {
        if (isMarketingRootPage()) return '';
        return (
            '<button type="button" class="app-back-btn" id="appBackBtn" title="' + t('nav.back') + '" aria-label="' + t('nav.back') + '">' +
                '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>' +
            '</button>'
        );
    }

    function headerMarkLinkHTML() {
        return (
            '<a href="/" class="app-header-mark-link" title="' + escapeHtml(brandName()) + ' - Home">' +
                '<img class="app-header-mark" src="/logo.png" alt="' + escapeHtml(brandName()) + '">' +
            '</a>'
        );
    }

    function normalizeNavPath(pathname) {
        var p = String(pathname || '/');
        if (p === '' || p === '/index.html') return '/';
        return p;
    }

    function readNavStack() {
        try {
            var stack = JSON.parse(sessionStorage.getItem(NAV_STACK_KEY) || '[]');
            return Array.isArray(stack) ? stack.map(normalizeNavPath).filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    }

    function writeNavStack(stack) {
        try {
            sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(Array.isArray(stack) ? stack.slice(-40) : []));
        } catch (_) {}
    }

    function recordNavVisit() {
        var path = getCurrentPath();
        var stack = readNavStack();
        var idx = stack.lastIndexOf(path);
        if (idx !== -1) stack = stack.slice(0, idx + 1);
        else stack.push(path);
        writeNavStack(stack);
    }

    function getLogicalParent(path) {
        var parents = {
            '/login.html': '/',
            '/signup.html': '/',
            '/verify.html': '/login.html',
            '/forgot-password.html': '/login.html',
            '/pricing.html': '/',
            '/payment.html': '/pricing.html',
            '/billing-status.html': '/pricing.html',
            '/onboarding.html': '/',
            '/settings.html': '/',
            '/invite.html': '/settings.html',
            '/guide.html': '/settings.html',
            '/support.html': '/invite.html',
            '/privacy.html': '/settings.html',
            '/terms.html': '/settings.html',
            '/language.html': '/settings.html',
            '/email.html': '/',
            '/whatsapp.html': '/',
            '/telegram.html': '/',
            '/schedule.html': '/',
            '/templates.html': '/',
            '/import-export.html': '/',
            '/verified-contact.html': '/import-export.html',
            '/marketing-database.html': '/import-export.html',
            '/apiConfig.html': '/settings.html'
        };
        if (parents[path]) return parents[path];
        if (ACCOUNT_HREFS[path]) return '/settings.html';
        return '/';
    }

    function goBack(event) {
        if (event) {
            try { event.preventDefault(); } catch (_) {}
        }
        var path = getCurrentPath();
        if (path === '/') return;

        var stack = readNavStack();
        while (stack.length && stack[stack.length - 1] === path) stack.pop();
        var prev = stack.length ? stack[stack.length - 1] : '';
        writeNavStack(stack);

        if (prev && prev !== path) {
            window.location.assign(prev);
            return;
        }

        var refPath = '';
        var sameOrigin = false;
        try {
            if (document.referrer) {
                var refUrl = new URL(document.referrer);
                sameOrigin = refUrl.origin === location.origin;
                refPath = normalizeNavPath(refUrl.pathname);
            }
        } catch (_) {}

        var settingsChild = !!ACCOUNT_HREFS[path];
        if (sameOrigin && refPath && refPath !== path) {
            if (!(settingsChild && refPath === '/settings.html') && window.history.length > 1) {
                window.history.back();
                return;
            }
        }

        if (window.currentUser && settingsChild) {
            window.location.assign('/settings.html');
            return;
        }

        window.location.assign(getLogicalParent(path));
    }

    function guestHeaderHTML(user) {
        var navLinks = buildNavLinks(GUEST_ITEMS, true);
        return (
            '<header class="app-header" id="appHeader">' +
                '<div class="app-header-left">' +
                    backButtonHTML() +
                    headerMarkLinkHTML() +
                    '<span class="app-header-title">' + getPageTitle(user || null) + '</span>' +
                '</div>' +
                '<div class="app-header-center">' +
                    '<nav class="app-header-nav">' + navLinks + '</nav>' +
                '</div>' +
                '<div class="app-header-actions">' +
                    '<div class="app-auth-actions" id="appAuthActions">' +
                        authButtonsHTML(user || null) +
                    '</div>' +
                '</div>' +
            '</header>'
        );
    }

    function getNavbarHTML(user) {
        var onboarding = getCurrentPath() === '/onboarding.html';
        if (!user || onboarding) return guestHeaderHTML(user);
        if (user.id && !user.platformAccess) return guestHeaderHTML(user);
        return (
            '<aside class="app-sidebar" id="appSidebar" aria-label="Main navigation">' +
                '<div class="app-sidebar-brand">' +
                    '<a href="/" class="app-logo" title="' + escapeHtml(brandName()) + '">' +
                        '<img class="app-logo-img" src="/logo.png" alt="' + escapeHtml(brandName()) + '">' +
                    '</a>' +
                    '<div class="app-sidebar-brand-text">' +
                        '<span class="app-logo-text" id="appLogoText">' + escapeHtml(brandName()) + '</span>' +
                        '<span class="app-sidebar-tagline">' + t('nav.tagline') + '</span>' +
                    '</div>' +
                    '<button type="button" class="app-sidebar-close" id="appDrawerClose" aria-label="' + t('nav.closeMenu') + '">' +
                        '<i class="fa-solid fa-xmark"></i>' +
                    '</button>' +
                '</div>' +
                '<nav class="app-sidebar-nav">' +
                    '<p class="app-sidebar-label">' + t('nav.overview') + '</p>' +
                    buildNavLinks(PUBLIC_ITEMS) +
                    '<p class="app-sidebar-label">' + t('nav.channels') + '</p>' + buildNavLinks(CHANNEL_ITEMS) +
                    '<p class="app-sidebar-label">' + t('nav.workspace') + '</p>' + buildNavLinks(WORKSPACE_ITEMS) +
                    '<p class="app-sidebar-label">' + t('nav.settings') + '</p>' + buildNavLinks(SETTINGS_ITEMS) +
                    buildNavLinks(SUPPORT_ITEMS) +
                '</nav>' +
                '<div class="app-sidebar-footer">' +
                    sidebarFooterHTML(user) +
                '</div>' +
            '</aside>' +
            '<div class="app-drawer-overlay" id="appDrawerOverlay"></div>' +
            '<header class="app-header" id="appHeader">' +
                '<div class="app-header-left">' +
                    '<button class="app-hamburger" id="appHamburger" aria-label="' + t('nav.openMenu') + '" aria-expanded="false">' +
                        '<span></span><span></span><span></span>' +
                    '</button>' +
                    backButtonHTML() +
                    headerMarkLinkHTML() +
                    '<span class="app-header-title">' + getPageTitle(user) + '</span>' +
                    '<div class="app-nav-status" id="appNavStatus"></div>' +
                '</div>' +
                '<div class="app-header-actions">' +
                    '<div class="app-auth-actions" id="appAuthActions">' +
                        authButtonsHTML(user) +
                    '</div>' +
                '</div>' +
            '</header>'
        );
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    async function loadCurrentUser() {
        try {
            var res = await fetch('/api/auth/me', { credentials: 'same-origin' });
            var data = await res.json();
            return data.authenticated ? data.user : null;
        } catch (_) {
            return null;
        }
    }

    async function logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        } catch (_) {}
        window.currentUser = null;
        writeShellAuthed(false);
        try { sessionStorage.clear(); } catch (_) {}
        try { localStorage.removeItem('kpiChartRange'); } catch (_) {}
        window.location.replace('/login.html');
    }

    function updateUserChip(user) {
        if (!user) return;
        var name = document.querySelector('.app-sidebar-user-name');
        var email = document.querySelector('.app-sidebar-user-email');
        var wrap = document.querySelector('.app-sidebar-user');
        if (name) name.textContent = user.name || user.email || 'Account';
        if (email) email.textContent = user.email || '';
        if (wrap) wrap.setAttribute('title', user.email || '');
        applySidebarAvatar(user);
    }

    function initNavbar() {
        var container = document.getElementById('app-navbar');
        if (!container) {
            container = document.createElement('div');
            container.id = 'app-navbar';
            document.body.insertBefore(container, document.body.firstChild);
        }

        var guessedAuthed = readShellAuthed();
        var guessedUser = guessedAuthed ? { name: '', email: '' } : null;
        window.currentUser = guessedUser;
        document.documentElement.classList.toggle('guest-mode', !guessedUser || getCurrentPath() === '/onboarding.html');

        function setNoScroll(on) {
            document.documentElement.classList.toggle('app-no-scroll', on);
            document.body.classList.toggle('app-no-scroll', on);
        }

        function bindChrome() {
            var savedTheme = localStorage.getItem('theme') || 'light';
            applyTheme(savedTheme);

            var backBtn = document.getElementById('appBackBtn');
            if (backBtn) backBtn.onclick = goBack;

            var hamburger = document.getElementById('appHamburger');
            var sidebar   = document.getElementById('appSidebar');
            var overlay   = document.getElementById('appDrawerOverlay');
            var closeBtn  = document.getElementById('appDrawerClose');

            function openDrawer() {
                if (!sidebar || !overlay || !hamburger) return;
                sidebar.classList.add('open');
                overlay.classList.add('show');
                hamburger.setAttribute('aria-expanded', 'true');
                hamburger.classList.add('open');
                setNoScroll(true);
            }

            function closeDrawer() {
                if (!sidebar || !overlay || !hamburger) return;
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
                hamburger.setAttribute('aria-expanded', 'false');
                hamburger.classList.remove('open');
                setNoScroll(false);
            }

            window.__rabtCloseDrawer = closeDrawer;

            if (hamburger) {
                hamburger.onclick = function () {
                    if (sidebar && sidebar.classList.contains('open')) closeDrawer();
                    else openDrawer();
                };
            }
            if (overlay) overlay.onclick = closeDrawer;
            if (closeBtn) closeBtn.onclick = closeDrawer;
            if (sidebar) {
                sidebar.querySelectorAll('.app-sidebar-link').forEach(function (link) {
                    link.addEventListener('click', closeDrawer);
                });
            }

            var logoutBtn = document.getElementById('appLogoutBtn');
            if (logoutBtn) logoutBtn.onclick = logout;

            var avatarImg = document.querySelector('.app-sidebar-user-avatar img');
            if (avatarImg) {
                avatarImg.addEventListener('error', function () {
                    var el = avatarImg.closest('.app-sidebar-user-avatar');
                    if (!el) return;
                    el.classList.remove('has-photo');
                    el.innerHTML = '<i class="fa-solid fa-user"></i>';
                });
            }
        }

        function mount(user) {
            recordNavVisit();
            syncMarketingRootClass();
            container.innerHTML = getNavbarHTML(user);
            bindChrome();
        }

        mount(guessedUser);

        if (!window.__rabtNavGlobalBound) {
            window.__rabtNavGlobalBound = true;
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && window.__rabtCloseDrawer) window.__rabtCloseDrawer();
            });
            window.addEventListener('resize', function () {
                if (window.innerWidth > 900 && window.__rabtCloseDrawer) window.__rabtCloseDrawer();
            });
        }

        loadCurrentUser().then(function (user) {
            var paid = !!(user && user.platformAccess);
            var path = getCurrentPath();
            writeShellAuthed(paid);
            window.currentUser = user || null;
            document.documentElement.classList.toggle('guest-mode', !paid || path === '/onboarding.html');

            if (!user && PROTECTED_PATHS.indexOf(path) !== -1) {
                writeShellAuthed(false);
                window.location.replace('/login.html');
                return;
            }
            if (user && !paid && PROTECTED_PATHS.indexOf(path) !== -1) {
                window.location.replace(user.nextPath || '/pricing.html');
                return;
            }
            if (user && paid && !user.onboardingCompleted && path !== '/onboarding.html') {
                window.location.replace('/onboarding.html');
                return;
            }

            var wantSidebar = !!(user && user.platformAccess && path !== '/onboarding.html');
            var guessedSidebar = !!(guessedUser && path !== '/onboarding.html');
            if (wantSidebar !== guessedSidebar || (!!user) !== (!!guessedUser) || !document.getElementById('appSidebar') && wantSidebar) {
                mount(user);
            } else if (user) {
                updateUserChip(user);
            }

            window.updateNavSystemName = function (name) {
                if (!name) return;
                var el1 = document.getElementById('appLogoText');
                if (el1) el1.textContent = name;
            };

            window.getNavStatusContainer = function () {
                return document.getElementById('appNavStatus');
            };

            window.updateTelegramStatus = function () {
                var statusBox = document.getElementById('appNavStatus');
                if (!statusBox || !user) return;
                fetch('/api/telegram/status')
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                        if (data.success && data.data) {
                            updateNavStatusForTelegram();
                        }
                    })
                    .catch(function() {});
            };

            function updateNavStatusForTelegram() {
                var statusBox = document.getElementById('appNavStatus');
                if (!statusBox) return;
                fetch('/api/telegram/status').then(function(r) { return r.json(); })
                .then(function(tgData) {
                    var tgConnected = tgData.success && tgData.data &&
                        (tgData.data.status === 'connected' || tgData.data.status === 'authenticated');
                    var tgClass = tgConnected ? 'nav-status-connected' : 'nav-status-disconnected';
                    var tgLabel = tgConnected ? t('nav.connected') : t('nav.disconnected');
                    statusBox.innerHTML = (
                        '<span class="nav-status-badge ' + tgClass + '">' +
                        '<i class="fa-brands fa-telegram"></i> ' + tgLabel +
                        '</span>'
                    );
                })
                .catch(function() {});
            }

            window.updateWhatsAppStatus = function () {
                var statusBox = document.getElementById('appNavStatus');
                if (!statusBox || !user) return;
                fetch('/api/whatsapp/status')
                    .then(function(res) { return res.json(); })
                    .then(function() { updateNavStatusForWhatsApp(); })
                    .catch(function() {});
            };

            function updateNavStatusForWhatsApp() {
                var statusBox = document.getElementById('appNavStatus');
                if (!statusBox) return;
                fetch('/api/whatsapp/status').then(function(r) { return r.json(); })
                .then(function(waData) {
                    var waConnected = waData.success && waData.data &&
                        !!(waData.data.ready || waData.data.connected);
                    var waClass = waConnected ? 'nav-status-connected' : 'nav-status-disconnected';
                    var waLabel = waConnected ? t('nav.connected') : t('nav.disconnected');
                    statusBox.innerHTML = (
                        '<span class="nav-status-badge ' + waClass + '">' +
                        '<i class="fa-brands fa-whatsapp"></i> ' + waLabel +
                        '</span>'
                    );
                })
                .catch(function() {});
            }

            var isWhatsApp = path.includes('whatsapp');
            var isTelegram = path.includes('telegram');
            if (user && isTelegram) updateNavStatusForTelegram();
            else if (user && isWhatsApp) updateNavStatusForWhatsApp();

            document.dispatchEvent(new CustomEvent('auth-ready', { detail: { user: user } }));

            function refreshSupportBadge() {
                if (!user || !user.platformAccess) return;
                fetch('/api/support/unread', { credentials: 'same-origin' })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        var badge = document.getElementById('supportNavBadge');
                        if (!badge) return;
                        var n = Number(data && data.unread) || 0;
                        badge.hidden = n < 1;
                        badge.textContent = n > 99 ? '99+' : String(n);
                    })
                    .catch(function () {});
            }
            refreshSupportBadge();
            setInterval(refreshSupportBadge, 8000);
        });
    }

    function visitId(key, make) {
        try {
            var value = localStorage.getItem(key);
            if (value) return value;
            value = (make || '') + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(key, value);
            return value;
        } catch (_) {
            return '';
        }
    }

    function readCookie(name) {
        var parts = ('; ' + document.cookie).split('; ' + name + '=');
        if (parts.length < 2) return '';
        return parts.pop().split(';').shift() || '';
    }

    function writeCookie(name, value, minutes) {
        var expires = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
        document.cookie = name + '=' + value + '; expires=' + expires + '; path=/; SameSite=Lax';
    }

    function pingPlatformVisit() {
        var visitorId = visitId('rabt_vid', 'v');
        var newVisitor = false;
        try { newVisitor = !localStorage.getItem('rabt_vid_seen'); localStorage.setItem('rabt_vid_seen', '1'); } catch (_) {}
        var sid = readCookie('rabt_sid');
        var newVisit = false;
        if (!sid) {
            sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            newVisit = true;
        }
        writeCookie('rabt_sid', sid, 30);
        fetch('/api/visit', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                visitorId: visitorId,
                newVisitor: newVisitor,
                newVisit: newVisit,
                path: String(location.pathname || '/')
            }),
            keepalive: true
        }).catch(function () {});
    }

    var initTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', initTheme);

    function startNavbar() {
        if (window.__rabtNavStarted) return;
        if (!document.body) return;
        window.__rabtNavStarted = true;
        initNavbar();
        pingPlatformVisit();
        var cms = window.RabtCmsReady || Promise.resolve();
        cms.then(function () {
            if (window.RabtI18n && window.RabtI18n.applyCms) window.RabtI18n.applyCms();
        });
    }

    if (document.body) {
        startNavbar();
    } else {
        document.addEventListener('DOMContentLoaded', startNavbar);
        var readyWatch = new MutationObserver(function () {
            if (document.body) {
                readyWatch.disconnect();
                startNavbar();
            }
        });
        readyWatch.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
