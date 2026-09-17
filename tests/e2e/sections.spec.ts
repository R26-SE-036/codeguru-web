/**
 * Every section, for a signed-in student, on a desktop and on a phone: it
 * loads, it does not crash, and nothing on it says a service is unavailable.
 */
import { expect, test } from '@playwright/test';

import { newStudent, register, watchForProblems } from './support';

const SECTIONS: Array<{ path: string; heading?: string }> = [
  { path: '/' },
  { path: '/insights', heading: 'Patterns in your code' },
  { path: '/study', heading: 'Lessons built for your gaps' },
  { path: '/study/progress', heading: 'Your progress' },
  { path: '/play', heading: 'Short games, tuned to you' },
  { path: '/pair' },
];

test('every section loads with nothing broken or unavailable', async ({ page }, testInfo) => {
  const problems = watchForProblems(page);
  await register(page.request, newStudent(`sections-${testInfo.project.name}`));

  for (const section of SECTIONS) {
    await test.step(section.path, async () => {
      await page.goto(section.path);
      await page.waitForLoadState('networkidle');

      expect(new URL(page.url()).pathname).toBe(section.path);

      // The app's own failure states first, so a section replaced by one says
      // which, rather than failing on a heading that is not there.
      await expect(page.getByText('This page did not load')).toHaveCount(0);
      await expect(page.getByText(/is unavailable right now/)).toHaveCount(0);
      await expect(page.getByText('Pairing is not connected')).toHaveCount(0);

      if (section.heading) {
        await expect(page.getByRole('heading', { name: section.heading })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      }
    });
  }

  expect(problems).toEqual([]);
});

test('the menu opens on a phone and reaches a section', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the sidebar is always visible on a desktop');
  await register(page.request, newStudent('menu'));

  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Sections' }).last().getByRole('link', { name: /Study/ }).click();

  await expect(page).toHaveURL(/\/study$/);
  await expect(page.getByRole('heading', { name: 'Lessons built for your gaps' })).toBeVisible();
});
