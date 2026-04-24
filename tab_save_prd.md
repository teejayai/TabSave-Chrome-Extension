# TabSave — Browser Extension PRD
**Version:** 1.1.0  
**Status:** Ready for Scaffolding  
**Last Updated:** 2026-04-23  
**Stack:** Chrome Extension (Manifest V3) · TypeScript · Tailwind CSS · Chrome APIs

---

## 1. Problem Statement

Users accumulate tabs during browsing sessions and lose track of useful links. Chrome provides no native way to save, name, and restore tab sessions as structured groups. Users resort to bookmarks (unstructured) or third-party apps (heavyweight).

**TabSave solves this with one click:** save tabs, auto-group them, and restore them as Chrome tab groups later. On first install, TabSave also inherits any tab groups the user already has open in Chrome — so existing work is never lost and the extension is immediately useful from the moment it's added.

---

## 2. Target Users

| User Type | Primary Need |
|---|---|
| Developers | Save docs and references per project |
| Designers | Collect inspiration per brief |
| Researchers | Manage multi-topic browsing sessions |
| Power users | Switch between work contexts cleanly |

---

## 3. Scope

### 3.1 In Scope (v1)
- Save current tab (1-click)
- Save all tabs in current window
- Auto-group by domain; manual custom group names
- Popup UI showing saved groups and tabs
- Open single saved tab
- Open entire group (current window or new window)
- Restore group as Chrome Tab Group (with label)
- Delete individual tabs or entire groups
- Context menu actions (right-click on any page)
- Persist all data locally via `chrome.storage.local`
- **Inherit existing Chrome tab groups on install** — on `onInstalled`, read all open tab groups across all windows and import them into TabSave storage, preserving their labels, colors, and member tabs
- **Create custom group ("New" button)** — user can create a named empty group from the popup; subsequently saved tabs can be assigned to it, overriding auto-domain grouping

### 3.2 Out of Scope (v1)
- Cloud sync or cross-device support
- User authentication
- Session sharing
- Drag-and-drop reordering
- Analytics or usage tracking

---

## 4. User Stories

```
US-01  As a user, I can save my active tab in one click so I don't lose it mid-session.
US-02  As a user, I can save all tabs in my current window as a named session.
US-03  As a user, I can see all saved tabs grouped by domain or custom topic in the popup.
US-04  As a user, I can create a custom named group (e.g. "Client Work") to override auto-grouping.
US-05  As a user, I can open a single saved tab without restoring the whole group.
US-06  As a user, I can restore an entire group in one click as new tabs in my current window.
US-07  As a user, I can restore an entire group in a new window for a fresh workspace.
US-08  As a user, restored groups are opened as Chrome Tab Groups with the group label applied.
US-09  As a user, I can delete a single saved tab or clear a whole group.
US-10  As a user, I can right-click any page and access Save Tab / Save Window actions.
US-11  As a user, when I install TabSave, all my existing Chrome tab groups are automatically
       imported into TabSave so I don't lose any context I already had open.
US-12  As a user, I can click "New" to create a custom named group so I can organise tabs
       by topic rather than domain.
US-13  As a user, when saving a tab I can select an existing custom group to assign it to,
       overriding the default auto-domain grouping.
US-14  As a user, I can see my custom groups listed alongside auto-domain groups in the popup
       with a visual indicator distinguishing the two.
```

---

## 5. Data Model

### 5.1 SavedTab

```ts
interface SavedTab {
  id: string;              // UUID — generated at save time
  url: string;             // Full URL
  title: string;           // Page title
  domain: string;          // Extracted hostname (no "www.")
  favicon?: string;        // favicon URL (optional)
  group: string;           // Auto-domain name or user-defined group name
  groupColor?: ChromeTabGroupColor; // Preserved from inherited Chrome tab group
  sessionId?: string;      // Links tabs saved together as a window session
  importedGroupId?: number; // Original Chrome tabGroup ID — set only on inherited groups
  source: "manual" | "window" | "inherited"; // How this tab entered TabSave
  createdAt: number;       // Unix timestamp (ms)
}
```

### 5.2 Storage Shape

```ts
// chrome.storage.local schema
{
  tabs: SavedTab[];       // All saved tabs, flat array
  groups: GroupMeta[];    // User-defined and inherited group metadata
}

interface GroupMeta {
  name: string;                     // Group label (matches SavedTab.group)
  createdAt: number;
  color?: ChromeTabGroupColor;      // Preserved from Chrome tab group
  type: "auto" | "custom" | "inherited"; // How the group was created
  inherited?: boolean;              // true if imported from existing Chrome tab group on install
  originalGroupId?: number;         // Chrome tabGroup ID at time of import
}
```

