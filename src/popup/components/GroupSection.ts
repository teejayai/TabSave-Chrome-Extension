import { renderTabCard } from "./TabCard";
import type { GroupMeta, SavedTab } from "../../shared/types";

export interface GroupSectionProps {
  group: GroupMeta;
  tabs: SavedTab[];
  expanded: boolean;
  menuOpen: boolean;
  confirmDelete: boolean;
}

export function renderGroupSection(props: GroupSectionProps): HTMLElement {
  const section = document.createElement("section");
  section.className = "group-card";
  section.dataset.groupName = props.group.name;

  const header = document.createElement("div");
  header.className = "group-card__header";

  const meta = document.createElement("div");
  meta.className = "group-card__meta";
  meta.innerHTML = `
    <span class="group-card__dot" style="background:${getGroupColor(props.group.color)}"></span>
    <span class="group-card__name">${escapeHtml(props.group.name)}</span>
    <span class="group-card__count">${props.tabs.length}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "group-card__actions";
  actions.innerHTML = `
    <button type="button" class="icon-button icon-button--danger" data-action="toggle-delete-group" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-label="Delete ${escapeHtml(props.group.name)}">
      ${renderTrashIcon()}
    </button>
    <button type="button" class="icon-button" data-action="toggle-open-menu" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-label="Open ${escapeHtml(props.group.name)} options">
      ${renderOpenIcon()}
    </button>
    <button type="button" class="icon-button" data-action="toggle-group" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-expanded="${String(props.expanded)}" aria-label="${props.expanded ? "Collapse" : "Expand"} ${escapeHtml(
      props.group.name
    )}">
      ${renderChevronIcon(props.expanded)}
    </button>
  `;

  header.append(meta, actions);
  section.append(header);

  if (props.menuOpen) {
    section.append(renderOpenMenu(props.group.name));
  }

  if (props.confirmDelete) {
    section.append(renderDeleteConfirm(props.group.name));
  }

  if (props.expanded) {
    const panel = document.createElement("div");
    panel.className = "group-card__panel";

    const divider = document.createElement("div");
    divider.className = "group-divider";
    panel.append(divider);

    for (const tab of props.tabs) {
      panel.append(renderTabCard({ tab }));
    }

    section.append(panel);
  }

  return section;
}

function renderOpenMenu(groupName: string): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "group-options";
  menu.innerHTML = `
    <button type="button" class="group-option" data-action="open-group" data-group-name="${escapeHtml(
      groupName
    )}">
      ${renderWindowIcon()}
      <span>Open in current window</span>
    </button>
    <button type="button" class="group-option" data-action="open-group-new-window" data-group-name="${escapeHtml(
      groupName
    )}">
      ${renderNewWindowIcon()}
      <span>Open in new window</span>
    </button>
  `;
  return menu;
}

function renderDeleteConfirm(groupName: string): HTMLElement {
  const confirm = document.createElement("div");
  confirm.className = "confirm-popover";
  confirm.innerHTML = `
    <p class="confirm-popover__title">Delete tab group?</p>
    <p class="confirm-popover__body">This removes the saved group and disconnects its synced Chrome tab group.</p>
    <div class="confirm-popover__actions">
      <button type="button" class="confirm-popover__button" data-action="cancel-delete-group" data-group-name="${escapeHtml(
        groupName
      )}">Cancel</button>
      <button type="button" class="confirm-popover__button confirm-popover__button--danger" data-action="delete-group" data-group-name="${escapeHtml(
        groupName
      )}">Delete</button>
    </div>
  `;
  return confirm;
}

function getGroupColor(color?: chrome.tabGroups.ColorEnum): string {
  switch (color) {
    case "blue":
      return "#2563EB";
    case "cyan":
      return "#06B6D4";
    case "green":
      return "#16A34A";
    case "grey":
      return "#9CA3AF";
    case "orange":
      return "#F95B2F";
    case "pink":
      return "#EC4899";
    case "purple":
      return "#7C3AED";
    case "red":
      return "#DC2626";
    case "yellow":
      return "#EAB308";
    default:
      return "#7C3AED";
  }
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

function renderOpenIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7.58 2.92h3.5v3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10.5 3.5L6.13 7.87" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M11.08 7.29v2.04a1.17 1.17 0 0 1-1.17 1.17H4.67A1.17 1.17 0 0 1 3.5 9.33V4.09a1.17 1.17 0 0 1 1.17-1.17h2.04" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function renderChevronIcon(expanded: boolean): string {
  const rotation = expanded ? "rotate(180 9 9)" : "";
  return `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <g transform="${rotation}">
        <path d="M5.25 7.5L9 11.25L12.75 7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
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
