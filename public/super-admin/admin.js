(function () {
    var alertBox = document.getElementById('alertBox');
    var currentUserFilter = 'all';

    function showAlert(msg, ok) {
        var type = ok ? 'success' : 'error';
        if (window.RabtUI) {
            RabtUI.toast(msg, type);
            if (alertBox) RabtUI.banner(alertBox, msg, type);
            return;
        }
        alertBox.className = 'sa-alert show ' + (ok ? 'ok' : 'bad');
        alertBox.textContent = msg;
        setTimeout(function () { alertBox.className = 'sa-alert'; alertBox.textContent = ''; }, 5000);
    }

    function askConfirm(message, options) {
        options = options || {};
        if (window.RabtUI) {
            return RabtUI.confirm({
                title: options.title || 'Please confirm',
                message: message,
                confirmLabel: options.confirmLabel || 'Confirm',
                cancelLabel: options.cancelLabel || 'Cancel',
                danger: !!options.danger
            });
        }
        return Promise.resolve(window.confirm(message));
    }

    function askPrompt(message, options) {
        options = options || {};
        if (window.RabtUI) {
            return RabtUI.prompt({
                title: options.title || 'Enter a value',
                message: options.message || message || '',
                placeholder: options.placeholder || '',
                value: options.value || '',
                confirmLabel: options.confirmLabel || 'OK',
                cancelLabel: options.cancelLabel || 'Cancel'
            });
        }
        return Promise.resolve(window.prompt(message, options.value || ''));
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtWhen(value) {
        if (value == null || value === '') return '—';
        var num = Number(value);
        var date = new Date(num && String(value).length < 13 && num < 1e12 ? num : value);
        if (Number.isNaN(date.getTime()) && num) date = new Date(num);
        if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
        return date.toLocaleString();
    }

    function fmtBytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fmtUptime(sec) {
        sec = Math.max(0, Number(sec) || 0);
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        return h + 'h ' + m + 'm';
    }

    async function api(url, opts) {
        var options = Object.assign({ credentials: 'same-origin' }, opts || {});
        if (!(options.body instanceof FormData)) {
            options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        }
        var res = await fetch(url, options);
        var data = {};
        try { data = await res.json(); } catch (_) {}
        if (res.status === 401) {
            window.location.replace('/super/admin/platform/login');
            throw new Error(data.message || 'Sign in required');
        }
        if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
        return data;
    }

    function badge(ok, on, off) {
        return '<span class="sa-badge ' + (ok ? 'ok' : 'muted') + '">' + escapeHtml(ok ? on : off) + '</span>';
    }

    function loaders() {
        return {
            overview: loadOverview,
            users: function () { return loadUsers(document.getElementById('userSearch').value); },
            sessions: loadSessions,
            activity: loadActivity,
            schedules: loadSchedules,
            lists: loadLists,
            'marketing-database': loadMarketingDatabase,
            channels: loadChannels,
            engagement: loadEngagement,
            platform: loadSmtp,
            broadcasts: loadBroadcasts,
            settings: loadSettings,
            support: loadSupport,
            contact: loadContact,
            payments: loadPayments
        };
    }

    function showView(name) {
        document.querySelectorAll('main section').forEach(function (el) {
            el.classList.toggle('sa-hidden', el.id !== 'view-' + name);
        });
        document.querySelectorAll('.sa-nav').forEach(function (btn) {
            var view = btn.getAttribute('data-view');
            var active = view === name ||
                (name === 'sessions' && view === 'users') ||
                (name === 'broadcasts' && view === 'platform');
            btn.classList.toggle('active', active);
        });
        var fn = loaders()[name];
        if (fn) fn();
    }

    document.querySelectorAll('.sa-nav').forEach(function (btn) {
        btn.addEventListener('click', function () { showView(btn.getAttribute('data-view')); });
    });

    document.getElementById('logoutBtn').addEventListener('click', async function () {
        await api('/api/super-admin/logout', { method: 'POST' });
        window.location.replace('/super/admin/platform/login');
    });

    async function loadMe() {
        var data = await api('/api/super-admin/me');
        var email = data.admin && data.admin.email ? data.admin.email : 'super admin';
        document.getElementById('adminWho').textContent = 'Signed in as ' + email + '.';
        document.getElementById('adminChip').textContent = email;
    }

    function kpi(label, value, icon) {
        return '<div class="sa-card sa-kpi"><i class="fa-solid ' + (icon || 'fa-circle') + '"></i><div class="label">' +
            escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div></div>';
    }

    function emptyTable(id, message) {
        document.getElementById(id).innerHTML = '<div class="sa-empty">' + escapeHtml(message) + '</div>';
    }

    var saKpiRange = 'week';
    var saRevenueRange = 'week';
    var saKpiFiltersReady = false;

    function toDateInput(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function ensureDatePair(fromId, toId) {
        var fromEl = document.getElementById(fromId);
        var toEl = document.getElementById(toId);
        if (!fromEl.value || !toEl.value) {
            var to = new Date();
            var from = new Date();
            from.setDate(from.getDate() - 6);
            fromEl.value = toDateInput(from);
            toEl.value = toDateInput(to);
        }
    }

    function loadSavedSaRange() {
        try {
            var saved = JSON.parse(localStorage.getItem('saKpiChartRange') || 'null');
            if (saved && saved.range) {
                saKpiRange = saved.range;
                if (saved.from) document.getElementById('saKpiFrom').value = saved.from;
                if (saved.to) document.getElementById('saKpiTo').value = saved.to;
            }
        } catch (_) {}
        try {
            var rev = JSON.parse(localStorage.getItem('saRevenueChartRange') || 'null');
            if (rev && rev.range) {
                saRevenueRange = rev.range;
                if (rev.from) document.getElementById('saRevenueFrom').value = rev.from;
                if (rev.to) document.getElementById('saRevenueTo').value = rev.to;
            }
        } catch (_) {}
    }

    function saveSaRange() {
        localStorage.setItem('saKpiChartRange', JSON.stringify({
            range: saKpiRange,
            from: document.getElementById('saKpiFrom').value,
            to: document.getElementById('saKpiTo').value
        }));
        localStorage.setItem('saRevenueChartRange', JSON.stringify({
            range: saRevenueRange,
            from: document.getElementById('saRevenueFrom').value,
            to: document.getElementById('saRevenueTo').value
        }));
    }

    function overviewQuery() {
        var q = '/api/super-admin/overview?range=' + encodeURIComponent(saKpiRange || 'week') +
            '&revenueRange=' + encodeURIComponent(saRevenueRange || 'week');
        if (saKpiRange === 'custom') {
            var from = document.getElementById('saKpiFrom').value;
            var to = document.getElementById('saKpiTo').value;
            if (from) q += '&from=' + encodeURIComponent(from);
            if (to) q += '&to=' + encodeURIComponent(to);
        }
        if (saRevenueRange === 'custom') {
            var rFrom = document.getElementById('saRevenueFrom').value;
            var rTo = document.getElementById('saRevenueTo').value;
            if (rFrom) q += '&revenueFrom=' + encodeURIComponent(rFrom);
            if (rTo) q += '&revenueTo=' + encodeURIComponent(rTo);
        }
        return q;
    }

    function syncRangeButtons(groupId, range) {
        var group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('.sa-kpi-range-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-range') === range);
        });
    }

    function setSaRange(range, skipLoad) {
        saKpiRange = range || 'week';
        syncRangeButtons('saKpiRange', saKpiRange);
        var custom = document.getElementById('saKpiCustom');
        if (saKpiRange === 'custom') {
            custom.classList.add('show');
            ensureDatePair('saKpiFrom', 'saKpiTo');
        } else {
            custom.classList.remove('show');
        }
        saveSaRange();
        if (!skipLoad) loadOverview();
    }

    function setRevenueRange(range, skipLoad) {
        saRevenueRange = range || 'week';
        syncRangeButtons('saRevenueRange', saRevenueRange);
        var custom = document.getElementById('saRevenueCustom');
        if (saRevenueRange === 'custom') {
            custom.classList.add('show');
            ensureDatePair('saRevenueFrom', 'saRevenueTo');
        } else {
            custom.classList.remove('show');
        }
        saveSaRange();
        if (!skipLoad) loadOverview();
    }

    function initSaChartFilters() {
        if (saKpiFiltersReady) return;
        saKpiFiltersReady = true;
        loadSavedSaRange();
        document.querySelectorAll('#saKpiRange .sa-kpi-range-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setSaRange(btn.getAttribute('data-range'));
            });
        });
        document.querySelectorAll('#saRevenueRange .sa-kpi-range-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setRevenueRange(btn.getAttribute('data-range'));
            });
        });
        document.getElementById('saKpiApply').addEventListener('click', function () {
            saKpiRange = 'custom';
            syncRangeButtons('saKpiRange', 'custom');
            document.getElementById('saKpiCustom').classList.add('show');
            saveSaRange();
            loadOverview();
        });
        document.getElementById('saRevenueApply').addEventListener('click', function () {
            saRevenueRange = 'custom';
            syncRangeButtons('saRevenueRange', 'custom');
            document.getElementById('saRevenueCustom').classList.add('show');
            saveSaRange();
            loadOverview();
        });
        setSaRange(saKpiRange, true);
        setRevenueRange(saRevenueRange, true);
    }

    function chartLabel(iso, grain, index, total) {
        var d = new Date(iso);
        if (grain === 'hour') {
            var h = d.getHours();
            var suffix = h >= 12 ? 'pm' : 'am';
            var h12 = h % 12 || 12;
            return h12 + suffix;
        }
        if (grain === 'month') {
            return d.toLocaleString(undefined, { month: 'short' });
        }
        if (total > 16) return d.getDate();
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
    }

    function shouldShowLabel(index, total, grain) {
        if (total <= 14) return true;
        if (grain === 'month') return true;
        if (grain === 'hour') return index % 3 === 0 || index === total - 1;
        var step = total > 40 ? 4 : 2;
        return index % step === 0 || index === total - 1;
    }

    function niceMax(value) {
        var n = Math.max(1, Number(value) || 1);
        if (n <= 5) return 5;
        var exp = Math.pow(10, Math.floor(Math.log10(n)));
        var scaled = n / exp;
        var nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
        return nice * exp;
    }

    function renderBarChart(targetId, options) {
        var el = document.getElementById(targetId);
        if (!el) return;
        var list = options.buckets || [];
        if (!list.length) {
            el.innerHTML = '<div class="sa-empty">No data in this range.</div>';
            return;
        }
        var max = niceMax(options.max || 1);
        var ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0];
        var grain = options.grain || 'day';
        var bars = list.map(function (bucket, index) {
            var segments = options.segments(bucket) || [];
            var total = segments.reduce(function (sum, seg) { return sum + (Number(seg.value) || 0); }, 0);
            var heightPct = total ? Math.max(4, Math.round((total / max) * 100)) : 0;
            var showLabel = shouldShowLabel(index, list.length, grain);
            var tip = options.tip ? options.tip(bucket) : String(total);
            var segsHtml = segments.filter(function (seg) { return Number(seg.value) > 0; }).map(function (seg) {
                var share = total ? Math.max(6, Math.round((Number(seg.value) / total) * 100)) : 0;
                return '<div class="sa-chart-seg ' + escapeHtml(seg.cls || '') + '" style="flex:' + share + '"></div>';
            }).join('');
            return '<div class="sa-chart-col" tabindex="0">' +
                '<div class="sa-chart-tip">' + escapeHtml(tip) + '</div>' +
                '<div class="sa-chart-col-plot">' +
                    (total ? '<div class="sa-chart-val">' + escapeHtml(options.valueLabel ? options.valueLabel(total, bucket) : String(total)) + '</div>' : '') +
                    '<div class="sa-chart-bar' + (total ? '' : ' is-empty') + '" data-h="' + heightPct + '">' +
                        (segsHtml || '<div class="sa-chart-seg empty"></div>') +
                    '</div>' +
                '</div>' +
                '<div class="sa-chart-xlabel">' + (showLabel ? escapeHtml(chartLabel(bucket.at, grain, index, list.length)) : '') + '</div>' +
            '</div>';
        }).join('');
        el.classList.remove('is-ready');
        el.innerHTML =
            '<div class="sa-chart">' +
                '<div class="sa-chart-yaxis">' + ticks.map(function (t) {
                    return '<span>' + escapeHtml(options.axisLabel ? options.axisLabel(t) : String(t)) + '</span>';
                }).join('') + '</div>' +
                '<div class="sa-chart-plot">' +
                    '<div class="sa-chart-grid">' + ticks.map(function () { return '<i></i>'; }).join('') + '</div>' +
                    '<div class="sa-chart-bars">' + bars + '</div>' +
                '</div>' +
            '</div>';
        requestAnimationFrame(function () {
            el.classList.add('is-ready');
            el.querySelectorAll('.sa-chart-bar').forEach(function (bar) {
                if (bar.classList.contains('is-empty')) return;
                bar.style.height = (bar.getAttribute('data-h') || '0') + '%';
            });
        });
    }

    function renderOverviewChart(chart) {
        chart = chart || {};
        var list = chart.buckets || [];
        var grain = chart.grain || 'hour';
        var summary = chart.summary || {};
        document.getElementById('saChartTitle').innerHTML = '<i class="fa-solid fa-chart-column"></i> ' + escapeHtml(chart.label || 'Activity chart');
        document.getElementById('saChartSub').textContent = grain === 'hour'
            ? 'Hourly sends and failures · live data'
            : (grain === 'month' ? 'Monthly sends and failures · live data' : 'Daily sends and failures · live data');
        document.getElementById('saChartSummary').textContent =
            (summary.sent || 0) + ' sent · ' + (summary.failed || 0) + ' failed · ' + (summary.jobs || 0) + ' jobs';
        var max = 1;
        list.forEach(function (b) { max = Math.max(max, Number(b.sent || 0) + Number(b.failed || 0)); });
        renderBarChart('overviewBars', {
            buckets: list,
            grain: grain,
            max: max,
            segments: function (bucket) {
                return [
                    { cls: 'sent', value: Number(bucket.sent || 0) },
                    { cls: 'failed', value: Number(bucket.failed || 0) }
                ];
            },
            tip: function (bucket) {
                return (bucket.sent || 0) + ' sent / ' + (bucket.failed || 0) + ' failed';
            }
        });
    }

    function fmtMoney(n) {
        var value = Number(n) || 0;
        return '$' + value.toLocaleString(undefined, { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 });
    }

    function renderRevenueChart(revenue) {
        revenue = revenue || {};
        var chart = revenue.chart || {};
        var list = chart.buckets || [];
        var grain = chart.grain || 'day';
        var summary = chart.summary || {};
        document.getElementById('saRevenueTitle').innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Total revenue';
        document.getElementById('saRevenueSub').textContent =
            (chart.label || 'Selected range') + ' · verified payments only';
        document.getElementById('saRevenueSummary').textContent =
            fmtMoney(summary.revenue || 0) + ' in range · ' + (summary.count || 0) + ' verified payments';
        document.getElementById('revenueSplit').innerHTML =
            '<div class="sa-revenue-pill"><span>All time</span> ' + escapeHtml(fmtMoney(revenue.totalRevenue || 0)) + '</div>' +
            '<div class="sa-revenue-pill"><span>This month</span> ' + escapeHtml(fmtMoney(revenue.revenueThisMonth || 0)) + '</div>' +
            '<div class="sa-revenue-pill"><span>1 Month plans</span> ' + escapeHtml(fmtMoney(revenue.monthlyPlanRevenue || 0)) + '</div>' +
            '<div class="sa-revenue-pill"><span>3 Months plans</span> ' + escapeHtml(fmtMoney(revenue.quarterlyPlanRevenue || 0)) + '</div>' +
            '<div class="sa-revenue-pill"><span>Pending</span> ' + escapeHtml(fmtMoney(revenue.pendingAmount || 0)) + '</div>';
        var max = 1;
        list.forEach(function (b) { max = Math.max(max, Number(b.revenue || 0)); });
        renderBarChart('revenueBars', {
            buckets: list,
            grain: grain,
            max: max,
            segments: function (bucket) {
                return [{ cls: 'revenue', value: Number(bucket.revenue || 0) }];
            },
            tip: function (bucket) {
                return fmtMoney(bucket.revenue || 0) + ' · ' + (bucket.count || 0) + ' payment' + ((bucket.count || 0) === 1 ? '' : 's');
            },
            valueLabel: function (total) {
                return fmtMoney(total);
            },
            axisLabel: function (n) {
                return fmtMoney(n);
            }
        });
    }

    function renderOverviewPayments(rows) {
        rows = rows || [];
        var wrap = document.getElementById('overviewPayments');
        if (!wrap) return;
        if (!rows.length) {
            wrap.innerHTML = '<div class="sa-empty">No verified payments yet.</div>';
            return;
        }
        wrap.innerHTML = '<table class="sa-table"><thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Verified</th></tr></thead><tbody>' +
            rows.map(function (row) {
                return '<tr>' +
                    '<td>' + escapeHtml(row.name || row.email || '—') + '</td>' +
                    '<td>' + escapeHtml(row.planName || row.planId || '—') + '</td>' +
                    '<td>' + escapeHtml(fmtMoney(row.amount)) + '</td>' +
                    '<td>' + fmtWhen(row.reviewedAt || row.submittedAt) + '</td>' +
                    '</tr>';
            }).join('') +
            '</tbody></table>';
    }

    async function loadOverview() {
        var data = await api(overviewQuery());
        var t = data.totals || {};
        var h = data.health || {};
        var revenue = data.revenue || {};
        document.getElementById('overviewHealth').innerHTML =
            '<span class="sa-pill"><i class="fa-solid fa-plug"></i> SMTP ' + (h.platformSmtp ? 'ready' : 'not set') + '</span>' +
            '<span class="sa-pill"><i class="fa-solid fa-clock"></i> Up ' + fmtUptime(h.uptimeSec) + '</span>' +
            '<span class="sa-pill"><i class="fa-solid fa-memory"></i> ' + escapeHtml(h.memoryMb || 0) + ' MB</span>' +
            '<span class="sa-pill"><i class="fa-solid fa-code-branch"></i> ' + escapeHtml(h.node || '') + '</span>' +
            '<span class="sa-pill"><i class="fa-solid fa-user-plus"></i> Signups ' + (h.signupEnabled === false ? 'closed' : 'open') + '</span>' +
            '<span class="sa-pill"><i class="fa-solid fa-screwdriver-wrench"></i> ' + (h.maintenanceMode ? 'Maintenance on' : 'Live') + '</span>';
        document.getElementById('overviewKpis').innerHTML =
            kpi('Total Revenue', fmtMoney(t.totalRevenue || revenue.totalRevenue || 0), 'fa-dollar-sign') +
            kpi('Revenue this month', fmtMoney(t.revenueThisMonth || revenue.revenueThisMonth || 0), 'fa-calendar-check') +
            kpi('Verified payments', t.approvedPayments || revenue.approvedCount || 0, 'fa-file-invoice-dollar') +
            kpi('Pending payments', t.pendingPayments || 0, 'fa-hourglass-half') +
            kpi('Total Platform Visit', t.visits || 0, 'fa-eye') +
            kpi('Users', t.users || 0, 'fa-users') +
            kpi('Verified', t.verified || 0, 'fa-circle-check') +
            kpi('Active plans', t.activeSubscriptions || 0, 'fa-crown') +
            kpi('Disabled', t.disabled || 0, 'fa-ban') +
            kpi('Open sessions', t.sessions || 0, 'fa-key') +
            kpi('Sent today', t.sentToday || 0, 'fa-paper-plane') +
            kpi('Failed today', t.failedToday || 0, 'fa-triangle-exclamation') +
            kpi('Sent this week', t.sentWeek || 0, 'fa-calendar-week') +
            kpi('Opens tracked', t.opens || 0, 'fa-envelope-open') +
            kpi('Clicks tracked', t.clicks || 0, 'fa-computer-mouse') +
            kpi('WhatsApp live', t.whatsappConnected || 0, 'fa-comments') +
            kpi('Telegram live', t.telegramConnected || 0, 'fa-paper-plane') +
            kpi('Email SMTP set', t.emailConfigured || 0, 'fa-server');
        renderOverviewChart(data.chart);
        renderRevenueChart(revenue);
        renderOverviewPayments(revenue.recentApproved || []);
        var rows = (data.recentUsers || []).map(function (u) {
            return '<tr data-jump="' + escapeHtml(u.id) + '"><td>' + escapeHtml(u.name) + '</td><td>' + escapeHtml(u.email) + '</td><td>' +
                badge(u.emailVerified, 'Verified', 'OTP pending') + ' ' +
                badge(!u.disabled, 'Active', 'Disabled') + '</td></tr>';
        }).join('');
        document.getElementById('overviewUsers').innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No users yet.</div>';
        document.getElementById('overviewUsers').querySelectorAll('[data-jump]').forEach(function (row) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', function () {
                document.getElementById('userSearch').value = row.getAttribute('data-jump');
                showView('users');
            });
        });
        var feed = (data.recentActivity || []).map(function (ev) {
            return '<div class="sa-feed-item"><div class="muted">' + escapeHtml(fmtWhen(ev.at)) + '</div><div><strong>' +
                escapeHtml(ev.label || ev.action || ev.channel) + '</strong><div class="muted">' +
                escapeHtml(ev.userName || '') + ' · ' + escapeHtml(ev.channel || '') +
                (ev.error ? ' · ' + escapeHtml(ev.error) : '') + '</div></div><div>' +
                badge(!ev.failed, (ev.sent || 0) + ' sent', (ev.failed || 0) + ' failed') + '</div></div>';
        }).join('');
        document.getElementById('overviewActivity').innerHTML = feed || '<div class="sa-empty">No activity yet.</div>';
    }

    function selectedUserIds() {
        return Array.prototype.map.call(document.querySelectorAll('#usersTable input[data-uid]:checked'), function (el) {
            return el.getAttribute('data-uid');
        });
    }

    async function loadUsers(q) {
        try {
            var data = await api('/api/super-admin/users' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
            var list = data.data || [];
            if (currentUserFilter === 'verified') list = list.filter(function (u) { return u.emailVerified && !u.disabled; });
            if (currentUserFilter === 'pending') list = list.filter(function (u) { return !u.emailVerified; });
            if (currentUserFilter === 'disabled') list = list.filter(function (u) { return u.disabled; });
            if (currentUserFilter === 'active') list = list.filter(function (u) { return (u.sessionCount || 0) > 0; });
            document.getElementById('usersTable').innerHTML = list.length
                ? list.map(userCardHtml).join('')
                : '<div class="sa-empty">No matching users.</div>';
            bindUserCardActions();
        } catch (err) {
            document.getElementById('usersTable').innerHTML = '<div class="sa-empty">Could not load users.</div>';
            showAlert(err.message || 'Could not load users', false);
        }
    }

    function na(value) {
        if (value == null || value === '') return 'N/A';
        return String(value);
    }

    function whenOrNA(value) {
        var text = fmtWhen(value);
        return text === '—' ? 'N/A' : text;
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        var a = (parts[0] || '?').charAt(0);
        var b = parts.length > 1 ? parts[1].charAt(0) : (parts[0] || '').charAt(1) || '';
        return (a + b).toUpperCase();
    }

    function avatarColor(name) {
        var hash = 0;
        String(name || '').split('').forEach(function (ch) {
            hash = ((hash << 5) - hash) + ch.charCodeAt(0);
            hash |= 0;
        });
        var hues = [262, 198, 162, 24, 338, 284, 210];
        return 'hsl(' + hues[Math.abs(hash) % hues.length] + ' 58% 48%)';
    }

    function chip(kind, label) {
        return '<span class="sa-chip ' + kind + '">' + escapeHtml(label) + '</span>';
    }

    function infoCell(icon, label, value) {
        return '<div class="sa-uprofile-cell">' +
            '<span class="k"><i class="fa-solid ' + icon + '"></i> ' + escapeHtml(label) + '</span>' +
            '<span class="v">' + escapeHtml(na(value)) + '</span>' +
        '</div>';
    }

    function infoRow(left, right) {
        return left + (right || '');
    }

    function userField(id, name) {
        return document.getElementById(name + '-' + id);
    }

    function userCardHtml(u) {
        var ch = u.channels || {};
        var eng = u.engagement || {};
        var emailEng = eng.email || {};
        var waEng = eng.whatsapp || {};
        var tgEng = eng.telegram || {};
        var support = u.support || {};
        var wa = ch.whatsapp || {};
        var tg = ch.telegram || {};
        var phone = wa.phone || tg.phone || '';
        var id = escapeHtml(u.id);
        var ob = u.onboarding || {};
        var photo = ob.hasAvatar
            ? '<img class="sa-uprofile-avatar sa-uprofile-photo" src="/api/super-admin/users/' + id + '/avatar" alt="">'
            : '<div class="sa-uprofile-avatar" style="background:' + avatarColor(u.name) + '">' + escapeHtml(initials(u.name)) + '</div>';
        var surveyStatus = (u.onboardingCompleted || ob.completed)
            ? (ob.skipped ? 'Skipped' : 'Completed')
            : 'Pending';
        var surveyBlock = '<div class="sa-survey">' +
            '<div class="sa-survey-title"><i class="fa-solid fa-clipboard-list"></i> Survey</div>' +
            '<div class="sa-survey-grid">' +
                infoCell('fa-circle-check', 'Status:', surveyStatus) +
                infoCell('fa-bullhorn', 'Heard about Rabط:', ob.hearAbout) +
                infoCell('fa-user-tie', 'Position:', ob.role) +
                infoCell('fa-bullseye', 'Main use:', ob.goals) +
                infoCell('fa-star', 'Interests:', (ob.interests || []).join(', ')) +
                infoCell('fa-heart', 'Hobbies:', (ob.hobbies || []).join(', ')) +
                infoCell('fa-building', 'Company:', ob.company) +
                infoCell('fa-globe', 'Website:', ob.website) +
            '</div></div>';
        return '<article class="sa-uprofile" data-user-id="' + id + '">' +
            '<div class="sa-uprofile-head">' +
                '<label class="sa-uprofile-check"><input type="checkbox" data-uid="' + id + '"></label>' +
                photo +
                '<div class="sa-uprofile-who">' +
                    '<h2>' + escapeHtml(u.name || 'User') + '</h2>' +
                    '<p>' + escapeHtml(u.email || '') + '</p>' +
                    '<div class="sa-uprofile-pills">' +
                        chip('role', 'USER') +
                        chip(u.disabled ? 'off' : 'on', u.disabled ? 'DISABLED' : 'ACTIVE') +
                        chip(u.emailVerified ? 'ok' : 'warn', u.emailVerified ? 'VERIFIED' : (u.otpPending ? 'OTP PENDING' : 'UNVERIFIED')) +
                        chip(subChip(u.subscriptionStatus), subLabel(u.subscriptionStatus)) +
                    '</div>' +
                '</div>' +
            '</div>' +
            surveyBlock +
            '<div class="sa-survey" style="margin-top:12px;">' +
                '<div class="sa-survey-title"><i class="fa-solid fa-crown"></i> Subscription</div>' +
                '<div class="sa-survey-grid">' +
                    infoCell('fa-calendar', 'Plan:', u.planName || u.planId || '—') +
                    infoCell('fa-credit-card', 'Payment status:', payStatusLabel(u.paymentStatus)) +
                    infoCell('fa-signal', 'Subscription:', subLabel(u.subscriptionStatus)) +
                    infoCell('fa-play', 'Start date:', whenOrNA(u.subscriptionStartedAt)) +
                    infoCell('fa-hourglass-end', 'Expiration:', whenOrNA(u.subscriptionExpiresAt)) +
                    infoCell('fa-clock', 'Days remaining:', daysLeftLabel(u)) +
                '</div>' +
                paymentHistoryHtml(u.paymentHistory) +
            '</div>' +
            '<div class="sa-uprofile-grid">' +
            infoRow(infoCell('fa-id-card', 'User ID:', u.id), infoCell('fa-at', 'Invite code:', u.inviteCode)) +
            infoRow(infoCell('fa-phone', 'Phone:', phone), infoCell('fa-envelope', 'Email SMTP:', ch.emailUser || (ch.emailConfigured ? 'Configured' : ''))) +
            infoRow(infoCell('fa-key', 'Sign-in:', 'Email password'), infoCell('fa-globe', 'IP Address:', u.lastLoginIp || u.signupIp)) +
            infoRow(infoCell('fa-calendar-plus', 'Joined:', whenOrNA(u.createdAt)), infoCell('fa-right-to-bracket', 'Last login:', whenOrNA(u.lastLoginAt))) +
            infoRow(infoCell('fa-circle-check', 'Verified at:', whenOrNA(u.verifiedAt)), infoCell('fa-user-plus', 'Invited by:', u.invitedByName ? (u.invitedByName + ' (' + u.invitedByEmail + ')') : '')) +
            infoRow(infoCell('fa-address-book', 'Lists:', u.listCount || 0), infoCell('fa-users', 'Contacts:', u.contactCount || 0)) +
            infoRow(infoCell('fa-calendar-check', 'Schedules:', u.scheduleCount || 0), infoCell('fa-hourglass-half', 'Waiting jobs:', u.waitingSchedules || 0)) +
            infoRow(infoCell('fa-key', 'Open sessions:', u.sessionCount || 0), infoCell('fa-hard-drive', 'Storage:', fmtBytes(u.storageBytes))) +
            infoRow(infoCell('fa-paper-plane', 'Sent today:', (u.today && u.today.sent) || 0), infoCell('fa-triangle-exclamation', 'Failed today:', (u.today && u.today.failed) || 0)) +
            infoRow(infoCell('fa-envelope-open', 'Email opens / clicks:', (emailEng.opened || 0) + ' / ' + (emailEng.clicked || 0)), infoCell('fa-chart-line', 'Email sent:', emailEng.sent || 0)) +
            infoRow(
                '<div class="sa-uprofile-cell"><span class="k"><i class="fa-brands fa-whatsapp"></i> WhatsApp:</span><span class="v">' +
                    escapeHtml(wa.connected ? (wa.phone || wa.status || 'Connected') : 'Off') + '</span></div>',
                '<div class="sa-uprofile-cell"><span class="k"><i class="fa-brands fa-telegram"></i> Telegram:</span><span class="v">' +
                    escapeHtml(tg.connected ? (tg.username || tg.phone || tg.status || 'Connected') : 'Off') + '</span></div>'
            ) +
            infoRow(infoCell('fa-comment-dots', 'WhatsApp sent / read:', (waEng.sent || 0) + ' / ' + (waEng.read || 0)), infoCell('fa-comments', 'Telegram sent / read:', (tgEng.sent || 0) + ' / ' + (tgEng.read || 0))) +
            infoRow(infoCell('fa-user-group', 'Friends invited:', u.invitedCount || 0), infoCell('fa-headset', 'Support messages:', support.messageCount || 0)) +
            '</div>' +
            '<div class="sa-uprofile-privacy">' +
                '<div class="k"><i class="fa-solid fa-shield-halved"></i> Channels</div>' +
                '<div class="sa-uprofile-pills">' +
                    chip(ch.emailConfigured ? 'teal' : 'soft', ch.emailConfigured ? 'Email SMTP On' : 'Email SMTP Off') +
                    chip(wa.connected ? 'teal' : 'soft', wa.connected ? 'WhatsApp On' : 'WhatsApp Off') +
                    chip(tg.connected ? 'teal' : 'soft', tg.connected ? 'Telegram On' : 'Telegram Off') +
                    chip((u.sessionCount || 0) > 0 ? 'teal' : 'soft', (u.sessionCount || 0) > 0 ? 'Session Active' : 'No Session') +
                '</div>' +
            '</div>' +
            '<div class="sa-uprofile-cta">' +
                '<button type="button" class="sa-ubtn sa-ubtn-loc" data-act="location" data-id="' + id + '"><i class="fa-solid fa-location-dot"></i> View Location</button>' +
                '<button type="button" class="sa-ubtn sa-ubtn-ban" data-act="disable" data-id="' + id + '">' + (u.disabled ? 'Enable' : 'Disable') + '</button>' +
                '<button type="button" class="sa-ubtn sa-ubtn-otp" data-act="verify" data-id="' + id + '">' + (u.emailVerified ? 'Mark unverified' : 'Mark verified') + '</button>' +
                '<button type="button" class="sa-ubtn sa-ubtn-del" data-act="delete" data-id="' + id + '"><i class="fa-solid fa-trash"></i> Delete</button>' +
            '</div>' +
            '<details class="sa-user-manage">' +
                '<summary>Account actions</summary>' +
                '<div class="sa-form-row">' +
                    '<input class="sa-input" id="editName-' + id + '" value="' + escapeHtml(u.name) + '">' +
                    '<input class="sa-input" id="editEmail-' + id + '" value="' + escapeHtml(u.email) + '">' +
                '</div>' +
                '<div class="sa-actions" style="margin-bottom:12px;">' +
                    '<button class="sa-btn sa-btn-primary sa-btn-sm" type="button" data-act="save" data-id="' + id + '">Save profile</button>' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" type="button" data-act="revoke" data-id="' + id + '">Revoke sessions</button>' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" type="button" data-act="otp" data-id="' + id + '">Resend OTP</button>' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" type="button" data-act="disc-wa" data-id="' + id + '">Disconnect WhatsApp</button>' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" type="button" data-act="disc-tg" data-id="' + id + '">Disconnect Telegram</button>' +
                '</div>' +
                '<input class="sa-input" id="resetPass-' + id + '" placeholder="New password">' +
                '<div class="sa-actions" style="margin-bottom:14px;">' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" type="button" data-act="password" data-id="' + id + '">Reset password</button>' +
                '</div>' +
            '</details>' +
        '</article>';
    }

    var userCardsBound = false;
    function bindUserCardActions() {
        if (userCardsBound) return;
        userCardsBound = true;
        document.getElementById('usersTable').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-act]');
            if (!btn || !document.getElementById('usersTable').contains(btn)) return;
            handleUserCardAction(btn).catch(function (err) { showAlert(err.message, false); });
        });
    }

    async function handleUserCardAction(btn) {
        var id = btn.getAttribute('data-id');
        var act = btn.getAttribute('data-act');
        if (!id || !act) return;
        if (act === 'location') {
            await openLocationModal(id);
            return;
        }
        if (act === 'disable') {
            var disableNow = btn.textContent.trim() !== 'Enable';
            await api('/api/super-admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ disabled: disableNow }) });
            showAlert(disableNow ? 'User disabled.' : 'User enabled.', true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'verify') {
            var makeVerified = btn.textContent.indexOf('unverified') === -1;
            await api('/api/super-admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ emailVerified: makeVerified }) });
            showAlert('Verification updated.', true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'delete') {
            if (!(await askConfirm('Delete this user and their workspace data? This cannot be undone.', { danger: true, title: 'Delete user?' }))) return;
            await api('/api/super-admin/users/' + id, { method: 'DELETE' });
            showAlert('User deleted.', true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'save') {
            await api('/api/super-admin/users/' + id, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: userField(id, 'editName').value,
                    email: userField(id, 'editEmail').value
                })
            });
            showAlert('User updated.', true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'password') {
            await api('/api/super-admin/users/' + id + '/password', {
                method: 'POST',
                body: JSON.stringify({ password: userField(id, 'resetPass').value })
            });
            showAlert('Password reset.', true);
            return;
        }
        if (act === 'revoke') {
            var revoked = await api('/api/super-admin/users/' + id + '/sessions/revoke', { method: 'POST' });
            showAlert(revoked.message, true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'otp') {
            var otp = await api('/api/super-admin/users/' + id + '/resend-otp', { method: 'POST' });
            showAlert(otp.message, true);
            return;
        }
        if (act === 'disc-wa') {
            var wa = await api('/api/super-admin/channels/' + id + '/whatsapp/disconnect', { method: 'POST' });
            showAlert(wa.message, true);
            return loadUsers(document.getElementById('userSearch').value);
        }
        if (act === 'disc-tg') {
            var tg = await api('/api/super-admin/channels/' + id + '/telegram/disconnect', { method: 'POST' });
            showAlert(tg.message, true);
            return loadUsers(document.getElementById('userSearch').value);
        }
    }

    document.getElementById('userSearch').addEventListener('input', function () {
        loadUsers(this.value).catch(function (err) { showAlert(err.message, false); });
    });
    document.getElementById('userFilter').addEventListener('change', function () {
        currentUserFilter = this.value;
        loadUsers(document.getElementById('userSearch').value);
    });
    document.getElementById('userRefresh').addEventListener('click', function () { loadUsers(document.getElementById('userSearch').value); });
    document.getElementById('openSessions').addEventListener('click', function () { showView('sessions'); });
    document.getElementById('sessBackUsers').addEventListener('click', function () { showView('users'); });
    document.getElementById('openBroadcasts').addEventListener('click', function () { showView('broadcasts'); });
    document.getElementById('bcBackPlatform').addEventListener('click', function () { showView('platform'); });
    document.getElementById('refreshOverview').addEventListener('click', loadOverview);
    document.getElementById('globalSearch').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        document.getElementById('userSearch').value = this.value;
        showView('users');
    });

    document.getElementById('bulkBar').addEventListener('click', async function (e) {
        var btn = e.target.closest('[data-bulk]');
        if (!btn) return;
        var ids = selectedUserIds();
        if (!ids.length) return showAlert('Select at least one user.', false);
        try {
            var r = await api('/api/super-admin/users/bulk', { method: 'POST', body: JSON.stringify({ ids: ids, action: btn.getAttribute('data-bulk') }) });
            showAlert(r.message, true);
            loadUsers(document.getElementById('userSearch').value);
        } catch (err) { showAlert(err.message, false); }
    });

    async function loadSchedules() {
        var data = await api('/api/super-admin/schedules');
        var rows = (data.data || []).map(function (s) {
            return '<tr>' +
                '<td><strong>' + escapeHtml(s.name) + '</strong><div style="color:#6b7389;font-size:12px;">' + escapeHtml(s.userName) + ' · ' + escapeHtml(s.userEmail) + '</div></td>' +
                '<td>' + escapeHtml(s.type) + '<br>' + escapeHtml(s.repeat) + '</td>' +
                '<td>' + escapeHtml(s.status) + '<div style="color:#6b7389;font-size:12px;">' + fmtWhen(s.nextRun || s.date) + '</div></td>' +
                '<td class="sa-actions">' +
                    (s.status === 'waiting' ? '<button class="sa-btn sa-btn-ghost sa-btn-sm" data-act="cancel" data-id="' + escapeHtml(s.id) + '">Cancel</button>' : '') +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" data-act="run" data-id="' + escapeHtml(s.id) + '">Run</button>' +
                    '<button class="sa-btn sa-btn-danger sa-btn-sm" data-act="del" data-id="' + escapeHtml(s.id) + '">Delete</button>' +
                '</td></tr>';
        }).join('');
        var wrap = document.getElementById('schedulesTable');
        wrap.innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>Campaign</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No schedules.</div>';
        wrap.querySelectorAll('[data-act]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var id = btn.getAttribute('data-id');
                var act = btn.getAttribute('data-act');
                try {
                    if (act === 'cancel') await api('/api/super-admin/schedules/' + id + '/cancel', { method: 'POST' });
                    if (act === 'run') await api('/api/super-admin/schedules/' + id + '/run-now', { method: 'POST' });
                    if (act === 'del') {
                        if (!(await askConfirm('Delete this schedule?', { danger: true, title: 'Delete schedule?' }))) return;
                        await api('/api/super-admin/schedules/' + id, { method: 'DELETE' });
                    }
                    showAlert('Done.', true);
                    loadSchedules();
                } catch (err) { showAlert(err.message, false); }
            });
        });
    }

    async function loadLists() {
        var data = await api('/api/super-admin/lists');
        var rows = (data.data || []).map(function (l) {
            return '<tr>' +
                '<td>' + escapeHtml(l.name) + '<div style="color:#6b7389;font-size:12px;">' + escapeHtml(l.userName) + ' · ' + escapeHtml(l.userEmail) + '</div></td>' +
                '<td>' + escapeHtml(l.kind) + '</td>' +
                '<td>' + escapeHtml(l.recordCount || 0) + '</td>' +
                '<td><button class="sa-btn sa-btn-danger sa-btn-sm" data-uid="' + escapeHtml(l.userId) + '" data-id="' + escapeHtml(l.id) + '">Delete</button></td></tr>';
        }).join('');
        var wrap = document.getElementById('listsTable');
        wrap.innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>List</th><th>Kind</th><th>Contacts</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No lists.</div>';
        wrap.querySelectorAll('button[data-id]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                if (!(await askConfirm('Delete this list?', { danger: true, title: 'Delete list?' }))) return;
                try {
                    await api('/api/super-admin/lists/' + encodeURIComponent(btn.getAttribute('data-uid')) + '/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' });
                    showAlert('List deleted.', true);
                    loadLists();
                } catch (err) { showAlert(err.message, false); }
            });
        });
    }

    async function loadMarketingDatabase() {
        var data = await api('/api/super-admin/marketing-database');
        var rows = (data.data || []).map(function (l) {
            return '<tr>' +
                '<td><strong>' + escapeHtml(l.name) + '</strong>' +
                    (l.description ? '<div style="color:#6b7389;font-size:12px;">' + escapeHtml(l.description) + '</div>' : '') +
                    '<div style="color:#94a3b8;font-size:11px;">' + escapeHtml(l.originalName || '') + '</div></td>' +
                '<td>' + escapeHtml(l.kind) + '</td>' +
                '<td>' + escapeHtml(l.recordCount || 0) + '</td>' +
                '<td>' + (l.active !== false ? '<span class="sa-badge ok">Visible</span>' : '<span class="sa-badge">Hidden</span>') + '</td>' +
                '<td class="sa-actions">' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" data-mkt-toggle="' + escapeHtml(l.id) + '" data-active="' + (l.active !== false ? '1' : '0') + '">' +
                        (l.active !== false ? 'Hide' : 'Show') +
                    '</button>' +
                    '<button class="sa-btn sa-btn-danger sa-btn-sm" data-mkt-delete="' + escapeHtml(l.id) + '">Delete</button>' +
                '</td></tr>';
        }).join('');
        var wrap = document.getElementById('marketingTable');
        wrap.innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>List</th><th>Kind</th><th>Contacts</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No marketing lists uploaded yet.</div>';
        wrap.querySelectorAll('[data-mkt-delete]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                if (!(await askConfirm('Delete this marketing list for all users?', { danger: true, title: 'Delete marketing list?' }))) return;
                try {
                    await api('/api/super-admin/marketing-database/' + encodeURIComponent(btn.getAttribute('data-mkt-delete')), { method: 'DELETE' });
                    showAlert('Marketing list deleted.', true);
                    loadMarketingDatabase();
                } catch (err) { showAlert(err.message, false); }
            });
        });
        wrap.querySelectorAll('[data-mkt-toggle]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var id = btn.getAttribute('data-mkt-toggle');
                var active = btn.getAttribute('data-active') !== '1';
                try {
                    await api('/api/super-admin/marketing-database/' + encodeURIComponent(id), {
                        method: 'PUT',
                        body: JSON.stringify({ active: active })
                    });
                    showAlert(active ? 'List is now visible to users.' : 'List hidden from users.', true);
                    loadMarketingDatabase();
                } catch (err) { showAlert(err.message, false); }
            });
        });
    }

    async function loadActivity() {
        var q = document.getElementById('actSearch').value;
        var channel = document.getElementById('actChannel').value;
        var data = await api('/api/super-admin/activity?channel=' + encodeURIComponent(channel) + (q ? ('&q=' + encodeURIComponent(q)) : ''));
        var rows = (data.data || []).map(function (ev) {
            return '<tr><td>' + escapeHtml(fmtWhen(ev.at)) + '</td><td>' + escapeHtml(ev.userName) + '<div style="color:#6b7389;font-size:12px;">' +
                escapeHtml(ev.userEmail) + '</div></td><td>' + escapeHtml(ev.channel) + '</td><td>' + escapeHtml(ev.label || ev.action || '') +
                (ev.error ? '<div style="color:#dc2626;font-size:12px;">' + escapeHtml(ev.error) + '</div>' : '') +
                '</td><td>' + (ev.sent || 0) + ' / ' + (ev.failed || 0) + '</td></tr>';
        }).join('');
        document.getElementById('activityTable').innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>When</th><th>User</th><th>Channel</th><th>Event</th><th>Sent / Failed</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No activity.</div>';
    }

    async function loadChannels() {
        var data = await api('/api/super-admin/channels');
        var rows = (data.data || []).map(function (row) {
            return '<tr><td><strong>' + escapeHtml(row.name) + '</strong><div style="color:#6b7389;font-size:12px;">' + escapeHtml(row.email) + '</div></td>' +
                '<td>' + badge(row.emailConfigured, row.emailUser || 'SMTP on', 'Not set') + '</td>' +
                '<td>' + badge(row.whatsapp && row.whatsapp.connected, row.whatsapp && row.whatsapp.phone ? row.whatsapp.phone : 'Live', 'Off') +
                (row.whatsapp && row.whatsapp.lastError ? '<div style="color:#dc2626;font-size:11px;">' + escapeHtml(row.whatsapp.lastError) + '</div>' : '') + '</td>' +
                '<td>' + badge(row.telegram && row.telegram.connected, (row.telegram && (row.telegram.username || row.telegram.phone)) || 'Live', 'Off') + '</td>' +
                '<td class="sa-actions">' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" data-ch="wa" data-id="' + escapeHtml(row.id) + '">Drop WA</button>' +
                    '<button class="sa-btn sa-btn-ghost sa-btn-sm" data-ch="tg" data-id="' + escapeHtml(row.id) + '">Drop TG</button>' +
                '</td></tr>';
        }).join('');
        var wrap = document.getElementById('channelsTable');
        wrap.innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>User</th><th>Email</th><th>WhatsApp</th><th>Telegram</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No workspaces.</div>';
        wrap.querySelectorAll('[data-ch]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                var id = btn.getAttribute('data-id');
                var ch = btn.getAttribute('data-ch');
                try {
                    var r = await api('/api/super-admin/channels/' + id + '/' + (ch === 'wa' ? 'whatsapp' : 'telegram') + '/disconnect', { method: 'POST' });
                    showAlert(r.message, true);
                    loadChannels();
                } catch (err) { showAlert(err.message, false); }
            });
        });
    }

    async function loadEngagement() {
        var data = await api('/api/super-admin/engagement');
        var t = data.totals || {};
        document.getElementById('engKpis').innerHTML =
            kpi('Email sent', t.emailSent || 0, 'fa-envelope') +
            kpi('Email opens', t.emailOpened || 0, 'fa-envelope-open') +
            kpi('Email clicks', t.emailClicked || 0, 'fa-computer-mouse') +
            kpi('WhatsApp reads', t.whatsappRead || 0, 'fa-check-double');
        var rows = (data.data || []).map(function (row) {
            var em = row.emailStats || {};
            var wa = row.whatsappStats || {};
            return '<tr><td>' + escapeHtml(row.name) + '<div style="color:#6b7389;font-size:12px;">' + escapeHtml(row.email) + '</div></td>' +
                '<td>' + (em.sent || 0) + ' sent · ' + (em.opened || 0) + ' open · ' + (em.clicked || 0) + ' click</td>' +
                '<td>' + (wa.sent || 0) + ' sent · ' + (wa.delivered || 0) + ' delivered · ' + (wa.read || 0) + ' read</td></tr>';
        }).join('');
        document.getElementById('engagementTable').innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>User</th><th>Email tracking</th><th>WhatsApp tracking</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No tracking data.</div>';
    }

    async function loadSessions() {
        var data = await api('/api/super-admin/sessions');
        document.getElementById('sessMeta').textContent = (data.count || 0) + ' workspace sessions · ' + (data.adminSessions || 0) + ' super admin sessions.';
        var rows = (data.data || []).map(function (s) {
            return '<tr><td>' + escapeHtml(s.userName) + '<div style="color:#6b7389;font-size:12px;">' + escapeHtml(s.userEmail) + '</div></td>' +
                '<td>' + fmtWhen(s.createdAt) + '</td><td>' + fmtWhen(s.expiresAt) + '</td>' +
                '<td><button class="sa-btn sa-btn-danger sa-btn-sm" data-id="' + escapeHtml(s.id) + '">Revoke</button></td></tr>';
        }).join('');
        var wrap = document.getElementById('sessionsTable');
        wrap.innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>User</th><th>Started</th><th>Expires</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No workspace sessions.</div>';
        wrap.querySelectorAll('button[data-id]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                try {
                    await api('/api/super-admin/sessions/' + encodeURIComponent(btn.getAttribute('data-id')), { method: 'DELETE' });
                    showAlert('Session revoked.', true);
                    loadSessions();
                } catch (err) { showAlert(err.message, false); }
            });
        });
    }

    async function loadBroadcasts() {
        var data = await api('/api/super-admin/broadcasts');
        var rows = (data.data || []).map(function (b) {
            return '<tr><td>' + fmtWhen(b.at) + '</td><td>' + escapeHtml(b.subject) + '<div style="color:#6b7389;font-size:12px;">' +
                escapeHtml(b.heading || '') + '</div></td><td>' + escapeHtml(b.audience) + (b.test ? ' (test)' : '') +
                '</td><td>' + (b.htmlTemplate ? 'HTML template' : 'Editor') +
                '</td><td>' + (b.sent || 0) + ' / ' + (b.failed || 0) + '</td><td>' + (b.attachmentCount || 0) + '</td></tr>';
        }).join('');
        document.getElementById('broadcastsTable').innerHTML = rows
            ? '<table class="sa-table"><thead><tr><th>When</th><th>Subject</th><th>Audience</th><th>Format</th><th>Sent / Failed</th><th>Files</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="sa-empty">No broadcasts yet.</div>';
    }

    async function loadSettings() {
        var data = await api('/api/super-admin/settings');
        var s = data.data || {};
        document.getElementById('setSignup').checked = s.signupEnabled !== false;
        document.getElementById('setMaintenance').checked = !!s.maintenanceMode;
        document.getElementById('setMaintMsg').value = s.maintenanceMessage || '';
        await loadSocialMedia();
        await loadCms();
        await loadAndroid();
        await loadHomeVideo();
        await loadTrustedBy();
        await loadBilling();
    }

    async function loadSocialMedia() {
        try {
            var data = await api('/api/super-admin/social-media');
            var sm = data.socialMedia || {};
            document.getElementById('contactEmail').value = sm.contactEmail || 'contact@raabt.app';
            document.getElementById('socialTwitter').value = sm.twitter || '';
            document.getElementById('socialLinkedin').value = sm.linkedin || '';
            document.getElementById('socialFacebook').value = sm.facebook || '';
            document.getElementById('socialInstagram').value = sm.instagram || '';
        } catch (err) {
            console.error('Failed to load social media settings:', err);
        }
    }

    function subChip(status) {
        if (status === 'active') return 'on';
        if (status === 'pending') return 'warn';
        if (status === 'rejected' || status === 'expired') return 'off';
        return 'soft';
    }
    function subLabel(status) {
        var map = {
            active: 'Active',
            pending: 'Payment Pending',
            rejected: 'Payment Rejected',
            expired: 'Expired',
            none: 'No Plan',
            disabled: 'Disabled',
            unverified: 'Unverified'
        };
        return map[status] || String(status || 'No Plan');
    }
    function payStatusLabel(status) {
        var map = {
            approved: 'Approved',
            pending: 'Pending',
            rejected: 'Rejected',
            none: 'None'
        };
        return map[status] || String(status || 'None');
    }
    function daysLeftLabel(u) {
        if (u.subscriptionStatus === 'expired') return '0 (expired)';
        if (u.daysRemaining == null || u.daysRemaining === '') return 'N/A';
        return String(u.daysRemaining);
    }
    function paymentHistoryHtml(rows) {
        rows = Array.isArray(rows) ? rows : [];
        if (!rows.length) {
            return '<div class="sa-empty" style="margin-top:10px;">No payment / renewal history.</div>';
        }
        return '<table class="sa-table" style="margin-top:10px;"><thead><tr>' +
            '<th>Plan</th><th>Amount</th><th>Payment</th><th>Submitted</th><th>Period start</th><th>Period end</th>' +
            '</tr></thead><tbody>' + rows.map(function (row) {
                return '<tr>' +
                    '<td>' + escapeHtml(row.planName || row.planId || '—') + '</td>' +
                    '<td>$' + escapeHtml(row.amount) + '</td>' +
                    '<td>' + escapeHtml(payStatusLabel(row.status)) + '</td>' +
                    '<td>' + fmtWhen(row.submittedAt) + '</td>' +
                    '<td>' + whenOrNA(row.activationStartedAt) + '</td>' +
                    '<td>' + whenOrNA(row.activationExpiresAt) + '</td>' +
                    '</tr>';
            }).join('') + '</tbody></table>';
    }

    async function loadBilling() {
        var data = await api('/api/super-admin/billing');
        var s = data.data || {};
        document.getElementById('billMonthly').value = s.monthlyAmount != null ? s.monthlyAmount : 14;
        document.getElementById('billQuarterly').value = s.quarterlyAmount != null ? s.quarterlyAmount : 29;
        document.getElementById('billAccountNumber').value = s.accountNumber || '';
        document.getElementById('billInstructions').value = s.instructions || '';
        var preview = document.getElementById('billingQrPreview');
        if (s.qrAvailable) {
            preview.className = '';
            preview.innerHTML = '<img src="/api/super-admin/billing/qr?t=' + Date.now() + '" alt="Payment QR" style="max-width:180px;border-radius:12px;background:#fff;padding:8px;">';
        } else {
            preview.className = 'sa-empty';
            preview.textContent = 'No QR uploaded yet.';
        }
        setPayBadge(data.pending);
    }

    var payFilter = 'all';
    async function loadPayments() {
        var status = (document.getElementById('payFilter') && document.getElementById('payFilter').value) || payFilter;
        payFilter = status;
        var data = await api('/api/super-admin/payments?status=' + encodeURIComponent(status));
        setPayBadge(data.pending);
        var list = data.data || [];
        var wrap = document.getElementById('paymentsTable');
        if (!list.length) {
            wrap.innerHTML = '<div class="sa-empty">No ' + escapeHtml(status === 'all' ? '' : status + ' ') + 'payment requests.</div>';
            return;
        }
        wrap.innerHTML = '<table class="sa-table"><thead><tr>' +
            '<th>User</th><th>Email</th><th>Package</th><th>Amount</th><th>Receipt</th><th>Submitted</th><th>Period</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>' + list.map(function (row) {
                var actions = row.status === 'pending'
                    ? '<button type="button" class="sa-btn sa-btn-primary sa-btn-sm" data-pay-approve="' + escapeHtml(row.id) + '">Verify &amp; Activate Account</button> ' +
                      '<button type="button" class="sa-btn sa-btn-danger sa-btn-sm" data-pay-reject="' + escapeHtml(row.id) + '">Reject</button>'
                    : '<span style="opacity:.7;font-size:12px;">' + escapeHtml(row.status === 'approved' ? 'Verified' : (row.status || '')) + '</span>';
                var period = (row.activationStartedAt || row.activationExpiresAt)
                    ? (whenOrNA(row.activationStartedAt) + ' → ' + whenOrNA(row.activationExpiresAt))
                    : '—';
                return '<tr>' +
                    '<td>' + escapeHtml(row.name) + '</td>' +
                    '<td>' + escapeHtml(row.email) + '</td>' +
                    '<td>' + escapeHtml(row.planName || row.planId) + '</td>' +
                    '<td>$' + escapeHtml(row.amount) + '</td>' +
                    '<td>' + (row.hasReceipt
                        ? '<button type="button" class="sa-btn sa-btn-ghost sa-btn-sm" data-pay-receipt="' + escapeHtml(row.id) + '">' + escapeHtml(row.receiptName || 'View receipt') + '</button>'
                        : '—') + '</td>' +
                    '<td>' + fmtWhen(row.submittedAt) + '</td>' +
                    '<td>' + period + '</td>' +
                    '<td>' + badge(row.status === 'approved', row.status, row.status) + '</td>' +
                    '<td>' + actions + '</td></tr>';
            }).join('') + '</tbody></table>';
    }

    function setPayBadge(n) {
        var badgeEl = document.getElementById('paymentsAdminBadge');
        if (!badgeEl) return;
        n = Number(n) || 0;
        badgeEl.hidden = n < 1;
        badgeEl.textContent = n > 99 ? '99+' : String(n);
    }

    async function refreshPayBadge() {
        try {
            var data = await api('/api/super-admin/payments?status=pending');
            setPayBadge(data.pending != null ? data.pending : (data.data || []).length);
        } catch (_) {}
    }

    var cmsState = { group: 'home', data: null };

    function cmsValue(key) {
        if (!cmsState.data) return '';
        var custom = cmsState.data.values && cmsState.data.values[key];
        if (custom != null && String(custom).trim() !== '') return custom;
        return (cmsState.data.defaults && cmsState.data.defaults[key]) || '';
    }

    function renderCmsTabs() {
        var tabs = document.getElementById('cmsTabs');
        if (!tabs || !cmsState.data) return;
        tabs.innerHTML = (cmsState.data.groups || []).map(function (g) {
            return '<button type="button" class="sa-cms-tab' + (g.id === cmsState.group ? ' active' : '') + '" data-cms-group="' + escapeHtml(g.id) + '">' + escapeHtml(g.label) + '</button>';
        }).join('');
    }

    function renderCmsFields() {
        var wrap = document.getElementById('cmsFields');
        var meta = document.getElementById('cmsMeta');
        if (!wrap || !cmsState.data) return;
        var q = (document.getElementById('cmsSearch').value || '').trim().toLowerCase();
        var fields = (cmsState.data.fields || []).filter(function (f) {
            if (f.group !== cmsState.group) return false;
            if (!q) return true;
            return (f.key + ' ' + f.label + ' ' + cmsValue(f.key)).toLowerCase().indexOf(q) !== -1;
        });
        wrap.innerHTML = fields.length ? fields.map(function (f) {
            var val = cmsValue(f.key);
            var html = f.type === 'html';
            var area = html || f.type === 'textarea';
            return '<div class="sa-cms-field"><label>' + escapeHtml(f.label) + '<span class="sa-cms-key">' + escapeHtml(f.key) + '</span></label>' +
                (f.hint ? '<p class="sa-card-copy">' + escapeHtml(f.hint) + '</p>' : '') +
                (area
                    ? '<textarea class="sa-input' + (html ? ' sa-cms-html' : '') + '" data-cms-field="' + escapeHtml(f.key) + '">' + escapeHtml(val) + '</textarea>'
                    : '<input class="sa-input" data-cms-field="' + escapeHtml(f.key) + '" value="' + escapeHtml(val) + '">') +
                '</div>';
        }).join('') : '<div class="sa-cms-empty">No matching fields.</div>';
        if (meta) meta.textContent = (cmsState.data.updatedAt ? 'Last saved ' + fmtWhen(cmsState.data.updatedAt) : 'Using built-in text until you save changes.');
    }

    function collectCmsPayload() {
        var fields = Object.assign({}, (cmsState.data && cmsState.data.values) || {});
        document.querySelectorAll('[data-cms-field]').forEach(function (el) {
            fields[el.getAttribute('data-cms-field')] = el.value;
        });
        return { fields: fields };
    }

    async function loadCms() {
        var data = await api('/api/super-admin/cms');
        cmsState.data = data.data || {};
        if (!cmsState.group) cmsState.group = 'home';
        renderCmsTabs();
        renderCmsFields();
    }

    document.getElementById('cmsTabs').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cms-group]');
        if (!btn) return;
        var payload = collectCmsPayload();
        cmsState.data.values = payload.fields;
        cmsState.group = btn.getAttribute('data-cms-group');
        renderCmsTabs();
        renderCmsFields();
    });
    document.getElementById('cmsSearch').addEventListener('input', function () { renderCmsFields(); });
    document.getElementById('cmsForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var payload = collectCmsPayload();
            var data = await api('/api/super-admin/cms', { method: 'PUT', body: JSON.stringify(payload) });
            cmsState.data = data.data || cmsState.data;
            renderCmsTabs();
            renderCmsFields();
            showAlert('CMS text saved.', true);
        } catch (err) { showAlert(err.message, false); }
    });
    document.getElementById('cmsResetGroup').addEventListener('click', function () {
        if (!cmsState.data) return;
        (cmsState.data.fields || []).forEach(function (f) {
            if (f.group === cmsState.group) cmsState.data.values[f.key] = '';
        });
        renderCmsFields();
        showAlert('This section is back to built-in text. Click Save CMS to keep it.', true);
    });


    function renderAndroid(info) {
        var meta = document.getElementById('androidMeta');
        var enabled = document.getElementById('androidEnabled');
        info = info || {};
        enabled.checked = !!info.enabled;
        document.getElementById('androidAppName').value = info.appName || 'Rabط Android App';
        document.getElementById('androidVersion').value = info.version || '';
        document.getElementById('androidNotes').value = info.releaseNotes || '';
        if (!info.available) {
            meta.className = 'sa-empty';
            meta.textContent = 'No APK uploaded yet. Upload a file, then turn downloads on.';
            return;
        }
        meta.className = '';
        meta.innerHTML = '<strong>' + escapeHtml(info.appName || info.originalName || 'Rabط Android App') + '</strong><div style="color:#6b7389;font-size:13px;margin-top:4px;">' +
            (info.version ? 'Version ' + escapeHtml(info.version) + ' · ' : '') +
            fmtBytes(info.size) +
            (info.uploadedAt ? ' · uploaded ' + fmtWhen(info.uploadedAt) : '') +
            ' · ' + (Number(info.downloadCount || 0) || 0) + ' downloads' +
            (info.enabled ? ' · downloads on' : ' · downloads off') + '</div>' +
            (info.releaseNotes ? '<p class="sa-card-copy" style="margin-top:8px;">' + escapeHtml(info.releaseNotes) + '</p>' : '');
    }

    async function loadAndroid() {
        var data = await api('/api/super-admin/android-app');
        renderAndroid(data.data || {});
    }

    function renderHomeVideo(items) {
        var list = document.getElementById('homeVideoList');
        if (!list) return;
        items = Array.isArray(items) ? items : [];
        if (!items.length) {
            list.className = 'sa-empty';
            list.textContent = 'No showcase videos yet. Add one below.';
            return;
        }
        list.className = '';
        list.innerHTML = items.map(function (item) {
            var preview = item.adminUrl
                ? '<video controls playsinline preload="metadata" src="' + escapeHtml(item.adminUrl) + '?v=' + encodeURIComponent(String(item.uploadedAt || '')) + '" style="width:100%;max-height:180px;border-radius:10px;background:#0f172a;margin-top:8px;"></video>'
                : '';
            return '<div class="sa-card" data-home-video-id="' + escapeHtml(item.id) + '" style="margin:0 0 12px;padding:14px;box-shadow:none;">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">' +
                '<div><strong>' + escapeHtml(item.originalName || 'Showcase video') + '</strong>' +
                '<div style="color:#6b7389;font-size:12px;margin-top:4px;">' + fmtBytes(item.size) +
                (item.uploadedAt ? ' · ' + fmtWhen(item.uploadedAt) : '') +
                (item.active ? ' · active' : ' · inactive') + '</div></div>' +
                '<label class="sa-check" style="margin:0;"><input type="checkbox" data-hv-active ' + (item.active ? 'checked' : '') + '> Active</label>' +
                '</div>' +
                '<label class="sa-label">Description</label>' +
                '<textarea class="sa-input" data-hv-desc maxlength="1200" rows="4">' + escapeHtml(item.description || '') + '</textarea>' +
                '<label class="sa-label">Display order</label>' +
                '<input class="sa-input" data-hv-order type="number" min="0" step="1" value="' + escapeHtml(String(item.order != null ? item.order : 0)) + '">' +
                '<label class="sa-label">Replace video file (optional)</label>' +
                '<input class="sa-input" data-hv-file type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov">' +
                preview +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
                '<button class="sa-btn sa-btn-primary" type="button" data-hv-save style="width:auto;">Save</button>' +
                '<button class="sa-btn sa-btn-ghost" type="button" data-hv-delete style="width:auto;">Delete</button>' +
                '</div></div>';
        }).join('');
    }

    async function loadHomeVideo() {
        var data = await api('/api/super-admin/home-videos');
        renderHomeVideo((data.data && data.data.items) || []);
    }

    function renderTrustedBy(payload) {
        var list = document.getElementById('trustedByList');
        var titleInput = document.getElementById('trustedByTitle');
        if (!list) return;
        payload = payload || {};
        if (titleInput) titleInput.value = payload.title || 'Trusted by';
        var items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) {
            list.className = 'sa-empty';
            list.textContent = 'No trusted companies yet. Add a logo below.';
            return;
        }
        list.className = '';
        list.innerHTML = items.map(function (item) {
            var preview = item.adminUrl
                ? '<img src="' + escapeHtml(item.adminUrl) + '?v=' + encodeURIComponent(String(item.uploadedAt || '')) + '" alt="' + escapeHtml(item.name || 'Logo') + '" style="max-height:48px;max-width:140px;object-fit:contain;margin-top:8px;background:#fff;border:1px solid #e6eaf2;border-radius:8px;padding:6px;">'
                : '';
            return '<div class="sa-card" data-trusted-id="' + escapeHtml(item.id) + '" style="margin:0 0 12px;padding:14px;box-shadow:none;">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">' +
                '<div><strong>' + escapeHtml(item.name || item.originalName || 'Company') + '</strong>' +
                '<div style="color:#6b7389;font-size:12px;margin-top:4px;">' + fmtBytes(item.size) +
                (item.uploadedAt ? ' · ' + fmtWhen(item.uploadedAt) : '') +
                (item.active ? ' · active' : ' · inactive') + '</div></div>' +
                '<label class="sa-check" style="margin:0;"><input type="checkbox" data-tb-active ' + (item.active ? 'checked' : '') + '> Active</label>' +
                '</div>' +
                '<label class="sa-label">Company name</label>' +
                '<input class="sa-input" data-tb-name maxlength="80" value="' + escapeHtml(item.name || '') + '">' +
                '<label class="sa-label">Display order</label>' +
                '<input class="sa-input" data-tb-order type="number" min="0" step="1" value="' + escapeHtml(String(item.order != null ? item.order : 0)) + '">' +
                '<label class="sa-label">Replace logo (optional)</label>' +
                '<input class="sa-input" data-tb-file type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,.png,.jpg,.jpeg,.webp,.svg,.gif">' +
                preview +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
                '<button class="sa-btn sa-btn-primary" type="button" data-tb-save style="width:auto;">Save</button>' +
                '<button class="sa-btn sa-btn-ghost" type="button" data-tb-delete style="width:auto;">Delete</button>' +
                '</div></div>';
        }).join('');
    }

    async function loadTrustedBy() {
        var data = await api('/api/super-admin/trusted-by');
        renderTrustedBy(data.data || {});
    }

    var recipientCounts = { verified: 0, active: 0, all: 0 };

    function updateBroadcastCount() {
        var mode = document.getElementById('broadcastAudience').value;
        var n = recipientCounts[mode] || 0;
        var labels = {
            verified: 'verified users',
            active: 'active users',
            all: 'accounts'
        };
        document.getElementById('broadcastCount').textContent =
            'This will send a branded Rabط email to ' + n + ' ' + (labels[mode] || 'users') + '. Upload an HTML template, or write in the editor and select text to bold, highlight, or turn into a link.';
    }

    async function loadSmtp() {
        var data = await api('/api/super-admin/platform-smtp');
        var s = data.data || {};
        recipientCounts = data.recipients || recipientCounts;
        document.getElementById('smtpHost').value = s.host || '';
        document.getElementById('smtpPort').value = s.port || 465;
        document.getElementById('smtpUser').value = s.user || '';
        document.getElementById('smtpFrom').value = s.fromName || 'Rabط';
        document.getElementById('smtpSecure').checked = s.secure !== false;
        document.getElementById('smtpPass').value = '';
        document.getElementById('smtpPass').placeholder = s.passwordSet ? 'Password saved — leave blank to keep' : 'Password';
        updateBroadcastCount();
    }

    function editorText() {
        var el = document.getElementById('broadcastMessage');
        return (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
    }

    function editorHtml() {
        return (document.getElementById('broadcastMessage').innerHTML || '').trim();
    }

    function runEditorCmd(cmd, value) {
        var editor = document.getElementById('broadcastMessage');
        editor.focus();
        document.execCommand(cmd, false, value || null);
    }

    document.getElementById('broadcastToolbar').addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) e.preventDefault();
    });
    document.getElementById('broadcastToolbar').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cmd]');
        if (!btn) return;
        runEditorCmd(btn.getAttribute('data-cmd'));
    });
    document.getElementById('broadcastHighlightBtn').addEventListener('click', function () {
        var editor = document.getElementById('broadcastMessage');
        editor.focus();
        try { document.execCommand('hiliteColor', false, '#FFF3A3'); }
        catch (_) { document.execCommand('backColor', false, '#FFF3A3'); }
    });
    document.getElementById('broadcastLinkBtn').addEventListener('click', async function () {
        var url = await askPrompt('', {
            title: 'Insert link',
            message: 'Paste the link URL',
            value: 'https://',
            placeholder: 'https://example.com'
        });
        if (!url) return;
        url = url.trim();
        if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = 'https://' + url;
        runEditorCmd('createLink', url);
    });
    document.getElementById('broadcastNameBtn').addEventListener('click', function () {
        document.getElementById('broadcastMessage').focus();
        document.execCommand('insertText', false, '{{name}}');
    });
    document.getElementById('broadcastFiles').addEventListener('change', function () {
        var files = Array.prototype.slice.call(this.files || []);
        document.getElementById('broadcastFileList').textContent = files.length
            ? files.map(function (f) { return f.name; }).join(' · ')
            : '';
    });

    function hasBroadcastTemplate() {
        var input = document.getElementById('broadcastTemplateInput');
        return !!(input && input.files && input.files[0]);
    }

    function setBroadcastTemplateMeta(file) {
        var meta = document.getElementById('broadcastTemplateMeta');
        var clear = document.getElementById('broadcastTemplateClear');
        if (file) {
            meta.textContent = 'Template loaded: ' + file.name + '. This HTML file will be sent as the professional email.';
            clear.hidden = false;
        } else {
            meta.textContent = '';
            clear.hidden = true;
            document.getElementById('broadcastTemplateInput').value = '';
        }
    }

    document.getElementById('broadcastTemplateBtn').addEventListener('click', function () {
        document.getElementById('broadcastTemplateInput').click();
    });
    document.getElementById('broadcastTemplateInput').addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) {
            setBroadcastTemplateMeta(null);
            return;
        }
        if (!/\.html$/i.test(file.name || '')) {
            showAlert('Upload a .html template file.', false);
            setBroadcastTemplateMeta(null);
            return;
        }
        setBroadcastTemplateMeta(file);
        showAlert('HTML template loaded: ' + file.name + '. You can send without typing in the editor.', true);
    });
    document.getElementById('broadcastTemplateClear').addEventListener('click', function () {
        setBroadcastTemplateMeta(null);
        showAlert('Template cleared. Editor content will be used.', true);
    });

    function broadcastPayload(testTo) {
        var fd = new FormData();
        fd.append('audience', document.getElementById('broadcastAudience').value);
        fd.append('subject', document.getElementById('broadcastSubject').value);
        fd.append('heading', document.getElementById('broadcastHeading').value);
        fd.append('htmlMessage', editorHtml());
        fd.append('message', editorText());
        fd.append('testTo', testTo || '');
        var template = document.getElementById('broadcastTemplateInput').files[0];
        if (template) fd.append('htmlTemplate', template);
        var files = document.getElementById('broadcastFiles').files || [];
        for (var i = 0; i < files.length; i += 1) fd.append('attachments', files[i]);
        return fd;
    }

    async function sendBroadcast(testTo) {
        if (!document.getElementById('broadcastSubject').value.trim() || document.getElementById('broadcastSubject').value.trim().length < 3) {
            throw new Error('Enter a subject.');
        }
        if (!hasBroadcastTemplate() && editorText().length < 10) {
            throw new Error('Write a longer message, or upload an HTML template.');
        }
        if (!testTo) {
            var n = recipientCounts[document.getElementById('broadcastAudience').value] || 0;
            if (!(await askConfirm('Send this professional email to ' + n + ' platform user' + (n === 1 ? '' : 's') + '?', { title: 'Send broadcast email?' }))) return;
        }
        var submitBtn = document.querySelector('#broadcastForm button[type="submit"]');
        var testBtn = document.getElementById('broadcastTestBtn');
        submitBtn.disabled = true;
        testBtn.disabled = true;
        submitBtn.textContent = testTo ? 'Sending test…' : 'Sending…';
        try {
            var data = await api('/api/super-admin/broadcast', {
                method: 'POST',
                body: broadcastPayload(testTo)
            });
            showAlert(data.message || 'Email sent.', true);
        } finally {
            submitBtn.disabled = false;
            testBtn.disabled = false;
            submitBtn.textContent = 'Send to all selected users';
        }
    }

    document.getElementById('smtpForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await api('/api/super-admin/platform-smtp', {
                method: 'POST',
                body: JSON.stringify({
                    host: document.getElementById('smtpHost').value,
                    port: document.getElementById('smtpPort').value,
                    user: document.getElementById('smtpUser').value,
                    fromName: document.getElementById('smtpFrom').value,
                    password: document.getElementById('smtpPass').value,
                    secure: document.getElementById('smtpSecure').checked
                })
            });
            showAlert('Platform SMTP saved.', true);
            loadSmtp();
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('smtpTestBtn').addEventListener('click', async function () {
        try {
            var to = document.getElementById('smtpTestTo').value.trim() || document.getElementById('broadcastTestTo').value.trim();
            if (!to) throw new Error('Enter a test email address.');
            var r = await api('/api/super-admin/platform-smtp/test', { method: 'POST', body: JSON.stringify({ to: to }) });
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('broadcastAudience').addEventListener('change', updateBroadcastCount);
    document.getElementById('broadcastTestBtn').addEventListener('click', async function () {
        try {
            var testTo = document.getElementById('broadcastTestTo').value.trim();
            if (!testTo) throw new Error('Enter a test email address.');
            await sendBroadcast(testTo);
        } catch (err) { showAlert(err.message, false); }
    });
    document.getElementById('broadcastForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try { await sendBroadcast(''); }
        catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('adminPassForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await api('/api/super-admin/password', {
                method: 'POST',
                body: JSON.stringify({
                    currentPassword: document.getElementById('curPass').value,
                    newPassword: document.getElementById('newPass').value
                })
            });
            showAlert('Password updated. Sign in again.', true);
            setTimeout(function () { window.location.replace('/super/admin/platform/login'); }, 800);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('settingsForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var r = await api('/api/super-admin/settings', {
                method: 'POST',
                body: JSON.stringify({
                    signupEnabled: document.getElementById('setSignup').checked,
                    maintenanceMode: document.getElementById('setMaintenance').checked,
                    maintenanceMessage: document.getElementById('setMaintMsg').value
                })
            });
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    function attachSocialMediaForm() {
        var socialMediaForm = document.getElementById('socialMediaForm');
        console.log('Checking for socialMediaForm:', socialMediaForm);
        if (socialMediaForm) {
            socialMediaForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                e.stopPropagation();
                try {
                    var contactEmail = document.getElementById('contactEmail').value;
                    var twitter = document.getElementById('socialTwitter').value;
                    var linkedin = document.getElementById('socialLinkedin').value;
                    var facebook = document.getElementById('socialFacebook').value;
                    var instagram = document.getElementById('socialInstagram').value;
                    console.log('Saving social media:', { contactEmail, twitter, linkedin, facebook, instagram });
                    var r = await api('/api/super-admin/social-media', {
                        method: 'POST',
                        body: JSON.stringify({
                            contactEmail: contactEmail,
                            twitter: twitter,
                            linkedin: linkedin,
                            facebook: facebook,
                            instagram: instagram
                        })
                    });
                    console.log('Social media save response:', r);
                    if (r.success) {
                        showAlert(r.message, true);
                    } else {
                        showAlert(r.message || 'Failed to save social media links', false);
                    }
                } catch (err) {
                    console.error('Social media save error:', err);
                    showAlert(err.message || 'Failed to save social media links', false);
                }
            });
            console.log('Social media form event listener attached');
        } else {
            console.error('socialMediaForm element not found');
        }
    }

    document.getElementById('androidUploadForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var input = document.getElementById('androidFile');
        if (!input.files || !input.files[0]) {
            showAlert('Choose an .apk file first.', false);
            return;
        }
        try {
            var fd = new FormData();
            fd.append('apk', input.files[0]);
            fd.append('appName', document.getElementById('androidAppName').value);
            fd.append('version', document.getElementById('androidVersion').value);
            fd.append('releaseNotes', document.getElementById('androidNotes').value);
            var r = await api('/api/super-admin/android-app', { method: 'POST', body: fd });
            renderAndroid(r.data || {});
            input.value = '';
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('androidMetaForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var r = await api('/api/super-admin/android-app/meta', {
                method: 'POST',
                body: JSON.stringify({
                    appName: document.getElementById('androidAppName').value,
                    version: document.getElementById('androidVersion').value,
                    releaseNotes: document.getElementById('androidNotes').value
                })
            });
            renderAndroid(r.data || {});
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('androidEnabled').addEventListener('change', async function () {
        try {
            var r = await api('/api/super-admin/android-app/toggle', {
                method: 'POST',
                body: JSON.stringify({ enabled: document.getElementById('androidEnabled').checked })
            });
            renderAndroid(r.data || {});
            showAlert(r.message, true);
        } catch (err) {
            showAlert(err.message, false);
            loadAndroid().catch(function () {});
        }
    });

    document.getElementById('androidRemove').addEventListener('click', async function () {
        if (!(await askConfirm('Remove the uploaded APK? Download Android App will be hidden for users.', { danger: true, title: 'Remove APK?' }))) return;
        try {
            var r = await api('/api/super-admin/android-app', { method: 'DELETE' });
            renderAndroid(r.data || {});
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('homeVideoAddForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var input = document.getElementById('homeVideoFile');
        if (!input.files || !input.files[0]) {
            showAlert('Choose a landscape video file first.', false);
            return;
        }
        try {
            var fd = new FormData();
            fd.append('video', input.files[0]);
            fd.append('description', document.getElementById('homeVideoDesc').value || '');
            fd.append('order', document.getElementById('homeVideoOrder').value || '');
            fd.append('active', document.getElementById('homeVideoActive').checked ? 'true' : 'false');
            var r = await api('/api/super-admin/home-videos', { method: 'POST', body: fd });
            renderHomeVideo((r.data && r.data.items) || []);
            document.getElementById('homeVideoDesc').value = '';
            document.getElementById('homeVideoOrder').value = '';
            document.getElementById('homeVideoActive').checked = true;
            input.value = '';
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('homeVideoList').addEventListener('click', async function (e) {
        var card = e.target.closest('[data-home-video-id]');
        if (!card) return;
        var id = card.getAttribute('data-home-video-id');
        if (e.target.closest('[data-hv-save]')) {
            try {
                var fileInput = card.querySelector('[data-hv-file]');
                var hasFile = fileInput && fileInput.files && fileInput.files[0];
                var r;
                if (hasFile) {
                    var fd = new FormData();
                    fd.append('video', fileInput.files[0]);
                    fd.append('description', (card.querySelector('[data-hv-desc]') || {}).value || '');
                    fd.append('order', (card.querySelector('[data-hv-order]') || {}).value || '0');
                    fd.append('active', card.querySelector('[data-hv-active]') && card.querySelector('[data-hv-active]').checked ? 'true' : 'false');
                    r = await api('/api/super-admin/home-videos/' + encodeURIComponent(id), { method: 'PUT', body: fd });
                } else {
                    r = await api('/api/super-admin/home-videos/' + encodeURIComponent(id), {
                        method: 'PUT',
                        body: JSON.stringify({
                            description: (card.querySelector('[data-hv-desc]') || {}).value || '',
                            order: (card.querySelector('[data-hv-order]') || {}).value || 0,
                            active: !!(card.querySelector('[data-hv-active]') && card.querySelector('[data-hv-active]').checked)
                        })
                    });
                }
                renderHomeVideo((r.data && r.data.items) || []);
                showAlert(r.message, true);
            } catch (err) { showAlert(err.message, false); }
            return;
        }
        if (e.target.closest('[data-hv-delete]')) {
            if (!(await askConfirm('Remove this showcase video from the home page?', { danger: true, title: 'Remove video?' }))) return;
            try {
                var del = await api('/api/super-admin/home-videos/' + encodeURIComponent(id), { method: 'DELETE' });
                renderHomeVideo((del.data && del.data.items) || []);
                showAlert(del.message, true);
            } catch (err) { showAlert(err.message, false); }
        }
    });

    document.getElementById('trustedByTitleForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var r = await api('/api/super-admin/trusted-by/title', {
                method: 'POST',
                body: JSON.stringify({ title: document.getElementById('trustedByTitle').value || 'Trusted by' })
            });
            renderTrustedBy(r.data || {});
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('trustedByAddForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var input = document.getElementById('trustedByFile');
        if (!input.files || !input.files[0]) {
            showAlert('Choose a company logo first.', false);
            return;
        }
        try {
            var fd = new FormData();
            fd.append('logo', input.files[0]);
            fd.append('name', document.getElementById('trustedByName').value || '');
            fd.append('order', document.getElementById('trustedByOrder').value || '');
            fd.append('active', document.getElementById('trustedByActive').checked ? 'true' : 'false');
            var r = await api('/api/super-admin/trusted-by', { method: 'POST', body: fd });
            renderTrustedBy(r.data || {});
            document.getElementById('trustedByName').value = '';
            document.getElementById('trustedByOrder').value = '';
            document.getElementById('trustedByActive').checked = true;
            input.value = '';
            showAlert(r.message, true);
        } catch (err) { showAlert(err.message, false); }
    });

    document.getElementById('trustedByList').addEventListener('click', async function (e) {
        var card = e.target.closest('[data-trusted-id]');
        if (!card) return;
        var id = card.getAttribute('data-trusted-id');
        if (e.target.closest('[data-tb-save]')) {
            try {
                var fileInput = card.querySelector('[data-tb-file]');
                var hasFile = fileInput && fileInput.files && fileInput.files[0];
                var r;
                if (hasFile) {
                    var fd = new FormData();
                    fd.append('logo', fileInput.files[0]);
                    fd.append('name', (card.querySelector('[data-tb-name]') || {}).value || '');
                    fd.append('order', (card.querySelector('[data-tb-order]') || {}).value || '0');
                    fd.append('active', card.querySelector('[data-tb-active]') && card.querySelector('[data-tb-active]').checked ? 'true' : 'false');
                    r = await api('/api/super-admin/trusted-by/' + encodeURIComponent(id), { method: 'PUT', body: fd });
                } else {
                    r = await api('/api/super-admin/trusted-by/' + encodeURIComponent(id), {
                        method: 'PUT',
                        body: JSON.stringify({
                            name: (card.querySelector('[data-tb-name]') || {}).value || '',
                            order: (card.querySelector('[data-tb-order]') || {}).value || 0,
                            active: !!(card.querySelector('[data-tb-active]') && card.querySelector('[data-tb-active]').checked)
                        })
                    });
                }
                renderTrustedBy(r.data || {});
                showAlert(r.message, true);
            } catch (err) { showAlert(err.message, false); }
            return;
        }
        if (e.target.closest('[data-tb-delete]')) {
            if (!(await askConfirm('Remove this company from Trusted by?', { danger: true, title: 'Remove company?' }))) return;
            try {
                var del = await api('/api/super-admin/trusted-by/' + encodeURIComponent(id), { method: 'DELETE' });
                renderTrustedBy(del.data || {});
                showAlert(del.message, true);
            } catch (err) { showAlert(err.message, false); }
        }
    });

    document.getElementById('schedRefresh').addEventListener('click', loadSchedules);
    document.getElementById('listsRefresh').addEventListener('click', loadLists);
    document.getElementById('marketingRefresh').addEventListener('click', loadMarketingDatabase);
    document.getElementById('marketingUploadForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var fileInput = document.getElementById('marketingFile');
        if (!fileInput.files || !fileInput.files[0]) {
            showAlert('Choose a contact file to upload.', false);
            return;
        }
        var fd = new FormData();
        fd.append('kind', document.getElementById('marketingKind').value);
        fd.append('name', document.getElementById('marketingName').value || '');
        fd.append('description', document.getElementById('marketingDesc').value || '');
        fd.append('active', document.getElementById('marketingActive').checked ? 'true' : 'false');
        fd.append('file', fileInput.files[0]);
        try {
            await api('/api/super-admin/marketing-database', { method: 'POST', body: fd });
            showAlert('Marketing list uploaded.', true);
            fileInput.value = '';
            document.getElementById('marketingName').value = '';
            document.getElementById('marketingDesc').value = '';
            loadMarketingDatabase();
        } catch (err) { showAlert(err.message, false); }
    });
    document.getElementById('actRefresh').addEventListener('click', loadActivity);
    document.getElementById('chanRefresh').addEventListener('click', loadChannels);
    document.getElementById('engRefresh').addEventListener('click', loadEngagement);
    document.getElementById('sessRefresh').addEventListener('click', loadSessions);
    document.getElementById('bcRefresh').addEventListener('click', loadBroadcasts);
    document.getElementById('actSearch').addEventListener('input', function () { loadActivity().catch(function (err) { showAlert(err.message, false); }); });
    document.getElementById('actChannel').addEventListener('change', loadActivity);
    document.getElementById('sessRevokeAll').addEventListener('click', async function () {
        if (!(await askConfirm('Revoke every workspace session? Users will have to sign in again. Super admin stays signed in.', { danger: true, title: 'Revoke all sessions?' }))) return;
        try {
            var r = await api('/api/super-admin/sessions/revoke-all', { method: 'POST' });
            showAlert(r.message, true);
            loadSessions();
        } catch (err) { showAlert(err.message, false); }
    });

    var supportUserId = '';
    var supportStamp = '';
    var supportSelected = {};
    var contactSelected = {};

    function inboxSelectedIds(map, prefix) {
        return Object.keys(map).filter(function (id) { return !!map[id]; });
    }

    function syncInboxSelectAll(prefix, idsOnPage, selectedMap) {
        var selectAll = document.getElementById(prefix + 'SelectAll');
        if (!selectAll) return;
        if (!idsOnPage.length) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            return;
        }
        var selectedCount = idsOnPage.filter(function (id) { return !!selectedMap[id]; }).length;
        selectAll.checked = selectedCount === idsOnPage.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < idsOnPage.length;
    }

    function updateSupportBulkButtons() {
        var ids = inboxSelectedIds(supportSelected);
        var disabled = ids.length < 1;
        ['supportMarkUnread', 'supportDeleteSelected'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = disabled;
        });
    }

    function updateContactBulkButtons() {
        var ids = inboxSelectedIds(contactSelected);
        var disabled = ids.length < 1;
        ['contactMarkUnreadBulk', 'contactMarkReadBulk', 'contactArchiveBulk', 'contactDeleteBulk'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = disabled;
        });
    }

    function bindInboxCheckbox(input, map, id, onChange) {
        input.checked = !!map[id];
        input.addEventListener('change', function () {
            if (input.checked) map[id] = true;
            else delete map[id];
            onChange();
        });
        input.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    }

    async function runSupportBulk(action) {
        var ids = inboxSelectedIds(supportSelected);
        if (!ids.length) return showAlert('Select at least one chat.', false);
        if (action === 'delete' && !(await askConfirm('Delete ' + ids.length + ' selected chat(s)? This cannot be undone.', { danger: true, title: 'Delete chats?' }))) return;
        try {
            var data = await api('/api/super-admin/support/chats/bulk', {
                method: 'POST',
                body: JSON.stringify({ ids: ids, action: action })
            });
            if (ids.indexOf(supportUserId) !== -1) {
                supportUserId = '';
                document.getElementById('supportHead').textContent = 'Select a customer to open the chat.';
                renderSupportMessages([]);
                document.getElementById('supportText').disabled = true;
                document.getElementById('supportSend').disabled = true;
            }
            ids.forEach(function (id) { delete supportSelected[id]; });
            showAlert(data.message || 'Bulk action completed.', true);
            await loadSupport();
            refreshSupportBadge();
        } catch (err) {
            showAlert(err.message, false);
        }
    }

    async function runContactBulk(action) {
        var ids = inboxSelectedIds(contactSelected);
        if (!ids.length) return showAlert('Select at least one message.', false);
        if (action === 'delete' && !(await askConfirm('Delete ' + ids.length + ' selected message(s)? This cannot be undone.', { danger: true, title: 'Delete messages?' }))) return;
        try {
            var data = await api('/api/super-admin/contact-messages/bulk', {
                method: 'POST',
                body: JSON.stringify({ ids: ids, action: action })
            });
            if (ids.indexOf(contactMessageId) !== -1) {
                contactMessageId = '';
                renderContactDetail(null);
            }
            ids.forEach(function (id) { delete contactSelected[id]; });
            showAlert(data.message || 'Bulk action completed.', true);
            await loadContact();
            refreshContactBadge();
        } catch (err) {
            showAlert(err.message, false);
        }
    }

    function supportAvatarHtml(userId, name, hasAvatar, sizeClass) {
        var id = escapeHtml(userId || '');
        var cls = 'sa-chat-avatar' + (sizeClass ? ' ' + sizeClass : '');
        if (hasAvatar && id) {
            return '<img class="' + cls + '" src="/api/super-admin/users/' + id + '/avatar" alt="" loading="lazy">';
        }
        return '<div class="' + cls + ' sa-chat-avatar-fallback" style="background:' + avatarColor(name) + '">' +
            escapeHtml(initials(name || 'U')) + '</div>';
    }

    function setSupportBadge(n) {
        var badge = document.getElementById('supportAdminBadge');
        if (!badge) return;
        n = Number(n) || 0;
        badge.hidden = n < 1;
        badge.textContent = n > 99 ? '99+' : String(n);
    }

    function renderSupportMessages(messages) {
        var log = document.getElementById('supportLog');
        var list = messages || [];
        if (!list.length) {
            log.innerHTML = '<div class="sa-empty">No messages yet. Send the first reply.</div>';
            supportStamp = '';
            return;
        }
        var stamp = list[list.length - 1].id + ':' + list.length;
        log.innerHTML = list.map(function (msg) {
            var mine = msg.from === 'admin';
            return '<div class="sa-bubble ' + (mine ? 'me' : 'them') + '">' +
                escapeHtml(msg.text) +
                '<small>' + (mine ? 'You' : 'Customer') + ' · ' + escapeHtml(fmtWhen(msg.at)) + '</small></div>';
        }).join('');
        if (stamp !== supportStamp) log.scrollTop = log.scrollHeight;
        supportStamp = stamp;
    }

    async function openSupportUser(userId, silent) {
        supportUserId = userId;
        document.getElementById('supportText').disabled = false;
        document.getElementById('supportSend').disabled = false;
        try {
            var data = await api('/api/super-admin/support/chats/' + encodeURIComponent(userId));
            var user = data.user || {};
            document.getElementById('supportHead').innerHTML =
                supportAvatarHtml(user.id || userId, user.name, !!user.hasAvatar, 'sa-chat-avatar-lg') +
                '<div class="sa-chat-head-meta">' +
                    '<strong>' + escapeHtml(user.name || 'Customer') + '</strong>' +
                    '<span>' + escapeHtml(user.email || '') + '</span>' +
                '</div>';
            renderSupportMessages((data.data && data.data.messages) || []);
            document.querySelectorAll('.sa-thread').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-id') === userId);
            });
        } catch (err) {
            if (!silent) showAlert(err.message, false);
        }
    }

    async function loadSupport() {
        var q = document.getElementById('supportSearch').value.trim();
        var chats = await api('/api/super-admin/support/chats' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
        setSupportBadge(chats.unread);
        var rows = chats.data || [];
        if (q) {
            var users = await api('/api/super-admin/users?q=' + encodeURIComponent(q));
            (users.data || []).forEach(function (user) {
                if (!rows.some(function (row) { return row.userId === user.id; })) {
                    rows.push({
                        userId: user.id,
                        userName: user.name,
                        userEmail: user.email,
                        unread: 0,
                        lastMessage: null,
                        hasAvatar: !!(user.hasAvatar || (user.onboarding && user.onboarding.hasAvatar))
                    });
                }
            });
        }
        var wrap = document.getElementById('supportThreads');
        if (!rows.length) {
            wrap.innerHTML = '<div class="sa-empty" style="padding:16px;">No customer chats yet. Search a user to start one.</div>';
            syncInboxSelectAll('support', [], supportSelected);
            updateSupportBulkButtons();
            return;
        }
        var pageIds = rows.map(function (row) { return row.userId; }).filter(Boolean);
        wrap.innerHTML = rows.map(function (row) {
            var preview = row.lastMessage && row.lastMessage.text ? row.lastMessage.text : 'No messages yet';
            return '<div class="sa-thread-row">' +
                '<label class="sa-thread-check"><input type="checkbox" class="support-select" data-id="' + escapeHtml(row.userId) + '"></label>' +
                '<button type="button" class="sa-thread' + (row.userId === supportUserId ? ' active' : '') + '" data-id="' + escapeHtml(row.userId) + '">' +
                supportAvatarHtml(row.userId, row.userName, !!row.hasAvatar) +
                '<div class="sa-thread-body">' +
                    '<strong>' + escapeHtml(row.userName || 'Customer') + '</strong>' +
                    '<span>' + escapeHtml(row.userEmail || '') + '</span>' +
                    '<span>' + escapeHtml(preview) + '</span>' +
                    (row.unread ? '<em>' + escapeHtml(row.unread) + '</em>' : '') +
                '</div>' +
                '</button></div>';
        }).join('');
        wrap.querySelectorAll('.support-select').forEach(function (input) {
            bindInboxCheckbox(input, supportSelected, input.getAttribute('data-id'), function () {
                syncInboxSelectAll('support', pageIds, supportSelected);
                updateSupportBulkButtons();
            });
        });
        wrap.querySelectorAll('.sa-thread').forEach(function (btn) {
            btn.addEventListener('click', function () { openSupportUser(btn.getAttribute('data-id')); });
        });
        syncInboxSelectAll('support', pageIds, supportSelected);
        updateSupportBulkButtons();
        if (supportUserId) openSupportUser(supportUserId, true);
    }

    document.getElementById('supportSelectAll').addEventListener('change', function () {
        var checked = this.checked;
        document.querySelectorAll('.support-select').forEach(function (input) {
            var id = input.getAttribute('data-id');
            input.checked = checked;
            if (checked) supportSelected[id] = true;
            else delete supportSelected[id];
        });
        this.indeterminate = false;
        updateSupportBulkButtons();
    });
    document.getElementById('supportMarkUnread').addEventListener('click', function () {
        runSupportBulk('markUnread');
    });
    document.getElementById('supportDeleteSelected').addEventListener('click', function () {
        runSupportBulk('delete');
    });
    document.getElementById('supportSearch').addEventListener('input', function () {
        loadSupport().catch(function (err) { showAlert(err.message, false); });
    });
    document.getElementById('supportForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!supportUserId) return showAlert('Select a customer first.', false);
        var text = document.getElementById('supportText').value.trim();
        if (!text) return;
        try {
            var data = await api('/api/super-admin/support/chats/' + encodeURIComponent(supportUserId), {
                method: 'POST',
                body: JSON.stringify({ text: text })
            });
            document.getElementById('supportText').value = '';
            renderSupportMessages((data.data && data.data.messages) || []);
            loadSupport().catch(function () {});
        } catch (err) { showAlert(err.message, false); }
    });
    document.getElementById('supportText').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('supportForm').requestSubmit();
        }
    });

    var contactMessageId = '';

    function contactStatusLabel(status) {
        var map = {
            new: 'New',
            read: 'Read',
            replied: 'Replied',
            archived: 'Archived'
        };
        return map[status] || String(status || 'New');
    }

    function setContactBadge(n) {
        var badge = document.getElementById('contactAdminBadge');
        if (!badge) return;
        n = Number(n) || 0;
        badge.hidden = n < 1;
        badge.textContent = n > 99 ? '99+' : String(n);
    }

    function setContactActions(enabled) {
        ['contactReplyText', 'contactReplySend', 'contactMarkRead', 'contactArchive', 'contactDelete'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
    }

    function renderContactDetail(row) {
        var body = document.getElementById('contactBody');
        var replies = document.getElementById('contactReplies');
        if (!row) {
            document.getElementById('contactHead').textContent = 'Select a contact message to open it.';
            body.innerHTML = '';
            replies.innerHTML = '';
            setContactActions(false);
            return;
        }
        document.getElementById('contactHead').innerHTML =
            '<div class="sa-chat-head-meta">' +
                '<strong>' + escapeHtml(row.name || 'Contact') + '</strong>' +
                '<span>' + escapeHtml(row.email || '') + ' · ' + escapeHtml(row.subjectLabel || row.subject || 'Message') + '</span>' +
                '<span>' + escapeHtml(contactStatusLabel(row.status)) + ' · ' + escapeHtml(fmtWhen(row.submittedAt)) + '</span>' +
            '</div>';
        body.innerHTML = '<div class="sa-bubble them">' +
            escapeHtml(row.message || '') +
            '<small>Contact form · ' + escapeHtml(fmtWhen(row.submittedAt)) + '</small></div>';
        var replyList = row.replies || [];
        replies.innerHTML = replyList.length
            ? replyList.map(function (reply) {
                return '<div class="sa-bubble me">' +
                    escapeHtml(reply.text || '') +
                    '<small>You · ' + escapeHtml(fmtWhen(reply.at)) + '</small></div>';
            }).join('')
            : '<div class="sa-empty" style="padding:12px;">No email replies sent yet.</div>';
        setContactActions(true);
    }

    async function openContactMessage(id, silent) {
        contactMessageId = id;
        try {
            var data = await api('/api/super-admin/contact-messages/' + encodeURIComponent(id));
            renderContactDetail(data.data || null);
            document.querySelectorAll('.sa-contact-thread').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-id') === id);
            });
        } catch (err) {
            if (!silent) showAlert(err.message, false);
        }
    }

    async function loadContact() {
        var q = document.getElementById('contactSearch').value.trim();
        var status = document.getElementById('contactFilter').value || 'all';
        var data = await api('/api/super-admin/contact-messages?q=' + encodeURIComponent(q) + '&status=' + encodeURIComponent(status));
        setContactBadge(data.unread);
        var rows = data.data || [];
        var wrap = document.getElementById('contactThreads');
        if (!rows.length) {
            wrap.innerHTML = '<div class="sa-empty">No contact messages yet.</div>';
            syncInboxSelectAll('contact', [], contactSelected);
            updateContactBulkButtons();
            if (!contactMessageId) renderContactDetail(null);
            return;
        }
        var pageIds = rows.map(function (row) { return row.id; }).filter(Boolean);
        wrap.innerHTML = rows.map(function (row) {
            return '<div class="sa-thread-row">' +
                '<label class="sa-thread-check"><input type="checkbox" class="contact-select" data-id="' + escapeHtml(row.id) + '"></label>' +
                '<button type="button" class="sa-thread sa-contact-thread' + (row.id === contactMessageId ? ' active' : '') + '" data-id="' + escapeHtml(row.id) + '">' +
                '<div class="sa-thread-body">' +
                    '<strong>' + escapeHtml(row.name || 'Contact') + '</strong>' +
                    '<span>' + escapeHtml(row.email || '') + '</span>' +
                    '<span>' + escapeHtml(row.subjectLabel || row.subject || 'Message') + ' · ' + escapeHtml(fmtWhen(row.submittedAt)) + '</span>' +
                    (row.unread ? '<em>1</em>' : '') +
                '</div>' +
                '</button></div>';
        }).join('');
        wrap.querySelectorAll('.contact-select').forEach(function (input) {
            bindInboxCheckbox(input, contactSelected, input.getAttribute('data-id'), function () {
                syncInboxSelectAll('contact', pageIds, contactSelected);
                updateContactBulkButtons();
            });
        });
        wrap.querySelectorAll('.sa-contact-thread').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openContactMessage(btn.getAttribute('data-id'));
            });
        });
        syncInboxSelectAll('contact', pageIds, contactSelected);
        updateContactBulkButtons();
        if (contactMessageId) openContactMessage(contactMessageId, true);
    }

    document.getElementById('contactSelectAll').addEventListener('change', function () {
        var checked = this.checked;
        document.querySelectorAll('.contact-select').forEach(function (input) {
            var id = input.getAttribute('data-id');
            input.checked = checked;
            if (checked) contactSelected[id] = true;
            else delete contactSelected[id];
        });
        this.indeterminate = false;
        updateContactBulkButtons();
    });
    document.getElementById('contactMarkUnreadBulk').addEventListener('click', function () {
        runContactBulk('markUnread');
    });
    document.getElementById('contactMarkReadBulk').addEventListener('click', function () {
        runContactBulk('markRead');
    });
    document.getElementById('contactArchiveBulk').addEventListener('click', function () {
        runContactBulk('archive');
    });
    document.getElementById('contactDeleteBulk').addEventListener('click', function () {
        runContactBulk('delete');
    });
    document.getElementById('contactSearch').addEventListener('input', function () {
        loadContact().catch(function (err) { showAlert(err.message, false); });
    });
    document.getElementById('contactFilter').addEventListener('change', function () {
        loadContact().catch(function (err) { showAlert(err.message, false); });
    });
    document.getElementById('contactReplyForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!contactMessageId) return showAlert('Select a contact message first.', false);
        var text = document.getElementById('contactReplyText').value.trim();
        if (!text) return showAlert('Write a reply.', false);
        try {
            var data = await api('/api/super-admin/contact-messages/' + encodeURIComponent(contactMessageId) + '/reply', {
                method: 'POST',
                body: JSON.stringify({ text: text })
            });
            document.getElementById('contactReplyText').value = '';
            renderContactDetail(data.data || null);
            showAlert(data.message || 'Reply sent to the customer email.', true);
            await loadContact();
        } catch (err) {
            showAlert(err.message, false);
        }
    });
    document.getElementById('contactMarkRead').addEventListener('click', async function () {
        if (!contactMessageId) return;
        try {
            var data = await api('/api/super-admin/contact-messages/' + encodeURIComponent(contactMessageId) + '/status', {
                method: 'PATCH',
                body: JSON.stringify({ status: 'read' })
            });
            renderContactDetail(data.data || null);
            await loadContact();
        } catch (err) {
            showAlert(err.message, false);
        }
    });
    document.getElementById('contactArchive').addEventListener('click', async function () {
        if (!contactMessageId) return;
        try {
            var data = await api('/api/super-admin/contact-messages/' + encodeURIComponent(contactMessageId) + '/status', {
                method: 'PATCH',
                body: JSON.stringify({ status: 'archived' })
            });
            renderContactDetail(data.data || null);
            showAlert('Message archived.', true);
            await loadContact();
        } catch (err) {
            showAlert(err.message, false);
        }
    });
    document.getElementById('contactDelete').addEventListener('click', async function () {
        if (!contactMessageId) return;
        if (!(await askConfirm('Delete this contact message?', { danger: true, title: 'Delete message?' }))) return;
        try {
            await api('/api/super-admin/contact-messages/' + encodeURIComponent(contactMessageId), { method: 'DELETE' });
            contactMessageId = '';
            renderContactDetail(null);
            showAlert('Contact message deleted.', true);
            await loadContact();
        } catch (err) {
            showAlert(err.message, false);
        }
    });

    async function refreshContactBadge() {
        try {
            var data = await api('/api/super-admin/contact-messages/unread');
            setContactBadge(data.unread);
        } catch (_) {}
    }

    async function refreshSupportBadge() {
        try {
            var data = await api('/api/super-admin/support/unread');
            setSupportBadge(data.unread);
        } catch (_) {}
    }

    var locMap = null;

    function locRow(label, value) {
        return '<div class="sa-loc-row"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value || '—') + '</strong></div>';
    }

    function formatLocWhen(value) {
        if (!value) return '—';
        var d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ', ' +
            pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function destroyLocMap() {
        if (locMap) {
            locMap.remove();
            locMap = null;
        }
    }

    function closeLocationModal() {
        var modal = document.getElementById('saLocModal');
        if (modal) modal.hidden = true;
        destroyLocMap();
    }

    function renderLocMap(lat, lon) {
        var mapEl = document.getElementById('saLocMap');
        var emptyEl = document.getElementById('saLocMapEmpty');
        var hasCoords = typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon);
        destroyLocMap();
        if (!mapEl || !emptyEl) return;
        if (!hasCoords || typeof L === 'undefined') {
            mapEl.hidden = true;
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;
        mapEl.hidden = false;
        locMap = L.map(mapEl, { scrollWheelZoom: true }).setView([lat, lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap'
        }).addTo(locMap);
        L.marker([lat, lon]).addTo(locMap);
        L.circle([lat, lon], { radius: 25000, color: '#5B4FFF', fillColor: '#5B4FFF', fillOpacity: 0.14, weight: 2 }).addTo(locMap);
        setTimeout(function () {
            if (locMap) locMap.invalidateSize();
        }, 120);
    }

    async function openLocationModal(id) {
        var data = await api('/api/super-admin/users/' + encodeURIComponent(id) + '/location');
        var loc = data.data || {};
        document.getElementById('saLocName').textContent = loc.name || 'User';
        document.getElementById('saLocDisclaimer').textContent = loc.disclaimer ||
            'Approximate location from the member’s IP address (not GPS).';
        var coords = (typeof loc.lat === 'number' && typeof loc.lon === 'number')
            ? (Number(loc.lat).toFixed(4) + ', ' + Number(loc.lon).toFixed(4) + ' (approx.)')
            : '—';
        document.getElementById('saLocRows').innerHTML =
            locRow('Presence', loc.presence) +
            locRow('Location status', loc.locationStatus) +
            locRow('IP address', loc.ip) +
            locRow('Place', loc.place) +
            locRow('ISP', loc.isp) +
            locRow('Last seen', formatLocWhen(loc.lastSeen)) +
            locRow('Coordinates', coords);
        document.getElementById('saLocModal').hidden = false;
        renderLocMap(loc.lat, loc.lon);
    }

    document.getElementById('saLocClose').addEventListener('click', closeLocationModal);
    document.getElementById('saLocModal').addEventListener('click', function (e) {
        if (e.target.id === 'saLocModal') closeLocationModal();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !document.getElementById('saLocModal').hidden) closeLocationModal();
        if (e.key === 'Escape' && !document.getElementById('saReceiptModal').hidden) closeReceiptModal();
    });

    function closeReceiptModal() {
        document.getElementById('saReceiptModal').hidden = true;
        document.getElementById('saReceiptBody').innerHTML = '';
    }
    document.getElementById('saReceiptClose').addEventListener('click', closeReceiptModal);
    document.getElementById('saReceiptModal').addEventListener('click', function (e) {
        if (e.target.id === 'saReceiptModal') closeReceiptModal();
    });

    document.getElementById('payRefresh').addEventListener('click', function () { loadPayments().catch(function (err) { showAlert(err.message, false); }); });
    document.getElementById('payFilter').addEventListener('change', function () { loadPayments().catch(function (err) { showAlert(err.message, false); }); });
    document.getElementById('paymentsTable').addEventListener('click', async function (e) {
        var approve = e.target.closest('[data-pay-approve]');
        var reject = e.target.closest('[data-pay-reject]');
        var receipt = e.target.closest('[data-pay-receipt]');
        try {
            if (approve) {
                if (!(await askConfirm('Verify this payment and activate the account? An activation email will be sent.', { title: 'Verify payment?' }))) return;
                var data = await api('/api/super-admin/payments/' + encodeURIComponent(approve.getAttribute('data-pay-approve')) + '/approve', { method: 'POST' });
                showAlert(data.message, true);
                // Keep the verified request + receipt visible in the list
                var approveFilter = document.getElementById('payFilter');
                if (approveFilter) approveFilter.value = 'all';
                payFilter = 'all';
                loadPayments();
            } else if (reject) {
                var reason = await askPrompt('', {
                    title: 'Reject payment',
                    message: 'Optional reject reason (shown to the user on their next attempt):',
                    placeholder: 'Reason for rejection',
                    value: ''
                });
                if (reason === null) return;
                reason = reason || '';
                var rejected = await api('/api/super-admin/payments/' + encodeURIComponent(reject.getAttribute('data-pay-reject')) + '/reject', {
                    method: 'POST',
                    body: JSON.stringify({ reason: reason })
                });
                showAlert(rejected.message, true);
                var rejectFilter = document.getElementById('payFilter');
                if (rejectFilter) rejectFilter.value = 'all';
                payFilter = 'all';
                loadPayments();
            } else if (receipt) {
                var id = receipt.getAttribute('data-pay-receipt');
                document.getElementById('saReceiptMeta').textContent = 'Receipt for payment ' + id;
                document.getElementById('saReceiptBody').innerHTML =
                    '<iframe src="/api/super-admin/payments/' + encodeURIComponent(id) + '/receipt" title="Receipt"></iframe>';
                document.getElementById('saReceiptModal').hidden = false;
            }
        } catch (err) {
            showAlert(err.message, false);
        }
    });

    document.getElementById('billingForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var data = await api('/api/super-admin/billing', {
                method: 'PUT',
                body: JSON.stringify({
                    monthlyAmount: document.getElementById('billMonthly').value,
                    quarterlyAmount: document.getElementById('billQuarterly').value,
                    accountName: '',
                    bankName: '',
                    accountNumber: document.getElementById('billAccountNumber').value,
                    instructions: document.getElementById('billInstructions').value
                })
            });
            showAlert(data.message, true);
        } catch (err) {
            showAlert(err.message, false);
        }
    });
    document.getElementById('billingQrForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var file = document.getElementById('billingQrFile').files[0];
        if (!file) { showAlert('Choose a QR image first.', false); return; }
        var form = new FormData();
        form.append('qr', file);
        try {
            var data = await api('/api/super-admin/billing/qr', { method: 'POST', body: form });
            showAlert(data.message, true);
            await loadBilling();
        } catch (err) {
            showAlert(err.message, false);
        }
    });
    document.getElementById('billingQrRemove').addEventListener('click', async function () {
        try {
            var data = await api('/api/super-admin/billing/qr', { method: 'DELETE' });
            showAlert(data.message, true);
            await loadBilling();
        } catch (err) {
            showAlert(err.message, false);
        }
    });

    setInterval(function () {
        refreshSupportBadge();
        refreshContactBadge();
        refreshPayBadge();
        var active = document.querySelector('.sa-nav.active');
        if (active && active.getAttribute('data-view') === 'support') {
            loadSupport().catch(function () {});
        }
        if (active && active.getAttribute('data-view') === 'contact') {
            loadContact().catch(function () {});
        }
        if (active && active.getAttribute('data-view') === 'payments') {
            loadPayments().catch(function () {});
        }
    }, 4000);

    function tickClock() {
        document.getElementById('clock').textContent = new Date().toLocaleString();
    }
    tickClock();
    setInterval(tickClock, 1000);

    loadMe().then(function () {
        initSaChartFilters();
        loadOverview();
        refreshSupportBadge();
        refreshContactBadge();
        refreshPayBadge();
        attachSocialMediaForm();
    }).catch(function (err) { showAlert(err.message, false); });

    console.log('Admin.js loaded successfully');
})();
