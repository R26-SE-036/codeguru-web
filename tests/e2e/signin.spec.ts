/**
 * Signing up, out and in, in a real browser - and getting sent back to where
 * you were going, on the address you were using.
 */
import { expect, test } from '@playwright/test';

import { BASE, newStudent, watchForProblems } from './support';

test('create an account, sign out, and sign back in to the page you asked for', async ({ page }) => {
  const problems = watchForProblems(page);
  const student = newStudent('signin');

  await page.goto('/register');
  await page.getByLabel('Full name').fill(student.fullName);
  await page.getByLabel('Email').fill(student.email);
  await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL((url) => url.pathname === '/login');

  // A deep link while signed out: sign-in comes first, on the same origin.
  // /insights, because this test is about signing in: a section that needs
  // Study Guider's database is sections.spec.ts's business.
  await page.goto('/insights');
  await expect(page).toHaveURL(`${BASE}/login?next=%2Finsights`);

  await page.getByLabel('Email').fill(student.email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/invalid|incorrect/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Password', { exact: true }).fill(student.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${BASE}/insights`);

  expect(problems).toEqual([]);
});
