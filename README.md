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
- 📌 **智能固定**: 鼠标悬停在 AI 回答上即可点击 📌 按钮进行收藏。
- 🗂️ **侧边栏索引**: 自动生成美观的毛玻璃风格侧边栏，集中展示所有收藏片段。
- ⚡ **瞬间穿梭**: 点击侧边栏卡片，页面将平滑滚动回原始对话位置。
- 💾 **会话持久化**: 收藏数据按 URL 存储，刷新页面或下次访问依然存在。

## 🚀 Installation

1. **Download/Clone** this repository to your local machine.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `Retrieplug` folder.
5. Head over to [Claude.ai](https://claude.ai) and start anchoring!

1. 下载或克隆本仓库到本地。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 开启右上角的 **“开发者模式”**。
4. 点击 **“加载已解压的扩展程序”**，选择本仓库文件夹即可。

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
- [ ] **多平台支持**: 适配 ChatGPT, Gemini 和 DeepSeek。
- [ ] **导出功能**: 支持将 Pin 过的精华内容一键导出为 Markdown。
- [ ] **分类标签**: 为不同的对话分支设置不同的颜色或标签。
- [ ] **搜索增强**: 在侧边栏增加搜索框，快速定位历史锚点。

## 📄 License

Distributed under the Apache-2.0 License. See LICENSE for more information.
---