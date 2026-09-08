import {
  addTab,
  addTabs,
  getGroups,
  getTabs,
  saveGroup,
  saveGroups,
  saveTabs
} from "../shared/storage";
import {
  buildSavedTab,
  extractDomain,
  generateSessionId,
  getAllWindowTabs,
  getCurrentTab,
  inheritExistingTabGroups as importExistingTabGroups
} from "../shared/tabs";
import {
  type BackgroundMessage,
  type GroupMeta,
  type SavedTab,
  type SaveTarget,
  type TabSaveRuntimeMessageType
} from "../shared/types";

export const CONTEXT_MENU_IDS = {
  saveTab: "save-tab",
  saveWindow: "save-window"
} as const;

export function registerRuntimeListeners(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void handleInstalled(details);
  });

  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      void inheritAndMergeExistingGroups();
    });
  }

  if (chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      void handleContextMenuClick(info, tab);
    });
  }

  registerChromeSyncListeners();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleRuntimeMessage(message as BackgroundMessage)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown background error."
        });
      });

    return true;
  });
}

export async function handleInstalled(
  details: chrome.runtime.InstalledDetails
): Promise<void> {
  void details;
  await setupContextMenus();

  // Inherit on install AND update so every existing Chrome tab group (across all
  // open windows) is captured, not just the ones present at first install.
  await inheritAndMergeExistingGroups();
}

export async function inheritAndMergeExistingGroups(): Promise<void> {
  const inherited = await inheritExistingTabGroups();

  if (inherited.tabs.length === 0 && inherited.groups.length === 0) {
    return;
  }

  const existingTabs = await getTabs();
  const existingGroups = await getGroups();
  const mergedTabs = dedupeTabsByUrlAndGroup([...existingTabs, ...inherited.tabs]);
  const mergedGroups = mergeGroups(existingGroups, inherited.groups);

  await Promise.all([addImportedTabs(mergedTabs), addImportedGroups(mergedGroups)]);
}

export async function setupContextMenus(): Promise<void> {
  if (!chrome.contextMenus?.create) {
    return;
  }

  try {
    await chrome.contextMenus.removeAll();
    await chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.saveTab,
      title: "TabSave: Save This Tab",
      contexts: ["page"]
    });
    await chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.saveWindow,
      title: "TabSave: Save All Tabs",
      contexts: ["page"]
    });
  } catch (error) {
    console.error("Failed to set up context menus", error);
  }
}

export async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  void tab;

  if (info.menuItemId === CONTEXT_MENU_IDS.saveTab) {
    await handleSaveCurrentTab("auto");
  }

  if (info.menuItemId === CONTEXT_MENU_IDS.saveWindow) {
    await handleSaveWindow();
  }
}

export async function handleRuntimeMessage(
  message: BackgroundMessage
): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (message.type) {
    case "SAVE_TAB":
      await handleSaveCurrentTab(message.payload?.targetGroup ?? null);
      return { ok: true };
    case "SAVE_WINDOW":
      await handleSaveWindow((message as any).payload?.targetGroup ?? null);
      return { ok: true };
    case "OPEN_TAB":
      await openSingleSavedTab(message.payload.tabId);
      return { ok: true };
    case "OPEN_TAB_NEW_WINDOW":
      await openSingleSavedTabInNewWindow(message.payload.tabId);
      return { ok: true };
    case "OPEN_GROUP":
      await openGroupInCurrentWindow(message.payload.groupName);
      return { ok: true };
    case "OPEN_GROUP_NEW_WINDOW":
      await openGroupInNewWindow(message.payload.groupName);
      return { ok: true };
    case "CREATE_GROUP":
      await createCustomGroup(message.payload.name);
      return { ok: true };
    case "DELETE_TAB":
      await deleteSavedTab(message.payload.id);
      return { ok: true };
    case "DELETE_GROUP":
      await deleteSavedGroup(message.payload.groupName);
      return { ok: true };
    case "RENAME_GROUP":
      await renameSavedGroup(message.payload.currentName, message.payload.nextName);
      return { ok: true };
    default:
      return assertNeverMessage(message.type);
  }
}

