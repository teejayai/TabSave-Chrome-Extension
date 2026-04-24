# AGENTS.md

## Purpose

This file defines project-specific guidance for coding agents working in `TabSave`.

## Project

- Name: `TabSave`
- Type: Chrome Extension (Manifest V3)
- Stack: TypeScript, esbuild, Tailwind CSS

## Working Rules

- Preserve the existing extension architecture under `src/background`, `src/shared`, and `src/popup`.
- Keep popup UI changes aligned with the Figma design source when implementing visual updates.
- Prefer small, scoped edits over broad refactors.
- Do not introduce external services or databases; persistence stays in `chrome.storage.local`.
- Keep Chrome API usage defensive and fail silently when APIs are unavailable.

## Build And Verify

- Install dependencies: `npm install`
- Build: `npm run build`
- Output directory: `dist/`

## Key Files

- Manifest: `manifest.json`
- Background worker: `src/background/service-worker.ts`
- Shared types: `src/shared/types.ts`
- Popup entry: `src/popup/popup.ts`
- Popup styles: `src/styles/popup.css`

## Notes For Future Updates

- Add testing guidance here if automated tests are introduced.
- Add coding conventions here if the team wants stricter component or styling rules.
- Add release or packaging steps here if the extension publishing workflow is formalized.
