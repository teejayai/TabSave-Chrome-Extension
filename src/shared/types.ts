export type ChromeTabGroupColor = chrome.tabGroups.ColorEnum;
export type SavedTabSource = "manual" | "window" | "inherited";
export type GroupType = "auto" | "custom" | "inherited";
export type SaveTarget = "auto" | string | null;

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  domain: string;
  favicon?: string;
  group: string;
  groupColor?: ChromeTabGroupColor;
  sessionId?: string;
  importedGroupId?: number;
  source: SavedTabSource;
  createdAt: number;
}

export interface GroupMeta {
  name: string;
  createdAt: number;
  color?: ChromeTabGroupColor;
  type: GroupType;
  inherited?: boolean;
  originalGroupId?: number;
}

export interface TabSaveStorageShape {
  tabs: SavedTab[];
  groups: GroupMeta[];
}

export type GroupedTabs = Record<string, SavedTab[]>;

export interface SaveTabMessage {
  type: "SAVE_TAB";
  payload?: {
    targetGroup: SaveTarget;
  };
}

export interface SaveWindowMessage {
  type: "SAVE_WINDOW";
}

export interface OpenTabMessage {
  type: "OPEN_TAB";
  payload: {
    tabId: string;
  };
}

export interface OpenGroupMessage {
  type: "OPEN_GROUP";
  payload: {
    groupName: string;
  };
}

export interface OpenGroupNewWindowMessage {
  type: "OPEN_GROUP_NEW_WINDOW";
  payload: {
    groupName: string;
  };
}

export interface CreateCustomGroupMessage {
  type: "CREATE_GROUP";
  payload: {
    name: string;
  };
}

export interface DeleteTabMessage {
  type: "DELETE_TAB";
  payload: {
    id: string;
  };
}

export interface DeleteGroupMessage {
  type: "DELETE_GROUP";
  payload: {
    groupName: string;
  };
}

export interface RenameGroupMessage {
  type: "RENAME_GROUP";
  payload: {
    currentName: string;
    nextName: string;
  };
}

export type BackgroundMessage =
  | SaveTabMessage
  | SaveWindowMessage
  | OpenTabMessage
  | OpenGroupMessage
  | OpenGroupNewWindowMessage
  | CreateCustomGroupMessage
  | DeleteTabMessage
  | DeleteGroupMessage
  | RenameGroupMessage;

export type TabSaveRuntimeMessageType = BackgroundMessage["type"];
