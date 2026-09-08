import { test as base, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({ }, use) => {
    const pathToExtension = path.join(__dirname, '../../dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background)
      background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

test.describe('TabSave E2E', () => {
  test('should save the current window', async ({ context, extensionId }) => {
    const testPage = await context.newPage();
    await testPage.goto('https://example.com/');
    await testPage.waitForLoadState('networkidle');

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await popupPage.waitForLoadState('networkidle');

    await popupPage.locator('[data-action="save-window"]').click();
    await expect(popupPage.locator('.toast--success')).toHaveText('Window saved');
    await expect(popupPage.locator('.group-card__name')).toContainText('Example');
  });

  test('should show error when trying to save an internal page', async ({ context, extensionId }) => {
    const internalPage = await context.newPage();
    await internalPage.goto('about:blank');
    await internalPage.waitForLoadState('networkidle');

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    
    await internalPage.bringToFront();
    await popupPage.bringToFront();

    await popupPage.locator('[data-action="save-tab"]').click();
    await expect(popupPage.locator('.toast--error')).toHaveText("This page doesn't have a web address to save.");
  });

  test('should create a custom group and defer grouping', async ({ context, extensionId }) => {
    // 1. Open test page first
    const testPage = await context.newPage();
    await testPage.goto('https://example.com/');
    await testPage.waitForLoadState('networkidle');

    // 2. Open popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    
    // Create empty group
    await popupPage.locator('[data-action="new-group"]').click();
    await popupPage.locator('#new-group-input').fill('My Research');
    await popupPage.locator('button[type="submit"]').click();
    await expect(popupPage.locator('.toast--success')).toHaveText('New group created');

    // 3. Select group and save
    await popupPage.locator('[data-action="toggle-group-selector"]').click();
    await popupPage.locator('button[data-group-value="My Research"]').click();
    
    // Re-focus the test page to ensure it is the "active" tab for the background script
    await testPage.bringToFront();
    await popupPage.bringToFront();
    
    await popupPage.locator('[data-action="save-window"]').click();
    
    const toast = popupPage.locator('.toast--success');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toHaveText('Window saved');

    // 4. Verify tab in group
    const groupCard = popupPage.locator('.group-card', { hasText: 'My Research' }).first();
    await groupCard.locator('[data-action="toggle-group"]').click();
    await expect(groupCard.locator('.tab-card__title')).toContainText('Example Domain');
  });

  test('should show validation for duplicate group names', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    
    await popupPage.locator('[data-action="new-group"]').click();
    await popupPage.locator('#new-group-input').fill('Duplicate');
    await popupPage.locator('button[type="submit"]').click();
    
    await popupPage.locator('[data-action="new-group"]').click();
    await popupPage.locator('#new-group-input').fill('Duplicate');
    await popupPage.locator('button[type="submit"]').click();
    
    await expect(popupPage.locator('.field__error')).toHaveText('Group "Duplicate" already exists.');
  });

  test('should automatically sync when a tab is added to a Chrome group', async ({ context, extensionId }) => {
    // 1. Create a custom group in TabSave
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await popupPage.locator('[data-action="new-group"]').click();
    await popupPage.locator('#new-group-input').fill('Sync Group');
    await popupPage.locator('button[type="submit"]').click();
    await expect(popupPage.locator('.toast--success')).toBeVisible();

    // 2. Open a test page
    const testPage = await context.newPage();
    await testPage.goto('https://example.com/');
    await testPage.waitForLoadState('networkidle');

    // 3. Move the tab into a Chrome group with the same name
    await popupPage.evaluate(async (name) => {
      const [tab] = await chrome.tabs.query({ url: 'https://example.com/' });
      if (tab?.id) {
        const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
        await chrome.tabGroups.update(groupId, { title: name });
      }
    }, 'Sync Group');

    // 4. Wait for sync and verify in popup
    await popupPage.bringToFront();
    const groupCard = popupPage.locator('.group-card', { hasText: 'Sync Group' }).first();
    await expect(groupCard).toBeVisible({ timeout: 10000 });
    
    // The tab should have been synced automatically
    await groupCard.locator('[data-action="toggle-group"]').click();
    await expect(groupCard.locator('.tab-card__title')).toContainText('Example Domain');
  });
});