### 5.3 Derived State (computed at render time)

```ts
// Group tabs for display — computed in popup, not stored
const grouped: Record<string, SavedTab[]> = tabs.reduce((acc, tab) => {
  acc[tab.group] = [...(acc[tab.group] || []), tab];
  return acc;
}, {});
```

---

## 6. Architecture

```
tabsave/
├── manifest.json              # MV3 manifest
├── src/
│   ├── background/
│   │   └── service-worker.ts  # All Chrome API logic
│   ├── popup/
│   │   ├── index.html         # Popup entry point
│   │   ├── popup.ts           # Popup controller
│   │   └── components/
│   │       ├── GroupSection.ts
│   │       └── TabCard.ts
│   ├── shared/
│   │   ├── storage.ts         # Storage read/write helpers
│   │   ├── tabs.ts            # Tab capture helpers
│   │   └── types.ts           # Shared interfaces
│   └── styles/
│       └── popup.css          # Tailwind entry
├── public/
│   └── icons/                 # 16, 48, 128px icons
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 7. Module Responsibilities

### 7.1 `service-worker.ts`
- Register context menu items on `chrome.runtime.onInstalled`
- **On `onInstalled` (reason: `"install"`)**: run `inheritExistingTabGroups()` to import all open Chrome tab groups before the user interacts with the extension
- Handle `chrome.contextMenus.onClicked`
- Listen for messages from popup (`SAVE_TAB`, `SAVE_WINDOW`, `OPEN_GROUP`, `OPEN_GROUP_NEW_WINDOW`)
- Execute tab group creation via `chrome.tabs.group` + `chrome.tabGroups.update`

### 7.2 `storage.ts`
- `getTabs(): Promise<SavedTab[]>`
- `saveTabs(tabs: SavedTab[]): Promise<void>`
- `addTab(tab: SavedTab): Promise<void>`
- `deleteTab(id: string): Promise<void>`
- `deleteGroup(groupName: string): Promise<void>`
- `getGroups(): Promise<GroupMeta[]>`
- `saveGroup(group: GroupMeta): Promise<void>`

### 7.3 `tabs.ts`
- `getCurrentTab(): Promise<chrome.tabs.Tab>`
- `getAllWindowTabs(): Promise<chrome.tabs.Tab[]>`
- `extractDomain(url: string): string`
- `buildSavedTab(tab: chrome.tabs.Tab, group: string, source: SavedTab["source"]): SavedTab`
- `generateSessionId(): string`
- `inheritExistingTabGroups(): Promise<void>` — queries all tab groups and their member tabs across all windows, converts them to `SavedTab[]` and `GroupMeta[]`, and writes to storage

### 7.4 `popup.ts`
- On load: read storage, group tabs by `tab.group`, render `GroupSection` per group
- Handle button actions: delegate to service worker via `chrome.runtime.sendMessage`
- Handle delete actions locally and update storage

---

## 8. Core Logic

### Save current tab
```ts
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const domain = new URL(tab.url!).hostname.replace("www.", "");
  const saved: SavedTab = {
    id: crypto.randomUUID(),
    url: tab.url!,
    title: tab.title!,
    domain,
    favicon: tab.favIconUrl,
    group: domain, // default to domain; user can rename
    createdAt: Date.now(),
  };
  addTab(saved);
});
```

### Save full window session
```ts
chrome.tabs.query({ currentWindow: true }, (tabs) => {
  const sessionId = crypto.randomUUID();
  const saved = tabs.map(tab => buildSavedTab(tab, extractDomain(tab.url!), sessionId));
  addTabs(saved);
});
```

### Open group in current window
```ts
async function openGroupCurrentWindow(urls: string[], label: string) {
  const tabIds: number[] = [];
  for (const url of urls) {
    const tab = await chrome.tabs.create({ url });
    tabIds.push(tab.id!);
  }
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, { title: label });
}
```

### Open group in new window
```ts
async function openGroupNewWindow(urls: string[], label: string) {
  const win = await chrome.windows.create({ url: urls });
  const tabIds = win.tabs!.map(t => t.id!);
  const groupId = await chrome.tabs.group({ tabIds, windowId: win.id });
  await chrome.tabGroups.update(groupId, { title: label });
}
```

### Context menu setup
```ts
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-tab",    title: "TabSave: Save This Tab",   contexts: ["page"] });
  chrome.contextMenus.create({ id: "save-window", title: "TabSave: Save All Tabs",   contexts: ["page"] });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "save-tab")    handleSaveCurrentTab();
  if (info.menuItemId === "save-window") handleSaveWindow();
});
```

### Create a custom group ("New" button)
```ts
// Triggered when user clicks [New] in the popup
async function createCustomGroup(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return; // reject empty names silently

  const existing = await getGroups();
  const duplicate = existing.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
  if (duplicate) throw new Error(`Group "${trimmed}" already exists`);

  const group: GroupMeta = {
    name: trimmed,
    createdAt: Date.now(),
    type: "custom",
  };

  await saveGroup(group);
}
```

**UI flow for "New" button:**
1. User clicks `[New]` → an inline input field appears in the popup (no modal, no new page)
2. User types a group name → presses Enter or clicks a confirm checkmark
3. `createCustomGroup(name)` is called → group is persisted to storage
4. The new empty group appears in the popup group list immediately
5. On subsequent "Save Tab" actions, a group selector dropdown lets the user pick this custom group instead of auto-domain

**Assigning a tab to a custom group on save:**
```ts
// Extended save flow — if user selects a custom group before saving
async function saveTabToGroup(groupName: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url) return;

  const saved: SavedTab = {
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    domain: extractDomain(tab.url),
    favicon: tab.favIconUrl,
    group: groupName,        // overrides auto-domain
    source: "manual",
    createdAt: Date.now(),
  };

  await addTab(saved);
}
```

**Edge cases handled:**
- Empty name input is rejected before storage write
- Duplicate group names (case-insensitive) throw an error surfaced as inline validation in the popup
- A custom group with no tabs is valid — it persists as an empty group until the user deletes it
- Auto-domain grouping remains the default; custom group assignment is always opt-in per save action

### Inherit existing tab groups on install
```ts
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return; // only run on fresh install, not updates

  // 1. Get all tab groups across all windows
  const chromeGroups = await chrome.tabGroups.query({});

  if (chromeGroups.length === 0) return;

  const savedTabs: SavedTab[] = [];
  const groupMetas: GroupMeta[] = [];

  for (const group of chromeGroups) {
    // 2. Get all tabs belonging to this group
    const groupTabs = await chrome.tabs.query({ groupId: group.id });

    // 3. Build GroupMeta — use group title or fall back to first domain
    const label = group.title?.trim() || extractDomain(groupTabs[0]?.url || "untitled");

    groupMetas.push({
      name: label,
      createdAt: Date.now(),
      color: group.color,
      inherited: true,
      originalGroupId: group.id,
    });

    // 4. Build SavedTab for each member tab
    for (const tab of groupTabs) {
      if (!tab.url || tab.url.startsWith("chrome://")) continue; // skip internal pages
      savedTabs.push({
        id: crypto.randomUUID(),
        url: tab.url,
        title: tab.title || tab.url,
        domain: extractDomain(tab.url),
        favicon: tab.favIconUrl,
        group: label,
        groupColor: group.color,
        importedGroupId: group.id,
        source: "inherited",
        createdAt: Date.now(),
      });
    }
  }

  // 5. Merge with any existing storage (safe for re-installs)
  const existing = await getTabs();
  await saveTabs([...existing, ...savedTabs]);
  const existingGroups = await getGroups();
  await saveGroups([...existingGroups, ...groupMetas]);
});
```

**Edge cases handled:**
- Groups with no title fall back to the domain of the first tab in the group
- `chrome://` and `edge://` internal tabs are skipped — they cannot be saved or reopened programmatically
- Re-install guard: the `reason !== "install"` check prevents duplicate imports on extension updates
- Empty group state: if the user has no tab groups open at install time, the function exits early with no side effects

