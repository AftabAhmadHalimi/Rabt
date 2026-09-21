function escapeHtml(input) {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function applyTokens(html, tokens = {}) {
    let out = String(html ?? '');
    for (const [key, value] of Object.entries(tokens)) {
        const token = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        out = out.replace(token, String(value ?? ''));
    }
    return out;
}

function wrapEmailTemplate(content, options = {}) {
    const systemName = options.systemName || 'Rabط';
    const backgroundColor = typeof options.backgroundColor === 'string' ? options.backgroundColor : '#1d4ed8';
    const contentWithTokens = applyTokens(content, {
        SYSTEM_NAME: systemName
    });

    const safeColor = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(backgroundColor) ? backgroundColor : '#1d4ed8';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                background: #f8f9fa;
                margin: 0; 
                padding: 20px; 
            }
            .container { 
                max-width: 650px; 
                margin: 0 auto; 
                background: rgba(255, 255, 255, 0.96); 
                border-radius: 8px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
                overflow: hidden;
            }
            .header { 
                background: ${safeColor}; 
                color: white; 
                padding: 25px; 
                text-align: center; 
            }
            .header h1 { margin: 0; font-size: 24px; }
            .body { padding: 30px; }
            .footer { 
                background: #f1f5f9; 
                padding: 20px; 
                text-align: center; 
                font-size: 14px; 
                color: #64748b; 
                border-top: 1px solid #e2e8f0; 
            }
            mark {
                background-color: #F8843F;
                color: #111827;
                padding: 0 2px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${escapeHtml(systemName)}</h1>
            </div>
            <div class="body">
                ${contentWithTokens}
            </div>
        </div>
    </body>
    </html>
    `;
}

function htmlToPlainText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function rewriteMailLinks(html, fromEmail) {
    const email = String(fromEmail || '').trim();
    const domain = (email.split('@')[1] || '').replace(/[^\w.-]/g, '');
    const homeUrl = domain ? `https://${domain}/` : (email ? `mailto:${email}` : '#');
    const unsubUrl = email ? `mailto:${encodeURIComponent(email)}?subject=unsubscribe` : homeUrl;

    let out = String(html || '');
    out = out.replace(/<a\b([^>]*?)href\s*=\s*(["'])([^"']*)\2([^>]*)>([\s\S]*?)<\/a>/gi, (full, pre, q, href, post, inner) => {
        const blob = `${pre} ${inner} ${post}`;
        if (/unsubscribe/i.test(blob)) {
            return `<a${pre}href=${q}${unsubUrl}${q}${post}>${inner}</a>`;
        }
        if (!href || href === '#' || href === 'javascript:void(0)' || href.toLowerCase() === 'javascript:;') {
            return `<a${pre}href=${q}${homeUrl}${q}${post}>${inner}</a>`;
        }
        return full;
    });
    return out;
}

function stripHiddenPreheaders(html) {
    return String(html || '').replace(
        /<div[^>]*style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|max-height\s*:\s*0px)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
        ''
    );
}

function sanitizeEmailHtml(html, options = {}) {
    const { fromEmail, subject } = options;
    let out = String(html || '').replace(/^\uFEFF/, '');
    out = out.replace(/<script[\s\S]*?<\/script>/gi, '');
    out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    out = out.replace(/<object[\s\S]*?<\/object>/gi, '');
    out = out.replace(/<embed[\s\S]*?>/gi, '');
    out = out.replace(/<form[\s\S]*?<\/form>/gi, '');
    out = out.replace(/<link\b[^>]*>/gi, '');
    out = out.replace(/@import\s+[^;]+;/gi, '');
    out = out.replace(/<base\b[^>]*>/gi, '');
    out = stripHiddenPreheaders(out);
    out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    out = out.replace(/javascript:/gi, '');
    out = out.replace(/<meta[^>]*http-equiv=["']?refresh[^>]*>/gi, '');
    if (subject) {
        if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
            out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(subject)}</title>`);
        }
    }
    if (/<html/i.test(out) && !/<meta[^>]+charset/i.test(out)) {
        out = out.replace(/<head([^>]*)>/i, '<head$1><meta charset="UTF-8">');
    }
    if (fromEmail) {
        out = rewriteMailLinks(out, fromEmail);
    }
    return out;
}

function rewriteTemplateImages(html, options = {}) {
    const emailAssetService = require('../services/emailAssetService');
    const publicBase = emailAssetService.publicHttpsBase(options.publicBaseUrl);
    const userId = options.userId;
    let out = String(html || '');

    out = out.replace(
        /src\s*=\s*(["'])(data:image\/(png|jpe?g|gif|webp);base64,[^"']+)\1/gi,
        (full, quote, dataUri) => {
            if (!userId) return full;
            const asset = emailAssetService.saveDataUri(userId, dataUri);
            if (!asset) return full;
            const url = publicBase ? publicBase + asset.path : asset.path;
            return `src=${quote}${url}${quote}`;
        }
    );

    out = out.replace(
        /src\s*=\s*(["'])([^"']+)\1/gi,
        (full, quote, src) => {
            const value = String(src || '').trim();
            if (!value || /^(data:|cid:|mailto:)/i.test(value)) return full;
            const rel = emailAssetService.localAssetPath(value);
            if (rel) {
                if (publicBase) return `src=${quote}${publicBase}${rel}${quote}`;
                return `src=${quote}${rel}${quote}`;
            }
            try {
                const parsed = new URL(value);
                if (parsed.protocol !== 'https:' || emailAssetService.isBlockedHost(parsed.hostname)) {
                    return `src=${quote}${quote}`;
                }
            } catch (_) {}
            return full;
        }
    );

    return { html: out, attachments: [] };
}

function decodeHtmlBuffer(buffer) {
    if (!buffer || !buffer.length) return '';
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return buffer.slice(3).toString('utf8');
    }
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.slice(2).toString('utf16le');
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.alloc(buffer.length - 2);
        for (let i = 2; i + 1 < buffer.length; i += 2) {
            swapped[i - 2] = buffer[i + 1];
            swapped[i - 1] = buffer[i];
        }
        return swapped.toString('utf16le');
    }
    return buffer.toString('utf8');
}

function prepareOutboundEmail(htmlContent, options = {}) {
    const { useRawHtml, wrapOptions, subject, fromEmail, publicBaseUrl, userId } = options;
    let html = useRawHtml
        ? applyTokens(String(htmlContent || ''), { SYSTEM_NAME: (wrapOptions && wrapOptions.systemName) || 'Rabط' })
        : wrapEmailTemplate(htmlContent, wrapOptions);
    html = sanitizeEmailHtml(html, { fromEmail, subject });
    const rewritten = rewriteTemplateImages(html, { publicBaseUrl, userId });
    html = rewritten.html;
    const text = htmlToPlainText(html) || String(subject || '').trim() || ' ';
    return {
        html,
        text,
        inlineAttachments: rewritten.attachments
    };
}

module.exports = {
    wrapEmailTemplate,
    prepareOutboundEmail,
    decodeHtmlBuffer
};