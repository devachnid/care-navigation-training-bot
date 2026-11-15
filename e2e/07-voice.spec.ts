import { expect, test } from '@playwright/test';
import path from 'node:path';
import { chromiumPath, ROOT } from './support/env';
import { newContextFor, setUpPractice } from './support/flows';

/**
 * Journey 7: a real voice call. Only `npm run e2e:voice` runs it (it is tagged @voice).
 *
 * A manager of a fresh practice takes the "Repeat prescription with buried red flag" draft. Chromium's
 * fake microphone plays e2e/fixtures/good.wav (a synthetic receptionist handling the call well), the
 * real voice model plays the caller, the test hangs up after about 78 seconds and the real debrief
 * model marks it. It costs a few pence and needs AI_GATEWAY_API_KEY (in .env.local) and network access.
 */

const WAV = path.join(ROOT, 'e2e', 'fixtures', 'good.wav');
const TITLE = 'Repeat prescription with buried red flag';
const HANG_UP_AFTER_SECONDS = 78;

// The browser reaches the voice service through HTTPS_PROXY when there is one; localhost is not proxied.
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost' } : undefined;

test.use({
  launchOptions: {
    executablePath: chromiumPath,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${WAV}%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
    proxy,
  },
});

test('a manager takes a real voice call and gets a debrief', { tag: '@voice' }, async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  test.skip(!process.env.AI_GATEWAY_API_KEY, 'AI_GATEWAY_API_KEY is not set (see e2e/README.md).');

  const practice = await setUpPractice(browser, 'voice');
  const context = await newContextFor(browser, practice.manager);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith('http://localhost')) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
  });
  page.on('websocket', ws =>
    ws.on('framereceived', f => {
      try {
        const message = JSON.parse(String(f.payload));
        if (message.type === 'error') problems.push(`voice error ${String(f.payload).slice(0, 300)}`);
      } catch {
        // Audio frames and other non-JSON frames.
      }
    }),
  );

  // Choose the call. It is a draft, which a manager may always try.
  await page.goto('/');
  await page.getByRole('button', { name: `Start the call ${TITLE}` }).click();
  await page.waitForURL(/\/call\/[0-9a-f-]{36}$/);
  const sessionId = page.url().split('/').pop()!;

  // The page the server sent holds no answer key.
  const html = await (await page.request.get(`/call/${sessionId}`)).text();
  expect(html).not.toContain('advise 999 immediately');
  expect(html).not.toContain('Processing the prescription request and ending the call');

  // Take the call, speak (the fake microphone) for about 78 seconds, hang up.
  await page.getByRole('button', { name: /start call/i }).click();
  await expect(page.getByRole('button', { name: /hang up/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(HANG_UP_AFTER_SECONDS * 1000);
  await page.getByRole('button', { name: /hang up/i }).click();

  // The debrief: written by the real model, so assert its shape and the call's content, not exact words.
  await page.waitForURL(/\/debrief\//, { timeout: 180_000 });
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  const result = page.getByLabel('Result of this call');
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result.getByText('Score').locator('..')).toHaveText(/Score\s*\d+%/);
  await expect(result.getByText('Outcome correct').locator('..')).toHaveText(/Outcome correct\s*Yes/);

  const transcript = page.locator('ol', { hasText: 'Caller' }).first();
  const text = await transcript.innerText();
  expect(text, 'the caller spoke').toContain('Caller');
  expect(text, 'the receptionist (the fake microphone) was heard').toContain('You');
  expect(text.toLowerCase()).toContain('chest');
  expect(text.toLowerCase()).toMatch(/999|nine nine nine|nine-nine-nine/);
  expect(problems, 'no failed requests or voice errors during the call').toEqual([]);

  await context.close();
});