---

## 9. Manifest (v3)

```json
{
  "manifest_version": 3,
  "name": "TabSave",
  "version": "1.0.0",
  "description": "Save, group, and restore browser tabs as sessions.",
  "permissions": ["tabs", "storage", "tabGroups", "contextMenus", "windows"],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16":  "public/icons/icon16.png",
      "48":  "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  }
}
```

---

## 10. Popup UI Layout

```
┌─────────────────────────────────────────┐
│  TabSave                    [⚙ Settings] │
├─────────────────────────────────────────┤
│  [+ Save Tab]        [+ Save All Tabs]  │
├─────────────────────────────────────────┤
│  [Auto-group by domain ▾]  [＋ New]     │
├─────────────────────────────────────────┤
│  GROUPED TABS                           │
│                                         │
│  ● Work  4       [🗑] [↗] [∨]           │  ← inherited / custom group
│  ● Design  10    [🗑] [↗] [∨]           │
│  ● Research  3   [🗑] [↗] [∨]           │
│                                         │
│  ▾ github.com  2  [🗑] [↗↗] [↗⬜] [∨]  │  ← auto-domain group (expanded)
│  ┌───────────────────────────────────┐  │
│  │ 🔵 react/react · github.com   [✕] │  │  ← TabCard: favicon, title, delete
│  │ 🔵 vitejs/vite · github.com   [✕] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ── NEW GROUP INLINE INPUT (on click) ──│
│  ┌───────────────────────┐ [✓] [✕]     │
│  │ Group name...         │              │
│  └───────────────────────┘              │
└─────────────────────────────────────────┘

Icon key:
  [↗↗]  = Open group in current window
  [↗⬜] = Open group in new window
  [🗑]  = Delete group
  [∨]   = Expand / collapse tabs
  [✕]   = Delete individual tab
  ●     = Group color dot (purple / orange / blue / green / red)
  Custom groups show a small tag icon to distinguish from auto-domain groups
```

