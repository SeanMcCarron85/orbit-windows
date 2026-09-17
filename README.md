# Orbit Windows (H1-a1)

Personal **Windows desk companion** for Orbit: always-on idle presence, task-wake Ask, one full-monitor frame via Electron `desktopCapturer`, propose + **PLAN · TEXT ONLY**, **Confirm** forever, then a text-only act stub (**no HID**).

Soft UX reference: Orbit cyber v3 (browser demo). This app is the native Windows path — no `getDisplayMedia` picker loop.

Repo: https://github.com/SeanMcCarron85/orbit-windows

## Requirements

- **Node.js 18+** (developed / verified with Node 20)
- **Windows 10 / 11** for real screen capture + OS permission (also runs on macOS/Linux for UI smoke tests)
- npm

## Install

```bash
git clone https://github.com/SeanMcCarron85/orbit-windows.git
cd orbit-windows
npm install
```

## Run

```bash
npm start
```

That launches Electron and loads the companion UI.

### Optional Windows package

```bash
npm run dist
```

Produces installer / portable artifacts under `dist/` via electron-builder (run on Windows for best results).

## First screen permission (Windows)

1. Start the app (`npm start`).
2. Idle shows **presence on · Ask to wake** — no capture yet.
3. Click **Ask** or **What’s on screen?**
4. On first capture, Windows may prompt for **screen recording / desktop capture** (or require Settings → Privacy → Screen recording / Graphics for the app). Allow once.
5. Later Asks reuse `desktopCapturer` against the **primary display** — no browser share picker every time.

If capture is denied, Orbit shows a labeled fallback frame and a soft plan; Confirm still required.

## Ask flow

1. **idle** — presence on, no analysis
2. Type in **Ask Orbit…** (or **What’s on screen?**) → **Ask**
3. **listen** — one JPEG frame from primary monitor (`desktopCapturer`, `types: ['screen']`)
4. **think** — BYO vision if a key is saved; else soft heuristic
5. **propose** — spoken/caption line + **PLAN · TEXT ONLY** (3–6 steps)
6. **armed-wait** — **Confirm** required
7. **Confirm** → **act** (~1s) caption: *Plan accepted — text only (no HID).*
8. **done** → **idle** — no more frames until the next Ask

## BYO vision (optional)

In **VISION · BYO**:

| Field | Default |
| --- | --- |
| Provider | OpenAI-compatible |
| Base URL | `https://api.openai.com/v1/chat/completions` |
| Model | `gpt-4o-mini` |
| API key | *(your key)* |

**Save** stores settings in **electron-store** under the app `userData` folder (never in the git repo). **Clear** removes the key only.

The key is read in the **main** process for the vision POST (`Authorization: Bearer …` to *your* base URL). It is never committed, never written to STATUS/README, and never logged.

Without a key: soft / estimated propose + plan from brightness / edge / tint heuristics on the frame.

## What this is / is not

**Is:** Windows-ready Electron desk companion with Confirm-gated text plans.  
**Is not:** HID / keyboard / mouse control, Pi / M5Stack hardware, or always-on frame spam.

See [STATUS.md](./STATUS.md) for works vs stubbed and a demo script.
