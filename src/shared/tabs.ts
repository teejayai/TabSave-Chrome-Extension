import type { GroupMeta, SavedTab, SavedTabSource } from "./types";

const INTERNAL_URL_PREFIXES = ["chrome://", "edge://", "about:", "chrome-extension://"];
const COMMON_SECOND_LEVEL_DOMAINS = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
const BRAND_NAME_OVERRIDES: Record<string, string> = {
  github: "GitHub",
  youtube: "YouTube"
};

export async function getCurrentTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;

  if (!tab) {
    throw new Error("No active tab found.");
  }

  return tab;
}

export async function getAllWindowTabs(): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ currentWindow: true });
}

export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const segments = hostname.split(".").filter(Boolean);
    const registrableSegment = getRegistrableSegment(segments);
    return formatBrandName(registrableSegment);
  } catch {
    return "Untitled";
  }
}

export function buildSavedTab(
  tab: chrome.tabs.Tab,
  group: string,
  source: SavedTabSource,
  sessionId?: string
): SavedTab {
  const url = tab.url?.trim();

  if (!url) {
    throw new Error("Cannot save a tab without a URL.");
  }

  return {
    id: crypto.randomUUID(),
    url,
    title: tab.title?.trim() || url,
    domain: extractDomain(url),
    favicon: tab.favIconUrl,
    group,
    source,
    createdAt: Date.now(),
    ...(sessionId ? { sessionId } : {})
  };
}

export function generateSessionId(): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function inheritExistingTabGroups(): Promise<{
  tabs: SavedTab[];
  groups: GroupMeta[];
}> {
  if (
    typeof chrome.windows?.getAll !== "function" ||
    typeof chrome.tabGroups?.query !== "function"
  ) {
    return {
      tabs: [],
      groups: []
    };
  }

  try {
    const windows = await chrome.windows.getAll({ populate: false });
    const importedTabs: SavedTab[] = [];
    const importedGroups: GroupMeta[] = [];
    const usedNames = new Set<string>();

    for (const windowRef of windows) {
      const chromeGroups = await chrome.tabGroups.query({ windowId: windowRef.id });

      for (const group of chromeGroups) {
        const memberTabs = await chrome.tabs.query({ groupId: group.id });
        const validTabs = memberTabs.filter((tab) => isSaveableUrl(tab.url));

        if (validTabs.length === 0) {
          continue;
        }

        const baseName =
          group.title?.trim() || extractDomain(validTabs[0]?.url ?? "") || `Group ${group.id}`;
        const groupName = ensureUniqueGroupName(baseName, usedNames);

        importedGroups.push({
          name: groupName,
          createdAt: Date.now(),
          color: group.color,
          type: "inherited",
          inherited: true,
          originalGroupId: group.id
        });

        for (const tab of validTabs) {
          const savedTab = buildSavedTab(tab, groupName, "inherited");
          savedTab.groupColor = group.color;
          savedTab.importedGroupId = group.id;
          importedTabs.push(savedTab);
        }
      }
    }

    return {
      tabs: importedTabs,
      groups: importedGroups
    };
  } catch (error) {
    console.error("Failed to inherit existing Chrome tab groups", error);
    return {
      tabs: [],
      groups: []
    };
  }
}

function isSaveableUrl(url?: string): url is string {
  if (!url) {
    return false;
  }

  return !INTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function ensureUniqueGroupName(name: string, usedNames: Set<string>): string {
  const trimmed = sanitizeGroupName(name) || "Untitled Group";
  let candidate = trimmed;
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${trimmed} (${suffix})`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function sanitizeGroupName(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function getRegistrableSegment(segments: string[]): string {
  if (segments.length === 0) {
    return "untitled";
  }

  if (segments.length === 1) {
    return segments[0];
  }

  const topLevelDomain = segments.at(-1) ?? "";
  const secondLevelDomain = segments.at(-2) ?? "";

  if (
    segments.length >= 3 &&
    topLevelDomain.length === 2 &&
    COMMON_SECOND_LEVEL_DOMAINS.has(secondLevelDomain)
  ) {
    return segments.at(-3) ?? secondLevelDomain;
  }

  return secondLevelDomain;
}

function formatBrandName(segment: string): string {
  const normalized = segment.trim().toLowerCase();

  if (!normalized) {
    return "Untitled";
  }

  const override = BRAND_NAME_OVERRIDES[normalized];

  if (override) {
    return override;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