export async function handleSaveCurrentTab(
  targetGroup: SaveTarget
): Promise<SavedTab> {
  const currentTab = await getCurrentTab();

  if (!currentTab.url || isInternalUrl(currentTab.url)) {
    throw new Error("This page doesn't have a web address to save.");
  }

  const groups = await getGroups();
  const groupName =
    targetGroup && targetGroup !== "auto" ? targetGroup : extractDomain(currentTab.url);

  const savedTab = buildSavedTab(currentTab, groupName, "manual");
  const groupMeta = await ensureStoredGroupMeta(groupName, groups);
  await addTabAndAutoGroup(savedTab);

  if (typeof currentTab.id === "number") {
    await ensureChromeMembership(groupMeta, [currentTab.id]);
  }

  return savedTab;
}

export async function handleSaveWindow(targetGroup?: SaveTarget): Promise<SavedTab[]> {
  const tabs = await getAllWindowTabs();
  const saveableTabs = tabs.filter((tab) => tab.url && !isInternalUrl(tab.url));

  if (saveableTabs.length === 0) {
    return [];
  }

  const groups = await getGroups();
  const existingGroupNames = groups.map((group) => group.name);
  const sessionId = generateSessionId();
  const savedTabs: SavedTab[] = [];
  const tabsByGroup = new Map<string, number[]>();

  for (const tab of saveableTabs) {
    const groupName =
      targetGroup && targetGroup !== "auto" ? targetGroup : extractDomain(tab.url || "");

    const savedTab = buildSavedTab(tab, groupName, "window", sessionId);
    savedTabs.push(savedTab);

    if (!existingGroupNames.some((name) => name.toLowerCase() === groupName.toLowerCase())) {
      existingGroupNames.push(groupName);
      await saveAutoGroupMeta(groupName);
    }

    if (typeof tab.id === "number") {
      const groupTabIds = tabsByGroup.get(groupName) ?? [];
      groupTabIds.push(tab.id);
      tabsByGroup.set(groupName, groupTabIds);
    }
  }

  await addTabs(savedTabs);

  const latestGroups = await getGroups();

  for (const [groupName, tabIds] of tabsByGroup.entries()) {
    const groupMeta = latestGroups.find(
      (group) => group.name.toLowerCase() === groupName.toLowerCase()
    );

    if (groupMeta) {
      await ensureChromeMembership(groupMeta, tabIds);
    }
  }

  return savedTabs;
}

export async function createCustomGroup(name: string): Promise<GroupMeta> {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Group name cannot be empty.");
  }

  const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
  const existingNames = new Set<string>([
    ...groups.map((group) => group.name.toLowerCase()),
    ...tabs.map((tab) => tab.group.toLowerCase())
  ]);

  if (existingNames.has(trimmed.toLowerCase())) {
    throw new Error(`Group "${trimmed}" already exists.`);
  }

  const color = getRandomChromeGroupColor();
  const group: GroupMeta = {
    name: trimmed,
    createdAt: Date.now(),
    type: "custom",
    color
  };

  await saveGroup(group);
  return group;
}

export async function openSingleSavedTab(tabId: string): Promise<void> {
  const tabs = await getTabs();
  const tab = tabs.find((item) => item.id === tabId);

  if (!tab?.url) {
    return;
  }

  await chrome.tabs.create({ url: tab.url });
}

export async function openSingleSavedTabInNewWindow(tabId: string): Promise<void> {
  const tabs = await getTabs();
  const tab = tabs.find((item) => item.id === tabId);

  if (!tab?.url) {
    return;
  }

  await chrome.windows.create({ url: tab.url });
}

