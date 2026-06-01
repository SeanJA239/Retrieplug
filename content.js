// AI Chat Pinboard - Content Script
// Multi-dialogue pin management with folder structure

(function() {
  'use strict';

  // Site-specific configurations
  const SITE_CONFIGS = {
    'claude.ai': {
      messageSelector: '[data-testid="chat-message-content"]',
      // Tried in order if messageSelector matches nothing (Claude renames testids)
      messageSelectorFallbacks: ['.font-claude-message', '[data-testid="assistant-message"]'],
      contentSelector: '.font-claude-message',
      excludeSelectors: [
        '[class*="thinking"]',
        '[class*="Thinking"]',
        'details',
        'summary',
        '[data-testid*="thinking"]'
      ],
      // Selector to get conversation title
      titleSelector: '[data-testid="conversation-title"], .font-tiempos',
      // Stable per-message id attribute (Claude exposes none reliably -> null = use content hash)
      messageIdAttr: null,
      // Scroll container for jump (null = detect at runtime via closest())
      scrollContainerSelector: null,
      // URL pattern that marks a settled (non-transient) conversation
      conversationPathPattern: /\/chat\//
    },
    'gemini.google.com': {
      messageSelector: 'model-response',
      contentSelector: '.model-response-text',
      excludeSelectors: [],
      titleSelector: '.conversation-title',
      messageIdAttr: null,
      scrollContainerSelector: null,
      conversationPathPattern: /\/app\//
    },
    'chatgpt.com': {
      messageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav [class*="active"]',
      messageIdAttr: 'data-message-id',
      scrollContainerSelector: null,
      conversationPathPattern: /\/c\//
    },
    'chat.openai.com': {
      messageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav [class*="active"]',
      messageIdAttr: 'data-message-id',
      scrollContainerSelector: null,
      conversationPathPattern: /\/c\//
    }
  };

  function getSiteConfig() {
    const hostname = window.location.hostname;
    for (const [site, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) return config;
    }
    return null;
  }

  const SITE_CONFIG = getSiteConfig();
  if (!SITE_CONFIG) return;

  const STORAGE_KEY = 'pinboard_all_dialogues';
  let allDialogues = {}; // { pathname: { title, pins: { id: {snippet, timestamp, messageIndex} } } }
  let shadowRoot = null;
  let currentPath = window.location.pathname;
  let expandedFolders = new Set();

  // Generic page/app names that should never be used as a folder title
  const GENERIC_TITLES = new Set([
    'chatgpt', 'chat gpt', 'claude', 'gemini', 'grok', 'doubao',
    'google gemini', 'new chat', 'new conversation', 'conversation',
    'chat', 'untitled', 'claude.ai'
  ]);

  function cleanTitle(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      // Strip trailing " - ChatGPT" / " | Claude" style site suffixes
      .replace(/\s*[-|·•]\s*(chatgpt|claude|gemini|grok|doubao)[^]*$/i, '')
      .trim();
  }

  // Reject ids and generic names so folders get human-readable titles
  function isMeaningfulTitle(text) {
    const title = cleanTitle(text);
    if (!title || title.length < 3) return false;
    if (GENERIC_TITLES.has(title.toLowerCase())) return false;
    // Looks like a uuid / opaque id slug
    if (/^[a-f0-9-]{8,}$/i.test(title)) return false;
    return true;
  }

  // Get current dialogue title
  function getDialogueTitle() {
    // 1) Site-specific in-page title element
    try {
      const el = document.querySelector(SITE_CONFIG.titleSelector);
      if (el) {
        const t = cleanTitle(el.textContent);
        if (isMeaningfulTitle(t)) return t.substring(0, 40);
      }
    } catch (e) {}
    // 2) Document title (ChatGPT/Claude set this to the conversation name)
    const docTitle = cleanTitle(document.title);
    if (isMeaningfulTitle(docTitle)) return docTitle.substring(0, 40);
    // 3) Fallback: last URL segment or "Untitled"
    const parts = currentPath.split('/').filter(Boolean);
    return parts[parts.length - 1]?.substring(0, 12) || 'Untitled';
  }

  const STORAGE_VERSION = 2;

  // Load all dialogues from storage (handles legacy unversioned shape)
  // Infer which site a stored conversation belongs to, from its URL path.
  // Used to heal pins saved before the per-dialogue `origin` field existed.
  function inferOrigin(path) {
    if (/\/chat\//.test(path)) return 'https://claude.ai';
    if (/\/c\//.test(path)) return 'https://chatgpt.com';
    if (/\/app\//.test(path)) return 'https://gemini.google.com';
    return null;
  }

  async function loadAllDialogues() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];
      if (stored && stored.dialogues) {
        // Versioned shape: { version, dialogues }
        allDialogues = stored.dialogues || {};
      } else if (stored && typeof stored === 'object') {
        // Legacy shape: the value *is* the dialogues map. Migrate on next save.
        allDialogues = stored;
      } else {
        allDialogues = {};
      }
    } catch (e) {
      console.error('Pinboard: Load failed', e);
      allDialogues = {};
    }

    // One-time migration: backfill `origin` for legacy pins so a cross-site
    // pin opens on its real host instead of the current tab's origin.
    let migrated = false;
    for (const [path, dialogue] of Object.entries(allDialogues)) {
      if (dialogue && !dialogue.origin) {
        const inferred = inferOrigin(path);
        if (inferred) { dialogue.origin = inferred; migrated = true; }
      }
    }
    if (migrated) await saveAllDialogues();

    renderSidebar();
  }

  // Save all dialogues to storage (versioned shape)
  async function saveAllDialogues() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { version: STORAGE_VERSION, dialogues: allDialogues }
      });
    } catch (e) {
      console.error('Pinboard: Save failed', e);
    }
  }

  // Get current dialogue data
  function getCurrentDialogue() {
    if (!allDialogues[currentPath]) {
      allDialogues[currentPath] = {
        title: getDialogueTitle(),
        origin: window.location.origin,
        pins: {}
      };
    } else if (!allDialogues[currentPath].origin) {
      // Backfill origin for dialogues created before this field existed
      allDialogues[currentPath].origin = window.location.origin;
    }
    return allDialogues[currentPath];
  }

  // Get pins for current dialogue
  function getCurrentPins() {
    return getCurrentDialogue().pins;
  }

  // Extract clean content
  function extractCleanContent(el) {
    const clone = el.cloneNode(true);
    for (const selector of SITE_CONFIG.excludeSelectors) {
      clone.querySelectorAll(selector).forEach(n => n.remove());
    }
    const contentEl = clone.querySelector(SITE_CONFIG.contentSelector) || clone;
    return contentEl.textContent.replace(/\s+/g, ' ').trim();
  }

  // --- Stable message identity (resilient to virtualization / reorder) ---

  // Site-provided stable id, if any (e.g. ChatGPT's data-message-id)
  function getMessageId(el) {
    const attr = SITE_CONFIG.messageIdAttr;
    if (!attr || !el) return null;
    const own = el.getAttribute(attr);
    if (own) return own;
    const anc = el.closest(`[${attr}]`);
    return anc ? anc.getAttribute(attr) : null;
  }

  // Content fingerprint: stable across reloads as long as the answer text is unchanged
  function getContentHash(el) {
    const text = extractCleanContent(el).slice(0, 300);
    if (!text) return null;
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
    }
    return 'h' + (h >>> 0).toString(36) + '_' + text.length;
  }

  // Does a stored pin record point at this live element?
  function pinMatchesEl(p, el, index) {
    if (!el) return false;
    if (p.messageId) {
      return getMessageId(el) === p.messageId;
    }
    if (p.contentHash) {
      return getContentHash(el) === p.contentHash;
    }
    return typeof p.messageIndex === 'number' && p.messageIndex === index;
  }

  // Get all assistant-message nodes, trying fallback selectors if the primary
  // one matches nothing (chat sites rename their data-testids over time).
  function getMessageNodes() {
    let nodes = document.querySelectorAll(SITE_CONFIG.messageSelector);
    if (nodes.length) return Array.from(nodes);
    for (const sel of (SITE_CONFIG.messageSelectorFallbacks || [])) {
      nodes = document.querySelectorAll(sel);
      if (nodes.length) return Array.from(nodes);
    }
    return [];
  }

  // Resolve a stored pin to a currently-mounted element (id -> hash -> index)
  function resolveMessageEl(pinData) {
    const messages = getMessageNodes();
    if (pinData.messageId) {
      const byId = messages.find(m => getMessageId(m) === pinData.messageId);
      if (byId) return byId;
    }
    if (pinData.contentHash) {
      const byHash = messages.find(m => getContentHash(m) === pinData.contentHash);
      if (byHash) return byHash;
    }
    if (typeof pinData.messageIndex === 'number' && messages[pinData.messageIndex]) {
      return messages[pinData.messageIndex];
    }
    return null;
  }

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Create sidebar
  function createSidebar() {
    const host = document.createElement('div');
    host.id = 'pinboard-host';
    host.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'open' });

    shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .sidebar {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%) translateX(100%);
          width: 300px;
          max-height: 75vh;
          background: rgba(18, 18, 22, 0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          border-right: none;
          border-radius: 12px 0 0 12px;
          box-shadow: -4px 0 30px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          font-family: system-ui, -apple-system, sans-serif;
          transition: transform 0.25s ease;
          pointer-events: auto;
        }

        .sidebar.open { transform: translateY(-50%) translateX(0); }

        .toggle-tab {
          position: fixed;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          width: 36px;
          height: 90px;
          background: rgba(18, 18, 22, 0.95);
          border: 1px solid rgba(255,255,255,0.12);
          border-right: none;
          border-radius: 10px 0 0 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 18px;
          color: #888;
          pointer-events: auto;
          transition: all 0.2s;
        }

        .toggle-tab:hover {
          background: rgba(30, 30, 40, 0.98);
          color: #fff;
          width: 40px;
        }

        .toggle-tab .count {
          background: #d97706;
          color: white;
          font-size: 10px;
          min-width: 18px;
          padding: 2px 5px;
          border-radius: 9px;
          font-weight: 600;
          text-align: center;
        }

        .header {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        .title { font-size: 14px; font-weight: 600; color: #f5f5f5; }

        .close-btn {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 20px;
          padding: 4px 8px;
          border-radius: 4px;
          line-height: 1;
        }
        .close-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

        .folders-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .folders-list::-webkit-scrollbar { width: 5px; }
        .folders-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }

        .folder {
          margin-bottom: 4px;
          border-radius: 8px;
          overflow: hidden;
        }

        .folder.current {
          background: rgba(217, 119, 6, 0.08);
          border: 1px solid rgba(217, 119, 6, 0.2);
        }

        .folder-header {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.15s;
          gap: 8px;
        }

        .folder-header:hover { background: rgba(255,255,255,0.05); }

        .folder-icon {
          font-size: 12px;
          color: #666;
          transition: transform 0.2s;
          width: 16px;
        }

        .folder.expanded .folder-icon { transform: rotate(90deg); }

        .folder-title {
          flex: 1;
          font-size: 12px;
          color: #ccc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .folder.current .folder-title { color: #f5a623; font-weight: 500; }

        .folder-count {
          font-size: 10px;
          color: #666;
          background: rgba(255,255,255,0.08);
          padding: 2px 6px;
          border-radius: 8px;
        }

        .folder.current .folder-count { background: rgba(217,119,6,0.2); color: #f5a623; }

        .folder-delete {
          background: none;
          border: none;
          color: #444;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
          border-radius: 4px;
          opacity: 0;
          transition: all 0.15s;
          margin-left: 4px;
        }

        .folder-header:hover .folder-delete { opacity: 1; }
        .folder-delete:hover { color: #ef4444; background: rgba(239,68,68,0.15); }

        .folder-pins {
          display: none;
          padding: 4px 8px 8px 28px;
        }

        .folder.expanded .folder-pins { display: block; }

        .pin-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .pin-card:hover {
          background: rgba(217, 119, 6, 0.1);
          border-color: rgba(217, 119, 6, 0.3);
        }

        .pin-card.inactive {
          opacity: 0.7;
        }

        .pin-card.inactive:hover {
          background: rgba(100, 100, 255, 0.1);
          border-color: rgba(100, 100, 255, 0.3);
        }

        .pin-snippet {
          font-size: 12px;
          color: #ddd;
          line-height: 1.4;
          margin-bottom: 6px;
          word-break: break-word;
        }

        .pin-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pin-meta {
          font-size: 10px;
          color: #666;
        }

        .pin-card.inactive .pin-meta::after {
          content: ' · opens new tab';
          color: #888;
        }

        .delete-btn {
          background: none;
          border: none;
          color: #555;
          cursor: pointer;
          font-size: 12px;
          padding: 3px 6px;
          border-radius: 4px;
          opacity: 0;
          transition: all 0.15s;
        }

        .pin-card:hover .delete-btn { opacity: 1; }
        .delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.15); }

        .empty {
          text-align: center;
          padding: 30px 20px;
          color: #555;
          font-size: 12px;
          line-height: 1.6;
        }

        .nav-hint {
          font-size: 10px;
          color: #666;
          padding: 8px 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
          text-align: center;
        }

        .toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          max-width: 280px;
          background: rgba(18, 18, 22, 0.96);
          color: #f5f5f5;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          box-shadow: 0 6px 24px rgba(0,0,0,0.5);
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.2s, transform 0.2s;
          pointer-events: none;
        }
        .toast.show { opacity: 1; transform: translateY(0); }
      </style>

      <div class="toast" id="toast"></div>

      <div class="toggle-tab" id="toggle">
        <span>📌</span>
        <span class="count" id="count">0</span>
      </div>

      <div class="sidebar" id="sidebar">
        <div class="header">
          <span class="title">📌 Pinboard</span>
          <button class="close-btn" id="close">×</button>
        </div>
        <div class="folders-list" id="folders"></div>
        <div class="nav-hint">Pins from other chats open in a new tab</div>
      </div>
    `;

    shadowRoot.getElementById('toggle').addEventListener('click', () => {
      shadowRoot.getElementById('sidebar').classList.add('open');
      // Auto-expand current folder
      expandedFolders.add(currentPath);
      renderSidebar();
    });

    shadowRoot.getElementById('close').addEventListener('click', () => {
      shadowRoot.getElementById('sidebar').classList.remove('open');
    });
  }

  // Render sidebar with folders
  function renderSidebar() {
    if (!shadowRoot) return;

    const foldersEl = shadowRoot.getElementById('folders');
    const countEl = shadowRoot.getElementById('count');

    // Count total pins
    let totalPins = 0;
    Object.values(allDialogues).forEach(d => {
      totalPins += Object.keys(d.pins || {}).length;
    });

    countEl.textContent = totalPins;
    countEl.style.display = totalPins > 0 ? '' : 'none';

    // Get dialogues with pins, sorted (current first)
    const dialoguesWithPins = Object.entries(allDialogues)
      .filter(([_, d]) => Object.keys(d.pins || {}).length > 0)
      .sort((a, b) => {
        if (a[0] === currentPath) return -1;
        if (b[0] === currentPath) return 1;
        return 0;
      });

    if (dialoguesWithPins.length === 0) {
      foldersEl.innerHTML = `
        <div class="empty">
          No pins yet<br>
          Hover over AI messages and click 📌
        </div>
      `;
      return;
    }

    foldersEl.innerHTML = '';

    for (const [path, dialogue] of dialoguesWithPins) {
      const sameOrigin = !dialogue.origin || dialogue.origin === window.location.origin;
      const isCurrent = path === currentPath && sameOrigin;
      const isExpanded = expandedFolders.has(path);
      const pins = Object.entries(dialogue.pins || {});

      const folder = document.createElement('div');
      folder.className = `folder${isCurrent ? ' current' : ''}${isExpanded ? ' expanded' : ''}`;

      // Folder header
      const header = document.createElement('div');
      header.className = 'folder-header';
      header.innerHTML = `
        <span class="folder-icon">▶</span>
        <span class="folder-title">${escapeHtml(dialogue.title || 'Untitled')}</span>
        <span class="folder-count">${pins.length}</span>
        <button class="folder-delete" title="Delete all pins in this folder">✕</button>
      `;

      header.addEventListener('click', (e) => {
        if (e.target.classList.contains('folder-delete')) {
          // Delete entire folder
          deleteFolder(path);
          return;
        }
        if (expandedFolders.has(path)) {
          expandedFolders.delete(path);
        } else {
          expandedFolders.add(path);
        }
        renderSidebar();
      });

      folder.appendChild(header);

      // Pins container
      const pinsContainer = document.createElement('div');
      pinsContainer.className = 'folder-pins';

      // Sort pins by message index
      pins.sort((a, b) => a[1].messageIndex - b[1].messageIndex);

      for (const [pinId, pinData] of pins) {
        const card = document.createElement('div');
        card.className = `pin-card${isCurrent ? '' : ' inactive'}`;
        card.innerHTML = `
          <div class="pin-snippet">${escapeHtml(pinData.snippet)}</div>
          <div class="pin-footer">
            <span class="pin-meta">${timeAgo(pinData.timestamp)}</span>
            <button class="delete-btn">✕</button>
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-btn')) {
            deletePin(path, pinId);
          } else if (isCurrent) {
            jumpToMessage(pinData);
          } else {
            // Open the other conversation in a new tab, deep-linked to the pin.
            // Use the dialogue's own origin so a ChatGPT pin opened from a Claude
            // tab points at chatgpt.com, not the current site.
            const origin = dialogue.origin || window.location.origin;
            const url = origin + path + '#pinboard=' + encodeURIComponent(pinId);
            window.open(url, '_blank');
          }
        });

        pinsContainer.appendChild(card);
      }

      folder.appendChild(pinsContainer);
      foldersEl.appendChild(folder);
    }

    // Update button states for current dialogue pins
    updatePinButtonStates();
  }

  // Update pin button visual states
  function updatePinButtonStates() {
    const currentPins = getCurrentPins();
    document.querySelectorAll('[data-pinboard-idx]').forEach(el => {
      const idx = parseInt(el.getAttribute('data-pinboard-idx'), 10);
      const btn = el.querySelector('.pinboard-btn');
      if (!btn) return;

      const isPinned = Object.values(currentPins).some(p => pinMatchesEl(p, el, idx));
      if (isPinned) {
        btn.style.opacity = '1';
        btn.style.background = 'rgba(217,119,6,0.35)';
      } else {
        btn.style.background = 'rgba(30,30,35,0.85)';
      }
    });
  }

  // Delete a pin
  function deletePin(path, pinId) {
    if (allDialogues[path]?.pins) {
      delete allDialogues[path].pins[pinId];
      // Remove dialogue if no pins left
      if (Object.keys(allDialogues[path].pins).length === 0) {
        delete allDialogues[path];
      }
      saveAllDialogues();
      renderSidebar();
    }
  }

  // Delete entire folder (all pins in a dialogue)
  function deleteFolder(path) {
    if (allDialogues[path]) {
      delete allDialogues[path];
      expandedFolders.delete(path);
      saveAllDialogues();
      renderSidebar();
      // Update pin button states if on current dialogue
      if (path === currentPath) {
        updatePinButtonStates();
      }
    }
  }

  // Find the scrollable conversation container
  function getScrollContainer(el) {
    if (SITE_CONFIG.scrollContainerSelector) {
      const c = document.querySelector(SITE_CONFIG.scrollContainerSelector);
      if (c) return c;
    }
    if (el) {
      const c = el.closest('[class*="overflow-y"], [class*="scroll"]');
      if (c) return c;
    }
    return document.querySelector('main') || document.scrollingElement || document.documentElement;
  }

  // Scroll to the START of a resolved message + briefly highlight it.
  // scrollMarginTop keeps the top from sitting flush under a sticky site header.
  function revealElement(el) {
    el.style.scrollMarginTop = '80px';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.style.outline = '2px solid #d97706';
    el.style.outlineOffset = '4px';
    el.style.transition = 'outline 0.3s';
    setTimeout(() => { el.style.outline = 'none'; }, 2500);
  }

  // Jump to a pinned message. Resolves by stable id/hash/index and, if the
  // target is virtualized (not currently mounted), scrolls the conversation
  // until it appears. Never deletes a pin just because it is off-screen.
  async function jumpToMessage(pinData) {
    let el = resolveMessageEl(pinData);
    if (el) { revealElement(el); return; }

    // Target not mounted — likely virtualized (common on ChatGPT). Walk the
    // conversation from the top, forcing rows to mount until we find it.
    const container = getScrollContainer(null);
    const step = () => Math.max(200, (container.clientHeight || window.innerHeight) * 0.8);

    try { container.scrollTo({ top: 0 }); } catch (_) { window.scrollTo(0, 0); }
    await delay(150);

    let lastTop = -1;
    for (let i = 0; i < 60; i++) {
      el = resolveMessageEl(pinData);
      if (el) { revealElement(el); return; }

      const before = container.scrollTop != null ? container.scrollTop : window.scrollY;
      try { container.scrollBy({ top: step() }); } catch (_) { window.scrollBy(0, step()); }
      await delay(90);

      const after = container.scrollTop != null ? container.scrollTop : window.scrollY;
      if (after === before && after === lastTop) break; // reached the bottom, can't scroll further
      lastTop = before;
    }

    el = resolveMessageEl(pinData);
    if (el) { revealElement(el); }
    else { showToast('Pinned message not found in this conversation'); }
  }

  // Add pin button to message
  function addPinButton(messageEl, index) {
    if (messageEl.hasAttribute('data-pinboard-idx')) return;
    messageEl.setAttribute('data-pinboard-idx', index);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'position:absolute;top:8px;right:8px;z-index:1000;';

    const btn = document.createElement('button');
    btn.className = 'pinboard-btn';
    btn.innerHTML = '📌';
    btn.title = 'Pin this message';
    btn.style.cssText = `
      width: 30px; height: 30px; padding: 0;
      background: rgba(30,30,35,0.85);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px; cursor: pointer; font-size: 14px;
      opacity: 0; transition: opacity 0.15s, transform 0.15s, background 0.15s;
      display: flex; align-items: center; justify-content: center;
    `;

    const currentPins = getCurrentPins();
    const isPinned = Object.values(currentPins).some(p => pinMatchesEl(p, messageEl, index));
    if (isPinned) {
      btn.style.opacity = '1';
      btn.style.background = 'rgba(217,119,6,0.35)';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pins = getCurrentPins();
      const existingPin = Object.entries(pins).find(([_, p]) => pinMatchesEl(p, messageEl, index));

      if (existingPin) {
        delete pins[existingPin[0]];
        btn.style.background = 'rgba(30,30,35,0.85)';
        // Clean up empty dialogue
        if (Object.keys(pins).length === 0) {
          delete allDialogues[currentPath];
        }
      } else {
        const text = extractCleanContent(messageEl);
        const snippet = text.substring(0, 50) + (text.length > 50 ? '...' : '');
        pins[`pin_${Date.now()}`] = {
          snippet,
          timestamp: Date.now(),
          messageIndex: index,
          messageId: getMessageId(messageEl),
          contentHash: getContentHash(messageEl)
        };
        // Update title
        getCurrentDialogue().title = getDialogueTitle();
        btn.style.background = 'rgba(217,119,6,0.35)';
        btn.style.opacity = '1';
      }

      saveAllDialogues();
      renderSidebar();
    });

    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.1)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

    btnContainer.appendChild(btn);

    const computed = window.getComputedStyle(messageEl);
    if (computed.position === 'static') messageEl.style.position = 'relative';
    messageEl.appendChild(btnContainer);

    messageEl.addEventListener('mouseenter', () => btn.style.opacity = '1');
    messageEl.addEventListener('mouseleave', () => {
      const pins = getCurrentPins();
      const stillPinned = Object.values(pins).some(p => pinMatchesEl(p, messageEl, index));
      if (!stillPinned) btn.style.opacity = '0';
    });
  }

  // Process messages
  function processMessages() {
    try {
      const messages = getMessageNodes();
      messages.forEach((msg, idx) => addPinButton(msg, idx));
    } catch (e) {
      console.error('Pinboard: Process error', e);
    }
  }

  function isConversationPath(path) {
    const pat = SITE_CONFIG.conversationPathPattern;
    return pat ? pat.test(path) : true;
  }

  // Check URL changes
  function checkUrlChange() {
    const newPath = window.location.pathname;
    if (newPath === currentPath) return;

    const oldPath = currentPath;

    // Rekey a fresh chat: pins made on a transient path (e.g. "/" or "/new")
    // before the conversation id settles should follow it to the real URL.
    const oldDialogue = allDialogues[oldPath];
    const oldHasPins = oldDialogue && Object.keys(oldDialogue.pins || {}).length > 0;
    if (oldHasPins && isConversationPath(newPath) && !isConversationPath(oldPath) && !allDialogues[newPath]) {
      allDialogues[newPath] = oldDialogue;
      allDialogues[newPath].title = getDialogueTitle();
      delete allDialogues[oldPath];
      if (expandedFolders.has(oldPath)) {
        expandedFolders.delete(oldPath);
        expandedFolders.add(newPath);
      }
      saveAllDialogues();
    }

    currentPath = newPath;
    expandedFolders.add(currentPath); // Auto-expand new dialogue
    renderSidebar();
    setTimeout(processMessages, 500);
  }

  // Setup observer
  function setupObserver() {
    const observer = new MutationObserver(() => {
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(() => {
        checkUrlChange();
        processMessages();
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Detect SPA navigations via the History API instead of polling.
    const fire = () => setTimeout(checkUrlChange, 0);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) { const r = origPush.apply(this, args); fire(); return r; };
    history.replaceState = function (...args) { const r = origReplace.apply(this, args); fire(); return r; };
    window.addEventListener('popstate', fire);
    // Light safety-net poll in case a navigation slips through.
    setInterval(checkUrlChange, 2000);
  }

  // Utilities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  let _toastTimer = null;
  function showToast(message) {
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  // Deep link support: open a conversation with #pinboard=<pinId> and auto-jump.
  function maybeJumpFromHash() {
    const m = window.location.hash.match(/pinboard=([^&]+)/);
    if (!m) return;
    const pinId = decodeURIComponent(m[1]);
    let tries = 0;
    const attempt = () => {
      const pinData = getCurrentPins()[pinId];
      if (pinData) {
        jumpToMessage(pinData);
        // Clear the hash so a manual refresh doesn't re-trigger the jump
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      if (tries++ < 12) setTimeout(attempt, 400);
    };
    setTimeout(attempt, 600);
  }

  // Initialize
  async function init() {
    createSidebar();
    await loadAllDialogues();
    expandedFolders.add(currentPath);

    setTimeout(() => {
      processMessages();
      setupObserver();
      maybeJumpFromHash();
    }, 800);

    console.log('Pinboard: Ready with multi-dialogue support');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
