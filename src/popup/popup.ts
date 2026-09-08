import { getGroups, getTabs } from "../shared/storage";
import { renderGroupSection } from "./components/GroupSection";
import { renderNewGroupInput } from "./components/NewGroupInput";
import { renderIcon } from "./icons";
import type { BackgroundMessage, GroupMeta, GroupedTabs, SavedTab } from "../shared/types";

export interface PopupState {
  groups: GroupMeta[];
  tabs: SavedTab[];
  groupedTabs: GroupedTabs;
  selectedGroupName: string;
  isGroupSelectOpen: boolean;
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
  activeTabMenuId: string | null;
  confirmDeleteTabId: string | null;
}

let toastTimeoutId: number | null = null;

export function bootstrapPopup(): void {
  document.addEventListener("DOMContentLoaded", () => {
    const state = createInitialState();
    
    // Listen for storage changes to keep UI in sync
    chrome.storage.onChanged.addListener(() => {
      void hydrateState(state).then(() => renderPopup(state));
    });

    void initializePopupWithState(state);
  });
}

export async function initializePopupWithState(state: PopupState): Promise<void> {
  await hydrateState(state);
  renderPopup(state);
  bindPopupEvents(state);
}

export async function initializePopup(): Promise<void> {
  const state = createInitialState();
  await initializePopupWithState(state);
}

export function createInitialState(): PopupState {
  return {
    groups: [],
    tabs: [],
    groupedTabs: {},
    selectedGroupName: "auto",
    isGroupSelectOpen: false,
    isCreatingGroup: false,
    groupDraft: "",
    validationMessage: null,
    toast: null,
    expandedGroups: new Set<string>(),
    activeMenuGroupName: null,
    confirmDeleteGroupName: null,
    activeTabMenuId: null,
    confirmDeleteTabId: null
  };
}

export function renderPopup(state: PopupState): void {
  renderStaticIcons();
  renderHeader(state);
  renderToolbar(state);
  renderToast(state);
  renderGroups(state);
  renderOverlayState(state);
}

// The two save buttons live in index.html; their glyphs come from the shared set.
function renderStaticIcons(): void {
  const saveTab = document.getElementById("icon-save-tab");
  const saveAll = document.getElementById("icon-save-all");

  if (saveTab && !saveTab.firstChild) {
    saveTab.innerHTML = renderIcon("add01");
  }

  if (saveAll && !saveAll.firstChild) {
    saveAll.innerHTML = renderIcon("layers01");
  }
}

function renderHeader(state: PopupState): void {
  const badge = getRequiredElement("tab-count-badge");
  const count = resolveDisplayOrder(state).length;
  badge.textContent = `${count} Tab Group${count === 1 ? "" : "s"}`;
}

function renderToolbar(state: PopupState): void {
  const selector = getRequiredElement("group-selector-slot");
  const groupNames = Array.from(new Set(state.groups.map((group) => group.name)));
  selector.replaceChildren(
    renderGroupSelector(state.selectedGroupName, groupNames, state.isGroupSelectOpen)
  );

  const slot = getRequiredElement("new-group-slot");
  slot.replaceChildren(renderNewGroupButton());
}

function renderGroupSelector(
  selectedGroupName: string,
  groupNames: string[],
  open: boolean
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `group-select${open ? " group-select--open" : ""}`;
  const selectedLabel =
    selectedGroupName === "auto" ? "Auto-group by domain" : selectedGroupName;

  wrapper.innerHTML = `
    <button
      type="button"
      class="group-select__trigger"
      data-action="toggle-group-selector"
      aria-haspopup="listbox"
      aria-expanded="${String(open)}"
    >
      <span class="group-select__label">${escapeHtml(selectedLabel)}</span>
      <span class="group-select__chevron" aria-hidden="true">${renderIcon("chevronDown")}</span>
    </button>
  `;

  if (open) {
    const menu = document.createElement("div");
    menu.className = "group-select__menu";
    menu.setAttribute("role", "listbox");
    menu.innerHTML = [
      renderGroupOption("auto", "Auto-group by domain", selectedGroupName === "auto"),
      ...groupNames.map((groupName) =>
        renderGroupOption(groupName, groupName, selectedGroupName === groupName)
      )
    ].join("");
    wrapper.append(menu);
  }

  return wrapper;
}

