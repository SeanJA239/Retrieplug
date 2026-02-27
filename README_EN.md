<h4 align="right"><strong>English</strong> | <a href="README.md">简体中文</a></h4>

<p align="center">
    <!-- If you have a Banner, you can replace the img tag below: -->
    <!-- <img src="[Your Banner Image URL here, recommended size 800x200]" alt="Retrieplug" width="800"/> -->
    <img src="icons/icon.svg" alt="Retrieplug Logo" width="138"/>
</p>

<h1 align="center">Retrieplug (Retrieve-Plugin)</h1>

<p align="center"><strong>Transforming linear AI chats into your personal knowledge tree.</strong></p>

<div align="center">
    <a href="https://github.com/SeanJA239/Retrieplug/blob/main/LICENSE" target="_blank">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-blue?style=flat-square"></a>
    <a href="https://github.com/SeanJA239/Retrieplug/releases" target="_blank">
    <img alt="Version" src="https://img.shields.io/github/v/release/SeanJA239/Retrieplug?style=flat-square"></a>
    <a href="https://github.com/SeanJA239/Retrieplug/stargazers" target="_blank">
    <img alt="Stars" src="https://img.shields.io/github/stars/SeanJA239/Retrieplug?style=flat-square"></a>
</div>

## 🌲 Why Retrieplug?

Standard AI interfaces force you to scroll endlessly. If your thought process is non-linear—branching off into technical details and then returning to the main topic—you lose context. **Retrieplug** allows you to anchor important answers and jump between different "branches" of your conversation via a persistent sidebar. It's a lightweight browser extension designed for efficient web information extraction, clipboard parsing, and formula copying, featuring a minimalist and highly efficient design.

## 🧠 Memory System

We have implemented a robust dual-mode storage system to ensure your "Knowledge Tree" is always safe and accessible.

### 1. Auto-Save (Persistence)
The extension automatically syncs your pinned messages to `chrome.storage.local` based on the unique conversation URL. Even if you refresh the page or restart your browser, your pins remain intact.

### 2. Manual Control
You have full control over the memory. Manually pin messages using the 📌 button on hover, or remove specific snippets directly from the sidebar. The storage updates in real-time.

## ✨ Features

- 📌 **Smart Pinning**: Hover over any AI response to instantly anchor it.
- 📋 **Snippet Sidebar**: A sleek, collapsible drawer with a glassmorphism design.
- ⚡ **Instant Warp**: Click any card in the sidebar to smoothly scroll to that message.
- 🎨 **Minimalist Design**: A clean, burden-free interface featuring the "Retrieval Eye" – a symbol of retrieval and anchoring.
- 🌗 **Multilingual & Dark Mode**: Natively adapts to system dark mode and supports seamless language switching.
- 📋 **Smart Clipboard Parsing**: (Coming Soon) Intelligently identify and parse clipboard content to greatly boost efficiency.
- 🧮 **One-Click Formula Extraction**: (Coming Soon) Easily capture LaTeX and MathML formulas from webpages.

## 📸 Screenshots

<p align="center">
    <img src="[Your interface screenshot URL here, recommended to show dark/light mode comparison]" width="100%"/>
</p>

## 🚀 Installation & Usage

1. **Get the Code**
   Clone the repository to your local machine using Git, or download the ZIP file:
   ```bash
   git clone https://github.com/SeanJA239/Retrieplug.git
   ```

2. **Open Extension Management**
   Type `chrome://extensions/` into the address bar of a Chromium-based browser (Chrome, Edge, etc.) and enable **Developer mode** in the top-right corner.

3. **Load Extension**
   Click the **Load unpacked** button in the top-left corner and select the cloned `Retrieplug` folder to complete the installation. Refresh your AI conversation page to start using it.

## 🗺️ Roadmap

- [x] Persistent Memory Storage (Local)
- [x] Auto & Manual Memory Management
- [x] Complete minimalist UI design and basic architecture
- [x] Support multilingual switching and dark mode adaptation
- [ ] Core: Smart clipboard parsing function
- [ ] Core: One-click LaTeX / MathML formula extraction
- [ ] Multi-platform support (ChatGPT, Gemini, DeepSeek)
- [ ] Export pins as Markdown / PDF
- [ ] Grouping/Folders for complex thought branches

## 🤝 Contributing & Feedback

We warmly welcome everyone to participate in the development of Retrieplug! Whether it's whimsical ideas for features, UI optimization suggestions, or any bugs you find, feel free to submit an [Issue](https://github.com/SeanJA239/Retrieplug/issues) or initiate a Pull Request.

Let's work together to build a more efficient web experience! ❤️

## 📄 License

This project is open-sourced under the **Apache-2.0 License**. Please see the [LICENSE](./LICENSE) file for more details.
