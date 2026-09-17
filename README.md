# Orbit Windows (H1-a1)

Personal **Windows desk companion** for Orbit: always-on idle presence, task-wake Ask, one full-monitor frame via Electron `desktopCapturer`, propose + **PLAN · TEXT ONLY**, **Confirm** forever, then a text-only act stub (**no HID**).

Soft UX reference: Orbit cyber v3 (browser demo). This app is the native Windows path — no `getDisplayMedia` picker loop.

Repo: https://github.com/SeanMcCarron85/orbit-windows

## Download for home Windows (no npm build)

**Recommended:** grab the prebuilt zip — unzip and run. No Node/npm required on the home PC.

1. Download **[Orbit-1.0.0-win-x64.zip](https://github.com/SeanMcCarron85/orbit-windows/releases/download/v1.0.0-h1a1/Orbit-1.0.0-win-x64.zip)** from the [v1.0.0-h1a1 release](https://github.com/SeanMcCarron85/orbit-windows/releases/tag/v1.0.0-h1a1).
2. Unzip the archive (e.g. right-click → Extract All).
3. Open the extracted folder and double-click **`Orbit.exe`**.
4. **SmartScreen** (unsigned personal build): if Windows shows *“Windows protected your PC”* → **More info** → **Run anyway**.
5. First **Ask** / **What’s on screen?** may still prompt for screen-capture / desktop recording permission — allow once.
6. Later Asks reuse Electron `desktopCapturer` on the primary monitor (no browser share picker).

Release page (all assets): https://github.com/SeanMcCarron85/orbit-windows/releases/tag/v1.0.0-h1a1

---

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

## Dev path (`npm start`)

For local development from source (Node 18+):

```bash
npm start
```

That launches Electron and loads the companion UI.

### Rebuild the Windows zip (maintainers / CI)

On Linux (this repo’s preferred path; **no Wine**):

```bash
npm run dist
```

Produces `dist/Orbit-1.0.0-win-x64.zip` via electron-builder **`zip`** target (`signAndEditExecutable: false`). NSIS/portable targets need Wine on Linux and are not used for the home download.

Attach the zip to a GitHub Release — do not commit binaries into git.

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
