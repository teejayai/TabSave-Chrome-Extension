import { getGroups, getTabs } from "../shared/storage";
import { renderGroupSection } from "./components/GroupSection";
import { renderNewGroupInput } from "./components/NewGroupInput";
import type { BackgroundMessage, GroupMeta, GroupedTabs, SavedTab } from "../shared/types";

export interface PopupState {
  groups: GroupMeta[];
  tabs: SavedTab[];
  groupedTabs: GroupedTabs;
  selectedGroupName: string;
  isCreatingGroup: boolean;
  groupDraft: string;
  validationMessage: string | null;
  toast: {
    tone: "success" | "error";
    message: string;
  } | null;
  expandedGroups: Set<string>;
  activeMenuGroupName: string | null;
  confirmDeleteGroupName: string | null;
}

export function bootstrapPopup(): void {
  document.addEventListener("DOMContentLoaded", () => {
    void initializePopup();
  });
}

export async function initializePopup(): Promise<void> {
  const state = createInitialState();
  await hydrateState(state);
  renderPopup(state);
  bindPopupEvents(state);
}

export function createInitialState(): PopupState {
  return {
    groups: [],
    tabs: [],
    groupedTabs: {},
    selectedGroupName: "auto",
    isCreatingGroup: false,
    groupDraft: "",
    validationMessage: null,
    toast: null,
    expandedGroups: new Set<string>(),
    activeMenuGroupName: null,
    confirmDeleteGroupName: null
  };
}

export function renderPopup(state: PopupState): void {
  renderHeader(state);
  renderToolbar(state);
  renderToast(state);
  renderGroups(state);
}

function renderHeader(state: PopupState): void {
  const badge = getRequiredElement("tab-count-badge");
  const count = state.tabs.length;
  badge.textContent = `${count} Tab${count === 1 ? "" : "s"}`;
}

function renderToolbar(state: PopupState): void {
  const select = getRequiredElement("group-selector");

  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("Group selector element is not a select.");
  }

  const groupNames = Array.from(new Set(state.groups.map((group) => group.name)));
  select.innerHTML = [
    `<option value="auto"${state.selectedGroupName === "auto" ? " selected" : ""}>Auto-group by domain</option>`,
    ...groupNames.map(
      (groupName) =>
        `<option value="${escapeHtml(groupName)}"${
          state.selectedGroupName === groupName ? " selected" : ""
        }>${escapeHtml(groupName)}</option>`
    )
  ].join("");

  const slot = getRequiredElement("new-group-slot");
  slot.replaceChildren();

  if (state.isCreatingGroup) {
    slot.append(
      renderNewGroupInput({
        value: state.groupDraft,
        validationMessage: state.validationMessage
      })
    );
  } else {
    slot.append(renderNewGroupButton());
  }
}

function renderToast(state: PopupState): void {
  const region = getRequiredElement("toast-region");
  region.replaceChildren();

  if (!state.toast) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${state.toast.tone}`;
  toast.textContent = state.toast.message;
  region.append(toast);
}

function renderGroups(state: PopupState): void {
  const container = getRequiredElement("groups-list");
  container.replaceChildren();

  if (state.tabs.length === 0) {
    container.append(renderEmptyState());
    return;
  }

  for (const groupName of resolveDisplayOrder(state)) {
    const group = getRenderableGroup(state, groupName);

    if (!group) {
      continue;
    }

    container.append(
      renderGroupSection({
        group,
        tabs: state.groupedTabs[groupName] ?? [],
        expanded: state.expandedGroups.has(groupName),
        menuOpen: state.activeMenuGroupName === groupName,
        confirmDelete: state.confirmDeleteGroupName === groupName
      })
    );
  }
}

function renderNewGroupButton(): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "new-group-button";
  button.dataset.action = "new-group";
  button.innerHTML = `
    <span class="new-group-button__icon" aria-hidden="true"></span>
    <span>New</span>
  `;
  return button;
}

function renderEmptyState(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <div class="empty-state__content">
      <div class="empty-state__illustration" aria-hidden="true">
        <span class="empty-state__glow"></span>
        <span class="empty-state__sheet"></span>
        <span class="empty-state__spark empty-state__spark--one"></span>
        <span class="empty-state__spark empty-state__spark--two"></span>
        <span class="empty-state__spark empty-state__spark--three"></span>
      </div>
      <div class="empty-state__copy">
        <p class="empty-state__title">No saved tabs yet</p>
        <p class="empty-state__text">Save a tab to start building your collection and access it anytime.</p>
      </div>
    </div>
  `;
  return empty;
}

