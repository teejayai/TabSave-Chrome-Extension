import type { SavedTab } from "../../shared/types";

export interface TabCardProps {
  tab: SavedTab;
  menuOpen: boolean;
  confirmDelete: boolean;
}

export function renderTabCard(props: TabCardProps): HTMLElement {
  const article = document.createElement("article");
  article.className = "tab-card";
  article.dataset.tabId = props.tab.id;

  const meta = document.createElement("div");
  meta.className = "tab-card__meta";
  meta.append(renderFavicon(props.tab));

  const content = document.createElement("div");
  content.className = "tab-card__content";
  content.innerHTML = `
    <p class="tab-card__title">${escapeHtml(props.tab.title)}</p>
    <p class="tab-card__domain">${escapeHtml(trimUrl(props.tab.url))}</p>
  `;
  meta.append(content);

  const actions = document.createElement("div");
  actions.className = "tab-card__actions";
  actions.innerHTML = `
    <button type="button" class="icon-button" data-action="toggle-open-tab-menu" data-tab-id="${escapeHtml(
      props.tab.id
    )}" aria-label="Open ${escapeHtml(props.tab.title)} options">
      ${renderOpenIcon()}
    </button>
    <button type="button" class="icon-button icon-button--danger" data-action="toggle-delete-tab" data-tab-id="${escapeHtml(
      props.tab.id
    )}" aria-label="Delete ${escapeHtml(props.tab.title)}">
      ${renderTrashIcon()}
    </button>
  `;

  article.append(meta, actions);

  if (props.menuOpen) {
    article.append(renderTabOpenMenu(props.tab));
  }

  if (props.confirmDelete) {
    article.append(renderDeleteConfirm(props.tab));
  }

  return article;
}

function renderTabOpenMenu(tab: SavedTab): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "tab-inline-panel";
  menu.innerHTML = `
    <button type="button" class="group-option" data-action="open-tab" data-tab-id="${escapeHtml(tab.id)}">
      ${renderWindowIcon()}
      <span>Open in current window</span>
    </button>
    <button type="button" class="group-option" data-action="open-tab-new-window" data-tab-id="${escapeHtml(tab.id)}">
      ${renderNewWindowIcon()}
      <span>Open in new window</span>
    </button>
  `;
  return menu;
}

function renderDeleteConfirm(tab: SavedTab): HTMLElement {
  const confirm = document.createElement("div");
  confirm.className = "confirm-popover confirm-popover--inline";
  confirm.innerHTML = `
    <p class="confirm-popover__title">Delete saved tab?</p>
    <p class="confirm-popover__body">This removes the tab from TabSave and ungroups it in Chrome if it is still grouped.</p>
    <div class="confirm-popover__actions">
      <button type="button" class="confirm-popover__button" data-action="cancel-delete-tab" data-tab-id="${escapeHtml(
        tab.id
      )}">Cancel</button>
      <button type="button" class="confirm-popover__button confirm-popover__button--danger" data-action="delete-tab" data-tab-id="${escapeHtml(
        tab.id
      )}">Delete</button>
    </div>
  `;
  return confirm;
}

function renderFavicon(tab: SavedTab): HTMLElement {
  if (tab.favicon) {
    const image = document.createElement("img");
    image.className = "tab-card__favicon";
    image.src = tab.favicon;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.replaceWith(createFallbackIcon(tab.domain));
    });
    return image;
  }

  return createFallbackIcon(tab.domain);
}

function createFallbackIcon(domain: string): HTMLElement {
  const fallback = document.createElement("span");
  fallback.className = "tab-card__favicon tab-card__favicon--fallback";
  fallback.textContent = domain.slice(0, 1) || "T";
  return fallback;
}

function trimUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function renderOpenIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7.58 2.92h3.5v3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.5 3.5L6.13 7.87" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M11.08 7.29v2.04a1.17 1.17 0 0 1-1.17 1.17H4.67A1.17 1.17 0 0 1 3.5 9.33V4.09a1.17 1.17 0 0 1 1.17-1.17h2.04" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderTrashIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 4.08H10.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M5.25 2.92h3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M4.08 4.08l.47 5.3c.04.52.48.92 1 .92h2.9c.52 0 .96-.4 1-.92l.47-5.3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.83 5.83v2.92M8.17 5.83v2.92" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
  `;
}

function renderWindowIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.04" y="3.21" width="9.92" height="7.58" rx="1.1" stroke="currentColor" stroke-width="1.1"/>
      <path d="M2.62 5.25h8.76" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
  `;
}

function renderNewWindowIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.04" y="3.21" width="7.58" height="7.58" rx="1.1" stroke="currentColor" stroke-width="1.1"/>
      <path d="M7.29 2.92h3.79v3.79" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M11.08 2.92L6.71 7.29" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
    </svg>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
