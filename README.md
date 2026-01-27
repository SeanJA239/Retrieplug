# AI Chat Pinboard

A Chrome Extension that adds bookmark/pin functionality to AI chat interfaces (claude.ai).

## Features

- **📌 Pin Messages**: Hover over any AI response to reveal a pin button
- **📋 Sidebar Navigation**: Collapsible sidebar shows all pinned messages
- **⚡ Instant Jump**: Click any pin card to smoothly scroll to that message
- **💾 Persistent Storage**: Pins are saved per-conversation and persist across refreshes

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select this folder (`retrieve-plug`)
5. Navigate to [claude.ai](https://claude.ai) and start a conversation

## Usage

1. **Pin a message**: Hover over any AI response and click the 📌 button
2. **View pins**: Look at the sidebar on the right side of the page
3. **Jump to pin**: Click any card in the sidebar to scroll to that message
4. **Remove pin**: Click the ✕ button on any pin card, or click the pin button again
5. **Collapse sidebar**: Click the ◀ button in the sidebar header

## File Structure

```
retrieve-plug/
├── manifest.json    # Extension configuration
├── content.js       # Main script (MutationObserver, storage, UI)
├── styles.css       # Pin button styles (host page)
├── icons/           # Extension icons (optional)
└── README.md        # This file
```

## Technical Details

- **Shadow DOM**: Sidebar uses Shadow DOM to prevent CSS conflicts
- **MutationObserver**: Detects dynamically loaded messages
- **chrome.storage.local**: Persists pins per conversation URL
- **Glassmorphism UI**: Modern frosted-glass design

## Customization

To support additional AI chat sites, modify `CONFIG` in `content.js`:

```javascript
const CONFIG = {
  messageSelector: '[data-testid="chat-message-content"]',
  messageContainerSelector: '.font-claude-message',
  fallbackSelectors: ['.prose', '[class*="message"]'],
  // Add your selectors here
};
```

Then update `manifest.json` matches:

```json
"matches": ["https://claude.ai/*", "https://chat.openai.com/*"]
```

## License

MIT
