import { renderIcon } from "../icons";
import type { SavedTab } from "../../shared/types";

export interface TabCardProps {
  tab: SavedTab;
  menuOpen: boolean;
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
    <p class="tab-card__domain">${escapeHtml(props.tab.url)}</p>
  `;
  meta.append(content);

  // Figma order: open link, delete-02.
  const actions = document.createElement("div");
  actions.className = "tab-card__actions";
  actions.innerHTML = `
    <button type="button" class="icon-button" data-action="toggle-open-tab-menu" data-tab-id="${escapeHtml(
      props.tab.id
    )}" aria-haspopup="menu" aria-expanded="${String(props.menuOpen)}" aria-label="Open ${escapeHtml(
      props.tab.title
    )}">
      ${renderIcon("openLink")}
    </button>
    <button type="button" class="icon-button" data-action="toggle-delete-tab" data-tab-id="${escapeHtml(
      props.tab.id
    )}" aria-label="Delete ${escapeHtml(props.tab.title)}">
      ${renderIcon("delete02")}
    </button>
  `;

  article.append(meta, actions);

  return article;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