export async function hydrateState(state: PopupState): Promise<void> {
  const [tabs, groups] = await Promise.all([getTabs(), getGroups()]);
  state.tabs = tabs;
  state.groups = groups;
  state.groupedTabs = groupTabsByName(tabs);

  const validSelections = new Set(["auto", ...groups.map((group) => group.name)]);

  if (!validSelections.has(state.selectedGroupName)) {
    state.selectedGroupName = "auto";
  }

  const visibleGroups = new Set(resolveDisplayOrder(state));
  state.expandedGroups = new Set(
    Array.from(state.expandedGroups).filter((groupName) => visibleGroups.has(groupName))
  );

  if (state.activeMenuGroupName && !visibleGroups.has(state.activeMenuGroupName)) {
    state.activeMenuGroupName = null;
  }

  if (state.confirmDeleteGroupName && !visibleGroups.has(state.confirmDeleteGroupName)) {
    state.confirmDeleteGroupName = null;
  }
}

export function bindPopupEvents(state: PopupState): void {
  const root = getRequiredElement("app");

  root.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionable = target.closest<HTMLElement>("[data-action]");

    if (!actionable) {
      if (!target.closest(".group-options") && !target.closest(".confirm-popover")) {
        state.activeMenuGroupName = null;
        state.confirmDeleteGroupName = null;
        renderPopup(state);
      }
      return;
    }

    const action = actionable.dataset.action;

    if (!action) {
      return;
    }

    void handleAction(action, actionable, state);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;

    if (target instanceof HTMLSelectElement && target.id === "group-selector") {
      state.selectedGroupName = target.value || "auto";
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target instanceof HTMLInputElement && target.id === "new-group-input") {
      state.groupDraft = target.value;
      state.validationMessage = null;
    }
  });

  root.addEventListener("submit", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLFormElement) || target.id !== "new-group-form") {
      return;
    }

    event.preventDefault();
    void submitNewGroup(state);
  });
}

async function handleAction(
  action: string,
  target: HTMLElement,
  state: PopupState
): Promise<void> {
  switch (action) {
    case "save-tab":
      await performMutation(
        state,
        {
          type: "SAVE_TAB",
          payload: {
            targetGroup: state.selectedGroupName
          }
        },
        "Tab saved"
      );
      return;
    case "save-window":
      await performMutation(state, { type: "SAVE_WINDOW" }, "Window saved");
      return;
    case "new-group":
      state.isCreatingGroup = true;
      state.validationMessage = null;
      state.toast = null;
      renderPopup(state);
      focusNewGroupInput();
      return;
    case "cancel-new-group":
      state.isCreatingGroup = false;
      state.groupDraft = "";
      state.validationMessage = null;
      renderPopup(state);
      return;
    case "toggle-group":
      toggleExpandedGroup(state, target.dataset.groupName || "");
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      renderPopup(state);
      return;
    case "toggle-open-menu":
      toggleGroupMenu(state, target.dataset.groupName || "");
      state.confirmDeleteGroupName = null;
      renderPopup(state);
      return;
    case "toggle-delete-group":
      toggleDeleteConfirm(state, target.dataset.groupName || "");
      state.activeMenuGroupName = null;
      renderPopup(state);
      return;
    case "cancel-delete-group":
      state.confirmDeleteGroupName = null;
      renderPopup(state);
      return;
    case "open-group":
      await performMutation(
        state,
        {
          type: "OPEN_GROUP",
          payload: {
            groupName: target.dataset.groupName || ""
          }
        },
        "Group opened"
      );
      return;
    case "open-group-new-window":
      await performMutation(
        state,
        {
          type: "OPEN_GROUP_NEW_WINDOW",
          payload: {
            groupName: target.dataset.groupName || ""
          }
        },
        "Opened in new window"
      );
      return;
    case "open-tab":
      await performMutation(
        state,
        {
          type: "OPEN_TAB",
          payload: {
            tabId: target.dataset.tabId || ""
          }
        },
        "Tab opened"
      );
      return;
    case "delete-tab":
      await performMutation(
        state,
        {
          type: "DELETE_TAB",
          payload: {
            id: target.dataset.tabId || ""
          }
        },
        "Tab removed"
      );
      return;
    case "delete-group":
      await performMutation(
        state,
        {
          type: "DELETE_GROUP",
          payload: {
            groupName: target.dataset.groupName || ""
          }
        },
        "Group removed"
      );
      return;
    default:
      return;
  }
}

