/* ── Rabط glass toasts, questions, and alerts ─────────────────────────── */
(function () {
    if (window.RabtUI) return;

    var ICONS = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-exclamation',
        warning: 'fa-solid fa-triangle-exclamation',
        info: 'fa-solid fa-circle-info',
        question: 'fa-solid fa-circle-question'
    };
    var TITLES = {
        success: 'Success',
        error: 'Something went wrong',
        warning: 'Please check',
        info: 'Notice',
        question: 'Confirm'
    };
    function tr(s) {
        return (window.RabtI18n && window.RabtI18n.phrase) ? window.RabtI18n.phrase(s) : s;
    }

    function ensureToasts() {
        var el = document.getElementById('rabtToasts');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rabtToasts';
            el.className = 'rabt-toasts';
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        return el;
    }

    function ensureDialog() {
        var overlay = document.getElementById('rabtDialog');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'rabtDialog';
        overlay.className = 'rabt-dialog-overlay';
        overlay.innerHTML =
            '<div class="rabt-dialog" role="dialog" aria-modal="true" aria-labelledby="rabtDialogTitle">' +
                '<div class="rabt-dialog-icon" id="rabtDialogIcon"></div>' +
                '<h3 id="rabtDialogTitle"></h3>' +
                '<p id="rabtDialogMessage"></p>' +
                '<input id="rabtDialogInput" class="rabt-dialog-input" type="text" hidden>' +
                '<div class="rabt-dialog-actions">' +
                    '<button type="button" class="rabt-dialog-btn rabt-dialog-btn-ghost" id="rabtDialogCancel">Cancel</button>' +
                    '<button type="button" class="rabt-dialog-btn rabt-dialog-btn-primary" id="rabtDialogOk">OK</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function cleanMessage(message) {
        return String(message || '').replace(/^[✅❌⚠️]\s*/, '').trim();
    }

    function typeOf(value) {
        if (value === 'error' || value === 'bad') return 'error';
        if (value === false || value === 'ok' || value === 'success') return 'success';
        if (value === 'warning' || value === 'warn') return 'warning';
        if (value === 'question') return 'question';
        return 'info';
    }

    function banner(el, message, type) {
        if (!el) return;
        type = typeOf(type);
        el.className = 'alert show alert-' + type + (type === 'success' ? ' ok' : '') + (type === 'error' ? ' bad' : '');
        el.innerHTML =
            '<span class="alert-icon"><i class="' + ICONS[type] + '"></i></span>' +
            '<span class="alert-copy">' + escapeHtml(tr(cleanMessage(message))) + '</span>';
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function toast(message, type, ttl) {
        type = typeOf(type);
        message = cleanMessage(message);
        if (!message) return;
        var host = ensureToasts();
        var item = document.createElement('div');
        item.className = 'rabt-toast rabt-toast-' + type;
        item.innerHTML =
            '<span class="rabt-toast-icon"><i class="' + ICONS[type] + '"></i></span>' +
            '<div class="rabt-toast-body">' +
                '<strong>' + tr(TITLES[type]) + '</strong>' +
                '<p></p>' +
            '</div>' +
            '<button type="button" class="rabt-toast-close" aria-label="' + tr('Dismiss') + '"><i class="fa-solid fa-xmark"></i></button>';
        item.querySelector('p').textContent = tr(message);
        host.appendChild(item);
        requestAnimationFrame(function () { item.classList.add('show'); });

        var hide = function () {
            item.classList.remove('show');
            setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 280);
        };
        item.querySelector('.rabt-toast-close').addEventListener('click', hide);
        setTimeout(hide, ttl || (type === 'error' ? 5600 : 4200));
    }

    function notify(message, type, targetEl) {
        type = typeOf(type);
        toast(message, type);
        if (targetEl) banner(targetEl, message, type);
    }

    function openDialog(opts) {
        return new Promise(function (resolve) {
            var overlay = ensureDialog();
            var icon = document.getElementById('rabtDialogIcon');
            var title = document.getElementById('rabtDialogTitle');
            var msg = document.getElementById('rabtDialogMessage');
            var input = document.getElementById('rabtDialogInput');
            var cancel = document.getElementById('rabtDialogCancel');
            var ok = document.getElementById('rabtDialogOk');
            var kind = opts.kind || 'question';

            overlay.classList.toggle('danger', !!opts.danger);
            icon.innerHTML = '<i class="' + ICONS[kind] + '"></i>';
            title.textContent = tr(opts.title || TITLES[kind]);
            msg.textContent = tr(cleanMessage(opts.message || ''));
            cancel.textContent = tr(opts.cancelLabel || 'Cancel');
            ok.textContent = tr(opts.confirmLabel || 'OK');
            cancel.style.display = opts.hideCancel ? 'none' : '';

            if (opts.prompt) {
                input.hidden = false;
                input.value = opts.value || '';
                input.placeholder = tr(opts.placeholder || '');
            } else {
                input.hidden = true;
                input.value = '';
            }

            function close(result) {
                overlay.classList.remove('show');
                document.body.classList.remove('app-no-scroll');
                cancel.onclick = ok.onclick = overlay.onclick = null;
                document.removeEventListener('keydown', onKey);
                resolve(result);
            }
            function onKey(e) {
                if (e.key === 'Escape') close(opts.prompt ? null : false);
                if (e.key === 'Enter' && opts.prompt) close(input.value);
            }

            cancel.onclick = function () { close(opts.prompt ? null : false); };
            ok.onclick = function () { close(opts.prompt ? input.value : true); };
            overlay.onclick = function (e) {
                if (e.target === overlay) close(opts.prompt ? null : false);
            };
            document.addEventListener('keydown', onKey);

            overlay.classList.add('show');
            document.body.classList.add('app-no-scroll');
            setTimeout(function () {
                if (opts.prompt) input.focus();
                else ok.focus();
            }, 40);
        });
    }

    function confirmDialog(opts) {
        opts = opts || {};
        opts.kind = opts.danger ? 'warning' : (opts.kind || 'question');
        return openDialog(opts);
    }

    function promptDialog(opts) {
        opts = opts || {};
        opts.prompt = true;
        opts.kind = 'info';
        opts.title = opts.title || 'Enter a value';
        return openDialog(opts);
    }

    function alertDialog(opts) {
        opts = opts || {};
        opts.hideCancel = true;
        opts.kind = opts.kind || 'info';
        opts.confirmLabel = opts.confirmLabel || 'Got it';
        return openDialog(opts).then(function () { return true; });
    }

    function guardNavigation(isBusy, options) {
        if (guardNavigation._bound) return;
        guardNavigation._bound = true;
        document.addEventListener('click', function (e) {
            var link = e.target.closest && e.target.closest('a[href]');
            if (!link || typeof isBusy !== 'function' || !isBusy()) return;
            var href = link.getAttribute('href');
            if (!href || href.charAt(0) === '#') return;
            e.preventDefault();
            e.stopPropagation();
            confirmDialog(options || {
                title: 'Leave this page?',
                message: 'A campaign is still running. You may lose the live progress view.',
                confirmLabel: 'Leave',
                cancelLabel: 'Stay',
                danger: true
            }).then(function (ok) {
                if (!ok) return;
                if (options && typeof options.onLeave === 'function') options.onLeave();
                window.location.href = href;
            });
        }, true);
    }

    window.RabtUI = {
        toast: toast,
        notify: notify,
        banner: banner,
        confirm: confirmDialog,
        prompt: promptDialog,
        alert: alertDialog,
        guardNavigation: guardNavigation
    };
})();
