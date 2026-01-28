# 🧩 Retrieplug (Retrieve-Plug)

> **"Transforming linear AI chats into your personal knowledge tree."**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Chrome%20|%20Edge-lightgrey.svg)](https://developer.chrome.com/docs/extensions/)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

Retrieplug is a productivity-focused Chrome extension designed for deep thinkers who find linear chat interfaces (like Claude or ChatGPT) restrictive. It allows you to **pin, organize, and navigate** complex AI conversations as if they were branches of a tree.

---

## 🌲 Why Retrieplug?

Standard AI interfaces force you to scroll endlessly. If your thought process is non-linear—branching off into technical details and then returning to the main topic—you lose context. 

**Retrieplug solves this by:**
- **Anchoring Context:** Save "Golden Answers" that you'll need to reference later.
- **Non-Linear Navigation:** Jump between different "branches" of your conversation via a persistent sidebar.
- **Cognitive Ease:** Spend less time scrolling and more time thinking.

## ✨ Key Features

- 📌 **Smart Pinning**: Hover over any AI response to instantly anchor it.
- 🗂️ **Snippet Sidebar**: A sleek, collapsible drawer that keeps your pinned gems organized.
- ⚡ **Instant Warp**: Click a pinned card to smoothly scroll back to the exact moment in history.
- 💾 **Session Persistence**: Pins are stored per conversation URL—refresh the page and your "knowledge tree" remains.
- 🎨 **Glassmorphism UI**: Designed to blend seamlessly with the modern aesthetics of Claude.ai.

## 🚀 Installation

1. **Download/Clone** this repository to your local machine.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `Retrieplug` folder.
5. Head over to [Claude.ai](https://claude.ai) and start anchoring!

## 🛠️ Configuration

To add support for ChatGPT or other AI platforms, simply update the `CONFIG` object in `content.js`:

```javascript
const CONFIG = {
  messageSelector: '[data-testid="chat-message-content"]', // Target for ChatGPT
  messageContainerSelector: '.font-claude-message',        // Target for Claude
  // ...
};
```
## 🗺️ Roadmap
- [ ] Support for multiple AI platforms (ChatGPT, Gemini).
- [ ] Export pinned messages as Markdown files.
- [ ] Folder/Category support for different "thought branches".
- [ ] Search bar within the sidebar.

## 📄 License

Distributed under the Apache-2.0 License. See LICENSE for more information.
---