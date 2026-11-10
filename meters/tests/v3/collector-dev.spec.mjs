// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Unlike src=sim, this drives the unmodified shell collector and polls its output.
test('synthetic collector data reaches Meters; paused traffic shows NO DATA and recovers', async ({ page }) => {
  test.setTimeout(60000);
  const script = fileURLToPath(new URL('../../../dev/serve.py', import.meta.url));
  const args = [script, '--no-browser', '--port', '0', '--at', '6'];
  if (process.env.MO_DOCKER_IMAGE) args.push('--docker', process.env.MO_DOCKER_IMAGE);
  const child = spawn(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let output = '';
  child.stderr.on('data', data => { output += data; });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Preview did not start: ' + output)), 35000);
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/index\.html\?src=poll:live\.txt/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Preview exited ${code}: ${output}`)); });
    });
    await page.goto(url + '&set=street&page=0');
    await expect.poll(() => page.evaluate(() => window.MeterData.target.speed)).toBe(30);
    expect(await page.evaluate(() => window.MeterData.target.coolant)).toBe(85);
    expect(await page.evaluate(() => window.MeterData.target.iat)).toBe(31);
    expect(await page.evaluate(() => window.MeterData.target.outside)).toBe(17);
    expect(await page.evaluate(() => window.MeterData.target.fuel)).toBeCloseTo(120 * 100 / 181, 3);
    expect(await page.evaluate(() => window.MeterData.sourceName)).toBe('LIVE');
    await expect(page.locator('#nodata')).toBeHidden();
    child.stdin.write('\n');
    await expect(page.locator('#nodata')).toBeVisible({ timeout: 8000 });
    child.stdin.write('\n');
    await expect(page.locator('#nodata')).toBeHidden({ timeout: 8000 });
  } finally {
    child.kill('SIGTERM');
    await exited;
  }
});