async function submitNewGroup(state: PopupState): Promise<void> {
  const trimmed = state.groupDraft.trim();

  if (!trimmed) {
    state.validationMessage = "Group name cannot be empty.";
    renderPopup(state);
    focusNewGroupInput();
    return;
  }

  const duplicate = state.groups.some(
    (group) => group.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (duplicate) {
    state.validationMessage = `Group "${trimmed}" already exists.`;
    renderPopup(state);
    focusNewGroupInput();
    return;
  }

  try {
    await sendMessage({
      type: "CREATE_GROUP",
      payload: {
        name: trimmed
      }
    });

    state.groupDraft = "";
    state.validationMessage = null;
    state.isCreatingGroup = false;
    state.toast = {
      tone: "success",
      message: "New group created"
    };
    await hydrateState(state);
    renderPopup(state);
  } catch (error) {
    state.validationMessage = error instanceof Error ? error.message : "Failed to create group.";
    state.toast = {
      tone: "error",
      message: "Network Error"
    };
    renderPopup(state);
    focusNewGroupInput();
  }
}

async function performMutation(
  state: PopupState,
  message: BackgroundMessage,
  successMessage: string
): Promise<void> {
  try {
    await sendMessage(message);
    await hydrateState(state);
    state.toast = {
      tone: "success",
      message: successMessage
    };
    state.activeMenuGroupName = null;
    state.confirmDeleteGroupName = null;
    renderPopup(state);
  } catch (error) {
    state.toast = {
      tone: "error",
      message: error instanceof Error ? error.message : "Network Error"
    };
    renderPopup(state);
  }
}

function toggleExpandedGroup(state: PopupState, groupName: string): void {
  if (!groupName) {
    return;
  }

  if (state.expandedGroups.has(groupName)) {
    state.expandedGroups.delete(groupName);
    return;
  }

  state.expandedGroups.add(groupName);
}

function toggleGroupMenu(state: PopupState, groupName: string): void {
  state.activeMenuGroupName =
    state.activeMenuGroupName === groupName ? null : groupName;
}

function toggleDeleteConfirm(state: PopupState, groupName: string): void {
  state.confirmDeleteGroupName =
    state.confirmDeleteGroupName === groupName ? null : groupName;
}

function groupTabsByName(tabs: SavedTab[]): GroupedTabs {
  return tabs.reduce<GroupedTabs>((groups, tab) => {
    groups[tab.group] = [...(groups[tab.group] ?? []), tab];
    return groups;
  }, {});
}

function resolveDisplayOrder(state: PopupState): string[] {
  const orderedGroups = state.groups
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((group) => group.name);

  for (const groupName of Object.keys(state.groupedTabs)) {
    if (!orderedGroups.includes(groupName)) {
      orderedGroups.push(groupName);
    }
  }

  return orderedGroups;
}

function getRenderableGroup(state: PopupState, groupName: string): GroupMeta | null {
  const existing = state.groups.find((group) => group.name === groupName);

  if (existing) {
    return existing;
  }

  if (!state.groupedTabs[groupName]) {
    return null;
  }

  return {
    name: groupName,
    createdAt: 0,
    type: "auto"
  };
}

async function sendMessage(message: BackgroundMessage): Promise<void> {
  const response = (await chrome.runtime.sendMessage(message)) as
    | { ok: true }
    | { ok: false; error: string };

  if (!response?.ok) {
    throw new Error(response?.error || "Background request failed.");
  }
}

function getRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Expected popup element #${id}.`);
  }

  return element;
}

function focusNewGroupInput(): void {
  const input = document.getElementById("new-group-input");

  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
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

bootstrapPopup();
