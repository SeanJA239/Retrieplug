// AI Chat Pinboard - Content Script
// Pin user queries, display AI answer snippets in sidebar

(function() {
  'use strict';

  // Site-specific configurations
  const SITE_CONFIGS = {
    'claude.ai': {
      userMessageSelector: '[data-testid="user-message"]',
      aiMessageSelector: '[data-testid="chat-message-content"]',
      contentSelector: '.font-claude-message',
      excludeSelectors: [
        '[class*="thinking"]',
        '[class*="Thinking"]',
        'details',
        'summary',
        '[data-testid*="thinking"]'
      ],
      // Selector to get conversation title
      titleSelector: '[data-testid="conversation-title"], .font-tiempos'
    },
    'gemini.google.com': {
      userMessageSelector: 'user-query',
      aiMessageSelector: 'model-response',
      contentSelector: '.model-response-text',
      excludeSelectors: [],
      titleSelector: '.conversation-title'
    },
    'chatgpt.com': {
      userMessageSelector: '[data-message-author-role="user"]',
      aiMessageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav a[aria-current="page"], nav [aria-current="page"]'
    },
    'chat.openai.com': {
      userMessageSelector: '[data-message-author-role="user"]',
      aiMessageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav a[aria-current="page"], nav [aria-current="page"]'
    },
    'grok.com': {
      userMessageSelector: '.items-end .message-bubble',
      aiMessageSelector: 'div[id^="response-"] .message-bubble',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: ''
    },
    'doubao.com': {
      userMessageSelector: 'div[data-testid="send_message"]',
      aiMessageSelector: 'div[data-testid="receive_message"]',
      contentSelector: 'div[data-testid="message_text_content"]',
      excludeSelectors: [],
      titleSelector: ''
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
  let allDialogues = {}; // { dialogueKey: { title, pins: { id: {snippet, timestamp, queryText} } } }
  let shadowRoot = null;

  const GENERIC_TITLES = new Set([
    'chatgpt', 'chat gpt', 'claude', 'gemini', 'grok', 'doubao',
    'google gemini', 'new chat', 'new conversation', 'conversation', 'chat', 'untitled'
  ]);

  let currentPath = getCurrentDialogueKey();
  let expandedFolders = new Set();

  function getDialogueUrlPath() {
    return window.location.pathname + window.location.search;
  }

  function getNavigablePath(dialogueKey) {
    return dialogueKey.split('::')[0];
  }

  function normalizeKey(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80);
  }

  function cleanTitle(text) {
    return (text || '')
      .replace(/\s+/g, ' ')
      // Remove UI metadata suffixes injected by some chat sidebars.
      .replace(/\s+(pinned\s+chat|pinned\s+conversation|pinned)\s*$/i, '')
      .replace(/\s+(已固定聊天|置顶聊天|已置顶聊天)\s*$/i, '')
      .replace(/\s*[-|]\s*(chatgpt|claude|gemini|grok|doubao).*$/i, '')
      .replace(/\s*[·•]\s*(chatgpt|claude|gemini|grok|doubao).*$/i, '')
      .trim();
  }

  function isLikelyId(text) {
    if (!text) return false;
    const value = String(text).trim();
    return (
      /^[a-f0-9-]{8,}$/i.test(value) ||
      /^[a-z0-9_-]{12,}$/i.test(value)
    );
  }

  function isMeaningfulTitle(text) {
    const title = cleanTitle(text);
    if (!title || title.length < 3) return false;
    const lowered = title.toLowerCase();
    if (GENERIC_TITLES.has(lowered)) return false;
    if (/^(google\s+)?gemini$/i.test(title)) return false;
    if (/^(chatgpt|chat gpt|openai chatgpt)$/i.test(title)) return false;
    if (/^(claude|claude ai)$/i.test(title)) return false;
    return true;
  }

  function getTitleFromSelector() {
    if (!SITE_CONFIG.titleSelector) return '';
    try {
      const els = Array.from(document.querySelectorAll(SITE_CONFIG.titleSelector));
      for (const el of els) {
        const activeContainer = el.closest('[aria-current="page"], a[aria-current="page"]');
        if (!activeContainer) continue;
        const text = cleanTitle(el.textContent || '');
        if (isMeaningfulTitle(text)) return text;
      }
      for (const el of els) {
        const text = cleanTitle(el.textContent || '');
        if (isMeaningfulTitle(text)) return text;
      }
    } catch (e) {}
    return '';
  }

  function getConversationIdFromPath() {
    const path = window.location.pathname;
    const matched = path.match(/\/(?:c|chat|conversation|thread|app)\/([^/?#]+)/i);
    return matched ? matched[1] : '';
  }

  function getTitleFromNavByConversationId() {
    const conversationId = getConversationIdFromPath();
    if (!conversationId) return '';

    try {
      const linkCandidates = document.querySelectorAll('a[href]');
      for (const link of linkCandidates) {
        const href = link.getAttribute('href') || '';
        if (!href.includes(conversationId)) continue;

        // Use dedicated title nodes first; avoid full link text (often includes username/status).
        const titleNode = link.querySelector(
          '.conversation-title, [data-testid*="conversation-title"], [class*="conversation"][class*="title"], [class*="title"]'
        );
        const nodeTitle = cleanTitle(titleNode?.textContent || '');
        if (isMeaningfulTitle(nodeTitle)) return nodeTitle;

        // Fallback: pick the first meaningful leaf text inside the link.
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
        let textNode = walker.nextNode();
        while (textNode) {
          const leaf = cleanTitle(textNode.textContent || '');
          if (isMeaningfulTitle(leaf)) return leaf;
          textNode = walker.nextNode();
        }
      }
    } catch (e) {}

    return '';
  }

  function getTitleHint() {
    // Most accurate: map current URL conversation id to nav item title.
    const navMatchedTitle = getTitleFromNavByConversationId();
    if (isMeaningfulTitle(navMatchedTitle)) return navMatchedTitle;

    const selectorTitle = getTitleFromSelector();
    if (isMeaningfulTitle(selectorTitle)) return selectorTitle;

    const docTitle = cleanTitle(document.title);
    if (isMeaningfulTitle(docTitle)) return docTitle;

    return '';
  }

  function findConversationIdInState(state, depth = 0) {
    if (!state || depth > 3) return '';

    if (typeof state === 'string') {
      return isLikelyId(state) ? state : '';
    }

    if (Array.isArray(state)) {
      for (const item of state) {
        const found = findConversationIdInState(item, depth + 1);
        if (found) return found;
      }
      return '';
    }

    if (typeof state === 'object') {
      const idKeyPattern = /(conversation|thread|chat|session|dialog|convo).*id|^id$/i;
      for (const [key, value] of Object.entries(state)) {
        if (typeof value !== 'string') continue;
        if (!idKeyPattern.test(key)) continue;
        if (isLikelyId(value)) return value;
      }

      for (const value of Object.values(state)) {
        const found = findConversationIdInState(value, depth + 1);
        if (found) return found;
      }
    }

    return '';
  }

  function getStateConversationId() {
    try {
      return findConversationIdInState(history.state);
    } catch (e) {
      return '';
    }
  }

  function getCurrentDialogueKey() {
    const url = new URL(window.location.href);
    const pathWithSearch = getDialogueUrlPath();

    // If URL already has search params, keep them; this is usually enough to identify dialogue.
    if (url.search) return pathWithSearch;

    // Try extracting a conversation-like id from history state for SPA routes that keep generic paths.
    const stateId = getStateConversationId();
    if (stateId) return `${pathWithSearch}::id:${encodeURIComponent(stateId)}`;

    // Generic path fallback: include a normalized title to avoid collisions.
    const titleHint = getTitleHint();
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const hasSpecificPath = pathSegments.length > 1 || isLikelyId(pathSegments[pathSegments.length - 1]);
    if (!hasSpecificPath && titleHint) {
      return `${pathWithSearch}::title:${normalizeKey(titleHint)}`;
    }

    return pathWithSearch;
  }

  // Get current dialogue title
  function getDialogueTitle() {
    const hint = getTitleHint();
    if (hint) return hint.substring(0, 30);

    // Fallback: use last part of URL or "Untitled"
    const urlPath = getDialogueUrlPath().split('?')[0];
    const parts = urlPath.split('/').filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1] || '');
    if (last && !isLikelyId(last)) {
      return cleanTitle(last).substring(0, 30);
    }
    if (last) {
      return `Chat ${last.substring(0, 8)}`;
    }
    return 'Untitled';
  }

  // Storage helper - prefer sync, fallback to local, then window.localStorage
  let useLocalStorage = false;
  let useWebLocalStorage = false;

  function getStorageApi() {
    try {
      return (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage : null;
    } catch (e) {
      return null;
    }
  }

  function toPromiseStorageCall(area, method, arg) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area[method] !== 'function') {
        reject(new Error(`Storage method unavailable: ${method}`));
        return;
      }

      try {
        const fn = area[method];
        // Callback style API
        if (fn.length >= 2) {
          fn.call(area, arg, (result) => {
            try {
              const msg = chrome?.runtime?.lastError?.message;
              if (msg) {
                reject(new Error(msg));
                return;
              }
            } catch (err) {}
            resolve(result);
          });
          return;
        }

        // Promise style API
        const maybePromise = fn.call(area, arg);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve).catch(reject);
        } else {
          resolve(maybePromise);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async function getStorageArea() {
    if (useWebLocalStorage) return null;

    const storage = getStorageApi();
    if (!storage) {
      useWebLocalStorage = true;
      console.warn('Pinboard: chrome.storage unavailable, using window.localStorage');
      return null;
    }

    if (!useLocalStorage && storage.sync) {
      try {
        // Probe sync availability first.
        await toPromiseStorageCall(storage.sync, 'get', null);
        return storage.sync;
      } catch (e) {
        console.log('Pinboard: Sync unavailable, using local storage');
        useLocalStorage = true;
      }
    }

    if (storage.local) {
      return storage.local;
    }

    useWebLocalStorage = true;
    console.warn('Pinboard: chrome.storage.local unavailable, using window.localStorage');
    return null;
  }

  function webLocalGet(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function webLocalSet(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  async function readStorage(key) {
    const area = await getStorageArea();
    if (!area) {
      return { [key]: webLocalGet(key) };
    }
    const result = await toPromiseStorageCall(area, 'get', key);
    return result || {};
  }

  async function writeStorage(payload) {
    const area = await getStorageArea();
    if (!area) {
      const [key, value] = Object.entries(payload)[0] || [];
      if (key) webLocalSet(key, value);
      return;
    }
    await toPromiseStorageCall(area, 'set', payload);
  }

  // Load all dialogues from storage
  async function loadAllDialogues() {
    try {
      const result = await readStorage(STORAGE_KEY);
      allDialogues = result[STORAGE_KEY] || {};
    } catch (e) {
      console.error('Pinboard: Load failed', e);
      allDialogues = {};
    }
    renderSidebar();
  }

  // Save all dialogues to storage
  async function saveAllDialogues() {
    try {
      await writeStorage({ [STORAGE_KEY]: allDialogues });
    } catch (e) {
      // If sync fails (quota exceeded), fallback to local
      if (!useLocalStorage) {
        console.log('Pinboard: Sync save failed, falling back to local');
        useLocalStorage = true;
        try {
          await writeStorage({ [STORAGE_KEY]: allDialogues });
        } catch (retryErr) {
          useWebLocalStorage = true;
          try {
            webLocalSet(STORAGE_KEY, allDialogues);
          } catch (localErr) {
            console.error('Pinboard: Save failed', localErr);
          }
        }
      } else {
        useWebLocalStorage = true;
        try {
          webLocalSet(STORAGE_KEY, allDialogues);
        } catch (localErr) {
          console.error('Pinboard: Save failed', localErr);
        }
      }
    }
  }

  // Get current dialogue data
  function getCurrentDialogue() {
    if (!allDialogues[currentPath]) {
      allDialogues[currentPath] = {
        title: getDialogueTitle(),
        pins: {}
      };
    }
    return allDialogues[currentPath];
  }

  // Get pins for current dialogue
  function getCurrentPins() {
    return getCurrentDialogue().pins;
  }

  // Find user message by matching query text
  function findUserMessageByQuery(queryText) {
    const messages = document.querySelectorAll(SITE_CONFIG.userMessageSelector);
    for (const msg of messages) {
      const text = msg.textContent.replace(/\s+/g, ' ').trim();
      // Match if the stored query is found in the message text
      if (text.includes(queryText) || queryText.includes(text.substring(0, 100))) {
        return msg;
      }
    }
    return null;
  }

  // Find AI message that follows a user message
  function findFollowingAiMessage(userMessageEl) {
    const aiMessages = document.querySelectorAll(SITE_CONFIG.aiMessageSelector);
    const userMessages = document.querySelectorAll(SITE_CONFIG.userMessageSelector);

    // Find the index of this user message
    let userIndex = -1;
    userMessages.forEach((el, idx) => {
      if (el === userMessageEl) userIndex = idx;
    });

    if (userIndex === -1) return null;

    // Find AI messages that come after this user message in DOM order
    const userRect = userMessageEl.getBoundingClientRect();
    for (const aiMsg of aiMessages) {
      const aiRect = aiMsg.getBoundingClientRect();
      // AI message should be below user message
      if (aiRect.top > userRect.top) {
        return aiMsg;
      }
    }

    // Fallback: return the AI message at same index
    return aiMessages[userIndex] || null;
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
          box-shadow: none;
          display: flex;
          flex-direction: column;
          font-family: system-ui, -apple-system, sans-serif;
          transition: transform 0.25s ease;
          pointer-events: auto;
        }

        .sidebar.open { transform: translateY(-50%) translateX(0); box-shadow: -4px 0 30px rgba(0,0,0,0.5); }

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

        .footer-actions {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .footer-btn {
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #999;
          font-size: 11px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .footer-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
      </style>

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
        <div class="footer-actions">
          <button class="footer-btn" id="export-btn">📤 Export</button>
          <button class="footer-btn" id="import-btn">📥 Import</button>
        </div>
        <input type="file" id="import-file" accept=".json" style="display:none;">
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

    // Export pins to JSON file
    shadowRoot.getElementById('export-btn').addEventListener('click', () => {
      const dataStr = JSON.stringify(allDialogues, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pinboard-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import pins from JSON file
    const importFile = shadowRoot.getElementById('import-file');
    shadowRoot.getElementById('import-btn').addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);

        // Merge imported data with existing
        for (const [path, dialogue] of Object.entries(imported)) {
          if (!allDialogues[path]) {
            allDialogues[path] = dialogue;
          } else {
            // Merge pins
            allDialogues[path].pins = {
              ...allDialogues[path].pins,
              ...dialogue.pins
            };
          }
        }

        await saveAllDialogues();
        renderSidebar();
        alert('Pins imported successfully!');
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }

      // Reset file input
      importFile.value = '';
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
          Hover over your queries and click 📌
        </div>
      `;
      return;
    }

    foldersEl.innerHTML = '';

    for (const [path, dialogue] of dialoguesWithPins) {
      const isCurrent = path === currentPath;
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
      pins.sort((a, b) => a[1].timestamp - b[1].timestamp);

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
            jumpToMessage(pinData.queryText);
          } else {
            // Open in new tab with hash to auto-scroll
            const hash = encodeURIComponent(pinData.queryText);
            window.open(window.location.origin + getNavigablePath(path) + '#pinboard=' + hash, '_blank');
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
      // Button container is now a sibling after the message
      const btnContainer = el.nextElementSibling;
      const btn = btnContainer?.querySelector('.pinboard-btn');
      if (!btn) return;

      const queryText = el.textContent.replace(/\s+/g, ' ').trim().substring(0, 150);
      const isPinned = Object.values(currentPins).some(p => p.queryText === queryText);
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

  // Jump to user query - position near top of viewport
  function jumpToMessage(queryText) {
    const el = findUserMessageByQuery(queryText);
    if (!el) {
      // Remove orphan pin
      const pins = getCurrentPins();
      for (const [id, data] of Object.entries(pins)) {
        if (data.queryText === queryText) {
          delete pins[id];
        }
      }
      saveAllDialogues();
      renderSidebar();
      return;
    }

    // Scroll element to top of viewport
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Create integrated highlight frame around both query and answer
    const aiMessage = findFollowingAiMessage(el);

    // Calculate bounding box that covers both elements
    const queryRect = el.getBoundingClientRect();
    let top = queryRect.top;
    let bottom = queryRect.bottom;
    let left = queryRect.left;
    let right = queryRect.right;

    if (aiMessage) {
      const aiRect = aiMessage.getBoundingClientRect();
      top = Math.min(top, aiRect.top);
      bottom = Math.max(bottom, aiRect.bottom);
      left = Math.min(left, aiRect.left);
      right = Math.max(right, aiRect.right);
    }

    // Create overlay frame
    const overlay = document.createElement('div');
    overlay.className = 'pinboard-highlight-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: ${top - 8}px;
      left: ${left - 8}px;
      width: ${right - left + 16}px;
      height: ${bottom - top + 16}px;
      border: 2px solid #d97706;
      border-radius: 12px;
      pointer-events: none;
      z-index: 10000;
      box-shadow: 0 0 20px rgba(217, 119, 6, 0.3);
      transition: opacity 0.3s;
    `;
    document.body.appendChild(overlay);

    // Update overlay position on scroll
    const updatePosition = () => {
      const newQueryRect = el.getBoundingClientRect();
      let newTop = newQueryRect.top;
      let newBottom = newQueryRect.bottom;
      let newLeft = newQueryRect.left;
      let newRight = newQueryRect.right;

      if (aiMessage) {
        const newAiRect = aiMessage.getBoundingClientRect();
        newTop = Math.min(newTop, newAiRect.top);
        newBottom = Math.max(newBottom, newAiRect.bottom);
        newLeft = Math.min(newLeft, newAiRect.left);
        newRight = Math.max(newRight, newAiRect.right);
      }

      overlay.style.top = `${newTop - 8}px`;
      overlay.style.left = `${newLeft - 8}px`;
      overlay.style.width = `${newRight - newLeft + 16}px`;
      overlay.style.height = `${newBottom - newTop + 16}px`;
    };

    window.addEventListener('scroll', updatePosition, true);

    // Remove overlay after delay
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        window.removeEventListener('scroll', updatePosition, true);
      }, 300);
    }, 2500);
  }

  // Add pin button to message
  function addPinButton(messageEl, index) {
    if (messageEl.hasAttribute('data-pinboard-idx')) return;
    messageEl.setAttribute('data-pinboard-idx', index);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'pinboard-btn-container';
    btnContainer.style.cssText = 'display:flex;justify-content:flex-end;padding:2px 0;width:100%;';

    const btn = document.createElement('button');
    btn.className = 'pinboard-btn';
    btn.innerHTML = '📌';
    btn.title = 'Pin this query';
    btn.style.cssText = `
      width: 28px; height: 28px; padding: 0;
      background: rgba(30,30,35,0.85);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px; cursor: pointer; font-size: 13px;
      opacity: 0; transition: opacity 0.15s, transform 0.15s, background 0.15s;
      display: flex; align-items: center; justify-content: center;
    `;

    const currentPins = getCurrentPins();
    const initialQueryText = messageEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 150);
    const isPinned = Object.values(currentPins).some(p => p.queryText === initialQueryText);
    if (isPinned) {
      btn.style.opacity = '1';
      btn.style.background = 'rgba(217,119,6,0.35)';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pins = getCurrentPins();
      const currentQueryText = messageEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 150);
      const existingPin = Object.entries(pins).find(([_, p]) => p.queryText === currentQueryText);

      if (existingPin) {
        delete pins[existingPin[0]];
        btn.style.background = 'rgba(30,30,35,0.85)';
        // Clean up empty dialogue
        if (Object.keys(pins).length === 0) {
          delete allDialogues[currentPath];
        }
      } else {
        // Store the user's query text for matching
        const queryText = messageEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 150);

        // Get snippet from the following AI response
        const aiMessage = findFollowingAiMessage(messageEl);
        let snippet = 'No AI response found';
        if (aiMessage) {
          const text = extractCleanContent(aiMessage);
          snippet = text.substring(0, 50) + (text.length > 50 ? '...' : '');
        }
        pins[`pin_${Date.now()}`] = {
          snippet,
          timestamp: Date.now(),
          queryText
        };
        // Update title
        const title = getDialogueTitle();
        getCurrentDialogue().title = isMeaningfulTitle(title) ? title : queryText.substring(0, 30);
        btn.style.background = 'rgba(217,119,6,0.35)';
        btn.style.opacity = '1';
      }

      saveAllDialogues();
      renderSidebar();
    });

    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.1)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

    btnContainer.appendChild(btn);

    // Insert button container after the user message (between query and answer)
    messageEl.parentNode.insertBefore(btnContainer, messageEl.nextSibling);

    // Show button on hover of either the message or the button container area
    const showBtn = () => btn.style.opacity = '1';
    const hideBtn = () => {
      const pins = getCurrentPins();
      const qText = messageEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 150);
      const stillPinned = Object.values(pins).some(p => p.queryText === qText);
      if (!stillPinned) btn.style.opacity = '0';
    };

    messageEl.addEventListener('mouseenter', showBtn);
    messageEl.addEventListener('mouseleave', hideBtn);
    btnContainer.addEventListener('mouseenter', showBtn);
    btnContainer.addEventListener('mouseleave', hideBtn);
  }

  // Process user messages to add pin buttons
  function processMessages() {
    try {
      const messages = document.querySelectorAll(SITE_CONFIG.userMessageSelector);
      messages.forEach((msg, idx) => addPinButton(msg, idx));
    } catch (e) {
      console.error('Pinboard: Process error', e);
    }
  }

  // Check URL changes
  function checkUrlChange() {
    const nextPath = getCurrentDialogueKey();
    if (nextPath !== currentPath) {
      currentPath = nextPath;
      expandedFolders.add(currentPath); // Auto-expand new dialogue
      renderSidebar();
      setTimeout(() => {
        processMessages();
        refreshCurrentDialogueTitle();
      }, 500);
    } else {
      refreshCurrentDialogueTitle();
    }
  }

  function refreshCurrentDialogueTitle() {
    const dialogue = allDialogues[currentPath];
    if (!dialogue) return;

    const liveTitle = getDialogueTitle();
    if (!isMeaningfulTitle(liveTitle)) return;
    if (dialogue.title === liveTitle) return;

    dialogue.title = liveTitle;
    saveAllDialogues();
    renderSidebar();
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
    setInterval(checkUrlChange, 1000);
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

  // Check for pinboard hash and scroll to pinned query
  function checkHashAndScroll() {
    const hash = window.location.hash;
    if (hash.startsWith('#pinboard=')) {
      const queryText = decodeURIComponent(hash.substring('#pinboard='.length));
      // Retry a few times as messages may still be loading
      let attempts = 0;
      const tryScroll = () => {
        const el = findUserMessageByQuery(queryText);
        if (el) {
          jumpToMessage(queryText);
          // Clean up hash
          history.replaceState(null, '', window.location.pathname + window.location.search);
        } else if (attempts < 10) {
          attempts++;
          setTimeout(tryScroll, 500);
        }
      };
      tryScroll();
    }
  }

  // Initialize
  async function init() {
    createSidebar();
    await loadAllDialogues();
    expandedFolders.add(currentPath);

    setTimeout(() => {
      processMessages();
      setupObserver();
      checkHashAndScroll();
    }, 800);

    console.log('Pinboard: Ready with multi-dialogue support');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
