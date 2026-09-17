'use strict';

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, systemPreferences } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  name: 'orbit-settings',
  defaults: {
    vision: {
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: '',
    },
  },
});

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 720,
    minHeight: 640,
    title: 'Orbit — Windows desk companion',
    backgroundColor: '#07090e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Prefer the primary display's screen source.
 * Electron screen source ids often look like `screen:0:0` or include display id.
 */
async function capturePrimaryScreenJpeg({ maxWidth = 1280, quality = 0.82 } = {}) {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;
  const thumbWidth = Math.min(maxWidth, Math.round(width * scale));
  const thumbHeight = Math.round((height * scale * thumbWidth) / (width * scale));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbWidth, height: thumbHeight },
    fetchWindowIcons: false,
  });

  if (!sources.length) {
    return {
      ok: false,
      error: 'no-screen-sources',
      message: 'No screen sources from desktopCapturer (check OS screen permission).',
    };
  }

  const primaryIdStr = String(primary.id);
  let chosen =
    sources.find((s) => String(s.display_id) === primaryIdStr) ||
    sources.find((s) => s.id.includes(primaryIdStr)) ||
    sources.find((s) => /primary|entire|screen 1|display 1/i.test(s.name)) ||
    sources[0];

  const thumb = chosen.thumbnail;
  if (!thumb || thumb.isEmpty()) {
    return {
      ok: false,
      error: 'empty-thumbnail',
      message: 'Screen thumbnail empty — grant screen recording permission and retry Ask.',
    };
  }

  const dataUrl = thumb.toDataURL({
    // Electron NativeImage toDataURL is PNG by default; convert via JPEG quality when available.
  });

  // Prefer JPEG for vision payload size: re-encode via data URL quality if possible.
  // NativeImage supports toJPEG on Buffer path.
  let jpegDataUrl = dataUrl;
  let mime = 'image/png';
  try {
    const buf = thumb.toJPEG(Math.round(Math.min(100, Math.max(40, quality * 100))));
    jpegDataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    mime = 'image/jpeg';
  } catch (_) {
    // keep PNG data URL
  }

  return {
    ok: true,
    dataUrl: jpegDataUrl,
    mime,
    sourceId: chosen.id,
    sourceName: chosen.name,
    displayId: chosen.display_id || primaryIdStr,
    width: thumb.getSize().width,
    height: thumb.getSize().height,
    primaryDisplayId: primary.id,
    captureKind: 'desktopCapturer-screen',
  };
}

function getScreenPermissionStatus() {
  // macOS has explicit screen capture status; Windows/Linux typically grant via first use / OS settings.
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus) {
    return systemPreferences.getMediaAccessStatus('screen');
  }
  return process.platform === 'win32' ? 'windows-os-grant' : 'linux-likely-ok';
}

function registerIpc() {
  ipcMain.handle('orbit:get-meta', () => ({
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    appVersion: app.getVersion(),
    screenPermission: getScreenPermissionStatus(),
  }));

  ipcMain.handle('orbit:capture-screen', async (_evt, opts = {}) => {
    try {
      return await capturePrimaryScreenJpeg(opts);
    } catch (err) {
      return {
        ok: false,
        error: 'capture-threw',
        message: err && err.message ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('orbit:get-vision-settings', () => {
    const vision = store.get('vision') || {};
    return {
      provider: vision.provider || 'openai-compatible',
      baseUrl: vision.baseUrl || 'https://api.openai.com/v1/chat/completions',
      model: vision.model || 'gpt-4o-mini',
      hasKey: Boolean(vision.apiKey),
      // Never send raw key to renderer logs; send masked for UI only when present
      apiKeyMasked: vision.apiKey ? '••••••••••••••••' : '',
    };
  });

  ipcMain.handle('orbit:save-vision-settings', (_evt, payload = {}) => {
    const current = store.get('vision') || {};
    const next = {
      provider: (payload.provider || current.provider || 'openai-compatible').trim(),
      baseUrl: (payload.baseUrl || current.baseUrl || 'https://api.openai.com/v1/chat/completions').trim(),
      model: (payload.model || current.model || 'gpt-4o-mini').trim(),
      apiKey: current.apiKey || '',
    };
    // Only replace key if a non-masked, non-empty value was provided
    const incoming = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
    if (incoming && !/^•+$/.test(incoming)) {
      next.apiKey = incoming;
    }
    store.set('vision', next);
    return {
      ok: true,
      hasKey: Boolean(next.apiKey),
      provider: next.provider,
      baseUrl: next.baseUrl,
      model: next.model,
    };
  });

  ipcMain.handle('orbit:clear-vision-key', () => {
    const current = store.get('vision') || {};
    store.set('vision', {
      ...current,
      apiKey: '',
    });
    return { ok: true, hasKey: false };
  });

  /**
   * Vision call runs in main so the API key never sits in renderer memory longer than needed.
   * Key is read from electron-store only; never logged.
   */
  ipcMain.handle('orbit:vision-propose', async (_evt, { dataUrl, userCue } = {}) => {
    const vision = store.get('vision') || {};
    const apiKey = vision.apiKey || '';
    if (!apiKey) {
      return { ok: false, error: 'no-key' };
    }
    if (!dataUrl) {
      return { ok: false, error: 'no-frame' };
    }

    const baseUrl = (vision.baseUrl || 'https://api.openai.com/v1/chat/completions').trim();
    const model = (vision.model || 'gpt-4o-mini').trim();
    const cue = (userCue || "What's on screen?").slice(0, 240);

    const body = {
      model,
      temperature: 0.4,
      max_tokens: 420,
      messages: [
        {
          role: 'system',
          content:
            'You are Orbit, a compact desk companion. Reply with ONLY a JSON object (no markdown fences) shaped like: {"propose":"<one short Orbit-voice offer, max ~28 words>","steps":["…","…","…"]}. steps must be 3–6 short numbered-ready action lines a human can follow. Text only — Orbit cannot control keyboard/mouse. No preamble.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `User cue: ${cue}\nHere is the full-monitor frame. Return propose + steps JSON for what is visible.`,
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);

    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          ok: false,
          error: 'http',
          status: res.status,
          detail: text.slice(0, 200),
          model,
        };
      }

      const json = await res.json();
      const content =
        json &&
        json.choices &&
        json.choices[0] &&
        json.choices[0].message &&
        json.choices[0].message.content
          ? String(json.choices[0].message.content)
          : '';

      return { ok: true, content, model, provider: 'openai-compatible' };
    } catch (err) {
      clearTimeout(timer);
      const aborted = err && err.name === 'AbortError';
      return {
        ok: false,
        error: aborted ? 'timeout' : 'network',
        detail: err && err.message ? err.message : String(err),
        model,
      };
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
