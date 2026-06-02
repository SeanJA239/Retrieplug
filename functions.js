// functions.js — DOM-based File Name Extraction & Smart Insert for AI Chat Pages
// Works alongside content.js without modifying it.
//
// Gemini-specific discovery:
//   File cards = <uploader-file-preview-container>
//   File name  = inside [data-test-id="cancel-button"] aria-label="Remove file xxx.png"
//   Strip prefix "Remove file " to get the real filename.

(function () {
    'use strict';

    const TAG = '[Extension]';

    let lastActiveInput = null;

    // ========================================================================
    //  Site-specific configuration
    // ========================================================================

    const SITE_PROFILES = [
        {
            name: 'generic',
            match: () => true,
            inputSelectors: [
                'textarea',
                'div[contenteditable="true"]',
            ],
            containerSelectors: [
                '.chat-input-container',
                '[class*="chat-input"]',
                '[class*="input-container"]',
                '[class*="composer"]',
                '[class*="input-area"]',
                'form',
            ],
            fileCardSelector: 'uploader-file-preview-container, .file-card, [class*="file-card"], [class*="file-item"], [class*="staged-file"], [class*="upload-item"], [class*="attachment"]',
            fileNameExtractor: defaultFileNameExtractor,
        },
        {
            name: 'claude',
            match: () => location.hostname.includes('claude.ai'),
            inputSelectors: [
                'div.ProseMirror[contenteditable="true"]',
                'fieldset .ProseMirror[contenteditable="true"]',
            ],
            containerSelectors: [
                'fieldset',
                '.composer-container',
                '[class*="composer"]',
                'form',
            ],
            fileCardSelector: '[class*="file"], [class*="attachment"], [data-testid*="file"], [data-testid*="attachment"]',
            fileNameExtractor: defaultFileNameExtractor,
        },
        {
            name: 'chatgpt',
            match: () => location.hostname.includes('chatgpt.com') || location.hostname.includes('chat.openai.com'),
            inputSelectors: [
                'div#prompt-textarea[contenteditable="true"]',
                'textarea#prompt-textarea',
            ],
            containerSelectors: [
                '[class*="composer"]',
                'form',
                '[class*="input-area"]',
            ],
            fileCardSelector: '[class*="file"], [class*="attachment"], [data-testid*="attachment"]',
            fileNameExtractor: defaultFileNameExtractor,
        },
        {
            name: 'gemini',
            match: () => location.hostname.includes('gemini.google.com'),
            inputSelectors: [
                'div.ql-editor[contenteditable="true"]',
                'rich-textarea div[contenteditable="true"]',
            ],
            containerSelectors: [
                '[class*="input-area"]',
                '[class*="bottom"]',
                '[class*="chat-input"]',
                '[class*="composer"]',
                'form',
            ],
            // Precise selector: Gemini wraps each uploaded file in this custom element
            fileCardSelector: 'uploader-file-preview-container',
            fileNameExtractor: geminiFileNameExtractor,
        },
        {
            name: 'grok',
            match: () => location.hostname.includes('grok.com'),
            inputSelectors: [
                'textarea[placeholder]',
            ],
            containerSelectors: [
                '[class*="input"]',
                'form',
            ],
            fileCardSelector: '[class*="file"], [class*="attachment"]',
            fileNameExtractor: defaultFileNameExtractor,
        },
        {
            name: 'doubao',
            match: () => location.hostname.includes('doubao.com'),
            inputSelectors: [
                'textarea.chat-input',
                'div[contenteditable="true"][data-testid]',
            ],
            containerSelectors: [
                '[class*="chat-input"]',
                '[class*="input-container"]',
                'form',
            ],
            fileCardSelector: '[class*="file"], [class*="attachment"], [class*="upload"]',
            fileNameExtractor: defaultFileNameExtractor,
        },
    ];

    // ========================================================================
    //  File name extractors
    // ========================================================================

    /**
     * Gemini-specific extractor.
     * The real filename lives in the cancel button's aria-label:
     *   <button data-test-id="cancel-button" aria-label="Remove file xxx.png">
     * We strip the "Remove file " prefix.
     */
    function geminiFileNameExtractor(card) {
        // Strategy 1: Cancel button aria-label (most reliable)
        const cancelBtn = card.querySelector('[data-test-id="cancel-button"]');
        if (cancelBtn) {
            const ariaLabel = cancelBtn.getAttribute('aria-label');
            if (ariaLabel) {
                const prefixes = ['Remove file ', 'Remove image ', 'Delete file ', 'Delete image '];
                for (const prefix of prefixes) {
                    if (ariaLabel.startsWith(prefix)) {
                        const name = ariaLabel.substring(prefix.length).trim();
                        if (name) {
                            console.log(TAG, 'Gemini extractor: cancel-button aria-label →', name);
                            return name;
                        }
                    }
                }
                // aria-label exists but no known prefix — return as-is
                if (ariaLabel.trim()) {
                    console.log(TAG, 'Gemini extractor: cancel-button aria-label (raw) →', ariaLabel.trim());
                    return ariaLabel.trim();
                }
            }
        }

        // Strategy 2: Fall through to default extractor as backup
        console.log(TAG, 'Gemini extractor: cancel-button not found, falling back to default');
        return defaultFileNameExtractor(card);
    }

    /**
     * Default / generic file-name extractor.
     * Deep, resilient strategy for non-Gemini sites.
     */
    function defaultFileNameExtractor(card) {
        const directTitle = card.getAttribute('title');
        if (directTitle && directTitle.trim()) return directTitle.trim();

        const directAriaLabel = card.getAttribute('aria-label');
        if (directAriaLabel && directAriaLabel.trim()) return directAriaLabel.trim();

        const dataName = card.dataset.filename || card.dataset.name || card.dataset.file;
        if (dataName && dataName.trim()) return dataName.trim();

        const nestedTitled = card.querySelector('[title]');
        if (nestedTitled) {
            const t = nestedTitled.getAttribute('title');
            if (t && t.trim()) return t.trim();
        }

        const nestedAria = card.querySelector('[aria-label]');
        if (nestedAria) {
            const a = nestedAria.getAttribute('aria-label');
            if (a && a.trim()) return a.trim();
        }

        const nestedData = card.querySelector('[data-filename], [data-name]');
        if (nestedData) {
            const n = nestedData.dataset.filename || nestedData.dataset.name;
            if (n && n.trim()) return n.trim();
        }

        const img = card.querySelector('img');
        if (img) {
            const alt = img.getAttribute('alt');
            if (alt && alt.trim()) return alt.trim();
        }

        const rawText = card.textContent || '';
        const cleanText = rawText.replace(/\s+/g, ' ').trim();
        if (cleanText.length > 0 && cleanText.length <= 50) return cleanText;

        const fnMatch = rawText.match(/[\w\-\u4e00-\u9fff]+\.\w{1,10}/);
        if (fnMatch) return fnMatch[0];

        return null;
    }

    // ========================================================================
    //  Blacklist (UI buttons that are NOT file cards)
    // ========================================================================

    const FILE_NAME_BLACKLIST = [
        'open upload file menu',
        'upload image',
        'upload file',
        'add file',
        'add image',
        'attach file',
        'attach image',
        'add attachment',
        'choose file',
        'select file',
    ];

    function isBlacklistedName(name) {
        if (!name) return true;
        const lower = name.toLowerCase().trim();
        for (const bad of FILE_NAME_BLACKLIST) {
            if (lower === bad || lower.includes(bad)) return true;
        }
        return false;
    }

    function isUIButton(el) {
        if (!el) return false;
        if (el.tagName === 'BUTTON') return true;
        if (el.getAttribute('role') === 'button' && !el.querySelector('[class*="file"]')) return true;
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        for (const bad of FILE_NAME_BLACKLIST) {
            if (ariaLabel === bad || ariaLabel.includes(bad)) return true;
        }
        return false;
    }

    // ========================================================================
    //  Profile selection
    // ========================================================================

    function getProfile() {
        for (let i = 1; i < SITE_PROFILES.length; i++) {
            if (SITE_PROFILES[i].match()) return SITE_PROFILES[i];
        }
        return SITE_PROFILES[0];
    }

    const PROFILE = getProfile();

    // ========================================================================
    //  DOM Querying helpers
    // ========================================================================

    function findInputElement() {
        for (const sel of PROFILE.inputSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
        }
        return null;
    }

    /**
     * Aggressive container finder — 3-phase search.
     * Phase 1: Walk ancestors matching containerSelectors that contain file cards.
     * Phase 2: Climb up to 10 ancestor levels, return first with file cards.
     * Phase 3: querySelector fallback from document root.
     */
    function findInputContainer(inputEl) {
        if (!inputEl) return null;

        const fileSelector = PROFILE.fileCardSelector;

        // Phase 1: Ancestors matching containerSelectors + containing file cards
        let node = inputEl;
        while (node && node !== document.body) {
            for (const sel of PROFILE.containerSelectors) {
                try {
                    if (node.matches && node.matches(sel)) {
                        if (node.querySelectorAll(fileSelector).length > 0) {
                            console.log(TAG, 'Container Phase1 hit (selector + has cards):', sel);
                            return node;
                        }
                    }
                } catch (_) { }
            }
            node = node.parentElement;
        }

        // Phase 2: Aggressive ancestor climbing (up to 10 levels)
        const MAX_CLIMB = 10;
        node = inputEl.parentElement;
        for (let level = 1; node && node !== document.body && level <= MAX_CLIMB; level++) {
            if (node.querySelectorAll(fileSelector).length > 0) {
                console.log(TAG, `Container Phase2 hit (ancestor level ${level}):`, node.tagName, node.className || '');
                return node;
            }
            node = node.parentElement;
        }

        // Phase 3: Global querySelector fallback
        for (const sel of PROFILE.containerSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {
                console.log(TAG, 'Container Phase3 hit (global):', sel);
                return el;
            }
        }

        return null;
    }

    /**
     * Find all staged file cards in the container and extract their names.
     * For Gemini: queries <uploader-file-preview-container>, extracts name
     * from cancel button aria-label, strips "Remove file " prefix.
     */
    function getStagedFileNames(container) {
        if (!container) return [];

        const cards = container.querySelectorAll(PROFILE.fileCardSelector);
        const names = [];

        console.log(TAG, `Found ${cards.length} element(s) matching "${PROFILE.fileCardSelector}"`);

        cards.forEach((card, idx) => {
            if (isUIButton(card)) {
                console.log(TAG, `  [${idx}] skip UI button:`, card.tagName,
                    card.getAttribute('aria-label')?.substring(0, 30) || '');
                return;
            }

            const name = PROFILE.fileNameExtractor(card);

            if (isBlacklistedName(name)) {
                console.log(TAG, `  [${idx}] skip blacklisted/empty:`, JSON.stringify(name),
                    '| tag:', card.tagName, card.className?.substring(0, 50) || '');
                return;
            }

            console.log(TAG, `  [${idx}] valid file:`, JSON.stringify(name));
            names.push(name);
        });

        return names;
    }

    // ========================================================================
    //  Track active input
    // ========================================================================

    function trackActiveInput() {
        window.addEventListener('focusin', (e) => {
            const el = e.target;
            if (
                el.tagName === 'TEXTAREA' ||
                el.tagName === 'INPUT' ||
                el.isContentEditable
            ) {
                lastActiveInput = el;
            }
        }, { capture: true });
    }

    // ========================================================================
    //  Text insertion (contenteditable-first, React / Vue compatible)
    // ========================================================================

    function insertTextAtCursor(el, text) {
        if (!el) return false;
        el.focus();

        if (el.isContentEditable) {
            return insertIntoContentEditable(el, text);
        }
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            return insertIntoNativeInput(el, text);
        }

        console.warn(TAG, 'Unknown input element type:', el.tagName);
        return false;
    }

    function insertIntoContentEditable(el, text) {
        el.focus();

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            console.log(TAG, 'Cursor not inside input, moved to end');
        }

        const execOk = document.execCommand('insertText', false, text);
        if (execOk) {
            console.log(TAG, 'Text inserted via execCommand');
            fireInputEvents(el);
            return true;
        }

        console.log(TAG, 'execCommand failed, using Range API fallback');
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);

        fireInputEvents(el);
        return true;
    }

    function insertIntoNativeInput(el, text) {
        el.focus();

        const execOk = document.execCommand('insertText', false, text);
        if (execOk) {
            console.log(TAG, 'Text inserted via execCommand (textarea)');
            fireInputEvents(el);
            return true;
        }

        console.log(TAG, 'execCommand failed, using native setter fallback');

        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        const before = el.value.substring(0, start);
        const after = el.value.substring(end);
        const newValue = before + text + after;

        const nativeSetter =
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set ||
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set ||
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

        if (nativeSetter) {
            nativeSetter.call(el, newValue);
            console.log(TAG, 'Value set via native setter');
        } else {
            el.value = newValue;
            console.warn(TAG, 'Native setter not found, using direct assignment');
        }

        try { el.setSelectionRange(start + text.length, start + text.length); } catch (_) { }
        fireInputEvents(el);
        return true;
    }

    function fireInputEvents(el) {
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true, inputType: 'insertText',
        }));
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }

    // ========================================================================
    //  Keyboard shortcut: Ctrl + Shift + 1-9
    //  window + capture = absolute highest priority
    // ========================================================================

    /**
     * Search the entire document for file cards (fallback when container is too narrow).
     */
    function getGlobalStagedFileNames() {
        const allCards = document.querySelectorAll(PROFILE.fileCardSelector);
        const names = [];

        console.log(TAG, `[Global fallback] Found ${allCards.length} element(s) matching "${PROFILE.fileCardSelector}" in document`);

        allCards.forEach((card, idx) => {
            if (isUIButton(card)) return;
            const name = PROFILE.fileNameExtractor(card);
            if (isBlacklistedName(name)) return;
            console.log(TAG, `  [global ${idx}] valid file:`, JSON.stringify(name));
            names.push(name);
        });

        return names;
    }

    function setupShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey) {
                console.log(TAG, 'Ctrl+Shift combo detected, code:', e.code,
                    '| key:', e.key, '| keyCode:', e.keyCode);
            }

            if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;

            // Dynamically extract Digit1-Digit9 from event.code
            let num = 0;
            const digitMatch = e.code.match(/^Digit(\d)$/);
            if (digitMatch) {
                num = parseInt(digitMatch[1], 10);
            }
            // keyCode fallback: 49='1' … 57='9'
            if (num === 0 && e.keyCode >= 49 && e.keyCode <= 57) {
                num = e.keyCode - 48;
                console.log(TAG, 'event.code miss, keyCode fallback:', num);
            }
            // Numpad fallback: Numpad1-Numpad9
            if (num === 0) {
                const numpadMatch = e.code.match(/^Numpad(\d)$/);
                if (numpadMatch) {
                    num = parseInt(numpadMatch[1], 10);
                    console.log(TAG, 'Numpad detected:', num);
                }
            }
            if (num < 1 || num > 9) return;

            // IMMEDIATELY block propagation — before any DOM work
            e.preventDefault();
            e.stopImmediatePropagation();

            console.log(TAG, `=== Shortcut Ctrl+Shift+${num} triggered (code=${e.code}, key=${e.key}) ===`);

            const index = num - 1;

            // Check if lastActiveInput is still in the DOM (may be stale after re-renders)
            if (lastActiveInput && !document.contains(lastActiveInput)) {
                console.log(TAG, 'lastActiveInput is stale (removed from DOM), clearing');
                lastActiveInput = null;
            }

            const inputEl = lastActiveInput || findInputElement();
            if (!inputEl) {
                console.warn(TAG, 'No input element found');
                return;
            }
            console.log(TAG, 'Input element:', inputEl.tagName, inputEl.className || '');

            // Find container and extract file names
            const container = findInputContainer(inputEl);
            let fileNames = [];

            if (container) {
                console.log(TAG, 'Container:', container.tagName, container.className || '');
                fileNames = getStagedFileNames(container);
            } else {
                console.warn(TAG, 'No container found via ancestor climb');
            }

            // If container search found fewer files than needed, try global search
            if (index >= fileNames.length) {
                console.log(TAG, `Container has ${fileNames.length} file(s), need index ${index}. Trying global search...`);
                const globalNames = getGlobalStagedFileNames();
                if (globalNames.length > fileNames.length) {
                    console.log(TAG, `Global search found ${globalNames.length} file(s) — using global results`);
                    fileNames = globalNames;
                }
            }

            console.log(TAG, 'Final file count:', fileNames.length);
            if (fileNames.length > 0) {
                console.log(TAG, 'Files:', fileNames);
            } else {
                console.warn(TAG, 'No file cards found anywhere! selector:', PROFILE.fileCardSelector);
                return;
            }

            if (index >= fileNames.length) {
                console.warn(TAG, `Index ${index} out of range (${fileNames.length} files total)`);
                return;
            }

            const fileName = fileNames[index];
            console.log(TAG, `Inserting file #${num}: "${fileName}"`);
            insertTextAtCursor(inputEl, fileName);

        }, { capture: true });
    }

    // ========================================================================
    //  API
    // ========================================================================

    window.__retrieplugFiles = {
        getFiles: () => {
            const inputEl = lastActiveInput || findInputElement();
            const container = findInputContainer(inputEl);
            const files = getStagedFileNames(container);
            console.log(TAG, '[API] getFiles:', files);
            return files;
        },
        getFile: (num) => window.__retrieplugFiles.getFiles()[num - 1],
        insertText: (text) => {
            const target = lastActiveInput || findInputElement();
            if (target) insertTextAtCursor(target, text);
            else console.warn(TAG, '[API] No input element found');
        },
        profileName: PROFILE.name,
    };

    // ========================================================================
    //  Init
    // ========================================================================

    function init() {
        trackActiveInput();
        setupShortcuts();
        console.log(TAG, `Initialized (profile: ${PROFILE.name}). Ctrl+Shift+1~9 to insert file names.`);
    }

    init();
})();
