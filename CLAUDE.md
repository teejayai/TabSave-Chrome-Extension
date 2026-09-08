# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TabSave — Chrome Extension (Manifest V3) that saves, groups, and restores browser tabs. TypeScript + esbuild + Tailwind, no framework. Product spec lives in `tab_save_prd.md`.

## Commands

```bash
npm install
npm run build          # clean + esbuild bundle + tailwind css -> dist/
npm run build:js       # esbuild only (also copies manifest.json, public/, index.html)
npm run build:css      # tailwind only
npm run watch:js       # esbuild watch (does NOT re-copy html/public; re-run build:js for those)
npm run watch:css
npm run typecheck      # tsc --noEmit
npm run test:e2e       # playwright; requires a fresh `npm run build` first
npx playwright test tests/e2e/extension.spec.ts -g "duplicate group names"   # single test
```

To see changes in a real browser: `npm run build`, then `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`. Reload the extension there after each rebuild.

E2E tests launch a persistent Chromium with `--load-extension=dist`, so they exercise the built output, not `src/`. They run non-headless and serially (`workers: 1`).

### Known pre-existing failures (not regressions)

- `npm run typecheck` is **not** clean: `chrome.tabGroups.ColorEnum` errors from a stale `@types/chrome`, plus several `chrome.tabs.group`/`highlight` signature mismatches in `service-worker.ts`. Check whether an error predates your change before chasing it.
- The e2e test `should create a custom group and defer grouping` intermittently fails with a Playwright strict-mode violation (two saved tabs both titled "Example Domain").

## Architecture

Three layers, and the boundary between them is the important part:

**`src/background/service-worker.ts`** — the only place that mutates Chrome state. Owns tab/tabGroup/contextMenu APIs, all writes to `chrome.storage.local`, and two-way sync. Registered listeners: runtime messages, `onInstalled`/`onStartup`, context menus, and `chrome.tabGroups` + `chrome.tabs` events (`registerChromeSyncListeners`).

**`src/shared/`** — `types.ts` (data shapes + the `BackgroundMessage` union), `storage.ts` (thin `chrome.storage.local` accessors, keys `tabs` and `groups`), `tabs.ts` (tab → `SavedTab` mapping, domain extraction, group inheritance).

**`src/popup/`** — read-only view. It reads `chrome.storage.local` directly to render, but **never mutates Chrome state**; every mutation goes through `chrome.runtime.sendMessage(BackgroundMessage)`.

### Message contract

Every background handler resolves to `{ ok: true }` or `{ ok: false, error: string }`; the popup's `sendMessage` throws on `!ok` and the caller turns that into an error toast. Adding an action means touching three places:

1. `src/shared/types.ts` — new interface + add it to the `BackgroundMessage` union
2. `service-worker.ts` — new `case` in `handleRuntimeMessage`
3. `popup.ts` — new `case` in `handleAction`, dispatched from a `data-action` attribute

### Group identity

Groups are keyed by **name** (a string) everywhere in storage — there is no group id in `GroupMeta` other than `originalGroupId`, which links back to a live Chrome tab group. Renaming a group rewrites every `SavedTab.group` that references it (`renameSavedGroup`). Saved groups are mirrored into real Chrome tab groups, and Chrome-side edits (rename, recolor, remove, tab moved in/out) sync back into storage.

### Popup rendering model

No framework, no vdom: state lives in a single `PopupState` object and **every** change calls `renderPopup(state)`, which re-renders each region from scratch. Consequences to respect:

- All interaction is event delegation on `#app` keyed off `data-action` — component code emits `data-action` attributes, never attaches listeners.
- Dialogs and popovers render into `#overlay-slot`, not inline in the list. Anchored popovers are positioned imperatively by `anchorPopover()` after they mount.
- `chrome.storage.onChanged` triggers a re-hydrate + re-render, so background mutations show up without the popup asking.

## Styling and design

The Figma file is the source of truth for the popup; match it exactly (tokens, spacing, icon set) rather than approximating. The popup is a fixed 360×480 surface.

- **`src/styles/popup.css` component styles must stay OUTSIDE `@layer`.** Tailwind tree-shakes classes inside `@layer components` that it can't find literally in the content globs, which silently deletes any class composed at runtime (e.g. `toast--${tone}`). Only `@tailwind base` is used; everything else is hand-written CSS.
- Colors/radii are CSS custom properties on `:root` named after the Figma variable collection (`--surface-on-background`, `--buttons-primary`, `--highlight-green-light`, …). Add tokens there rather than hardcoding hex values in rules.
- Icons are inlined as path data in `src/popup/icons.ts`, each keeping its native Figma viewBox and stroke width and using `currentColor`. Source SVGs are in `public/icons/figma/`. `public/untitled icons/` is an unused legacy icon library — don't source new icons from it.

## Conventions (from AGENTS.md)

- Persistence stays in `chrome.storage.local`; no external services or databases.
- Chrome API usage is defensive — feature-check and fail silently when an API is unavailable (the popup and tests run in contexts where some APIs are missing).
- Prefer small, scoped edits over broad refactors; preserve the `background` / `shared` / `popup` split.

## Build output layout

`scripts/build.mjs` bundles `service-worker.ts` and `popup.ts` as ESM and copies `manifest.json`, `public/`, and `src/popup/index.html` into `dist/`, **preserving the `src/...` path structure**. That is why `manifest.json` points at `src/background/service-worker.js` and why relative asset paths like `../../public/icons/...` resolve identically in source and in the built extension. Keep that mirroring in mind when adding files.
