'use strict';

(() => {
  const STATES = ['idle', 'listen', 'think', 'propose', 'armed-wait', 'act', 'done'];

  const el = {
    stateLabel: document.getElementById('stateLabel'),
    statusLine: document.getElementById('statusLine'),
    captureStatus: document.getElementById('captureStatus'),
    metaLine: document.getElementById('metaLine'),
    presence: document.getElementById('presence'),
    orbLabel: document.getElementById('orbLabel'),
    visionHint: document.getElementById('visionHint'),
    visionProvider: document.getElementById('visionProvider'),
    visionBaseUrl: document.getElementById('visionBaseUrl'),
    visionModel: document.getElementById('visionModel'),
    visionApiKey: document.getElementById('visionApiKey'),
    visionSaveBtn: document.getElementById('visionSaveBtn'),
    visionClearBtn: document.getElementById('visionClearBtn'),
    planPanel: document.getElementById('planPanel'),
    planBadge: document.getElementById('planBadge'),
    planSteps: document.getElementById('planSteps'),
    planFoot: document.getElementById('planFoot'),
    captureRow: document.getElementById('captureRow'),
    captureThumb: document.getElementById('captureThumb'),
    captureBadge: document.getElementById('captureBadge'),
    captureNote: document.getElementById('captureNote'),
    caption: document.getElementById('caption'),
    captionWho: document.getElementById('captionWho'),
    captionLine: document.getElementById('captionLine'),
    askInput: document.getElementById('askInput'),
    askBtn: document.getElementById('askBtn'),
    whatsOnScreenBtn: document.getElementById('whatsOnScreenBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
  };

  let state = 'idle';
  let busy = false;
  let lastPlan = null;
  let lastFrame = null; // { dataUrl, sourceName, ... }
  let visionHasKey = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function setStatus(text) {
    el.statusLine.textContent = text;
  }

  function setCaptureStatus(text) {
    el.captureStatus.textContent = text;
  }

  function setState(next) {
    if (!STATES.includes(next)) return;
    state = next;
    el.stateLabel.textContent = next;
    el.stateLabel.dataset.state = next;
    el.presence.dataset.state = next;
    el.orbLabel.textContent = next;
    el.confirmBtn.hidden = next !== 'armed-wait';
  }

  function showCaption(who, line) {
    el.caption.dataset.who = who || '';
    el.captionWho.textContent = who || '';
    el.captionLine.textContent = line || '';
  }

  function clearCaption() {
    showCaption('', '');
  }

  function showFrame(dataUrl, note) {
    el.captureRow.hidden = false;
    el.captureThumb.src = dataUrl;
    el.captureBadge.textContent = 'LIVE FRAME';
    el.captureNote.textContent = note || '';
  }

  function clearCaptureUI() {
    el.captureRow.hidden = true;
    el.captureThumb.removeAttribute('src');
    el.captureNote.textContent = '';
    clearPlanUI();
  }

  function clampPlanSteps(steps) {
    const list = Array.isArray(steps) ? steps : [];
    return list
      .map((s) => String(s || '').replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  function buildSoftPlan({ heuristics, sourceName, blocked }) {
    const steps = [];
    const noun = sourceName ? `screen “${String(sourceName).slice(0, 40)}”` : 'screen';
    if (blocked) {
      steps.push('Review the demo fallback frame');
      steps.push('Note what you wanted Orbit to see');
      steps.push('Grant OS screen permission and Ask again');
      steps.push('Confirm when ready (text plan only)');
    } else if (heuristics) {
      steps.push(`Review the active area (${heuristics.kind}, ${heuristics.busy})`);
      steps.push('Note what to change or summarize');
      steps.push('Check cool/warm cues only as soft hints');
      steps.push('Confirm when ready (Orbit will acknowledge — no HID)');
    } else {
      steps.push(`Review the active ${noun}`);
      steps.push('Note what to change or summarize');
      steps.push('Skim related UI nearby if needed');
      steps.push('Confirm when ready (Orbit will acknowledge — no HID)');
    }
    while (steps.length < 3) steps.push('Confirm when ready');
    return {
      steps: clampPlanSteps(steps.slice(0, 6)),
      soft: true,
      source: blocked ? 'fallback' : 'heuristic',
    };
  }

  function showPlanUI(plan) {
    lastPlan = plan;
    if (!plan || !plan.steps || !plan.steps.length) {
      el.planPanel.hidden = true;
      return;
    }
    el.planPanel.hidden = false;
    el.planSteps.innerHTML = '';
    plan.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      el.planSteps.appendChild(li);
    });
    const fromVision = plan.source === 'vision' && !plan.soft;
    el.planBadge.textContent = fromVision ? 'from vision' : 'soft / estimated';
    el.planBadge.classList.toggle('from-vision', fromVision);
    el.planFoot.textContent = fromVision
      ? 'Confirm still required · text only · no keyboard/mouse control.'
      : 'Soft / estimated plan · Confirm still required · text only · no keyboard/mouse control.';
  }

  function clearPlanUI() {
    lastPlan = null;
    el.planPanel.hidden = true;
    el.planSteps.innerHTML = '';
    el.planBadge.textContent = '';
    el.planFoot.textContent = '';
  }

  /** Sample brightness / edge-ish / tint from an Image via canvas */
  function sampleHeuristicsFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const w = Math.min(160, img.naturalWidth || 160);
        const h = Math.max(1, Math.round(((img.naturalHeight || w) * w) / (img.naturalWidth || w)));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        let r = 0, g = 0, b = 0, n = 0, edge = 0;
        const data = ctx.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const i = (y * w + x) * 4;
            const rr = data[i], gg = data[i + 1], bb = data[i + 2];
            r += rr; g += gg; b += bb; n++;
            if (x + 2 < w) {
              const j = (y * w + (x + 2)) * 4;
              edge += Math.abs(rr - data[j]) + Math.abs(gg - data[j + 1]) + Math.abs(bb - data[j + 2]);
            }
          }
        }
        const avg = n ? (r + g + b) / (3 * n) : 128;
        const tintR = n ? r / n : 0;
        const tintB = n ? b / n : 0;
        const edgeScore = n ? edge / n : 0;
        const kind = avg < 70 ? 'dark UI' : avg > 180 ? 'bright UI' : 'window';
        const busy = edgeScore > 90 ? 'busy' : 'clean';
        const tint = tintB - tintR > 18 ? 'cool/blue tones' : tintR - tintB > 18 ? 'warm tones' : 'neutral tones';
        resolve({ kind, busy, tint, avg, edgeScore });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function heuristicPropose(h, sourceName) {
    if (!h) {
      return sourceName
        ? `Want me to summarize what’s on “${sourceName.slice(0, 48)}”?`
        : 'Want me to summarize what’s visible on screen?';
    }
    return `Looks like a ${h.kind} — ${h.busy}, ${h.tint}. Want me to summarize what’s visible?`;
  }

  function makeFallbackDataUrl() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121820';
    ctx.fillRect(0, 0, 640, 360);
    ctx.strokeStyle = '#4affd4';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 592, 312);
    ctx.fillStyle = '#4affd4';
    ctx.font = '20px Segoe UI, sans-serif';
    ctx.fillText('FALLBACK — capture blocked', 40, 180);
    ctx.fillStyle = '#7a8fa0';
    ctx.font = '14px Consolas, monospace';
    ctx.fillText('Grant OS screen permission, then Ask again', 40, 210);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  function parseVisionContent(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    try {
      const obj = JSON.parse(cleaned);
      const propose = String(obj.propose || obj.offer || '').trim();
      const steps = clampPlanSteps(obj.steps || obj.plan || obj.actions);
      if (propose && steps.length >= 3) {
        return { propose, steps, soft: false, source: 'vision' };
      }
      if (propose) {
        const padded = steps.slice();
        while (padded.length < 3) padded.push('Confirm when ready (text plan only)');
        return { propose, steps: clampPlanSteps(padded), soft: steps.length < 3, source: 'vision' };
      }
    } catch (_) {
      /* fall through */
    }
    const proposeMatch =
      cleaned.match(/(?:^|\n)\s*(?:propose|offer)\s*[:\-]\s*(.+?)(?=\n\s*(?:steps?|plan)\s*[:\-]|\n\s*\d+[\.\)]|$)/is) ||
      cleaned.match(/^(.+?)(?:\n\s*(?:steps?|plan)\s*[:\-]|\n\s*1[\.\)])/is);
    const propose = proposeMatch ? proposeMatch[1].trim().slice(0, 180) : cleaned.split('\n')[0].trim().slice(0, 180);
    const steps = [];
    const stepBlock = cleaned.match(/(?:steps?|plan)\s*[:\-]?\s*([\s\S]+)/i);
    const block = stepBlock ? stepBlock[1] : cleaned;
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*(?:\d+[\.\)]|[-*])\s+(.+)/);
      if (m) steps.push(m[1].trim());
    }
    const clamped = clampPlanSteps(steps);
    if (propose && clamped.length >= 3) {
      return { propose, steps: clamped, soft: false, source: 'vision' };
    }
    if (propose) {
      return { propose, steps: null, soft: false, source: 'vision' };
    }
    return null;
  }

  async function refreshVisionUI() {
    const cfg = await window.orbit.getVisionSettings();
    visionHasKey = Boolean(cfg.hasKey);
    el.visionProvider.value = cfg.provider || 'openai-compatible';
    el.visionBaseUrl.value = cfg.baseUrl || '';
    el.visionModel.value = cfg.model || 'gpt-4o-mini';
    if (cfg.hasKey) {
      el.visionApiKey.value = cfg.apiKeyMasked || '••••••••••••••••';
      el.visionApiKey.dataset.masked = '1';
      el.visionHint.textContent = `Key saved · ${cfg.model} · main→endpoint`;
      el.visionHint.dataset.state = 'ready';
    } else {
      el.visionApiKey.value = '';
      el.visionApiKey.dataset.masked = '0';
      el.visionHint.textContent = 'No key · soft heuristic';
      el.visionHint.dataset.state = '';
    }
  }

  async function saveVision() {
    let keyInput = (el.visionApiKey.value || '').trim();
    if (el.visionApiKey.dataset.masked === '1' && /^•+$/.test(keyInput)) {
      keyInput = ''; // keep existing
    }
    const result = await window.orbit.saveVisionSettings({
      provider: el.visionProvider.value,
      baseUrl: el.visionBaseUrl.value,
      model: el.visionModel.value,
      apiKey: keyInput,
    });
    visionHasKey = Boolean(result.hasKey);
    await refreshVisionUI();
    el.visionHint.textContent = result.hasKey
      ? `Saved · ${result.model}`
      : 'Saved settings · still no key';
  }

  async function clearVisionKey() {
    await window.orbit.clearVisionKey();
    await refreshVisionUI();
    el.visionHint.textContent = 'Key cleared · soft heuristic';
  }

  function setBusy(on) {
    busy = on;
    el.askBtn.disabled = on;
    el.whatsOnScreenBtn.disabled = on;
    el.askInput.disabled = on && state !== 'armed-wait';
  }

  async function runAsk(cue) {
    if (busy && state !== 'idle' && state !== 'done' && state !== 'armed-wait') return;
    if (state === 'armed-wait') {
      // New Ask abandons prior armed-wait
      clearPlanUI();
    }

    setBusy(true);
    clearCaption();
    clearPlanUI();

    const taskCue = (cue || el.askInput.value || '').trim() || "What's on screen?";

    setState('listen');
    setStatus('listening · capturing primary monitor');
    setCaptureStatus('Capture: grabbing frame…');
    showCaption('Orbit', 'Looking at your screen…');

    await sleep(280);

    let frame = null;
    let blocked = false;
    try {
      const result = await window.orbit.captureScreen({ maxWidth: 1280, quality: 0.82 });
      if (result && result.ok && result.dataUrl) {
        frame = result;
        lastFrame = result;
        showFrame(result.dataUrl, `${result.sourceName || 'screen'} · ${result.width}×${result.height}`);
        setCaptureStatus(
          `Capture: desktopCapturer · primary · ${result.sourceName || result.sourceId} · ${result.width}×${result.height}`
        );
      } else {
        blocked = true;
        const fb = makeFallbackDataUrl();
        frame = {
          dataUrl: fb,
          sourceName: 'FALLBACK',
          message: (result && result.message) || 'capture failed',
        };
        lastFrame = frame;
        showFrame(fb, 'fallback · capture blocked');
        setCaptureStatus(`Capture: blocked · ${(result && result.error) || 'unknown'} · using fallback`);
      }
    } catch (err) {
      blocked = true;
      const fb = makeFallbackDataUrl();
      frame = { dataUrl: fb, sourceName: 'FALLBACK', message: String(err) };
      lastFrame = frame;
      showFrame(fb, 'fallback · capture error');
      setCaptureStatus(`Capture: error · ${err && err.message ? err.message : err}`);
    }

    setState('think');
    setStatus(visionHasKey && !blocked ? 'thinking · vision…' : 'thinking · soft heuristic…');
    showCaption('Orbit', 'Thinking…');

    let proposeLine = '';
    let plan = null;
    let heuristics = null;

    if (!blocked) {
      heuristics = await sampleHeuristicsFromDataUrl(frame.dataUrl);
    }

    if (visionHasKey && !blocked) {
      const visionResult = await window.orbit.visionPropose({
        dataUrl: frame.dataUrl,
        userCue: taskCue,
      });
      if (visionResult && visionResult.ok && visionResult.content) {
        const parsed = parseVisionContent(visionResult.content);
        if (parsed && parsed.propose) {
          proposeLine = parsed.propose;
          if (parsed.steps && parsed.steps.length >= 3) {
            plan = {
              steps: clampPlanSteps(parsed.steps),
              soft: Boolean(parsed.soft),
              source: 'vision',
            };
          } else {
            plan = buildSoftPlan({ heuristics, sourceName: frame.sourceName, blocked: false });
            plan.source = 'vision';
            plan.soft = true;
          }
          setCaptureStatus(
            `Capture: vision · ${visionResult.model || 'model'} · ${frame.sourceName || 'screen'}`
          );
        } else {
          setCaptureStatus('Capture: vision failed · fallback · parse');
        }
      } else {
        const reason = (visionResult && visionResult.error) || 'fail';
        setCaptureStatus(`Capture: vision failed · fallback · ${reason}`);
      }
    }

    if (!proposeLine) {
      if (blocked) {
        proposeLine =
          'Capture was blocked — using a demo fallback frame. Want me to summarize what’s on that frame?';
      } else {
        proposeLine = heuristicPropose(heuristics, frame.sourceName);
      }
    }
    if (!plan) {
      plan = buildSoftPlan({ heuristics, sourceName: frame.sourceName, blocked });
    }

    await sleep(blocked || visionHasKey ? 200 : 700);

    setState('propose');
    setStatus('propose · text plan ready');
    showCaption('Orbit', proposeLine);
    showPlanUI(plan);

    await sleep(450);

    setState('armed-wait');
    setStatus('armed-wait · Confirm required (no HID)');
    setBusy(false);
  }

  async function onConfirm() {
    if (state !== 'armed-wait' || busy) return;
    setBusy(true);

    setState('act');
    setStatus('plan accepted · no keyboard/mouse control');
    showCaption('Orbit', 'Plan accepted — text only (no HID).');

    await sleep(1000);

    setState('done');
    setStatus('done');
    showCaption('Orbit', 'Done.');

    await sleep(700);

    setState('idle');
    setStatus('presence on · Ask to wake');
    setCaptureStatus('Capture: idle · no frames until next Ask');
    clearCaption();
    clearPlanUI();
    // Keep last thumb visible briefly? Spec: clear on idle path for capture UI — clear plan; leave thumb optional.
    // Match cyber-v3: clear plan; stream kept but no frames — we clear thumb on idle for cleanliness.
    el.captureRow.hidden = true;
    setBusy(false);
  }

  function wire() {
    el.askBtn.addEventListener('click', () => {
      runAsk(el.askInput.value);
    });
    el.whatsOnScreenBtn.addEventListener('click', () => {
      el.askInput.value = "What's on screen?";
      runAsk("What's on screen?");
    });
    el.askInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runAsk(el.askInput.value);
      }
    });
    el.confirmBtn.addEventListener('click', () => onConfirm());
    el.visionSaveBtn.addEventListener('click', () => saveVision());
    el.visionClearBtn.addEventListener('click', () => clearVisionKey());
    el.visionApiKey.addEventListener('focus', () => {
      if (el.visionApiKey.dataset.masked === '1') {
        el.visionApiKey.value = '';
        el.visionApiKey.dataset.masked = '0';
      }
    });
  }

  async function boot() {
    wire();
    setState('idle');
    setStatus('presence on · Ask to wake');
    setCaptureStatus('Capture: idle');
    clearCaption();

    try {
      const meta = await window.orbit.getMeta();
      el.metaLine.textContent = `${meta.platform} · electron ${meta.electron} · screen ${meta.screenPermission}`;
    } catch (_) {
      el.metaLine.textContent = 'meta unavailable';
    }

    await refreshVisionUI();
  }

  if (!window.orbit) {
    showCaption('Orbit', 'Preload bridge missing — run via Electron (npm start).');
    setStatus('error · not in Electron');
  } else {
    boot();
  }
})();
