// Records the scripted showreel from the RUNNING demo page, frame by frame (fixed dt), into H.264.
// Every frame is a screenshot of the live page (WebGL canvas + DOM UI); nothing is pre-rendered or upscaled.
//   node capture.mjs <out.mp4> [WxH=1920x1080] [fps=60] [seconds=78]
// Needs: demo server on PORT (default 8765), Edge, ffmpeg path in FFMPEG env.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const out = process.argv[2];
const [W, H] = (process.argv[3] || '1920x1080').split('x').map(Number);
const fps = Number(process.argv[4] || 60), seconds = Number(process.argv[5] || 78);
const total = Math.round(fps * seconds);

const ff = spawn(process.env.FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });

const browser = await puppeteer.launch({
  executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars', '--mute-audio', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${process.env.PORT || 8765}/?capture&director&q=high`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
const cdp = await page.createCDPSession();
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((dt) => window.__frame(dt), 1 / fps);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done', out, `${total} frames @ ${fps} fps, ${W}x${H}`);
