import { test, expect } from '@playwright/test';
import { createStepper } from './utils/screenshot';

test('create a room and verify the settings modal has no consensus toggle', async ({ page }) => {
    const shoot = createStepper(page, 'lobby');

    await page.goto('/');
    await shoot('home');

    await page.getByPlaceholder('Your name').fill('Playwright Host');
    await page.getByRole('button', { name: 'Gather a New Village' }).click();

    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+/);
    await expect(page.locator('.room-shell__room-code')).toBeVisible();
    await shoot('room created');

    await page.getByRole('button', { name: /Rules & Setup/ }).click();
    await expect(page.getByRole('heading', { name: 'Rules & Setup' })).toBeVisible();
    await shoot('settings modal open');

    // Regression check: this toggle was removed once the backend started always
    // resolving the werewolf vote by majority instead of requiring consensus.
    await expect(page.getByText('Werewolves require consensus')).toHaveCount(0);
});