function renderGroupOption(value: string, label: string, selected: boolean): string {
  return `
    <button
      type="button"
      class="group-select__option"
      role="option"
      aria-selected="${String(selected)}"
      data-action="select-group-option"
      data-group-value="${escapeHtml(value)}"
    >
      <span class="group-select__label-text">${escapeHtml(label)}</span>
      <span class="group-select__check${selected ? " group-select__check--on" : ""}" aria-hidden="true">${renderIcon(
        "tickDouble"
      )}</span>
    </button>
  `;
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

  const displayOrder = resolveDisplayOrder(state);

  if (displayOrder.length === 0) {
    container.append(renderEmptyState());
    return;
  }

  for (const groupName of displayOrder) {
    const group = getRenderableGroup(state, groupName);

    if (!group) {
      continue;
    }

    container.append(
      renderGroupSection({
        group,
        tabs: state.groupedTabs[groupName] ?? [],
        expanded: state.expandedGroups.has(groupName),
        activeTabMenuId: state.activeTabMenuId
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
    <span class="new-group-button__icon" aria-hidden="true">${renderIcon("folderAdd")}</span>
    <span>New</span>
  `;
  return button;
}

function renderEmptyState(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <img
      class="empty-state__illustration"
      src="../../public/icons/figma/empty-state.svg"
      alt=""
      aria-hidden="true"
    />
    <div class="empty-state__copy">
      <p class="empty-state__title">No saved tabs yet</p>
      <p class="empty-state__text">Save a tab to start building your collection and access it anytime.</p>
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

  const visibleTabIds = new Set(tabs.map((tab) => tab.id));

  if (state.activeTabMenuId && !visibleTabIds.has(state.activeTabMenuId)) {
    state.activeTabMenuId = null;
  }

  if (state.confirmDeleteTabId && !visibleTabIds.has(state.confirmDeleteTabId)) {
    state.confirmDeleteTabId = null;
  }
}

export function bindPopupEvents(state: PopupState): void {
  const root = getRequiredElement("app");

  root.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const actionable = target.closest("[data-action]");

    if (!(actionable instanceof HTMLElement)) {
      if (!target.closest(".popover") && !target.closest(".group-select")) {
        state.activeMenuGroupName = null;
        state.confirmDeleteGroupName = null;
        state.activeTabMenuId = null;
        state.confirmDeleteTabId = null;
        state.isGroupSelectOpen = false;
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

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target instanceof HTMLInputElement && target.id === "new-group-input") {
      state.groupDraft = target.value;
      state.validationMessage = null;
      renderPopup(state);
      focusNewGroupInput(false);
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
      await performMutation(
        state,
        {
          type: "SAVE_WINDOW",
          payload: {
            targetGroup: state.selectedGroupName
          }
        } as any,
        "Window saved"
      );
      return;
    case "new-group":
      state.isCreatingGroup = true;
      state.isGroupSelectOpen = false;
      state.validationMessage = null;
      state.toast = null;
      renderPopup(state);
      focusNewGroupInput();
      return;
    case "dismiss-overlay":
      state.isCreatingGroup = false;
      state.groupDraft = "";
      state.validationMessage = null;
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      state.activeTabMenuId = null;
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "cancel-new-group":
      state.isCreatingGroup = false;
      state.groupDraft = "";
      state.validationMessage = null;
      renderPopup(state);
      return;
    case "toggle-group-selector":
      state.isGroupSelectOpen = !state.isGroupSelectOpen;
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      state.activeTabMenuId = null;
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "select-group-option":
      state.selectedGroupName = target.dataset.groupValue || "auto";
      state.isGroupSelectOpen = false;
      renderPopup(state);
      return;
    case "toggle-group":
      toggleExpandedGroup(state, target.dataset.groupName || "");
      state.isGroupSelectOpen = false;
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      state.activeTabMenuId = null;
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "toggle-open-menu":
      state.isGroupSelectOpen = false;
      toggleGroupMenu(state, target.dataset.groupName || "");
      state.confirmDeleteGroupName = null;
      state.activeTabMenuId = null;
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "toggle-delete-group":
      state.isGroupSelectOpen = false;
      toggleDeleteConfirm(state, target.dataset.groupName || "");
      state.activeMenuGroupName = null;
      state.activeTabMenuId = null;
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "cancel-delete-group":
      state.confirmDeleteGroupName = null;
      renderPopup(state);
      return;
    case "toggle-open-tab-menu":
      state.isGroupSelectOpen = false;
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      toggleTabMenu(state, target.dataset.tabId || "");
      state.confirmDeleteTabId = null;
      renderPopup(state);
      return;
    case "toggle-delete-tab":
      state.isGroupSelectOpen = false;
      state.activeMenuGroupName = null;
      state.confirmDeleteGroupName = null;
      state.activeTabMenuId = null;
      toggleTabDeleteConfirm(state, target.dataset.tabId || "");
      renderPopup(state);
      return;
    case "cancel-delete-tab":
      state.confirmDeleteTabId = null;
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
    case "open-tab-new-window":
      await performMutation(
        state,
        {
          type: "OPEN_TAB_NEW_WINDOW",
          payload: {
            tabId: target.dataset.tabId || ""
          }
        },
        "Opened in new window"
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
    showToast(state, "success", "New group created");
    await hydrateState(state);
    renderPopup(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create group.";
    state.validationMessage = message;
    showToast(state, "error", message);
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
    showToast(state, "success", successMessage);
    state.isGroupSelectOpen = false;
    state.activeMenuGroupName = null;
    state.confirmDeleteGroupName = null;
    state.activeTabMenuId = null;
    state.confirmDeleteTabId = null;
    renderPopup(state);
  } catch (error) {
    showToast(state, "error", error instanceof Error ? error.message : "Network Error");
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

function toggleTabMenu(state: PopupState, tabId: string): void {
  state.activeTabMenuId = state.activeTabMenuId === tabId ? null : tabId;
}

function toggleTabDeleteConfirm(state: PopupState, tabId: string): void {
  state.confirmDeleteTabId = state.confirmDeleteTabId === tabId ? null : tabId;
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

function renderOverlayState(state: PopupState): void {
  const overlay = getRequiredElement("overlay-slot");
  overlay.replaceChildren();

  const dialog = state.isCreatingGroup || state.confirmDeleteGroupName || state.confirmDeleteTabId;
  const popover = state.activeMenuGroupName || state.activeTabMenuId;

  if (!dialog && !popover) {
    overlay.setAttribute("aria-hidden", "true");
    return;
  }

  overlay.removeAttribute("aria-hidden");

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.dataset.action = "dismiss-overlay";
  overlay.append(backdrop);

  if (state.isCreatingGroup) {
    overlay.append(
      renderNewGroupInput({
        value: state.groupDraft,
        validationMessage: state.validationMessage
      })
    );
    return;
  }

  if (state.confirmDeleteGroupName) {
    overlay.append(
      renderConfirmDialog({
        eyebrow: "DELETE TAB GROUP ?",
        body:
          "This will remove the group and all its saved tabs from TabSave. " +
          "If the tabs are currently open in your browser, they may also be closed.",
        cancelAction: "cancel-delete-group",
        confirmAction: "delete-group",
        dataAttribute: "data-group-name",
        dataValue: state.confirmDeleteGroupName
      })
    );
    return;
  }

  if (state.confirmDeleteTabId) {
    overlay.append(
      renderConfirmDialog({
        eyebrow: "DELETE TAB",
        body:
          "This will remove this tab from TabSave. " +
          "If the tab is currently open in your browser, they may also be closed.",
        cancelAction: "cancel-delete-tab",
        confirmAction: "delete-tab",
        dataAttribute: "data-tab-id",
        dataValue: state.confirmDeleteTabId
      })
    );
    return;
  }

  if (state.activeMenuGroupName) {
    const menu = renderOpenOptions("open-group", "open-group-new-window", "data-group-name", state.activeMenuGroupName);
    overlay.append(menu);
    anchorPopover(
      menu,
      `[data-action="toggle-open-menu"][data-group-name="${cssEscape(state.activeMenuGroupName)}"]`
    );
    return;
  }

  if (state.activeTabMenuId) {
    const menu = renderOpenOptions("open-tab", "open-tab-new-window", "data-tab-id", state.activeTabMenuId);
    overlay.append(menu);
    anchorPopover(
      menu,
      `[data-action="toggle-open-tab-menu"][data-tab-id="${cssEscape(state.activeTabMenuId)}"]`
    );
  }
}

interface ConfirmDialogProps {
  eyebrow: string;
  body: string;
  cancelAction: string;
  confirmAction: string;
  dataAttribute: string;
  dataValue: string;
}

function renderConfirmDialog(props: ConfirmDialogProps): HTMLElement {
  const dialog = document.createElement("div");
  dialog.className = "popover popover--confirm";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", props.eyebrow);
  const payload = `${props.dataAttribute}="${escapeHtml(props.dataValue)}"`;
  dialog.innerHTML = `
    <div class="popover__header">
      <p class="popover__eyebrow">${escapeHtml(props.eyebrow)}</p>
      <button type="button" class="popover__close" data-action="${props.cancelAction}" ${payload} aria-label="Close">
        ${renderIcon("cancel01")}
      </button>
    </div>
    <div class="popover__body">
      <p class="popover__text">${escapeHtml(props.body)}</p>
      <div class="popover__actions">
        <button type="button" class="button button--secondary button--fixed" data-action="${
          props.cancelAction
        }" ${payload}>Cancel</button>
        <button type="button" class="button button--danger button--fixed" data-action="${
          props.confirmAction
        }" ${payload}>Delete</button>
      </div>
    </div>
  `;
  return dialog;
}

function renderOpenOptions(
  currentAction: string,
  newWindowAction: string,
  dataAttribute: string,
  dataValue: string
): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "popover popover--menu";
  menu.setAttribute("role", "menu");
  const payload = `${dataAttribute}="${escapeHtml(dataValue)}"`;
  menu.innerHTML = `
    <button type="button" class="menu-option" role="menuitem" data-action="${currentAction}" ${payload}>
      <span>Open in current window</span>
      ${renderIcon("windowsNew")}
    </button>
    <button type="button" class="menu-option" role="menuitem" data-action="${newWindowAction}" ${payload}>
      <span>Open in new window</span>
      ${renderIcon("windowsOld")}
    </button>
  `;
  return menu;
}

// Places a popover just under its trigger, right-aligned, clamped to the popup frame.
function anchorPopover(popover: HTMLElement, anchorSelector: string): void {
  const shell = document.getElementById("app");
  const anchor = document.querySelector(anchorSelector);

  if (!shell || !(anchor instanceof HTMLElement)) {
    return;
  }

  const shellRect = shell.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth || 186;
  const height = popover.offsetHeight || 70;

  const left = clamp(anchorRect.right - shellRect.left - width + 6, 10, shellRect.width - width - 10);
  const below = anchorRect.bottom - shellRect.top + 8;
  const top = below + height > shellRect.height - 10
    ? Math.max(10, anchorRect.top - shellRect.top - height - 8)
    : below;

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function cssEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function showToast(
  state: PopupState,
  tone: "success" | "error",
  message: string
): void {
  state.toast = { tone, message };

  if (toastTimeoutId !== null) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    state.toast = null;
    renderPopup(state);
    toastTimeoutId = null;
  }, 2600);
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

function focusNewGroupInput(select = true): void {
  const input = document.getElementById("new-group-input");

  if (input instanceof HTMLInputElement) {
    input.focus();

    if (select) {
      input.select();
    } else {
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }
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
