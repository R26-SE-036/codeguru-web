/**
 * The VS Code extension's sign-in, with a real browser doing the browser's
 * part. The test stands in for the extension: it listens on the loopback port,
 * takes the code the browser brings back, and redeems it at the edge exactly as
 * browserAuth.ts does.
 */
import { expect, test } from '@playwright/test';

import { CALLBACK, fakeExtensionListener, newStudent, register } from './support';

const signInUrl = `/login?redirect_uri=${encodeURIComponent(CALLBACK)}`;

test.describe('signing the editor in', () => {
  let listener: Awaited<ReturnType<typeof fakeExtensionListener>>;

  test.beforeEach(async () => {
    listener = await fakeExtensionListener();
    test.skip(!listener.listening, 'port 53682 is in use - probably a real VS Code sign-in in progress');
  });

  test.afterEach(async () => {
    await listener?.close();
  });

  test('from a signed-out browser: sign in, and the editor gets a code that works', async ({ page, request }) => {
    const student = newStudent('editor-signed-out');
    await register(request, student);

    await page.goto(signInUrl);
    await page.getByLabel('Email').fill(student.email);
    await page.getByLabel('Password', { exact: true }).fill(student.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL(/^http:\/\/127\.0\.0\.1:53682\/callback\?code=/);
    const code = await listener.code;
    expect(code).toBeTruthy();

    const redeemed = await request.post('/api/v1/auth/handoff/redeem', { data: { code } });
    expect(redeemed.status()).toBe(200);
    expect((await redeemed.json()).user.email).toBe(student.email);
  });

  test('from a browser that is already signed in: connect without signing in again', async ({ page, request }) => {
    const student = newStudent('editor-signed-in');
    // page.request shares the page's cookies: this browser is now signed in,
    // which is the usual state of a student's browser when they click Sign In
    // in VS Code.
    await register(page.request, student);

    await page.goto(signInUrl);

    // It used to bounce a signed-in browser straight to the home page and drop
    // the return address, leaving the editor waiting until it timed out.
    await expect(page.getByRole('heading', { name: 'Connect VS Code' })).toBeVisible();
    await expect(page.getByText(student.email)).toBeVisible();
    await page.getByRole('button', { name: 'Connect VS Code' }).click();

    await page.waitForURL(/^http:\/\/127\.0\.0\.1:53682\/callback\?code=/);
    const redeemed = await request.post('/api/v1/auth/handoff/redeem', { data: { code: await listener.code } });
    expect(redeemed.status()).toBe(200);
    expect((await redeemed.json()).user.email).toBe(student.email);
  });
});
