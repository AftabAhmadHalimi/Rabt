(function () {
    var engine = window.RabtEmailTemplates;
    var state = {
        source: 'all',
        category: 'all',
        q: '',
        items: [],
        categories: [],
        loading: false,
        editor: null,
        selectedBlock: null,
        canvasMode: 'desktop',
        previewMode: 'desktop'
    };

    function $(id) { return document.getElementById(id); }
    function notify(message, type) {
        if (window.RabtUI) return RabtUI.notify(message, type || 'info');
        window.alert(message);
    }
    function ask(message, title) {
        if (window.RabtUI) {
            return RabtUI.confirm({ message: message, danger: true, title: title || 'Please confirm' });
        }
        return Promise.resolve(window.confirm(message));
    }
    function escapeHtml(value) { return engine.escapeHtml(value); }
    function shown(value) { return engine.applySamples(value == null ? '' : value, true); }
    function keepMerge(display, stored) {
        if (display == null) return stored;
        if (engine.applySamples(stored || '', true) === display) return stored || '';
        return display;
    }
    function api(path, options) {
        return fetch(path, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok || !body.success) {
                    var err = new Error((body && body.message) || 'Request failed');
                    err.status = res.status;
                    throw err;
                }
                return body.data;
            });
        });
    }
    function assetBase() {
        return (window.location && window.location.origin) || '';
    }
    function withVisibleAssets(html) {
        var origin = assetBase();
        return String(html || '').replace(/src=(["'])(\/m\/)/gi, 'src=$1' + origin + '$2');
    }
    function categoryLabel(id) {
        var found = (state.categories || engine.CATEGORIES).find(function (item) { return item.id === id; });
        return found ? found.label : id;
    }
    function themeOf(editor) {
        return Object.assign(engine.defaultTheme(), (editor && editor.theme) || {});
    }

    function loadList() {
        state.loading = true;
        renderGrid();
        var params = new URLSearchParams();
        params.set('source', state.source);
        if (state.category && state.category !== 'all') params.set('category', state.category);
        if (state.q) params.set('q', state.q);
        api('/api/templates?' + params.toString()).then(function (data) {
            state.items = data.items || [];
            state.categories = data.categories || engine.CATEGORIES;
            state.loading = false;
            renderCategoryFilter();
            renderGrid();
        }).catch(function (err) {
            state.loading = false;
            state.items = [];
            renderCategoryFilter();
            renderGrid(err.message);
        });
    }

    function renderCategoryFilter() {
        var select = $('categoryFilter');
        if (!select) return;
        var list = (state.categories && state.categories.length) ? state.categories : engine.CATEGORIES;
        var cats = [{ id: 'all', label: 'All' }].concat(list);
        select.innerHTML = cats.map(function (cat) {
            return '<option value="' + escapeHtml(cat.id) + '"' +
                (state.category === cat.id ? ' selected' : '') + '>' +
                escapeHtml(cat.label) + '</option>';
        }).join('');
    }

    function thumbHtml(html) {
        var src = 'srcdoc="' + escapeHtml(withVisibleAssets(html || '')) + '"';
        return '<div class="tpl-thumb"><iframe sandbox="" tabindex="-1" ' + src + '></iframe></div>';
    }

    function renderGrid(error) {
        var grid = $('tplGrid');
        if (state.loading) {
            grid.innerHTML = '<div class="tpl-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading templates…</div>';
            return;
        }
        if (error) {
            grid.innerHTML = '<div class="tpl-error">' + escapeHtml(error) + '</div>';
            return;
        }
        if (!state.items.length) {
            var empty = state.source === 'mine'
                ? 'No saved templates yet. Create one, or edit a ready-made design to keep a private copy.'
                : 'No templates match this search.';
            grid.innerHTML = '<div class="tpl-empty"><i class="fa-regular fa-envelope"></i>' + empty + '</div>';
            return;
        }
        grid.innerHTML = state.items.map(function (item) {
            return (
                '<article class="tpl-card" data-id="' + escapeHtml(item.id) + '">' +
                    thumbHtml(item.htmlPreview || compiledPreview(item) || '') +
                    '<div class="tpl-card-body">' +
                        '<div class="tpl-card-name">' + escapeHtml(item.name) + '</div>' +
                        '<div class="tpl-card-desc">' + escapeHtml(item.description || '') + '</div>' +
                        '<div class="tpl-card-meta">' +
                            '<span class="tpl-badge' + (item.system ? ' system' : '') + '">' + (item.system ? 'Ready Template' : 'My Template') + '</span>' +
                            '<span class="tpl-badge">' + escapeHtml(categoryLabel(item.category)) + '</span>' +
                        '</div>' +
                        '<div class="tpl-card-actions">' +
                            '<button type="button" class="tpl-btn tpl-btn-primary" data-act="use">Use Template</button>' +
                            '<button type="button" class="tpl-btn" data-act="edit">Edit</button>' +
                            '<button type="button" class="tpl-btn tpl-btn-icon" data-act="preview" title="Preview" aria-label="Preview"><i class="fa-regular fa-eye"></i></button>' +
                            (item.system ? '' : '<button type="button" class="tpl-btn tpl-btn-icon" data-act="delete" title="Delete" aria-label="Delete"><i class="fa-regular fa-trash-can"></i></button>') +
                        '</div>' +
                    '</div>' +
                '</article>'
            );
        }).join('');
    }

    function useTemplate(id, fromEditor) {
        var send = function (tpl) {
            try {
                sessionStorage.setItem('rabt_compose_template', JSON.stringify({
                    id: tpl.id,
                    name: tpl.name,
                    subject: tpl.subject,
                    html: tpl.html || engine.compile(tpl, { assetBase: assetBase() }),
                    htmlPreview: tpl.htmlPreview || engine.compile(tpl, { preview: true, assetBase: assetBase() }),
                    usedAt: Date.now()
                }));
            } catch (_) {}
            window.location.href = '/email.html?template=1';
        };
        if (fromEditor && state.editor) {
            return send(Object.assign({}, state.editor, {
                html: engine.compile(state.editor, { assetBase: assetBase() }),
                htmlPreview: engine.compile(state.editor, { preview: true, assetBase: assetBase() })
            }));
        }
        api('/api/templates/' + encodeURIComponent(id)).then(send).catch(function (err) { notify(err.message, 'error'); });
    }

    function compiledPreview(tpl) {
        return engine.compile(tpl || state.editor, { preview: true, assetBase: assetBase() });
    }

    function openPreview(html, name) {
        $('previewTitle').textContent = name || 'Preview';
        $('previewFrame').srcdoc = html;
        $('tplPreview').hidden = false;
        $('previewDesktop').classList.add('active');
        $('previewMobile').classList.remove('active');
        $('previewFrameWrap').classList.remove('mobile');
        state.previewMode = 'desktop';
    }
    function closePreview() {
        $('tplPreview').hidden = true;
        $('previewFrame').srcdoc = '';
    }

    function blankTemplate() {
        return {
            id: '',
            name: 'Untitled template',
            description: 'A custom email for this workspace.',
            category: 'marketing',
            subject: 'A message from {{company_name}}',
            preheader: '',
            system: false,
            theme: engine.defaultTheme(),
            blocks: [
                engine.newBlock('logo'),
                engine.newBlock('heading', { text: 'Write a headline' }),
                engine.newBlock('text'),
                engine.newBlock('button', { label: 'Get started' }),
                engine.newBlock('footer'),
                engine.newBlock('unsubscribe')
            ]
        };
    }

    function showLibrary() {
        $('tplLibrary').hidden = false;
        $('tplBuilder').hidden = true;
        document.documentElement.classList.remove('app-no-scroll');
        state.editor = null;
        loadList();
    }

    function isMobileEditor() {
        return window.matchMedia && window.matchMedia('(max-width: 860px)').matches;
    }
    function setEditorTab(tab) {
        var next = tab || 'canvas';
        var builder = $('tplBuilder');
        if (!builder) return;
        builder.setAttribute('data-eb-tab', next);
        Array.prototype.forEach.call(document.querySelectorAll('#ebMobileTabs [data-eb-tab]'), function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-eb-tab') === next);
        });
    }
    function openEditor(tpl) {
        state.editor = JSON.parse(JSON.stringify(tpl));
        if (!state.editor.theme) state.editor.theme = engine.defaultTheme();
        if (!Array.isArray(state.editor.blocks) || !state.editor.blocks.length) {
            state.editor.blocks = blankTemplate().blocks;
        }
        state.selectedBlock = null;
        state.canvasMode = isMobileEditor() ? 'mobile' : 'desktop';
        $('tplLibrary').hidden = true;
        $('tplPicker').hidden = true;
        $('tplBuilder').hidden = false;
        setEditorTab('canvas');
        document.documentElement.classList.add('app-no-scroll');
        $('builderName').value = state.editor.name || '';
        $('builderProtect').hidden = !state.editor.system;
        $('canvasDesktop').classList.toggle('active', state.canvasMode === 'desktop');
        $('canvasMobile').classList.toggle('active', state.canvasMode === 'mobile');
        $('ebStage').classList.toggle('mobile', state.canvasMode === 'mobile');
        renderPalette();
        renderCanvas();
        renderInspector();
    }

    function selected() {
        if (!state.editor) return null;
        return state.editor.blocks.find(function (block) { return block.id === state.selectedBlock; }) || null;
    }

    function insertBlock(type, count) {
        var block = engine.newBlock(type);
        if (type === 'columns') block.count = count || 2;
        var list = state.editor.blocks;
        var index = list.findIndex(function (item) { return item.id === state.selectedBlock; });
        if (index >= 0) list.splice(index + 1, 0, block);
        else list.push(block);
        state.selectedBlock = block.id;
        renderCanvas();
        renderInspector();
        if (isMobileEditor()) setEditorTab('canvas');
    }

    function moveBlock(id, dir) {
        var list = state.editor.blocks;
        var index = list.findIndex(function (block) { return block.id === id; });
        if (index < 0) return;
        if (dir === 'remove') {
            list.splice(index, 1);
            state.selectedBlock = list[Math.max(0, index - 1)] ? list[Math.max(0, index - 1)].id : null;
        } else if (dir === 'duplicate') {
            var copy = JSON.parse(JSON.stringify(list[index]));
            copy.id = typeId(copy.type);
            list.splice(index + 1, 0, copy);
            state.selectedBlock = copy.id;
        } else if (dir === 'up' && index > 0) {
            list.splice(index - 1, 0, list.splice(index, 1)[0]);
        } else if (dir === 'down' && index < list.length - 1) {
            list.splice(index + 1, 0, list.splice(index, 1)[0]);
        }
        renderCanvas();
        renderInspector();
    }

    function typeId(type) {
        return (type || 'b') + '-' + Math.random().toString(36).slice(2, 10);
    }

    function renderPalette() {
        $('blockPalette').innerHTML = engine.BLOCK_GROUPS.map(function (group) {
            return '<div class="eb-group"><h3>' + escapeHtml(group.label) + '</h3>' +
                group.items.map(function (item) {
                    return '<button type="button" class="eb-block-btn" draggable="true" data-type="' + item.type + '"' +
                        (item.count ? ' data-count="' + item.count + '"' : '') + '>' +
                        '<i class="' + item.icon + '"></i>' + escapeHtml(item.label) + '</button>';
                }).join('') + '</div>';
        }).join('');
    }

    function renderCanvas() {
        var wrap = $('blockCanvas');
        var theme = themeOf(state.editor);
        var stage = $('ebStage');
        if (stage) {
            stage.style.background = theme.pageBg || '#E8ECF3';
            if (stage.parentNode) stage.parentNode.style.background = theme.pageBg || '#E8ECF3';
        }
        var stripe = '<div style="height:5px;background:' + escapeHtml(theme.accent) + ';"></div>';
        wrap.innerHTML = '<div class="eb-card" style="background:' + escapeHtml(theme.cardBg) +
            ';border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(30,37,64,0.08);">' + stripe +
            state.editor.blocks.map(function (block) {
                var active = block.id === state.selectedBlock ? ' active' : '';
                return (
                    '<div class="eb-block' + active + '" data-id="' + escapeHtml(block.id) + '" draggable="true">' +
                        '<div class="eb-tools">' +
                            '<button type="button" data-move="up" title="Move up"><i class="fa-solid fa-chevron-up"></i></button>' +
                            '<button type="button" data-move="down" title="Move down"><i class="fa-solid fa-chevron-down"></i></button>' +
                            '<button type="button" data-move="duplicate" title="Duplicate"><i class="fa-regular fa-copy"></i></button>' +
                            '<button type="button" class="danger" data-move="remove" title="Delete"><i class="fa-regular fa-trash-can"></i></button>' +
                        '</div>' +
                        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0">' +
                            engine.renderBlock(block, theme, true, assetBase()) +
                        '</table>' +
                    '</div>'
                );
            }).join('') + '</div>';
        enableInlineEdit();
    }

    function enableInlineEdit() {
        Array.prototype.forEach.call(document.querySelectorAll('#blockCanvas .eb-block'), function (node) {
            var id = node.getAttribute('data-id');
            var block = state.editor.blocks.find(function (item) { return item.id === id; });
            if (!block || (block.type !== 'heading' && block.type !== 'text' && block.type !== 'button')) return;
            var target = node.querySelector('h1, p, a');
            if (!target) return;
            target.contentEditable = 'true';
            target.setAttribute('data-inline', block.type);
            target.addEventListener('click', function (e) {
                e.stopPropagation();
                state.selectedBlock = id;
                Array.prototype.forEach.call(document.querySelectorAll('#blockCanvas .eb-block'), function (el) {
                    el.classList.toggle('active', el.getAttribute('data-id') === id);
                });
                renderInspector();
            });
            target.addEventListener('blur', function () {
                if (block.type === 'button') {
                    var nextLabel = target.textContent.trim();
                    if (nextLabel === shown(block.label).trim()) return;
                    block.label = nextLabel;
                    return;
                }
                var nextText = target.innerText.replace(/\n{3,}/g, '\n\n').trim();
                if (nextText === shown(block.text).trim()) return;
                block.text = nextText;
                block.html = engine.sanitizeInlineHtml(target.innerHTML);
            });
        });
    }

    function field(label, id, value, type) {
        return '<div class="tpl-field"><label>' + escapeHtml(label) + '</label><input id="' + id + '" type="' +
            (type || 'text') + '" value="' + escapeHtml(value == null ? '' : value) + '"></div>';
    }
    function uploadField(label, kind, src) {
        var raw = String(src || '').trim();
        var display = engine.resolveImageSrc(raw, assetBase());
        var hasImg = !!(raw && (engine.isSafeImageSrc(raw) || engine.isSafeImageSrc(display)));
        var thumb = hasImg
            ? '<div class="tpl-upload-preview"><img src="' + escapeHtml(display || raw) + '" alt=""></div>'
            : '<div class="tpl-upload-empty"><i class="fa-regular fa-image"></i><span>PNG, JPG, GIF, or WebP</span></div>';
        return '<div class="tpl-field"><label>' + escapeHtml(label) + '</label>' + thumb +
            '<div class="tpl-upload-actions">' +
            '<label class="tpl-upload-btn" for="ins-file"><i class="fa-solid fa-upload"></i> ' +
            (hasImg ? 'Replace image' : 'Upload ' + escapeHtml(kind)) + '</label>' +
            '<input id="ins-file" class="tpl-upload-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp">' +
            (hasImg ? '<button type="button" class="tpl-btn" id="ins-clear-src">Remove</button>' : '') +
            '</div></div>';
    }
    function readImageFile(file, kind) {
        return new Promise(function (resolve, reject) {
            if (!file) return reject(new Error('Choose an image file.'));
            if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
                return reject(new Error('Use PNG, JPG, GIF, or WebP.'));
            }
            if (file.size > 6 * 1024 * 1024) return reject(new Error('Image must be under 6 MB.'));

            function finish(data) {
                if (!engine.isSafeImageSrc(data)) {
                    reject(new Error('That image is still too large. Try a smaller file.'));
                    return;
                }
                resolve(data);
            }

            function compress() {
                var img = new Image();
                var url = URL.createObjectURL(file);
                img.onload = function () {
                    URL.revokeObjectURL(url);
                    var maxW = kind === 'logo' ? 480 : 1200;
                    var maxH = kind === 'logo' ? 240 : 1200;
                    var scale = Math.min(1, maxW / img.width, maxH / img.height);
                    var w = Math.max(1, Math.round(img.width * scale));
                    var h = Math.max(1, Math.round(img.height * scale));
                    var canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    var keepPng = file.type === 'image/png' || kind === 'logo';
                    var data = canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.82);
                    var quality = 0.82;
                    while (data.length > 900000 && quality > 0.45) {
                        quality -= 0.12;
                        data = canvas.toDataURL('image/jpeg', quality);
                    }
                    finish(data);
                };
                img.onerror = function () {
                    URL.revokeObjectURL(url);
                    reject(new Error('Could not read that image.'));
                };
                img.src = url;
            }

            if (file.size <= 350000) {
                var reader = new FileReader();
                reader.onload = function () {
                    var data = String(reader.result || '');
                    if (engine.isSafeImageSrc(data)) resolve(data);
                    else compress();
                };
                reader.onerror = function () { reject(new Error('Could not read that image.')); };
                reader.readAsDataURL(file);
                return;
            }
            compress();
        });
    }
    function handleImageUpload(file) {
        var block = selected();
        if (!block || (block.type !== 'logo' && block.type !== 'image')) return;
        var blockId = block.id;
        readImageFile(file, block.type).then(function (data) {
            // Show immediately on the canvas while the hosted asset upload finishes.
            block.src = data;
            renderCanvas();
            renderInspector();
            return api('/api/templates/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUri: data })
            }).then(function (saved) {
                var current = (state.editor.blocks || []).find(function (item) { return item.id === blockId; });
                if (!current) return;
                if (saved && saved.src) current.src = saved.src;
                else current.src = data;
                if (state.selectedBlock === blockId) {
                    renderCanvas();
                    renderInspector();
                } else {
                    renderCanvas();
                }
            }).catch(function () {
                // Keep the data-URI preview already applied above.
            });
        }).then(function () {
            notify(block.type === 'logo' ? 'Logo uploaded.' : 'Image uploaded.', 'success');
        }).catch(function (err) {
            notify((err && err.message) || 'Could not upload that image.', 'error');
            renderInspector();
        });
    }
    function area(label, id, value) {
        return '<div class="tpl-field"><label>' + escapeHtml(label) + '</label><textarea id="' + id + '">' +
            escapeHtml(value || '') + '</textarea></div>';
    }
    function select(label, id, options, value) {
        return '<div class="tpl-field"><label>' + escapeHtml(label) + '</label><select id="' + id + '">' +
            options.map(function (opt) {
                return '<option value="' + escapeHtml(opt.id) + '"' + (String(opt.id) === String(value) ? ' selected' : '') + '>' +
                    escapeHtml(opt.label) + '</option>';
            }).join('') + '</select></div>';
    }
    function colorField(label, id, value) {
        return '<div class="tpl-field"><label>' + escapeHtml(label) + '</label><input id="' + id + '" type="color" value="' +
            escapeHtml(value || '#5B4FFF') + '"></div>';
    }
    function alignField(value) {
        return '<div class="tpl-field"><label>Alignment</label><div class="tpl-align" id="ins-align">' +
            ['left', 'center', 'right'].map(function (item) {
                return '<button type="button" data-align="' + item + '" class="' + (value === item ? 'active' : '') +
                    '" title="' + item + '"><i class="fa-solid fa-align-' + item + '"></i></button>';
            }).join('') + '</div></div>';
    }
    function personalizeButton() {
        return '<div class="tpl-field personalize"><button type="button" class="tpl-btn" id="personalizeBtn"><i class="fa-solid fa-user-tag"></i> Personalize</button>' +
            '<div class="personalize-menu" id="personalizeMenu">' +
            engine.MERGE_TAGS.map(function (tag) {
                return '<button type="button" data-tag="{{' + tag.key + '}}">' + escapeHtml(tag.label) + '</button>';
            }).join('') + '</div></div>';
    }

    function renderInspector() {
        var pane = $('blockInspector');
        var block = selected();
        if (!block) {
            var theme = themeOf(state.editor);
            pane.innerHTML =
                '<h3 class="eb-group" style="margin-top:0;">Email Settings</h3>' +
                field('Template name', 'meta-name', state.editor.name) +
                field('Subject', 'meta-subject', shown(state.editor.subject)) +
                area('Description', 'meta-desc', shown(state.editor.description)) +
                select('Category', 'meta-cat', engine.CATEGORIES, state.editor.category) +
                field('Content width', 'meta-width', theme.width || 640, 'number') +
                colorField('Background color', 'meta-page', theme.pageBg) +
                colorField('Email background', 'meta-card', theme.cardBg) +
                select('Default font', 'meta-font', engine.FONTS, theme.font) +
                colorField('Text color', 'meta-text', theme.text) +
                colorField('Link color', 'meta-link', theme.linkColor || theme.accent) +
                colorField('Button color', 'meta-button', theme.buttonColor || theme.accent) +
                colorField('Accent bar', 'meta-accent', theme.accent);
            return;
        }
        var html = '<h3 class="eb-group" style="margin-top:0;">' + escapeHtml(block.type.charAt(0).toUpperCase() + block.type.slice(1)) + '</h3>';
        html += personalizeButton();
        if (block.type === 'heading' || block.type === 'text' || block.type === 'footer' || block.type === 'unsubscribe' || block.type === 'logo') {
            html += area(block.type === 'logo' ? 'Logo text' : 'Text', 'ins-text', shown(block.text));
        }
        if (block.type === 'logo') html += uploadField('Logo', 'logo', block.src);
        if (block.type === 'heading' || block.type === 'text') {
            html += select('Font', 'ins-font', engine.FONTS, block.font || themeOf(state.editor).font);
            html += field('Font size', 'ins-size', block.size || 16, 'number');
            html += select('Weight', 'ins-weight', [
                { id: '400', label: 'Regular' }, { id: '600', label: 'Semibold' }, { id: '700', label: 'Bold' }, { id: '800', label: 'Extra bold' }
            ], block.weight || (block.type === 'heading' ? '800' : '400'));
            html += field('Line height', 'ins-lineh', block.lineHeight || (block.type === 'heading' ? 1.25 : 1.7), 'number');
            html += colorField('Text color', 'ins-color', block.color || '#1E2540');
        }
        if (block.type === 'button') {
            html += field('Button text', 'ins-label', shown(block.label));
            html += field('Button URL', 'ins-href', shown(block.href));
            html += colorField('Background color', 'ins-bg', block.bg || '#5B4FFF');
            html += colorField('Text color', 'ins-fg', block.color || '#FFFFFF');
            html += field('Border radius', 'ins-radius', block.radius || 10, 'number');
            html += field('Font size', 'ins-size', block.size || 15, 'number');
            html += field('Padding', 'ins-btnpad', block.btnPad || 14, 'number');
        }
        if (block.type === 'image') {
            html += uploadField('Image', 'image', block.src);
            html += field('Alt text', 'ins-alt', shown(block.alt));
            html += field('Link URL', 'ins-href', shown(block.href));
            html += field('Width', 'ins-width', block.width || 536, 'number');
            html += field('Border radius', 'ins-radius', block.radius || 12, 'number');
        }
        if (block.type === 'columns') {
            html += select('Columns', 'ins-count', [
                { id: '1', label: '1 Column' }, { id: '2', label: '2 Columns' }, { id: '3', label: '3 Columns' }
            ], String(block.count || 2));
            html += field('Left heading', 'ins-col-left-h', shown(block.leftHeading));
            html += area('Left text', 'ins-col-left-t', shown(block.leftText));
            if (Number(block.count || 2) !== 1) {
                html += field('Right heading', 'ins-col-right-h', shown(block.rightHeading));
                html += area('Right text', 'ins-col-right-t', shown(block.rightText));
            }
            if (Number(block.count || 2) === 3) {
                html += field('Middle heading', 'ins-col-mid-h', shown(block.midHeading));
                html += area('Middle text', 'ins-col-mid-t', shown(block.midText));
            }
        }
        if (block.type === 'social') {
            html += field('Website', 'ins-web', shown(block.website));
            html += field('LinkedIn', 'ins-li', shown(block.linkedin));
            html += field('Instagram', 'ins-ig', shown(block.instagram));
            html += field('Facebook', 'ins-fb', shown(block.facebook));
        }
        if (block.type === 'divider') html += colorField('Line color', 'ins-color', block.color || '#E6EAF2');
        if (block.type === 'spacer') html += field('Height (px)', 'ins-height', block.height || 16, 'number');
        if (['logo', 'heading', 'text', 'button', 'footer', 'image'].indexOf(block.type) !== -1) html += alignField(block.align || 'left');
        html += '<div class="tpl-row">' +
            field('Padding top', 'ins-pt', block.padTop != null ? block.padTop : (block.padding || 8), 'number') +
            field('Padding bottom', 'ins-pb', block.padBottom != null ? block.padBottom : (block.padding || 8), 'number') +
            '</div><div class="tpl-row">' +
            field('Padding left', 'ins-pl', block.padLeft != null ? block.padLeft : 32, 'number') +
            field('Padding right', 'ins-pr', block.padRight != null ? block.padRight : 32, 'number') +
            '</div>';
        pane.innerHTML = html;
    }

    function val(id) {
        var el = $(id);
        return el ? el.value : null;
    }

    function readGlobalSettings() {
        if (!state.editor) return;
        if ($('meta-name')) {
            state.editor.name = val('meta-name');
            $('builderName').value = state.editor.name;
        }
        if ($('meta-subject')) state.editor.subject = keepMerge(val('meta-subject'), state.editor.subject);
        if ($('meta-desc')) state.editor.description = keepMerge(val('meta-desc'), state.editor.description);
        if ($('meta-cat')) state.editor.category = val('meta-cat');
        if (!state.editor.theme) state.editor.theme = engine.defaultTheme();
        if ($('meta-width')) state.editor.theme.width = parseInt(val('meta-width'), 10) || 640;
        if ($('meta-page')) state.editor.theme.pageBg = val('meta-page');
        if ($('meta-card')) state.editor.theme.cardBg = val('meta-card');
        if ($('meta-font')) state.editor.theme.font = val('meta-font');
        if ($('meta-text')) state.editor.theme.text = val('meta-text');
        if ($('meta-link')) state.editor.theme.linkColor = val('meta-link');
        if ($('meta-button')) state.editor.theme.buttonColor = val('meta-button');
        if ($('meta-accent')) state.editor.theme.accent = val('meta-accent');
        $('ebStage').style.background = state.editor.theme.pageBg || '#E8ECF3';
    }

    function readInspector() {
        var block = selected();
        if (!block) {
            readGlobalSettings();
            return;
        }
        if ($('ins-text')) block.text = keepMerge(val('ins-text'), block.text);
        if (val('ins-font') != null) block.font = val('ins-font');
        if (val('ins-size') != null) block.size = parseInt(val('ins-size'), 10) || block.size;
        if (val('ins-weight') != null) block.weight = val('ins-weight');
        if (val('ins-lineh') != null) block.lineHeight = parseFloat(val('ins-lineh')) || block.lineHeight;
        if (val('ins-color') != null) block.color = val('ins-color');
        if ($('ins-label')) block.label = keepMerge(val('ins-label'), block.label);
        if ($('ins-href')) block.href = keepMerge(val('ins-href'), block.href);
        if (val('ins-bg') != null) block.bg = val('ins-bg');
        if (val('ins-fg') != null) block.color = val('ins-fg');
        if (val('ins-radius') != null) block.radius = parseInt(val('ins-radius'), 10) || 0;
        if (val('ins-btnpad') != null) block.btnPad = parseInt(val('ins-btnpad'), 10) || 14;
        if ($('ins-alt')) block.alt = keepMerge(val('ins-alt'), block.alt);
        if (val('ins-width') != null) block.width = parseInt(val('ins-width'), 10) || 536;
        if (val('ins-count') != null) block.count = parseInt(val('ins-count'), 10) || 2;
        if (block.type === 'columns') {
            if ($('ins-col-left-h')) block.leftHeading = keepMerge(val('ins-col-left-h'), block.leftHeading);
            if ($('ins-col-left-t')) block.leftText = keepMerge(val('ins-col-left-t'), block.leftText);
            if ($('ins-col-right-h')) block.rightHeading = keepMerge(val('ins-col-right-h'), block.rightHeading);
            if ($('ins-col-right-t')) block.rightText = keepMerge(val('ins-col-right-t'), block.rightText);
            if ($('ins-col-mid-h')) block.midHeading = keepMerge(val('ins-col-mid-h'), block.midHeading);
            if ($('ins-col-mid-t')) block.midText = keepMerge(val('ins-col-mid-t'), block.midText);
        }
        if ($('ins-web')) block.website = keepMerge(val('ins-web'), block.website);
        if ($('ins-li')) block.linkedin = keepMerge(val('ins-li'), block.linkedin);
        if ($('ins-ig')) block.instagram = keepMerge(val('ins-ig'), block.instagram);
        if ($('ins-fb')) block.facebook = keepMerge(val('ins-fb'), block.facebook);
        if (val('ins-height') != null) block.height = parseInt(val('ins-height'), 10) || 16;
        if (val('ins-pt') != null) block.padTop = parseInt(val('ins-pt'), 10) || 0;
        if (val('ins-pb') != null) block.padBottom = parseInt(val('ins-pb'), 10) || 0;
        if (val('ins-pl') != null) block.padLeft = parseInt(val('ins-pl'), 10) || 0;
        if (val('ins-pr') != null) block.padRight = parseInt(val('ins-pr'), 10) || 0;
    }

    function insertTag(tag) {
        var block = selected();
        if (!block) return;
        var text = $('ins-text') || $('ins-label');
        var prop = text && text.id === 'ins-label' ? 'label' : 'text';
        if (text) {
            block[prop] = (block[prop] || '') + tag;
            renderInspector();
            renderCanvas();
            return;
        }
        if (block.type === 'heading' || block.type === 'text' || block.type === 'logo' || block.type === 'footer') {
            block.text = (block.text || '') + tag;
            renderCanvas();
            renderInspector();
        } else if (block.type === 'button') {
            block.label = (block.label || '') + tag;
            renderCanvas();
            renderInspector();
        }
    }

    function saveEditor() {
        readInspector();
        state.editor.name = $('builderName').value.trim() || state.editor.name;
        var payload = {
            name: state.editor.name,
            description: state.editor.description,
            category: state.editor.category,
            subject: state.editor.subject,
            preheader: state.editor.preheader || state.editor.description,
            theme: state.editor.theme,
            blocks: state.editor.blocks
        };
        var path = '/api/templates';
        var method = 'POST';
        if (state.editor.system && state.editor.id) {
            path += '/' + encodeURIComponent(state.editor.id);
            method = 'PUT';
        } else if (state.editor.id) {
            path += '/' + encodeURIComponent(state.editor.id);
            method = 'PUT';
        }
        $('builderSave').disabled = true;
        api(path, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (saved) {
            notify(state.editor.system ? 'Saved as a private copy in My Templates.' : 'Template saved.', 'success');
            state.editor = saved;
            state.editor.system = false;
            $('builderProtect').hidden = true;
            $('builderName').value = saved.name;
        }).catch(function (err) {
            notify(err.message, 'error');
        }).then(function () {
            $('builderSave').disabled = false;
        });
    }

    function openPicker() {
        $('tplPicker').hidden = false;
        var ready = state.items.filter(function (item) { return item.system; });
        if (!ready.length) {
            api('/api/templates?source=system').then(function (data) {
                paintPicker(data.items || []);
            });
        } else paintPicker(ready);
    }
    function paintPicker(items) {
        $('pickerGrid').innerHTML = items.map(function (item) {
            return '<button type="button" class="tpl-pick" data-id="' + escapeHtml(item.id) + '">' +
                thumbHtml(item.htmlPreview || '') + '<strong>' + escapeHtml(item.name) + '</strong></button>';
        }).join('');
    }

    var canvasTimer = null;
    function liveCanvas(e) {
        if (e && e.target && (e.target.type === 'file' || e.target.id === 'ins-file')) return;
        readInspector();
        clearTimeout(canvasTimer);
        canvasTimer = setTimeout(renderCanvas, 160);
    }

    $('sourceTabs').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-source]');
        if (!btn) return;
        state.source = btn.getAttribute('data-source');
        Array.prototype.forEach.call($('sourceTabs').querySelectorAll('.tpl-tab'), function (el) {
            el.classList.toggle('active', el === btn);
        });
        loadList();
    });
    $('categoryFilter').addEventListener('change', function () {
        state.category = $('categoryFilter').value || 'all';
        loadList();
    });
    var searchTimer = null;
    $('tplSearch').addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            state.q = $('tplSearch').value.trim();
            loadList();
        }, 140);
    });
    $('tplGrid').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-act]');
        var card = e.target.closest('[data-id]');
        if (!btn || !card) return;
        var id = card.getAttribute('data-id');
        var act = btn.getAttribute('data-act');
        if (act === 'use') return useTemplate(id);
        if (act === 'preview') {
            api('/api/templates/' + encodeURIComponent(id)).then(function (tpl) {
                openPreview(compiledPreview(tpl), tpl.name);
            }).catch(function (err) { notify(err.message, 'error'); });
            return;
        }
        if (act === 'edit') {
            api('/api/templates/' + encodeURIComponent(id)).then(openEditor).catch(function (err) { notify(err.message, 'error'); });
            return;
        }
        if (act === 'delete') {
            ask('Delete this template from your workspace? Ready-made templates are not affected.', 'Delete template').then(function (ok) {
                if (!ok) return;
                api('/api/templates/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
                    notify('Template deleted.', 'success');
                    loadList();
                }).catch(function (err) { notify(err.message, 'error'); });
            });
        }
    });
    $('createTplBtn').addEventListener('click', openPicker);
    $('pickerClose').addEventListener('click', function () { $('tplPicker').hidden = true; });
    $('startBlank').addEventListener('click', function () { openEditor(blankTemplate()); });
    $('pickerGrid').addEventListener('click', function (e) {
        var pick = e.target.closest('[data-id]');
        if (!pick) return;
        api('/api/templates/' + encodeURIComponent(pick.getAttribute('data-id'))).then(openEditor).catch(function (err) {
            notify(err.message, 'error');
        });
    });
    $('builderClose').addEventListener('click', showLibrary);
    $('ebMobileTabs').addEventListener('click', function (e) {
        var tab = e.target.closest('[data-eb-tab]');
        if (!tab) return;
        if (tab.getAttribute('data-eb-tab') === 'settings') renderInspector();
        setEditorTab(tab.getAttribute('data-eb-tab'));
    });
    $('builderSave').addEventListener('click', saveEditor);
    $('builderPreview').addEventListener('click', function () {
        readInspector();
        openPreview(compiledPreview(state.editor), state.editor.name);
    });
    $('builderUse').addEventListener('click', function () {
        readInspector();
        useTemplate(state.editor.id, true);
    });
    $('builderName').addEventListener('input', function () {
        if (state.editor) state.editor.name = $('builderName').value;
    });
    $('canvasDesktop').addEventListener('click', function () {
        state.canvasMode = 'desktop';
        $('canvasDesktop').classList.add('active');
        $('canvasMobile').classList.remove('active');
        $('ebStage').classList.remove('mobile');
    });
    $('canvasMobile').addEventListener('click', function () {
        state.canvasMode = 'mobile';
        $('canvasMobile').classList.add('active');
        $('canvasDesktop').classList.remove('active');
        $('ebStage').classList.add('mobile');
    });
    $('blockPalette').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-type]');
        if (!btn || !state.editor) return;
        insertBlock(btn.getAttribute('data-type'), parseInt(btn.getAttribute('data-count'), 10));
    });
    $('blockPalette').addEventListener('dragstart', function (e) {
        var btn = e.target.closest('[data-type]');
        if (!btn) return;
        e.dataTransfer.setData('text/plain', JSON.stringify({
            type: btn.getAttribute('data-type'),
            count: parseInt(btn.getAttribute('data-count'), 10) || null
        }));
    });
    $('blockCanvas').addEventListener('dragover', function (e) { e.preventDefault(); });
    $('blockCanvas').addEventListener('drop', function (e) {
        e.preventDefault();
        try {
            var payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
            if (payload.type) insertBlock(payload.type, payload.count);
        } catch (_) {}
    });
    $('blockCanvas').addEventListener('click', function (e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return;
        var move = e.target.closest('[data-move]');
        var row = e.target.closest('[data-id]');
        if (!row) {
            state.selectedBlock = null;
            renderCanvas();
            renderInspector();
            return;
        }
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            moveBlock(row.getAttribute('data-id'), move.getAttribute('data-move'));
            return;
        }
        if (state.selectedBlock === row.getAttribute('data-id') && !move) {
            if (isMobileEditor()) setEditorTab('settings');
            return;
        }
        state.selectedBlock = row.getAttribute('data-id');
        renderCanvas();
        renderInspector();
        if (isMobileEditor()) setEditorTab('settings');
    });
    $('blockInspector').addEventListener('input', liveCanvas);
    $('blockInspector').addEventListener('change', function (e) {
        if (e.target && e.target.id === 'ins-file') {
            handleImageUpload(e.target.files && e.target.files[0]);
            return;
        }
        readInspector();
        if (e.target && e.target.id === 'ins-count') renderInspector();
        renderCanvas();
    });
    $('blockInspector').addEventListener('click', function (e) {
        if (e.target.closest('#ins-clear-src')) {
            var current = selected();
            if (current) current.src = '';
            renderCanvas();
            renderInspector();
            return;
        }
        var alignBtn = e.target.closest('[data-align]');
        if (alignBtn) {
            var block = selected();
            if (block) block.align = alignBtn.getAttribute('data-align');
            renderCanvas();
            renderInspector();
            return;
        }
        if (e.target.closest('#personalizeBtn')) {
            $('personalizeMenu').classList.toggle('open');
            return;
        }
        var tag = e.target.closest('[data-tag]');
        if (tag) {
            insertTag(tag.getAttribute('data-tag'));
            $('personalizeMenu').classList.remove('open');
        }
    });
    $('previewClose').addEventListener('click', closePreview);
    $('tplPreview').addEventListener('click', function (e) {
        if (e.target.id === 'tplPreview') closePreview();
    });
    $('previewDesktop').addEventListener('click', function () {
        $('previewDesktop').classList.add('active');
        $('previewMobile').classList.remove('active');
        $('previewFrameWrap').classList.remove('mobile');
    });
    $('previewMobile').addEventListener('click', function () {
        $('previewMobile').classList.add('active');
        $('previewDesktop').classList.remove('active');
        $('previewFrameWrap').classList.add('mobile');
    });

    renderCategoryFilter();
    loadList();
})();