export async function openGroupInCurrentWindow(groupName: string): Promise<void> {
  const tabs = await getTabs();
  const groups = await getGroups();
  const matchingTabs = tabs.filter((tab) => tab.group === groupName);

  if (matchingTabs.length === 0) {
    return;
  }

  const groupMeta = groups.find((group) => group.name === groupName);
  const groupId = await openGroupCurrentWindow(
    matchingTabs.map((tab) => tab.url),
    groupName,
    groupMeta?.color
  );

  if (groupMeta && groupId !== null) {
    await persistGroupChromeId(groupMeta, groupId);
  }
}

export async function openGroupInNewWindow(groupName: string): Promise<void> {
  const tabs = await getTabs();
  const groups = await getGroups();
  const matchingTabs = tabs.filter((tab) => tab.group === groupName);

  if (matchingTabs.length === 0) {
    return;
  }

  const groupMeta = groups.find((group) => group.name === groupName);
  const groupId = await openGroupNewWindow(
    matchingTabs.map((tab) => tab.url),
    groupName,
    groupMeta?.color
  );

  if (groupMeta && groupId !== null) {
    await persistGroupChromeId(groupMeta, groupId);
  }
}

export async function openGroupCurrentWindow(
  urls: string[],
  label: string,
  color?: chrome.tabGroups.ColorEnum
): Promise<number | null> {
  const createdTabs = await Promise.all(urls.map((url) => chrome.tabs.create({ url })));
  const tabIds = createdTabs
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === "number");

  return restoreChromeTabGroup(tabIds, label, color);
}

export async function openGroupNewWindow(
  urls: string[],
  label: string,
  color?: chrome.tabGroups.ColorEnum
): Promise<number | null> {
  const windowRef = await chrome.windows.create({ url: urls });
  const tabIds = (windowRef.tabs ?? [])
    .map((tab) => tab.id)
    .filter((id): id is number => typeof id === "number");

  return restoreChromeTabGroup(tabIds, label, color);
}

export async function restoreChromeTabGroup(
  tabIds: number[],
  label: string,
  color?: chrome.tabGroups.ColorEnum
): Promise<number | null> {
  if (tabIds.length === 0 || typeof chrome.tabs.group !== "function") {
    return null;
  }

  try {
    const groupId = await chrome.tabs.group({ tabIds });

    if (typeof chrome.tabGroups?.update === "function") {
      await chrome.tabGroups.update(groupId, {
        title: label,
        ...(color ? { color } : {})
      });
    }

    return groupId;
  } catch (error) {
    console.error("Failed to restore Chrome tab group", error);
    return null;
  }
}

export function assertNeverMessage(
  type: TabSaveRuntimeMessageType
): { ok: false; error: string } {
  return {
    ok: false,
    error: `Unhandled background message type: ${type}`
  };
}

registerRuntimeListeners();

export async function inheritExistingTabGroups(): Promise<{
  tabs: SavedTab[];
  groups: GroupMeta[];
}> {
  return importExistingTabGroups();
}

export async function deleteSavedGroup(groupName: string): Promise<void> {
  const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
  const groupMeta = groups.find((group) => group.name === groupName);
  const groupTabs = tabs.filter((tab) => tab.group === groupName);

  if (groupMeta) {
    await removeChromeGroup(groupMeta, groupTabs);
  }

  const nextTabs = tabs.filter((tab) => tab.group !== groupName);
  const nextGroups = groups.filter((group) => group.name !== groupName);
  await Promise.all([saveTabs(nextTabs), saveGroups(nextGroups)]);
}

export async function deleteSavedTab(tabId: string): Promise<void> {
  const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
  const savedTab = tabs.find((tab) => tab.id === tabId);

  if (!savedTab) {
    return;
  }

  const groupMeta = groups.find((group) => group.name === savedTab.group);

  if (groupMeta) {
    await removeSingleTabFromChromeGroup(savedTab, groupMeta);
  }

  await saveTabs(tabs.filter((tab) => tab.id !== tabId));
}

