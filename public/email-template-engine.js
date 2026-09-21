(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.RabtEmailTemplates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var CATEGORIES = [
        { id: 'marketing', label: 'Marketing' },
        { id: 'business', label: 'Business' },
        { id: 'newsletter', label: 'Newsletter' },
        { id: 'promotion', label: 'Promotion' },
        { id: 'ecommerce', label: 'E-commerce' },
        { id: 'event', label: 'Events' },
        { id: 'transactional', label: 'Transactional' }
    ];

    var FONTS = [
        { id: 'Arial, Helvetica, sans-serif', label: 'Arial' },
        { id: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
        { id: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
        { id: '"Times New Roman", Times, serif', label: 'Times' },
        { id: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
        { id: 'Verdana, Geneva, sans-serif', label: 'Verdana' }
    ];

    var MERGE_TAGS = [
        { key: 'first_name', label: 'First Name', sample: 'Mohammad' },
        { key: 'last_name', label: 'Last Name', sample: 'Ahmadi' },
        { key: 'email', label: 'Email', sample: 'mohammad@example.com' },
        { key: 'phone', label: 'Phone', sample: '+93 70 123 4567' },
        { key: 'company_name', label: 'Company Name', sample: 'Afghanistan Business Group' },
        { key: 'product_name', label: 'Product Name', sample: 'Premium Package' },
        { key: 'discount_code', label: 'Discount Code', sample: 'KABUL20' },
        { key: 'website_url', label: 'Website', sample: 'https://www.example.com' },
        { key: 'unsubscribe_url', label: 'Unsubscribe URL', sample: 'https://www.example.com/unsubscribe' }
    ];

    var BLOCK_TYPES = [
        { type: 'logo', label: 'Logo', icon: 'fa-solid fa-certificate', group: 'advanced' },
        { type: 'heading', label: 'Heading', icon: 'fa-solid fa-heading', group: 'content' },
        { type: 'text', label: 'Text', icon: 'fa-solid fa-align-left', group: 'content' },
        { type: 'image', label: 'Image', icon: 'fa-regular fa-image', group: 'content' },
        { type: 'button', label: 'Button', icon: 'fa-solid fa-arrow-right', group: 'content' },
        { type: 'divider', label: 'Divider', icon: 'fa-solid fa-minus', group: 'content' },
        { type: 'spacer', label: 'Spacer', icon: 'fa-solid fa-arrows-up-down', group: 'content' },
        { type: 'columns', label: 'Columns', icon: 'fa-solid fa-table-columns', group: 'layout' },
        { type: 'social', label: 'Social Links', icon: 'fa-solid fa-share-nodes', group: 'social' },
        { type: 'footer', label: 'Footer', icon: 'fa-solid fa-shoe-prints', group: 'advanced' },
        { type: 'unsubscribe', label: 'Unsubscribe', icon: 'fa-solid fa-envelope-open-text', group: 'advanced' }
    ];

    var BLOCK_GROUPS = [
        {
            id: 'content',
            label: 'Content',
            items: [
                { type: 'text', label: 'Text', icon: 'fa-solid fa-align-left' },
                { type: 'heading', label: 'Heading', icon: 'fa-solid fa-heading' },
                { type: 'image', label: 'Image', icon: 'fa-regular fa-image' },
                { type: 'button', label: 'Button', icon: 'fa-solid fa-arrow-right' },
                { type: 'divider', label: 'Divider', icon: 'fa-solid fa-minus' },
                { type: 'spacer', label: 'Spacer', icon: 'fa-solid fa-arrows-up-down' }
            ]
        },
        {
            id: 'layout',
            label: 'Layout',
            items: [
                { type: 'columns', count: 1, label: '1 Column', icon: 'fa-solid fa-square' },
                { type: 'columns', count: 2, label: '2 Columns', icon: 'fa-solid fa-table-columns' },
                { type: 'columns', count: 3, label: '3 Columns', icon: 'fa-solid fa-table-cells' }
            ]
        },
        {
            id: 'social',
            label: 'Social',
            items: [{ type: 'social', label: 'Social Links', icon: 'fa-solid fa-share-nodes' }]
        },
        {
            id: 'advanced',
            label: 'Advanced',
            items: [
                { type: 'logo', label: 'Logo', icon: 'fa-solid fa-certificate' },
                { type: 'footer', label: 'Footer', icon: 'fa-solid fa-shoe-prints' },
                { type: 'unsubscribe', label: 'Unsubscribe', icon: 'fa-solid fa-envelope-open-text' }
            ]
        }
    ];

    function defaultTheme() {
        return {
            pageBg: '#EEF1F7',
            cardBg: '#FFFFFF',
            accent: '#5B4FFF',
            text: '#1E2540',
            muted: '#6B7389',
            linkColor: '#5B4FFF',
            buttonColor: '#5B4FFF',
            font: 'Arial, Helvetica, sans-serif',
            width: 640
        };
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, '&#39;');
    }

    function isMergeTag(value) {
        return /^\{\{\s*[a-z_][a-z0-9_]*\s*\}\}$/i.test(String(value || '').trim());
    }

    function sampleMap() {
        var map = {};
        MERGE_TAGS.forEach(function (item) { map[item.key] = item.sample; });
        return map;
    }

    function applySamples(value, preview) {
        var text = String(value == null ? '' : value);
        if (!preview) return text;
        var map = sampleMap();
        return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, function (_, key) {
            var found = map[String(key).toLowerCase()];
            return found == null ? '' : found;
        });
    }

    function isLocalAssetPath(src) {
        return /^\/m\/[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/i.test(String(src || '').trim());
    }

    function isBlockedImageHost(hostname) {
        var host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
        if (!host) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
        if (/\.local$|\.internal$/i.test(host)) return true;
        if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
        return false;
    }

    function resolveImageSrc(src, assetBase) {
        var value = String(src || '').trim();
        var base = String(assetBase || '').replace(/\/$/, '');
        if (isLocalAssetPath(value)) return base ? base + value : value;
        try {
            var parsed = new URL(value);
            if (/^\/m\/[a-f0-9]{32}\.(png|jpe?g|gif|webp)$/i.test(parsed.pathname)) {
                return base ? base + parsed.pathname : parsed.pathname;
            }
        } catch (_) {}
        return value;
    }

    function isSafeImageSrc(src) {
        var value = String(src || '').trim();
        if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
            return value.length < 1200000;
        }
        if (isLocalAssetPath(value)) return true;
        try {
            var parsed = new URL(value);
            // Hosted template assets (/m/…) are safe on http or https — needed for local editor preview.
            if (isLocalAssetPath(parsed.pathname)) return true;
            if (parsed.protocol !== 'https:') return false;
            if (isBlockedImageHost(parsed.hostname)) return false;
            return true;
        } catch (_) {
            return false;
        }
    }

    function sanitizeUrl(url) {
        var value = String(url || '').trim();
        if (!value) return '{{website_url}}';
        if (isMergeTag(value)) return value;
        if (/^(https?:\/\/|mailto:)/i.test(value)) {
            if (/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(value)) {
                return '{{website_url}}';
            }
            return value.replace(/"/g, '');
        }
        if (value.charAt(0) === '#') return value.replace(/"/g, '');
        return '{{website_url}}';
    }

    function sanitizeInlineHtml(html) {
        var out = String(html || '');
        out = out.replace(/<\s*(script|style|iframe|object|embed|form|img|svg|math)[\s\S]*?<\/\s*\1\s*>/gi, '');
        out = out.replace(/<\s*(script|style|iframe|object|embed|form|img)[^>]*>/gi, '');
        out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        out = out.replace(/javascript:/gi, '');
        out = out.replace(/<(?!\/?(strong|b|em|i|u|a|br|span)\b)[^>]+>/gi, '');
        out = out.replace(/\shref\s*=\s*(["'])([^"']*)\1/gi, function (_, q, href) {
            return ' href=' + q + sanitizeUrl(href) + q;
        });
        return out;
    }

    function nl2br(value, preview) {
        return escapeHtml(applySamples(value, preview)).replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
    }

    function richText(block, preview) {
        if (block && block.html) {
            var html = sanitizeInlineHtml(block.html);
            return applySamples(html, preview);
        }
        return nl2br(block && block.text, preview);
    }

    function num(value, fallback, max) {
        var n = parseInt(value, 10);
        if (!isFinite(n) || n < 0) n = fallback;
        if (max && n > max) n = max;
        return n;
    }

    function padAll(block, fallback) {
        return num(block && block.padding, fallback, 80);
    }

    function padCss(block, fallback) {
        var all = padAll(block, fallback);
        var t = num(block && block.padTop, all, 80);
        var r = num(block && block.padRight, 32, 80);
        var b = num(block && block.padBottom, all, 80);
        var l = num(block && block.padLeft, 32, 80);
        return t + 'px ' + r + 'px ' + b + 'px ' + l + 'px';
    }

    function align(block) {
        var value = String((block && block.align) || 'left').toLowerCase();
        if (value === 'center' || value === 'right') return value;
        return 'left';
    }

    function color(value, fallback) {
        var raw = String(value || '').trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
        return fallback;
    }

    function fontSize(value, fallback) {
        return num(value, fallback, 48) < 11 ? fallback : num(value, fallback, 48);
    }

    function fontFamily(block, theme) {
        var raw = String((block && block.font) || (theme && theme.font) || '').trim();
        var allowed = FONTS.some(function (item) { return item.id === raw; });
        return allowed ? raw : ((theme && theme.font) || 'Arial, Helvetica, sans-serif');
    }

    function weight(block, fallback) {
        var value = String((block && block.weight) || fallback || '400');
        if (value === '400' || value === '600' || value === '700' || value === '800') return value;
        if (value === 'normal') return '400';
        if (value === 'bold') return '700';
        return fallback || '400';
    }

    function lineHeight(block, fallback) {
        var n = parseFloat(block && block.lineHeight);
        if (!isFinite(n) || n < 1) return fallback;
        if (n > 2.4) return 2.4;
        return n;
    }

    function uid(prefix) {
        return (prefix || 'b') + '-' + Math.random().toString(36).slice(2, 10);
    }

    function newBlock(type, extras) {
        var id = uid(type);
        var block;
        switch (type) {
            case 'logo':
                block = { id: id, type: 'logo', text: 'Your Logo', src: '', align: 'left', color: '#5B4FFF', padding: 10 };
                break;
            case 'heading':
                block = { id: id, type: 'heading', text: 'A clear headline', align: 'left', size: 28, weight: '800', color: '#1E2540', padding: 8, lineHeight: 1.25 };
                break;
            case 'text':
                block = { id: id, type: 'text', text: 'Write a short, useful paragraph. Keep one idea per block so the email stays easy to scan on a phone.', align: 'left', size: 15, weight: '400', color: '#3D4663', padding: 8, lineHeight: 1.7 };
                break;
            case 'image':
                block = { id: id, type: 'image', src: '', alt: 'Campaign image', href: '{{website_url}}', width: 536, radius: 12, align: 'center', padding: 8 };
                break;
            case 'button':
                block = { id: id, type: 'button', label: 'Continue', href: '{{website_url}}', align: 'left', bg: '#5B4FFF', color: '#FFFFFF', radius: 10, size: 15, btnPad: 14, padding: 18 };
                break;
            case 'columns':
                block = {
                    id: id,
                    type: 'columns',
                    count: 2,
                    padding: 8,
                    leftHeading: 'First point',
                    leftText: 'A short supporting line for this column.',
                    rightHeading: 'Second point',
                    rightText: 'A short supporting line for this column.',
                    midHeading: 'Third point',
                    midText: 'A short supporting line for this column.'
                };
                break;
            case 'divider':
                block = { id: id, type: 'divider', color: '#E6EAF2', padding: 12 };
                break;
            case 'spacer':
                block = { id: id, type: 'spacer', height: 16 };
                break;
            case 'social':
                block = {
                    id: id,
                    type: 'social',
                    padding: 8,
                    website: '{{website_url}}',
                    linkedin: '{{website_url}}',
                    instagram: '{{website_url}}',
                    facebook: '{{website_url}}'
                };
                break;
            case 'footer':
                block = { id: id, type: 'footer', text: '{{company_name}} · A message from our team', align: 'center', color: '#8B93A7', padding: 8 };
                break;
            case 'unsubscribe':
                block = { id: id, type: 'unsubscribe', text: 'If you no longer want these emails, you can unsubscribe at any time.', padding: 4 };
                break;
            default:
                block = { id: id, type: 'text', text: '', align: 'left', size: 15, color: '#3D4663', padding: 8 };
        }
        return Object.assign(block, extras || {});
    }

    function cloneBlocks(blocks) {
        return JSON.parse(JSON.stringify(Array.isArray(blocks) ? blocks : []));
    }

    function renderLogo(block, theme, preview, assetBase) {
        var rawSrc = String(block.src || '').trim();
        var src = resolveImageSrc(rawSrc, assetBase);
        var rawText = String(block.text || '').trim();
        var inner;
        if (rawSrc && (isSafeImageSrc(rawSrc) || isSafeImageSrc(src))) {
            inner = '<img src="' + escapeAttr(src || rawSrc) + '" alt="Logo" style="display:inline-block;max-height:48px;max-width:200px;border:0;">';
        } else if (rawText) {
            inner = '<div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;font-weight:800;color:' +
                color(block.color, theme.accent) + ';">' + escapeHtml(applySamples(rawText, preview)) + '</div>';
        } else {
            inner = '<span style="display:inline-block;border:1px dashed #C5CAD6;border-radius:8px;padding:10px 14px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;color:#8B93A7;background:#F7F8FC;">Your Logo</span>';
        }
        return '<tr><td style="padding:' + padCss(block, 10) + ';text-align:' + align(block) + ';">' + inner + '</td></tr>';
    }

    function renderHeading(block, theme, preview) {
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';text-align:' + align(block) + ';font-family:' + escapeAttr(fontFamily(block, theme)) + ';">' +
            '<h1 style="margin:0;font-size:' + fontSize(block.size, 28) + 'px;line-height:' + lineHeight(block, 1.25) +
            ';font-weight:' + weight(block, '800') + ';color:' + color(block.color, theme.text) + ';">' +
            richText(block, preview) + '</h1></td></tr>'
        );
    }

    function renderText(block, theme, preview) {
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';text-align:' + align(block) + ';font-family:' + escapeAttr(fontFamily(block, theme)) + ';">' +
            '<p style="margin:0;font-size:' + fontSize(block.size, 15) + 'px;line-height:' + lineHeight(block, 1.7) +
            ';font-weight:' + weight(block, '400') + ';color:' + color(block.color, '#3D4663') + ';">' +
            richText(block, preview) + '</p></td></tr>'
        );
    }

    function renderImage(block, preview, assetBase) {
        var rawSrc = String(block.src || '').trim();
        var src = resolveImageSrc(rawSrc, assetBase);
        var href = applySamples(sanitizeUrl(block.href || '{{website_url}}'), preview);
        var alt = escapeAttr(applySamples(block.alt || 'Image', preview));
        var width = num(block.width, 536, 640);
        var radius = num(block.radius, 12, 32);
        var inner;
        if (rawSrc && (isSafeImageSrc(rawSrc) || isSafeImageSrc(src))) {
            inner = '<img src="' + escapeAttr(src || rawSrc) + '" alt="' + alt + '" width="' + width + '" style="display:block;width:100%;max-width:' + width + 'px;height:auto;border:0;border-radius:' + radius + 'px;">';
        } else {
            inner = '<div style="background:#EEF1F8;border-radius:' + radius + 'px;padding:52px 20px;text-align:center;color:#8B93A7;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Image placeholder</div>';
        }
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';text-align:' + align(block) + ';">' +
            '<a href="' + escapeAttr(href) + '" style="text-decoration:none;">' + inner + '</a></td></tr>'
        );
    }

    function renderButton(block, theme, preview) {
        var href = applySamples(sanitizeUrl(block.href || '{{website_url}}'), preview);
        var bg = color(block.bg, theme.buttonColor || theme.accent);
        var fg = color(block.color, '#FFFFFF');
        var a = align(block);
        var radius = num(block.radius, 10, 40);
        var size = fontSize(block.size, 15);
        var btnPad = num(block.btnPad, 14, 28);
        var label = escapeHtml(applySamples(block.label || 'Continue', preview));
        return (
            '<tr><td style="padding:' + padCss(block, 18) + ';text-align:' + a + ';">' +
            '<table role="presentation" cellspacing="0" cellpadding="0" align="' + a + '"><tr>' +
            '<td bgcolor="' + bg + '" style="background:' + bg + ';border-radius:' + radius + 'px;">' +
            '<a href="' + escapeAttr(href) + '" style="display:inline-block;padding:' + btnPad + 'px 26px;font-size:' + size +
            'px;line-height:1;font-weight:700;color:' + fg + ';text-decoration:none;border-radius:' + radius + 'px;">' +
            label + '</a></td></tr></table></td></tr>'
        );
    }

    function colCell(heading, text, theme, preview, width) {
        return (
            '<td class="stack" style="width:' + width + '%;padding:14px 16px;background:#F7F8FC;border-radius:12px;vertical-align:top;">' +
            '<div style="font-size:15px;font-weight:800;color:' + theme.text + ';margin-bottom:6px;">' +
            escapeHtml(applySamples(heading || '', preview)) + '</div>' +
            '<div style="font-size:13px;line-height:1.6;color:' + theme.muted + ';">' + nl2br(text, preview) + '</div></td>'
        );
    }

    function renderColumns(block, theme, preview) {
        var count = num(block.count, 2, 3);
        if (count < 1) count = 1;
        var cols = [
            { h: block.leftHeading, t: block.leftText },
            { h: block.rightHeading, t: block.rightText },
            { h: block.midHeading, t: block.midText }
        ].slice(0, count);
        if (count === 3) {
            cols = [
                { h: block.leftHeading, t: block.leftText },
                { h: block.midHeading, t: block.midText },
                { h: block.rightHeading, t: block.rightText }
            ];
        }
        var width = Math.floor(100 / count);
        var gap = '<td class="stack-gap" width="12" style="width:12px;font-size:0;">&nbsp;</td>';
        var inner = cols.map(function (col, i) {
            return (i ? gap : '') + colCell(col.h, col.t, theme, preview, width);
        }).join('');
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';">' +
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>' + inner + '</tr></table></td></tr>'
        );
    }

    function renderDivider(block) {
        return (
            '<tr><td style="padding:' + padCss(block, 12) + ';">' +
            '<div style="height:1px;line-height:1px;background:' + color(block.color, '#E6EAF2') + ';">&nbsp;</div></td></tr>'
        );
    }

    function renderSpacer(block) {
        var height = num(block.height, 16, 80);
        if (height < 4) height = 16;
        return '<tr><td style="height:' + height + 'px;line-height:' + height + 'px;font-size:0;">&nbsp;</td></tr>';
    }

    function renderSocial(block, theme, preview) {
        var linkColor = color(theme.linkColor || theme.accent, theme.accent);
        function link(label, href) {
            return '<a href="' + escapeAttr(applySamples(sanitizeUrl(href), preview)) + '" style="display:inline-block;margin:0 8px;color:' +
                linkColor + ';font-size:13px;font-weight:700;text-decoration:none;">' + escapeHtml(label) + '</a>';
        }
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';text-align:center;">' +
            link('Website', block.website) +
            link('LinkedIn', block.linkedin) +
            link('Instagram', block.instagram) +
            link('Facebook', block.facebook) +
            '</td></tr>'
        );
    }

    function renderFooter(block, theme, preview) {
        return (
            '<tr><td style="padding:' + padCss(block, 8) + ';text-align:' + align(block) + ';">' +
            '<p style="margin:0;font-size:12px;line-height:1.6;color:' + color(block.color, theme.muted) + ';">' +
            nl2br(block.text, preview) + '</p></td></tr>'
        );
    }

    function renderUnsubscribe(block, theme, preview) {
        var copy = escapeHtml(applySamples(block.text || 'If you no longer want these emails, you can unsubscribe at any time.', preview));
        var href = applySamples('{{unsubscribe_url}}', preview);
        return (
            '<tr><td style="padding:' + padCss(block, 4) + ';padding-bottom:28px;text-align:center;">' +
            '<p style="margin:0;font-size:12px;line-height:1.6;color:' + theme.muted + ';">' + copy +
            ' <a href="' + escapeAttr(href) + '" style="color:' + color(theme.linkColor || theme.accent, theme.accent) +
            ';font-weight:700;text-decoration:underline;">Unsubscribe</a></p></td></tr>'
        );
    }

    function renderBlock(block, theme, preview, assetBase) {
        if (!block || !block.type) return '';
        switch (block.type) {
            case 'logo': return renderLogo(block, theme, preview, assetBase);
            case 'heading': return renderHeading(block, theme, preview);
            case 'text': return renderText(block, theme, preview);
            case 'image': return renderImage(block, preview, assetBase);
            case 'button': return renderButton(block, theme, preview);
            case 'columns': return renderColumns(block, theme, preview);
            case 'divider': return renderDivider(block);
            case 'spacer': return renderSpacer(block);
            case 'social': return renderSocial(block, theme, preview);
            case 'footer': return renderFooter(block, theme, preview);
            case 'unsubscribe': return renderUnsubscribe(block, theme, preview);
            default: return '';
        }
    }

    function firstHeading(blocks) {
        var list = Array.isArray(blocks) ? blocks : [];
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] && list[i].type === 'heading' && list[i].text) {
                return applySamples(String(list[i].text), true);
            }
        }
        return '';
    }

    function compile(template, options) {
        var preview = !!(options && options.preview);
        var theme = Object.assign(defaultTheme(), (template && template.theme) || {});
        var blocks = Array.isArray(template && template.blocks) ? template.blocks : [];
        var assetBase = String((options && options.assetBase) || '').replace(/\/$/, '');
        var inner = blocks.map(function (block) { return renderBlock(block, theme, preview, assetBase); }).join('');
        var preheader = escapeHtml(applySamples((template && template.preheader) || (template && template.description) || '', preview));
        var subject = escapeHtml(applySamples((template && template.subject) || '', preview));
        var width = num(theme.width, 640, 720);
        if (width < 480) width = 480;
        var hideScroll = preview
            ? 'html,body{scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{width:0;height:0;display:none;}'
            : '';
        var html = (
            '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
            '<title>' + subject + '</title>\n' +
            '<style>' + hideScroll + '@media only screen and (max-width:620px){.email-card{width:100% !important;} .stack{display:block !important;width:100% !important;box-sizing:border-box;} .stack-gap{display:none !important;}}</style>\n' +
            '</head>\n<body style="margin:0;padding:0;background:' + color(theme.pageBg, '#EEF1F7') + ';font-family:' +
            escapeAttr(theme.font) + ';">\n' +
            '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + preheader + '</div>\n' +
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:' +
            color(theme.pageBg, '#EEF1F7') + ';padding:24px 12px;">\n<tr><td align="center">\n' +
            '<table role="presentation" class="email-card" width="' + width + '" cellspacing="0" cellpadding="0" style="width:' +
            width + 'px;max-width:100%;background:' + color(theme.cardBg, '#FFFFFF') + ';border-radius:16px;overflow:hidden;">\n' +
            '<tr><td style="height:5px;background:' + color(theme.accent, '#5B4FFF') + ';font-size:0;line-height:5px;">&nbsp;</td></tr>\n' +
            inner +
            '</table>\n</td></tr></table>\n</body>\n</html>'
        );
        return preview ? applySamples(html, true) : html;
    }

    return {
        CATEGORIES: CATEGORIES,
        FONTS: FONTS,
        MERGE_TAGS: MERGE_TAGS,
        BLOCK_TYPES: BLOCK_TYPES,
        BLOCK_GROUPS: BLOCK_GROUPS,
        defaultTheme: defaultTheme,
        newBlock: newBlock,
        cloneBlocks: cloneBlocks,
        compile: compile,
        renderBlock: renderBlock,
        firstHeading: firstHeading,
        sanitizeUrl: sanitizeUrl,
        isSafeImageSrc: isSafeImageSrc,
        resolveImageSrc: resolveImageSrc,
        sanitizeInlineHtml: sanitizeInlineHtml,
        applySamples: applySamples,
        escapeHtml: escapeHtml
    };
});
