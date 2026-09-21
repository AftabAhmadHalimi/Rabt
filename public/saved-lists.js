/* Shared helper for saved recipient lists (Contact). */
(function () {
    if (window.RabtLists) return;

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function load(kind) {
        var url = '/api/lists' + (kind ? ('?kind=' + encodeURIComponent(kind)) : '');
        var res = await fetch(url, { credentials: 'same-origin' });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(data.message || 'Could not load saved lists.');
        return data.data || [];
    }

    var ALL_VALUE = '__all__';

    function tr(s) {
        return (window.RabtI18n && window.RabtI18n.phrase) ? window.RabtI18n.phrase(s) : s;
    }

    function fillSelect(select, lists, emptyLabel) {
        if (!select) return;
        if (!lists || !lists.length) {
            select.innerHTML = '<option value="">' + escapeHtml(tr(emptyLabel || 'No saved lists — open Contact')) + '</option>';
            return;
        }
        var total = 0;
        lists.forEach(function (item) {
            total += Array.isArray(item.contacts) ? item.contacts.length : (item.recordCount || 0);
        });
        var options = '<option value="' + ALL_VALUE + '" selected>' + escapeHtml(tr('All Contact · {n}').replace('{n}', String(total))) + '</option>';
        options += lists.map(function (item) {
            var label = (item.name || tr('Untitled')) + ' · ' + (item.recordCount || 0) + ' ' + tr('rows');
            return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(label) + '</option>';
        }).join('');
        select.innerHTML = options;
    }

    function filenameFromDisposition(header) {
        var value = String(header || '');
        var star = value.match(/filename\*=UTF-8''([^;]+)/i);
        if (star) {
            try { return decodeURIComponent(star[1].trim()); } catch (_) { /* fall through */ }
        }
        var plain = value.match(/filename="?([^";]+)"?/i);
        return plain ? plain[1].trim() : 'list.txt';
    }

    async function fileFromId(id) {
        if (!id) throw new Error('Select a saved list.');
        var res = await fetch('/api/lists/' + encodeURIComponent(id) + '/download', { credentials: 'same-origin' });
        if (!res.ok) {
            var data = await res.json().catch(function () { return {}; });
            throw new Error(data.message || 'Could not load the saved list.');
        }
        var blob = await res.blob();
        var name = filenameFromDisposition(res.headers.get('content-disposition'));
        return new File([blob], name, { type: blob.type || 'application/octet-stream' });
    }

    async function fileFromAll(kind, filename) {
        var lists = await load(kind);
        var seen = {};
        var values = [];
        lists.forEach(function (list) {
            (list.contacts || []).forEach(function (value) {
                var key = String(value || '').toLowerCase();
                if (!key || seen[key]) return;
                seen[key] = true;
                values.push(value);
            });
        });
        if (!values.length) throw new Error('No verified contacts in your saved lists.');
        return new File([values.join('\n') + '\n'], filename || 'all-contacts.txt', { type: 'text/plain' });
    }

    async function fileFromSaved(id, kind, allFilename) {
        if (!id) throw new Error('Select a saved list.');
        if (id === ALL_VALUE) return fileFromAll(kind, allFilename);
        return fileFromId(id);
    }

    function consumePrefill(channel, apply) {
        try {
            var raw = sessionStorage.getItem('rabtSelectedRecipients');
            if (!raw) return;
            var data = JSON.parse(raw);
            if (!data || data.channel !== channel || !data.values || !data.values.length) return;
            sessionStorage.removeItem('rabtSelectedRecipients');
            apply(data.values.join('\n'));
        } catch (_) {}
    }

    window.RabtLists = {
        ALL: ALL_VALUE,
        load: load,
        fillSelect: fillSelect,
        fileFromId: fileFromId,
        fileFromAll: fileFromAll,
        fileFromSaved: fileFromSaved,
        escapeHtml: escapeHtml,
        consumePrefill: consumePrefill
    };
})();