export async function renameSavedGroup(
  currentName: string,
  nextName: string
): Promise<GroupMeta> {
  const trimmedName = nextName.trim();

  if (!trimmedName) {
    throw new Error("Group name cannot be empty.");
  }

  const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
  const existingGroup = groups.find((group) => group.name === currentName);

  if (!existingGroup) {
    throw new Error(`Group "${currentName}" was not found.`);
  }

  const duplicate = groups.some(
    (group) =>
      group.name.toLowerCase() === trimmedName.toLowerCase() &&
      group.name.toLowerCase() !== currentName.toLowerCase()
  );

  if (duplicate) {
    throw new Error(`Group "${trimmedName}" already exists.`);
  }

  const renamedGroup: GroupMeta = {
    ...existingGroup,
    name: trimmedName
  };
  const renamedTabs = tabs.map((tab) =>
    tab.group === currentName
      ? {
          ...tab,
          group: trimmedName
        }
      : tab
  );

  await Promise.all([
    saveGroups(upsertGroupMeta(groups, renamedGroup, currentName)),
    saveTabs(renamedTabs)
  ]);

  await renameChromeGroup(renamedGroup, currentName);
  return renamedGroup;
}

async function addTabAndAutoGroup(tab: SavedTab): Promise<void> {
  await addTab(tab);
  await saveAutoGroupMeta(tab.group);
}

async function saveAutoGroupMeta(groupName: string): Promise<void> {
  const groups = await getGroups();
  const existing = groups.find((group) => group.name.toLowerCase() === groupName.toLowerCase());

  if (existing) {
    return;
  }

  await saveGroup({
    name: groupName,
    createdAt: Date.now(),
    type: "auto",
    color: getRandomChromeGroupColor()
  });
}

function getRandomChromeGroupColor(): chrome.tabGroups.ColorEnum {
  const colors: chrome.tabGroups.ColorEnum[] = [
    "grey",
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange"
  ];

  return colors[Math.floor(Math.random() * colors.length)] ?? "blue";
}

function isInternalUrl(url: string): boolean {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://")
  );
}