---

## 11. Build Order

```
Phase 1 — Foundation
  [ ] 1. Init project: npm, TypeScript, Tailwind, esbuild/webpack
  [ ] 2. Write manifest.json with all permissions
  [ ] 3. Define all types in shared/types.ts

Phase 2 — Core Logic
  [ ] 4. Implement storage.ts helpers
  [ ] 5. Implement tabs.ts helpers
  [ ] 6. Implement save current tab (service worker)
  [ ] 7. Implement save full window session (service worker)

Phase 3 — Popup UI
  [ ] 8.  Build popup index.html shell + Tailwind setup
  [ ] 9.  Load and render grouped tabs from storage
  [ ] 10. Implement open single tab action
  [ ] 11. Implement open group (current window) action
  [ ] 12. Implement open group (new window) action
  [ ] 13. Implement delete tab / delete group
  [ ] 14. Implement "New" button — inline group name input, validation, persist to storage
  [ ] 15. Implement group selector dropdown on Save Tab action (auto-domain vs custom group)

Phase 4 — Chrome Integration
  [ ] 16. Wire Chrome Tab Group creation on restore
  [ ] 17. Register and handle context menu actions
  [ ] 18. Implement inheritExistingTabGroups() on onInstalled

Phase 5 — Polish
  [ ] 19. Add empty state (no saved tabs yet)
  [ ] 20. Add inline validation for duplicate/empty custom group names
  [ ] 21. Add loading/saving feedback states
  [ ] 22. Cross-browser QA (Chrome stable + Canary)
  [ ] 23. Icon assets (16, 48, 128px)
```

---

## 12. Post-MVP Backlog

| Feature | Notes |
|---|---|
| Keyword search across saved tabs | Filter by title or URL in popup |
| Keyboard shortcut | `Ctrl+Shift+S` to save tab without opening popup |
| Rename groups | Inline edit group label |
| Tab group color picker | Map group to Chrome tab group colors |
| Cloud sync | `chrome.storage.sync` or external backend |
| Export / import | JSON export of all saved sessions |

---

## 13. Definition of Done (v1)

- [ ] Save current tab persists to `chrome.storage.local`
- [ ] Save window captures all tabs with shared `sessionId`
- [ ] Popup renders all groups with correct tabs
- [ ] Open single tab launches correct URL
- [ ] Open group opens all URLs as tabs in current window
- [ ] Open group in new window creates a new Chrome window
- [ ] Restored tabs are assigned to a Chrome Tab Group with label
- [ ] Delete tab removes only that tab from storage
- [ ] Delete group removes all tabs with that group name
- [ ] Context menu appears on right-click and triggers correct actions
- [ ] All data persists across popup close and browser restart
- [ ] UI is functional and usable within popup constraints (400px wide)
- [ ] "New" button renders an inline input — no modal or navigation
- [ ] Custom group is created on Enter / confirm and appears in the group list immediately
- [ ] Empty and duplicate group names are rejected with inline validation messaging
- [ ] Save Tab action offers a group selector — defaults to auto-domain, allows custom group override
- [ ] Custom groups are visually distinguishable from auto-domain groups in the popup
