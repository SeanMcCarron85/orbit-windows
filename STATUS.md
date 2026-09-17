# Orbit Windows (H1-a1) — status

## Repo
https://github.com/SeanMcCarron85/orbit-windows

## Path
`/workspace/orbit-windows/`

| File | Role |
| --- | --- |
| `main.js` | Electron main: window, `desktopCapturer` primary-screen JPEG, electron-store vision settings, vision POST |
| `preload.js` | `contextBridge` → `window.orbit` IPC |
| `renderer/index.html` | Soft cyber shell: presence orb, BYO panel, PLAN panel, Ask row, Confirm |
| `renderer/styles.css` | Soft cyber styling |
| `renderer/app.js` | States, Ask→frame→propose→armed-wait→Confirm→act→done→idle |
| `package.json` | Electron + electron-store + electron-builder (win) |
| `README.md` | Install / run / permission / Ask / BYO |
| `STATUS.md` | This file |

## UX lock

Presence stays on; **capture/analyze only on task-wake**. No auto frame on launch.

### Presence always on
- On launch: idle orb + STATUS `presence on · Ask to wake`
- **No** `desktopCapturer` call, **no** vision, **no** heuristic until Ask

### Task-wake (text, no mic)
- **Ask Orbit…** + **Ask**
- **What’s on screen?**
- Enter submits

### Capture approach (Windows desk)
- Electron **`desktopCapturer.getSources({ types: ['screen'], thumbnailSize })`**
- Prefer **primary display** (`screen.getPrimaryDisplay()` matched by `display_id` / id / name heuristics, else first screen source)
- Thumbnail encoded as **JPEG** for the propose path
- **Not** browser `getDisplayMedia` — no share-picker every Ask
- First-run / OS screen-recording permission may be required once; later Asks reuse the same API without a picker UI

### Flow
1. **idle** presence
2. **Ask** / **What’s on screen?**
3. **listen** — one full-monitor frame
4. **think** — vision if key else soft heuristic
5. **propose** + **S4 PLAN · TEXT ONLY** (3–6 steps) → **armed-wait**
6. **Confirm** → **act** (~1s) *Plan accepted — text only (no HID).* → **done** → **idle**
7. No more frames until next Ask

Confirm forever. **No HID.**

## Works vs stubbed

### Works
- Idle presence on launch (no auto capture)
- Ask / What’s on screen? task-wake
- Primary-monitor frame via `desktopCapturer` (screen types)
- Soft heuristic propose when no vision key
- Optional BYO OpenAI-compatible vision (key in electron-store / userData)
- PLAN · TEXT ONLY panel with badge `from vision` or `soft / estimated`
- armed-wait + Confirm gate
- Act stub (~1s) — caption/STATUS plan-accepted, no HID
- done → idle
- Fallback synthetic frame when capture blocked
- Secrets local only (`.gitignore` excludes env / local config; key never in repo)

### Stubbed / by design
- **No HID** / no keyboard / mouse injection
- **No mic / ASR** (text Ask only)
- Soft plans are generic when vision is off or weak
- Vision quality depends on your BYO model/key
- No Pi / M5Stack / Orange Pi path
- Simplified orb presence (not full cyber-v3 3D cube / personas / Look around)
- `npm run dist` packaging not smoke-tested on this Linux build agent (source `npm start` is the primary path)

## Permission grant (Windows)

1. `npm start`
2. Ask once
3. If Windows prompts for screen capture / recording — **Allow**
4. Or: Windows Settings → Privacy & security → allow desktop capture / screen recording for Orbit / Electron
5. Re-Ask; STATUS should show `desktopCapturer · primary · …`

Linux/macOS: capture may work without a picker but depends on compositor / Screen Recording TCC (macOS).

## Demo script (wake → frame → propose → Confirm → done)

1. Launch → confirm STATUS **`presence on · Ask to wake`**, state **idle**, no thumb
2. Click **What’s on screen?** (or type a cue + **Ask**)
3. State **listen** → **think** → frame thumb appears; Capture STATUS mentions `desktopCapturer`
4. **propose** shows Orbit line + **PLAN · TEXT ONLY** (badge soft or from vision)
5. State **armed-wait**; **Confirm** visible
6. Click **Confirm** → caption **Plan accepted — text only (no HID).** → **done** → **idle**
7. Confirm Capture STATUS returns to idle / no frames until next Ask
8. Ask again → new frame; Confirm still required before act

Optional: Save a vision key → Ask → badge **from vision** when the model returns propose+steps JSON.

## How to run on Windows

```bash
git clone https://github.com/SeanMcCarron85/orbit-windows.git
cd orbit-windows
npm install
npm start
```

Node **18+** (20 recommended). See README for BYO vision and optional `npm run dist`.

## Verified on this Linux box vs Sean on Windows

| Check | Linux box (build agent) | Sean on Windows |
| --- | --- | --- |
| `npm install` | yes | expected |
| App loads / idle STATUS | yes (headless/xvfb if needed) | yes |
| State machine Confirm gate | yes (logic) | yes |
| Real primary-monitor JPEG | may be empty / compositor-limited | **must verify** |
| OS screen permission UX | n/a | **must verify** |
| BYO vision live call | only if key provided locally (not committed) | optional |
| electron-builder `.exe` | not produced here | optional `npm run dist` |

## Blockers
- None for source ship. Real capture quality and Windows permission prompts need Sean’s Windows machine.