function dedupeTabsByUrlAndGroup(tabs: SavedTab[]): SavedTab[] {
  const seen = new Set<string>();
  const deduped: SavedTab[] = [];

  for (const tab of tabs) {
    const key = `${tab.url}::${tab.group}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(tab);
  }

  return deduped;
}

function mergeGroups(existing: GroupMeta[], incoming: GroupMeta[]): GroupMeta[] {
  const byName = new Map<string, GroupMeta>();

  for (const group of existing) {
    byName.set(group.name.toLowerCase(), group);
  }

  // When an inherited Chrome group's name aligns with a group we already track,
  // keep the existing metadata but adopt the Chrome group link and color so the
  // two stay synced instead of producing a duplicate.
  for (const group of incoming) {
    const key = group.name.toLowerCase();
    const previous = byName.get(key);

    if (previous) {
      byName.set(key, {
        ...previous,
        color: previous.color ?? group.color,
        originalGroupId: group.originalGroupId ?? previous.originalGroupId
      });
    } else {
      byName.set(key, group);
    }
  }

  return Array.from(byName.values()).sort((left, right) => left.createdAt - right.createdAt);
}

async function addImportedTabs(tabs: SavedTab[]): Promise<void> {
  await saveTabs(tabs);
}

async function addImportedGroups(groups: GroupMeta[]): Promise<void> {
  await saveGroups(groups);
}

function registerChromeSyncListeners(): void {
  if (chrome.tabGroups?.onCreated) {
    chrome.tabGroups.onCreated.addListener((group) => {
      void syncChromeGroupById(group.id);
    });
  }

  if (chrome.tabGroups?.onUpdated) {
    chrome.tabGroups.onUpdated.addListener((group) => {
      void handleChromeGroupUpdated(group);
    });
  }

  if (chrome.tabGroups?.onRemoved) {
    chrome.tabGroups.onRemoved.addListener((group) => {
      void handleChromeGroupRemoved(group);
    });
  }

  if (chrome.tabs?.onCreated) {
    chrome.tabs.onCreated.addListener((tab) => {
      void syncChromeGroupForTab(tab);
    });
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Sync if the tab was moved into/out of a group, or if its URL changed while in a group
      if (
        changeInfo.groupId !== undefined ||
        (changeInfo.url && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
      ) {
        void syncChromeGroupForTab(tab);
      }
    });
  }

  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      // If a tab is removed, we might need to sync the group it was in.
      // Since we don't have the tab object anymore, we can't easily know the group.
      // However, chrome.tabGroups events or a general sync might be needed.
      // For now, onRemoved is less critical than onUpdated for *adding* tabs.
    });
  }

  if (chrome.tabs?.onMoved) {
    chrome.tabs.onMoved.addListener((tabId) => {
      void handleTabMoved(tabId);
    });
  }
}

async function handleChromeGroupUpdated(group: chrome.tabGroups.TabGroup): Promise<void> {
  try {
    const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
    const existingGroup = findGroupMeta(groups, group.id, group.title);

    if (!existingGroup) {
      await syncChromeGroupById(group.id);
      return;
    }

    const nextName = group.title?.trim() || existingGroup.name;
    const nextColor = group.color ?? existingGroup.color;
    const updatedGroup: GroupMeta = {
      ...existingGroup,
      name: nextName,
      color: nextColor,
      originalGroupId: group.id,
      inherited: existingGroup.inherited ?? existingGroup.type === "inherited"
    };

    const nextGroups = groups.map((item) =>
      item.originalGroupId === group.id || item.name.toLowerCase() === existingGroup.name.toLowerCase()
        ? updatedGroup
        : item
    );

    const nextTabs = tabs.map((tab) =>
      tab.importedGroupId === group.id || tab.group === existingGroup.name
        ? {
            ...tab,
            group: nextName,
            groupColor: nextColor,
            importedGroupId: group.id
          }
        : tab
    );

    await Promise.all([saveGroups(nextGroups), saveTabs(nextTabs)]);
  } catch (error) {
    console.error("Failed to update TabSave group from Chrome", error);
  }
}

async function handleChromeGroupRemoved(group: chrome.tabGroups.TabGroup): Promise<void> {
  try {
    const [groups, tabs] = await Promise.all([getGroups(), getTabs()]);
    const existingGroup = findGroupMeta(groups, group.id, group.title);

    if (!existingGroup) {
      return;
    }

    const nextGroups = groups.filter(
      (item) =>
        item.originalGroupId !== group.id &&
        item.name.toLowerCase() !== existingGroup.name.toLowerCase()
    );
    const nextTabs = tabs.filter(
      (tab) => tab.importedGroupId !== group.id && tab.group !== existingGroup.name
    );

    await Promise.all([saveGroups(nextGroups), saveTabs(nextTabs)]);
  } catch (error) {
    console.error("Failed to remove TabSave group after Chrome group removal", error);
  }
}

async function handleTabMoved(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncChromeGroupForTab(tab);
  } catch (error) {
    console.error("Failed to inspect moved tab for group sync", error);
  }
}

async function syncChromeGroupForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.groupId === undefined || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return;
  }

  await syncChromeGroupById(tab.groupId);
}

async function syncChromeGroupById(groupId: number): Promise<void> {
  if (
    typeof chrome.tabGroups?.get !== "function" ||
    typeof chrome.tabs?.query !== "function"
  ) {
    return;
  }

  try {
    const [chromeGroup, chromeTabs, groups, savedTabs] = await Promise.all([
      chrome.tabGroups.get(groupId),
      chrome.tabs.query({ groupId }),
      getGroups(),
      getTabs()
    ]);

    const validTabs = chromeTabs.filter(
      (tab): tab is chrome.tabs.Tab & { url: string } => Boolean(tab.url) && !isInternalUrl(tab.url as string)
    );

    const existingGroup = findGroupMeta(groups, groupId, chromeGroup.title);
    const groupName =
      chromeGroup.title?.trim() ||
      existingGroup?.name ||
      extractDomain(validTabs[0]?.url ?? "") ||
      `Group ${groupId}`;

    const nextGroup: GroupMeta = {
      name: groupName,
      createdAt: existingGroup?.createdAt ?? Date.now(),
      color: chromeGroup.color ?? existingGroup?.color,
      type: existingGroup?.type ?? "inherited",
      inherited:
        existingGroup?.inherited ?? (!existingGroup || existingGroup.type === "inherited"),
      originalGroupId: groupId
    };

    const nextGroups = upsertGroupMeta(groups, nextGroup, existingGroup?.name);
    const syncedTabs = validTabs.map((tab) => buildChromeSyncedTab(tab, nextGroup));
    const preservedTabs = savedTabs.filter((tab) => {
      if (tab.importedGroupId === groupId) {
        return false;
      }

      if (
        existingGroup &&
        tab.source === "inherited" &&
        tab.group.toLowerCase() === existingGroup.name.toLowerCase()
      ) {
        return false;
      }

      return true;
    });
    const syncedKeys = new Set(syncedTabs.map((tab) => `${tab.url}::${tab.group.toLowerCase()}`));
    const dedupedPreservedTabs = preservedTabs.filter(
      (tab) => !syncedKeys.has(`${tab.url}::${tab.group.toLowerCase()}`)
    );

    await Promise.all([saveGroups(nextGroups), saveTabs([...dedupedPreservedTabs, ...syncedTabs])]);
  } catch (error) {
    console.error(`Failed to sync Chrome tab group ${groupId} into TabSave`, error);
  }
}

async function syncCustomGroupToChrome(group: GroupMeta): Promise<GroupMeta> {
  if (
    typeof chrome.tabs?.group !== "function" ||
    typeof chrome.tabGroups?.update !== "function"
  ) {
    return group;
  }

  try {
    const currentTab = await getCurrentTab();

    if (!currentTab.id || !currentTab.url || isInternalUrl(currentTab.url)) {
      return group;
    }

    const color = group.color ?? "blue";
    return ensureChromeMembership(
      {
        ...group,
        color
      },
      [currentTab.id]
    );
  } catch (error) {
    console.error("Failed to create Chrome tab group for custom TabSave group", error);
    return group;
  }
}

async function ensureStoredGroupMeta(
  groupName: string,
  existingGroups?: GroupMeta[]
): Promise<GroupMeta> {
  const groups = existingGroups ?? (await getGroups());
  const existingGroup = groups.find(
    (group) => group.name.toLowerCase() === groupName.toLowerCase()
  );

  if (existingGroup) {
    return existingGroup;
  }

  const nextGroup: GroupMeta = {
    name: groupName,
    createdAt: Date.now(),
    type: "auto"
  };

  await saveGroup(nextGroup);
  return nextGroup;
}

async function ensureChromeMembership(
  groupMeta: GroupMeta,
  tabIds: number[]
): Promise<GroupMeta> {
  if (tabIds.length === 0 || typeof chrome.tabs?.group !== "function") {
    return groupMeta;
  }

  const resolvedGroup = await ensureChromeGroupAvailable(groupMeta, {
    tabIds
  });

  if (resolvedGroup.originalGroupId === undefined) {
    return resolvedGroup;
  }

  try {
    await chrome.tabs.group({
      tabIds,
      groupId: resolvedGroup.originalGroupId
    });
    return resolvedGroup;
  } catch (error) {
    console.error(`Failed to add tabs to Chrome group "${resolvedGroup.name}"`, error);
    return resolvedGroup;
  }
}

async function ensureChromeGroupAvailable(
  groupMeta: GroupMeta,
  options: {
    tabIds?: number[];
    urls?: string[];
  } = {}
): Promise<GroupMeta> {
  // Prefer the Chrome group we are already linked to, then fall back to any open
  // Chrome group whose title matches this group's name so saves automatically
  // join an existing aligned tab group instead of creating a duplicate.
  const existingChromeGroup =
    (await findExistingChromeGroup(groupMeta.originalGroupId)) ??
    (await findChromeGroupByTitle(groupMeta.name));

  if (existingChromeGroup) {
    await updateChromeGroupMetadata(existingChromeGroup.id, groupMeta);

    // Persist the discovered link when it wasn't already stored.
    if (groupMeta.originalGroupId !== existingChromeGroup.id) {
      return persistGroupChromeId(groupMeta, existingChromeGroup.id);
    }

    return {
      ...groupMeta,
      originalGroupId: existingChromeGroup.id
    };
  }

  const candidateTabIds =
    options.tabIds?.length ? options.tabIds : await findOpenTabIdsByUrls(options.urls ?? []);

  if (candidateTabIds.length === 0 || typeof chrome.tabs?.group !== "function") {
    return groupMeta;
  }

  try {
    const groupId = await chrome.tabs.group({ tabIds: candidateTabIds });
    const updatedGroup = await persistGroupChromeId(
      {
        ...groupMeta,
        color: groupMeta.color ?? "blue"
      },
      groupId
    );

    await updateChromeGroupMetadata(groupId, updatedGroup);
    return updatedGroup;
  } catch (error) {
    console.error(`Failed to create Chrome group for "${groupMeta.name}"`, error);
    return groupMeta;
  }
}

async function persistGroupChromeId(groupMeta: GroupMeta, groupId: number): Promise<GroupMeta> {
  const updatedGroup: GroupMeta = {
    ...groupMeta,
    originalGroupId: groupId
  };

  await saveGroup(updatedGroup);
  return updatedGroup;
}

async function updateChromeGroupMetadata(groupId: number, groupMeta: GroupMeta): Promise<void> {
  const existingChromeGroup = await findExistingChromeGroup(groupId);

  if (!existingChromeGroup || typeof chrome.tabGroups?.update !== "function") {
    return;
  }

  try {
    await chrome.tabGroups.update(groupId, {
      title: groupMeta.name,
      ...(groupMeta.color ? { color: groupMeta.color } : {})
    });
  } catch (error) {
    console.error(`Failed to update Chrome tab group metadata for "${groupMeta.name}"`, error);
  }
}

async function findExistingChromeGroup(
  groupId?: number
): Promise<chrome.tabGroups.TabGroup | null> {
  if (groupId === undefined || typeof chrome.tabGroups?.query !== "function") {
    return null;
  }

  try {
    const groups = await chrome.tabGroups.query({});
    return groups.find((group) => group.id === groupId) ?? null;
  } catch (error) {
    console.error(`Failed to query Chrome tab groups for id ${groupId}`, error);
    return null;
  }
}

async function findChromeGroupByTitle(
  title: string
): Promise<chrome.tabGroups.TabGroup | null> {
  const normalizedTitle = title.trim().toLowerCase();

  if (!normalizedTitle || typeof chrome.tabGroups?.query !== "function") {
    return null;
  }

  try {
    const groups = await chrome.tabGroups.query({});
    return (
      groups.find((group) => group.title?.trim().toLowerCase() === normalizedTitle) ?? null
    );
  } catch (error) {
    console.error(`Failed to query Chrome tab groups by title "${title}"`, error);
    return null;
  }
}

async function removeChromeGroup(groupMeta: GroupMeta, savedTabs: SavedTab[]): Promise<void> {
  const chromeGroup = await findExistingChromeGroup(groupMeta.originalGroupId);

  if (chromeGroup && typeof chrome.tabs?.ungroup === "function") {
    try {
      const groupedTabs = await chrome.tabs.query({ groupId: chromeGroup.id });
      const tabIds = groupedTabs
        .map((tab) => tab.id)
        .filter((id): id is number => typeof id === "number");

      if (tabIds.length > 0) {
        await chrome.tabs.ungroup(tabIds);
      }

      return;
    } catch (error) {
      console.error(`Failed to ungroup Chrome tabs for "${groupMeta.name}"`, error);
    }
  }

  const openTabIds = await findOpenTabIdsByUrls(savedTabs.map((tab) => tab.url));

  if (openTabIds.length > 0 && typeof chrome.tabs?.ungroup === "function") {
    try {
      await chrome.tabs.ungroup(openTabIds);
    } catch (error) {
      console.error(`Failed to ungroup fallback Chrome tabs for "${groupMeta.name}"`, error);
    }
  }
}

async function removeSingleTabFromChromeGroup(
  savedTab: SavedTab,
  groupMeta: GroupMeta
): Promise<void> {
  if (typeof chrome.tabs?.query !== "function" || typeof chrome.tabs?.ungroup !== "function") {
    return;
  }

  try {
    const matchingTabs = await chrome.tabs.query({ url: savedTab.url });
    const resolvedGroup = await ensureChromeGroupAvailable(groupMeta, {
      urls: [savedTab.url]
    });
    const tabIds = matchingTabs
      .filter(
        (tab) =>
          typeof tab.id === "number" &&
          tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE &&
          (resolvedGroup.originalGroupId === undefined || tab.groupId === resolvedGroup.originalGroupId)
      )
      .map((tab) => tab.id as number);

    if (tabIds.length > 0) {
      await chrome.tabs.ungroup(tabIds);
    }
  } catch (error) {
    console.error(`Failed to ungroup saved tab "${savedTab.title}" in Chrome`, error);
  }
}

async function renameChromeGroup(groupMeta: GroupMeta, previousName: string): Promise<void> {
  const savedTabs = (await getTabs()).filter((tab) => tab.group === groupMeta.name);
  const resolvedGroup = await ensureChromeGroupAvailable(groupMeta, {
    urls: savedTabs.map((tab) => tab.url)
  });

  if (resolvedGroup.originalGroupId === undefined) {
    return;
  }

  await updateChromeGroupMetadata(resolvedGroup.originalGroupId, resolvedGroup);

  const groups = await getGroups();
  const nextGroups = upsertGroupMeta(groups, resolvedGroup, previousName);
  await saveGroups(nextGroups);
}

async function findOpenTabIdsByUrls(urls: string[]): Promise<number[]> {
  if (urls.length === 0 || typeof chrome.tabs?.query !== "function") {
    return [];
  }

  const uniqueUrls = Array.from(new Set(urls));
  const tabIdSet = new Set<number>();

  for (const url of uniqueUrls) {
    try {
      const tabs = await chrome.tabs.query({ url });

      for (const tab of tabs) {
        if (typeof tab.id === "number") {
          tabIdSet.add(tab.id);
        }
      }
    } catch (error) {
      console.error(`Failed to query Chrome tabs for URL "${url}"`, error);
    }
  }

  return Array.from(tabIdSet);
}

function findGroupMeta(
  groups: GroupMeta[],
  groupId?: number,
  title?: string
): GroupMeta | undefined {
  const normalizedTitle = title?.trim().toLowerCase();

  return groups.find((group) => {
    if (groupId !== undefined && group.originalGroupId === groupId) {
      return true;
    }

    if (normalizedTitle) {
      return group.name.toLowerCase() === normalizedTitle;
    }

    return false;
  });
}

function upsertGroupMeta(
  groups: GroupMeta[],
  nextGroup: GroupMeta,
  previousName?: string
): GroupMeta[] {
  const normalizedNextName = nextGroup.name.toLowerCase();
  const normalizedPreviousName = previousName?.toLowerCase();
  const filtered = groups.filter((group) => {
    if (group.originalGroupId === nextGroup.originalGroupId) {
      return false;
    }

    if (group.name.toLowerCase() === normalizedNextName) {
      return false;
    }

    if (normalizedPreviousName && group.name.toLowerCase() === normalizedPreviousName) {
      return false;
    }

    return true;
  });

  filtered.push(nextGroup);
  filtered.sort((left, right) => left.createdAt - right.createdAt);
  return filtered;
}

function buildChromeSyncedTab(
  tab: chrome.tabs.Tab & { url: string },
  group: GroupMeta
): SavedTab {
  const savedTab = buildSavedTab(tab, group.name, "inherited");
  savedTab.groupColor = group.color;
  savedTab.importedGroupId = group.originalGroupId;
  return savedTab;
}
