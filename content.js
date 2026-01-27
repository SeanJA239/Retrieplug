// AI Chat Pinboard - Content Script
// Multi-dialogue pin management with folder structure

(function() {
  'use strict';

  // Site-specific configurations
  const SITE_CONFIGS = {
    'claude.ai': {
      messageSelector: '[data-testid="chat-message-content"]',
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
      messageSelector: 'model-response',
      contentSelector: '.model-response-text',
      excludeSelectors: [],
      titleSelector: '.conversation-title'
    },
    'chatgpt.com': {
      messageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav [class*="active"]'
    },
    'chat.openai.com': {
      messageSelector: '[data-message-author-role="assistant"]',
      contentSelector: '.markdown',
      excludeSelectors: [],
      titleSelector: 'nav [class*="active"]'
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

  // Get current dialogue title
  function getDialogueTitle() {
    try {
      const el = document.querySelector(SITE_CONFIG.titleSelector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim().substring(0, 30);
      }
    } catch (e) {}
    // Fallback: use last part of URL or "Untitled"
    const parts = currentPath.split('/').filter(Boolean);
    return parts[parts.length - 1]?.substring(0, 12) || 'Untitled';
  }

  // Load all dialogues from storage
  async function loadAllDialogues() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
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
      await chrome.storage.local.set({ [STORAGE_KEY]: allDialogues });
    } catch (e) {
      console.error('Pinboard: Save failed', e);
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

  // Find message by index
  function findMessageByIndex(index) {
    const messages = document.querySelectorAll(SITE_CONFIG.messageSelector);
    return messages[index] || null;
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
            jumpToMessage(pinData.messageIndex);
          } else {
            // Open in new tab
            window.open(window.location.origin + path, '_blank');
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

      const isPinned = Object.values(currentPins).some(p => p.messageIndex === idx);
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

  // Jump to message - position START of answer at middle of viewport
  function jumpToMessage(messageIndex) {
    const el = findMessageByIndex(messageIndex);
    if (!el) {
      // Remove orphan pin
      const pins = getCurrentPins();
      for (const [id, data] of Object.entries(pins)) {
        if (data.messageIndex === messageIndex) {
          delete pins[id];
        }
      }
      saveAllDialogues();
      renderSidebar();
      return;
    }

    // Step 1: Scroll element to top of viewport
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Step 2: After scroll completes, adjust to move element to middle
    setTimeout(() => {
      const viewportMiddle = window.innerHeight / 2;
      // Find scrollable container (claude.ai uses a custom container)
      const scrollContainer = el.closest('[class*="overflow-y"], [class*="scroll"]')
        || document.querySelector('main')
        || document.documentElement;

      if (scrollContainer && scrollContainer.scrollBy) {
        scrollContainer.scrollBy({ top: -viewportMiddle + 50, behavior: 'smooth' });
      } else {
        window.scrollBy({ top: -viewportMiddle + 50, behavior: 'smooth' });
      }
    }, 500);

    // Highlight the pinned answer
    el.style.outline = '2px solid #d97706';
    el.style.outlineOffset = '4px';
    el.style.transition = 'outline 0.3s';

    setTimeout(() => {
      el.style.outline = 'none';
    }, 2500);
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
    const isPinned = Object.values(currentPins).some(p => p.messageIndex === index);
    if (isPinned) {
      btn.style.opacity = '1';
      btn.style.background = 'rgba(217,119,6,0.35)';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const pins = getCurrentPins();
      const existingPin = Object.entries(pins).find(([_, p]) => p.messageIndex === index);

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
          messageIndex: index
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
      const stillPinned = Object.values(pins).some(p => p.messageIndex === index);
      if (!stillPinned) btn.style.opacity = '0';
    });
  }

  // Process messages
  function processMessages() {
    try {
      const messages = document.querySelectorAll(SITE_CONFIG.messageSelector);
      messages.forEach((msg, idx) => addPinButton(msg, idx));
    } catch (e) {
      console.error('Pinboard: Process error', e);
    }
  }

  // Check URL changes
  function checkUrlChange() {
    if (window.location.pathname !== currentPath) {
      currentPath = window.location.pathname;
      expandedFolders.add(currentPath); // Auto-expand new dialogue
      renderSidebar();
      setTimeout(processMessages, 500);
    }
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

  // Initialize
  async function init() {
    createSidebar();
    await loadAllDialogues();
    expandedFolders.add(currentPath);

    setTimeout(() => {
      processMessages();
      setupObserver();
    }, 800);

    console.log('Pinboard: Ready with multi-dialogue support');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
