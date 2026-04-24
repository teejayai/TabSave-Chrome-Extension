import type { GroupMeta, SavedTab, TabSaveStorageShape } from "./types";

export const STORAGE_KEYS = {
  tabs: "tabs",
  groups: "groups"
} as const;

type StorageKey = typeof STORAGE_KEYS.tabs | typeof STORAGE_KEYS.groups;
type StorageSnapshot = TabSaveStorageShape;

function getStorageArea(): chrome.storage.StorageArea | null {
  return chrome?.storage?.local ?? null;
}

async function getFromStorage<T>(key: StorageKey, fallback: T): Promise<T> {
  try {
    const storage = getStorageArea();

    if (!storage) {
      return fallback;
    }

    const result = (await storage.get(key)) as Record<string, unknown>;
    return (result[key] as T | undefined) ?? fallback;
  } catch (error) {
    console.error(`Failed to read ${key} from chrome.storage.local`, error);
    return fallback;
  }
}

async function setInStorage(values: Partial<Record<StorageKey, unknown>>): Promise<void> {
  try {
    const storage = getStorageArea();

    if (!storage) {
      return;
    }

    await storage.set(values);
  } catch (error) {
    console.error("Failed to write to chrome.storage.local", error);
  }
}

export async function getStorageSnapshot(): Promise<TabSaveStorageShape> {
  const snapshot = await getAllStorage();
  return {
    tabs: snapshot.tabs,
    groups: snapshot.groups
  };
}

export async function getTabs(): Promise<SavedTab[]> {
  return getFromStorage<SavedTab[]>(STORAGE_KEYS.tabs, []);
}

export async function saveTabs(tabs: SavedTab[]): Promise<void> {
  await setInStorage({ [STORAGE_KEYS.tabs]: tabs });
}

export async function addTab(tab: SavedTab): Promise<void> {
  const tabs = await getTabs();
  await saveTabs([...tabs, tab]);
}

export async function addTabs(tabs: SavedTab[]): Promise<void> {
  const existing = await getTabs();
  await saveTabs([...existing, ...tabs]);
}

export async function deleteTab(id: string): Promise<void> {
  const tabs = await getTabs();
  await saveTabs(tabs.filter((tab) => tab.id !== id));
}

export async function deleteGroup(groupName: string): Promise<void> {
  try {
    const [tabs, groups] = await Promise.all([getTabs(), getGroups()]);
    const nextTabs = tabs.filter((tab) => tab.group !== groupName);
    const nextGroups = groups.filter((group) => group.name !== groupName);
    await setInStorage({
      [STORAGE_KEYS.tabs]: nextTabs,
      [STORAGE_KEYS.groups]: nextGroups
    });
  } catch (error) {
    console.error(`Failed to delete group "${groupName}"`, error);
  }
}

export async function getGroups(): Promise<GroupMeta[]> {
  return getFromStorage<GroupMeta[]>(STORAGE_KEYS.groups, []);
}

export async function saveGroup(group: GroupMeta): Promise<void> {
  try {
    const groups = await getGroups();
    const normalizedName = group.name.toLowerCase();
    const nextGroups = groups.filter((item) => item.name.toLowerCase() !== normalizedName);
    nextGroups.push(group);
    nextGroups.sort((left, right) => left.createdAt - right.createdAt);
    await setInStorage({ [STORAGE_KEYS.groups]: nextGroups });
  } catch (error) {
    console.error(`Failed to save group "${group.name}"`, error);
  }
}

export async function saveGroups(groups: GroupMeta[]): Promise<void> {
  await setInStorage({ [STORAGE_KEYS.groups]: groups });
}

async function getAllStorage(): Promise<StorageSnapshot> {
  try {
    const storage = getStorageArea();

    if (!storage) {
      return {
        tabs: [],
        groups: []
      };
    }

    const result = (await storage.get([
      STORAGE_KEYS.tabs,
      STORAGE_KEYS.groups
    ])) as Partial<StorageSnapshot>;

    return {
      tabs: Array.isArray(result.tabs) ? result.tabs : [],
      groups: Array.isArray(result.groups) ? result.groups : []
    };
  } catch (error) {
    console.error("Failed to read storage snapshot", error);
    return {
      tabs: [],
      groups: []
    };
  }
}
