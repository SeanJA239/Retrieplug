# AI Chat Pinboard — UX Optimization Plan

**Scope:** User experience on **Claude (claude.ai)** and **ChatGPT (chatgpt.com / chat.openai.com)** web.
**Target file:** `content.js` (single content script), with supporting changes to `manifest.json`, `styles.css`.
**Date:** 2026-06-01
**Status:** ✅ Phase 1 (P0-1/2/3) + small P1/P3 wins (P1-1, P1-4, P3-2, P3-4) implemented in `content.js` v1.1.0. Remaining: P1-2 (button placement), P1-3 (theme), P2 features, P3-1/3 (observer scoping, non-destructive render), P3-5 (README).
**Branch context:** Working tree is on `old-version-test`, which has reverted `content.js` to the **index-based** pin model (pins keyed by `messageIndex`). The previous `HEAD` used a more robust content/query-based model. Several issues below stem directly from that regression — see [P0-1](#p0-1-pin-identity-is-index-based).

---

## 1. Current behavior (baseline)

- Adds a 📌 button to each assistant message (`SITE_CONFIG.messageSelector`).
- Clicking pins the message: stores `{ snippet, timestamp, messageIndex }` under `allDialogues[pathname].pins[id]` in `chrome.storage.local`.
- A right-edge sidebar (Shadow DOM) lists pins grouped into per-conversation "folders".
- Clicking a pin in the **current** conversation scrolls to `messages[messageIndex]`; a pin from **another** conversation opens that path in a new tab (no jump).

---

## 2. Problems found, prioritized

Priorities: **P0** = breaks the core promise (reliable jump-to-message); **P1** = site-specific friction users hit constantly; **P2** = missing features that limit usefulness; **P3** = robustness/perf/polish.

### P0 — Correctness: the jump is unreliable

#### P0-1: Pin identity is index-based
`content.js:659-663` stores `messageIndex` = position in `document.querySelectorAll(messageSelector)`. This is fragile on **both** target sites:
- **ChatGPT virtualizes** the message list — off-screen messages are unmounted from the DOM. `querySelectorAll` therefore returns only currently-rendered messages, so indices shift and `messages[index]` (`content.js:111-113`, `571`) resolves to the **wrong** message or `null`.
- **Claude lazy-renders** long conversations; early messages may not be present until scrolled into view.
- **Edit / regenerate / branch switching** on both sites reorders or replaces messages, silently corrupting every saved index.

**Fix direction:** anchor pins to a stable identity, with graceful fallbacks:
1. **ChatGPT:** the assistant message element exposes a stable id (`[data-message-id]` on the `[data-message-author-role]` node). Store it.
2. **Claude:** capture the message's own identifier where exposed; otherwise store a **content fingerprint** (first ~200 chars normalized + a short hash) plus the ordinal as tiebreaker.
3. Persist `{ messageId, contentHash, messageIndex, snippet, timestamp }`. Resolution order at jump time: `messageId` → `contentHash` match → `messageIndex` (last resort). This recovers the robustness lost in the `old-version-test` revert.

**Acceptance:** pin a message, scroll far away (forcing virtualization on ChatGPT), reopen — clicking the pin still lands on the correct message.

#### P0-2: `jumpToMessage` is timing- and container-fragile
`content.js:571-612` calls `scrollIntoView`, then after a **fixed 500ms** `setTimeout` guesses the scroll container via `el.closest('[class*="overflow-y"], [class*="scroll"]')`. Problems:
- On ChatGPT the target may be **unmounted** (virtualized) → `findMessageByIndex` returns null → pin is silently deleted as "orphan" (`content.js:574-583`). Users lose pins just by scrolling.
- The 500ms guess races with smooth-scroll completion on slow/long pages.
- Container heuristic differs between Claude and ChatGPT and can pick the wrong element.

**Fix direction:**
- Resolve the element via the stable id (P0-1) **before** declaring it orphaned. If not in DOM, progressively scroll the conversation container toward the target (or scroll to top and step down) until it mounts, then center it.
- Replace the fixed timeout with a `scrollend` listener (with a timeout fallback) instead of a magic 500ms.
- Detect the scroll container once per site via config rather than per-jump class guessing.

**Acceptance:** jumping to a message that is currently virtualized scrolls until it mounts and centers it; pins are never auto-deleted merely because they are off-screen.

#### P0-3: Cross-conversation pins lose the target
`content.js:509-511`: a pin from another conversation does `window.open(origin + path)` with **no anchor**, dropping the user at the top of a possibly very long chat.

**Fix direction:** append an anchor (`#pinboard=<pinId>`), and on `init()` detect that hash and auto-run the (hardened) jump once messages load.

**Acceptance:** clicking a pin from another conversation opens that chat and scrolls to the exact message.

---

### P1 — Site-specific friction (Claude & ChatGPT)

#### P1-1: ChatGPT conversation title is usually wrong
`content.js:32,38` uses `titleSelector: 'nav [class*="active"]'`. ChatGPT's sidebar markup rarely exposes a simple `active` class on the title node, so folders fall back to the URL slug or "Untitled" (`getDialogueTitle`, `content.js:60-70`). Note the `old-version-test` revert **dropped** the smarter title logic (`cleanTitle`, generic-title rejection, id detection) that previously lived here.
**Fix:** prefer `document.title` (ChatGPT sets it to the conversation name), strip the trailing site suffix, reject generic/id-like values, and fall back to the active nav link's text. Restore the `cleanTitle`/`isMeaningfulTitle` helpers removed in the revert.

#### P1-2: Pin button collides with native message actions
`content.js:620,626-633` pins the button at `top:8px; right:8px` absolutely positioned inside the message. This overlaps:
- **Claude:** the copy / retry / thumbs action row and can sit over content.
- **ChatGPT:** the model-message hover toolbar and the right edge of wide messages.
**Fix:** position relative to the message's existing action bar (or left-gutter), offset to avoid the native hover toolbar, and ensure it never covers text. Verify against both sites' current DOM.

#### P1-3: Sidebar is hard-coded dark; clashes in light mode
The Shadow DOM styles (`content.js:138-156` etc.) use a fixed dark glassmorphism palette. In Claude/ChatGPT **light** mode this is a jarring black panel.
**Fix:** detect theme (`prefers-color-scheme` and/or the site's `html`/`body` theme class) and provide a light variant via CSS custom properties.

#### P1-4: New-chat path instability orphans pins
`currentPath = window.location.pathname` (`content.js:56`). A brand-new chat starts on a transient path (e.g. `/new` or `/`) and the URL changes to the real conversation id **after** the first response. Pins created in that window attach to the transient key and become an orphaned folder.
**Fix:** when `checkUrlChange` (`content.js:702-709`) detects the settle from a transient path to a real conversation id, **rekey** the in-flight dialogue's pins to the new path instead of creating a new folder.

---

### P2 — Feature gaps that limit usefulness

| # | Gap | Where | Proposed |
|---|-----|-------|----------|
| P2-1 | No search/filter across pins | `renderSidebar` `content.js:415` | Add a search box in `.header`; filter folders/snippets live. |
| P2-2 | Cannot rename folders or pins, no notes | titles auto-derived `content.js:60-70`, snippet auto `content.js:658` | Inline-edit folder title; allow an optional note per pin. |
| P2-3 | No export/import (data-loss risk) | storage only `content.js:85-91` | Add export-to-JSON / import; `storage.local` is wiped if the user clears site data. |
| P2-4 | Snippet truncated to 50 chars, no preview | `content.js:658` | Store a longer excerpt; expand-on-hover or click-to-preview in the card. |
| P2-5 | No keyboard / a11y support | buttons are bare emoji | Add `aria-label`s, focus styles, `role`s, and a toggle shortcut (e.g. `Alt+P`). |
| P2-6 | Toggle tab fixed center-right, can overlap site UI; not dismissable | `.toggle-tab` `content.js:160-181` | Make position user-adjustable (remember vertical offset) and allow hide. |

---

### P3 — Robustness / performance / polish

- **P3-1 — Whole-body MutationObserver + full reprocch every 300ms** (`content.js:712-721`). `processMessages` re-`querySelectorAll`s and iterates **all** messages on every mutation batch; on long Claude/ChatGPT threads (and during streaming, which mutates constantly) this is wasteful. Scope the observer to the conversation container and only process added nodes. The streaming-token mutation storm is the worst case.
- **P3-2 — `setInterval(checkUrlChange, 1000)`** (`content.js:721`) polls forever. Replace with a patched `history.pushState`/`replaceState` + `popstate` listener (both sites are SPAs using the History API).
- **P3-3 — `renderSidebar` wipes and rebuilds all folder DOM via `innerHTML`** (`content.js:449`+) on every change → flicker, lost scroll position inside the list, and discarded inline-edit state. Move to targeted/diffed updates (or at least preserve scrollTop and expanded state).
- **P3-4 — No storage schema version** (`STORAGE_KEY`, `content.js:53`). Adding `messageId`/`contentHash` (P0-1) needs a migration path; introduce `{ version, dialogues }` and migrate old index-only records on load.
- **P3-5 — README is stale/inconsistent** (`README.md` says Claude-only and documents a `CONFIG` object that no longer exists; manifest already supports ChatGPT/Gemini). Update after the work lands.

---

## 3. Specific completion plan (phased)

Each task lists the file/anchor to touch and a concrete acceptance check. Phases are ordered so the highest-impact correctness fixes land first.

### Phase 1 — Make the jump reliable (P0) — *highest impact*
1. **Add a site-aware message-anchor layer.** New helpers `getMessageId(el, site)` and `getContentHash(el)` near `extractCleanContent` (`content.js:116`). Extend `SITE_CONFIG` with `messageIdAttr` (ChatGPT: `data-message-id`) and `scrollContainerSelector`.
2. **Store the richer pin record** in the pin-creation path (`content.js:656-668`): `{ messageId, contentHash, messageIndex, snippet, timestamp }`.
3. **Rewrite resolution + jump** (`findMessageByIndex` `content.js:110`, `jumpToMessage` `content.js:571`): resolve by `messageId` → `contentHash` → `messageIndex`; if not mounted, scroll the configured container until it appears; center via `scrollend` not a fixed timeout; **never** auto-delete a pin just because it is off-screen (replace the orphan logic at `content.js:574-583`).
4. **Cross-conversation deep link** (`content.js:509-511`): open with `#pinboard=<id>`; in `init` (`content.js:740`) detect the hash and run the jump after messages load.
5. **Storage migration** (P3-4): on `loadAllDialogues` (`content.js:73`), wrap data as `{ version: 2, dialogues }` and backfill missing ids/hashes from current DOM where possible.

*Exit criteria:* pin → scroll away (virtualization) → reload → jump lands correctly on both Claude and ChatGPT, including cross-conversation deep links.

### Phase 2 — Site-specific UX (P1)
6. Fix ChatGPT title resolution and restore `cleanTitle`/`isMeaningfulTitle` (P1-1) — `content.js:60-70`, configs `content.js:32,38`.
7. Reposition the pin button to avoid native toolbars on both sites (P1-2) — `addPinButton` `content.js:615-688`.
8. Theme-aware sidebar via CSS variables + theme detection (P1-3) — Shadow style block `content.js:135-385`.
9. Rekey transient new-chat paths (P1-4) — `checkUrlChange` `content.js:702-709`.

*Exit criteria:* correct folder titles on ChatGPT; pin button never overlaps native UI; sidebar matches light/dark; no orphan folder after starting a fresh chat.

### Phase 3 — Feature gaps (P2)
10. Search box (P2-1), inline rename + notes (P2-2), export/import (P2-3), longer snippet/preview (P2-4), a11y + shortcut (P2-5), adjustable/dismissable toggle (P2-6).

*Exit criteria:* user can find a pin by text, rename folders, and back up/restore pins; sidebar is keyboard-usable.

### Phase 4 — Robustness & perf (P3) + docs
11. Scope + incremental MutationObserver (P3-1); History-API URL detection (P3-2); non-destructive `renderSidebar` updates (P3-3); update `README.md` (P3-5).

*Exit criteria:* no measurable jank during streaming on a long thread; sidebar list keeps scroll position across updates.

---

## 4. Effort / impact summary

| Item | Impact | Effort | Phase |
|------|:------:|:------:|:-----:|
| P0-1 stable pin identity | ★★★ | M | 1 |
| P0-2 robust jump | ★★★ | M | 1 |
| P0-3 cross-convo deep link | ★★ | S | 1 |
| P1-1 ChatGPT titles | ★★ | S | 2 |
| P1-2 button placement | ★★ | S | 2 |
| P1-3 light/dark theme | ★★ | M | 2 |
| P1-4 new-chat rekey | ★★ | S | 2 |
| P2-1…6 features | ★★ | M–L | 3 |
| P3-1…4 perf/robustness | ★ | M | 4 |

**Recommended first commit:** Phase 1 only — it restores the extension's core promise (reliable jump) that the `old-version-test` index revert broke, and is the prerequisite for everything else.

---

## 5. Open items to verify against live DOM before coding
The target sites change markup frequently; confirm these on the current builds before implementing:
- ChatGPT: exact stable id attribute on the assistant message node, and the scroll container element.
- Claude: whether a stable per-message id is exposed; otherwise rely on the content-hash fallback.
- Both: current native hover-toolbar geometry (for P1-2) and theme class names on `<html>`/`<body>` (for P1-3).
