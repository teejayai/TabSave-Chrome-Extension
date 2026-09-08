import { renderTabCard } from "./TabCard";
import { renderIcon } from "../icons";
import type { GroupMeta, SavedTab } from "../../shared/types";

export interface GroupSectionProps {
  group: GroupMeta;
  tabs: SavedTab[];
  expanded: boolean;
  activeTabMenuId: string | null;
}

export function renderGroupSection(props: GroupSectionProps): HTMLElement {
  const section = document.createElement("section");
  section.className = `group-card${props.expanded ? " group-card--expanded" : ""}`;
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

  // Figma order: delete-02, open link, chevron-down.
  const actions = document.createElement("div");
  actions.className = "group-card__actions";
  actions.innerHTML = `
    <button type="button" class="icon-button" data-action="toggle-delete-group" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-label="Delete ${escapeHtml(props.group.name)}">
      ${renderIcon("delete02")}
    </button>
    <button type="button" class="icon-button" data-action="toggle-open-menu" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-haspopup="menu" aria-label="Open ${escapeHtml(props.group.name)}">
      ${renderIcon("openLink")}
    </button>
    <button type="button" class="icon-button icon-button--chevron${
      props.expanded ? " icon-button--chevron-open" : ""
    }" data-action="toggle-group" data-group-name="${escapeHtml(
      props.group.name
    )}" aria-expanded="${String(props.expanded)}" aria-label="${
      props.expanded ? "Collapse" : "Expand"
    } ${escapeHtml(props.group.name)}">
      ${renderIcon("chevronDown")}
    </button>
  `;

  header.append(meta, actions);
  section.append(header);

  if (props.expanded) {
    const divider = document.createElement("div");
    divider.className = "group-divider";
    section.append(divider);

    const panel = document.createElement("div");
    panel.className = "group-card__panel";

    for (const tab of props.tabs) {
      panel.append(
        renderTabCard({
          tab,
          menuOpen: props.activeTabMenuId === tab.id
        })
      );
    }

    section.append(panel);
  }

  return section;
}

// Highlights/*-Dark tokens from the Figma design system.
function getGroupColor(color?: chrome.tabGroups.ColorEnum): string {
  switch (color) {
    case "blue":
      return "#2565cc";
    case "cyan":
      return "#00808e";
    case "green":
      return "#006e04";
    case "grey":
      return "#6c6c6c";
    case "orange":
      return "#c74926";
    case "pink":
      return "#b6007a";
    case "purple":
      return "#6525cc";
    case "red":
      return "#b60000";
    case "yellow":
      return "#ae9a00";
    default:
      return "#6525cc";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
