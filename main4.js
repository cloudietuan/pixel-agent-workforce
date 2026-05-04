// Main render loop + simulation driver + fake chat / chaos / tasks.
window.__main4 = {stage:'start'};
import { AGENTS, BY_ID, PAIRS, SCENARIOS, CHAOS_EVENTS, TILE, ZOOM, S, COLS, ROWS } from './agents2.js';
window.__main4.stage = 'after agents2';
import { drawWorld, drawDesks, drawDogBed, drawPostFx, assetsReady, loadPct, imgs, EXITS, setPhase, worldPhase, getPhaseName } from './world5.js';
import { drawAgents, tickSimulation, state, cam, sendAgentTo, pulseAgent,
         recenterCamera, updateCamera, centerCameraOnAgent, hitTest } from './sim2.js';
import { Memory, Story, UserContext, setUserContext, logEvent, generateThought, generateChatReply, generateRecap, processUserMessage, advanceDay, evolvePersonas, offline, saveAll } from './engine.js';
window.__main4.stage = 'after imports';

// Expose to window for panels
window.ENGINE = { Memory, Story, UserContext, setUserContext, logEvent, generateThought, generateChatReply, generateRecap, processUserMessage, advanceDay, evolvePersonas, offline, saveAll };

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resize() {
  const col = document.getElementById('cv-col');
  canvas.width = col.clientWidth;
  canvas.height = col.clientHeight;
  recenterCamera(canvas);
  cam.x = cam.tx; cam.y = cam.ty;
}
resize(); window.addEventListener('resize', resize);

// ── Mouse / select ───────────────────────────────────────────────────────────
let hoverId = null;
const hoverCard = document.getElementById('hover-card');
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const id = hitTest(canvas, cx, cy);
  hoverId = id;
  if (id) {
    const a = state[id];
    hoverCard.classList.add('on');
    hoverCard.style.left = (e.clientX + 14) + 'px';
    hoverCard.style.top  = (e.clientY - 10) + 'px';
    hoverCard.innerHTML =
      `<div class="hc-name" style="color:${a.color}">${a.emoji} ${a.name}</div>` +
      `<div class="hc-role">${a.role}</div>` +
      `<div class="hc-th">${a.thought}</div>`;
    canvas.style.cursor = 'pointer';
  } else {
    hoverCard.classList.remove('on');
    canvas.style.cursor = 'default';
  }
});
canvas.addEventListener('mouseleave', () => { hoverCard.classList.remove('on'); hoverId = null; });

// ── Pan / drag (mouse + touch) + pinch zoom ─────────────────────────────────
let drag = null;   // { startX, startY, camSX, camSY, moved }
let pinch = null;  // { d0, zoom0 }
const DRAG_THRESHOLD = 5;

function canvasXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    cx: (clientX - rect.left) * (canvas.width / rect.width),
    cy: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function startDrag(clientX, clientY) {
  // Disable cinematic auto-pan while user is interacting
  cam._userPanning = true;
  dismissPanHint();
  drag = { startX: clientX, startY: clientY, camSX: cam.tx, camSY: cam.ty, moved: false };
}

// Dismiss onboarding hint on first interaction
let _hintDismissed = false;
function dismissPanHint() {
  if (_hintDismissed) return;
  _hintDismissed = true;
  const h = document.getElementById('pan-hint');
  if (h) h.classList.add('dismissed');
}
// Auto-hide after 8s
setTimeout(dismissPanHint, 9000);
function moveDrag(clientX, clientY) {
  if (!drag) return;
  const dx = clientX - drag.startX;
  const dy = clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;
  if (drag.moved) {
    const rect = canvas.getBoundingClientRect();
    const kx = canvas.width / rect.width;
    const ky = canvas.height / rect.height;
    cam.tx = drag.camSX - dx * kx;
    cam.ty = drag.camSY - dy * ky;
    cam.x = cam.tx; cam.y = cam.ty;
    canvas.style.cursor = 'grabbing';
  }
}
function endDrag(clientX, clientY, wasTouch) {
  if (!drag) return;
  const wasTap = !drag.moved;
  drag = null;
  canvas.style.cursor = 'default';
  if (wasTap) {
    const { cx, cy } = canvasXY(clientX, clientY);
    const id = hitTest(canvas, cx, cy);
    if (id) window.selectAgent(id);
    else window.clearSelection();
  }
  setTimeout(() => cam._userPanning = false, 2500);
}
// Safety: if pointer leaves without mouseup, end drag anyway
window.addEventListener('blur', () => { drag = null; pinch = null; });
window.addEventListener('pointerup', () => { if (drag) { drag = null; canvas.style.cursor = 'default'; setTimeout(() => cam._userPanning = false, 1500); } });
// Double-click/tap canvas to reset camera
canvas.addEventListener('dblclick', () => {
  cam.userZoom = 1;
  recenterCamera(canvas);
  cam._userPanning = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  startDrag(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
  if (drag) moveDrag(e.clientX, e.clientY);
});
window.addEventListener('mouseup', (e) => {
  if (drag) endDrag(e.clientX, e.clientY, false);
});

// Touch
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  } else if (e.touches.length === 2) {
    drag = null;
    const [a, b] = e.touches;
    pinch = { d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom0: cam.userZoom || 1 };
    cam._userPanning = true;
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  if (pinch && e.touches.length === 2) {
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    cam.userZoom = Math.max(0.5, Math.min(2.2, pinch.zoom0 * (d / pinch.d0)));
  } else if (drag && e.touches.length === 1) {
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  if (pinch && e.touches.length < 2) pinch = null;
  if (drag && e.touches.length === 0) {
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY, true);
  }
}, { passive: false });

// Wheel zoom (desktop)
canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
    cam.userZoom = Math.max(0.5, Math.min(2.2, (cam.userZoom || 1) * (e.deltaY < 0 ? 1.08 : 0.92)));
    cam._userPanning = true;
    clearTimeout(cam._zoomReset);
    cam._zoomReset = setTimeout(() => cam._userPanning = false, 2500);
    e.preventDefault();
  }
}, { passive: false });

// Keyboard pan (arrow keys / WASD)
window.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
  const step = 48;
  let dx = 0, dy = 0;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dx = -step;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx =  step;
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') dy = -step;
  if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') dy =  step;
  if (dx || dy) {
    cam.tx += dx; cam.ty += dy;
    cam._userPanning = true;
    dismissPanHint();
    clearTimeout(cam._keyReset);
    cam._keyReset = setTimeout(() => cam._userPanning = false, 2500);
    e.preventDefault();
  }
});

// ── Public helpers used by panels ────────────────────────────────────────────
window.selectAgent = (id) => {
  window.STORE.selectedId = id;
  window.emit('select');
  if (cam.cinematic && !cam._userPanning) centerCameraOnAgent(canvas, id);
};
window.clearSelection = () => { window.STORE.selectedId = null; window.emit('select'); };
window.focusAgent = (id) => centerCameraOnAgent(canvas, id);

window.highlightPair = (a, b) => {
  const A = state[a], B = state[b];
  sendAgentTo(a, b, `→ ${B.name}`);
  addHighlight({ type: PAIRS.find(p=>(p[0]===a&&p[1]===b)||(p[0]===b&&p[1]===a))?.[2] || 'meet', title: `${A.name} ↔ ${B.name}`, body: `Heading into the lounge to sync.`, color: A.color });
};

window.pulseFromUI = (id) => {
  const a = state[id];
  pulseAgent(id, a.thoughts[Math.floor(Math.random()*a.thoughts.length)], 'think');
  addLog(id, 'use_tool', '[manual nudge]');
};

// ── Chat ─────────────────────────────────────────────────────────────────────
window.sendChat = (text, targetId) => {
  const msg = { sender: 'You', self: true, text, color: '#e94560' };
  window.STORE.messages.push(msg);
  window.emit('chat');

  let resolved = targetId;
  if (!resolved || resolved === 'auto') {
    // pick by keyword
    const t = text.toLowerCase();
    const by = AGENTS.find(a => t.includes(a.name.toLowerCase()) || t.includes(a.role.toLowerCase()));
    resolved = by?.id || 'atlas'; // default: orchestrator
  }
  const a = state[resolved];
  if (!a) return;
  pulseAgent(resolved, `→ "${text.slice(0,24)}…"`, 'work');
  // Fake AI response after delay
  // Run user message through engine to evolve world
  processUserMessage(text).then(res => {
    if (res.evolved) {
      showBanner(`▶ WORLD EXPANDED`);
      window.emit('story');
    }
  });

  // Claude-backed reply
  const history = window.STORE.messages.slice(-8).map(m => ({ sender: m.sender, text: m.text }));
  setTimeout(async () => {
    let replyText = null;
    if (!offline()) {
      try { replyText = await generateChatReply(resolved, text, history); } catch {}
    }
    if (!replyText) {
      const replies = [
        `On it — cross-referencing ${a.thoughts[0].toLowerCase()}.`,
        `Looping in ${pickAlly(a.id)} for context.`,
        `Filed. ${a.thoughts[Math.floor(Math.random()*a.thoughts.length)]}.`,
      ];
      replyText = replies[Math.floor(Math.random()*replies.length)];
    }
    const reply = { sender: a.name, text: replyText, color: a.color };
    window.STORE.messages.push(reply);
    window.emit('chat');
    addLog(a.id, 'talk', reply.text);
    logEvent('chat', `${a.name} → John: ${replyText.slice(0,80)}`, [a.id]);
  }, 900 + Math.random()*900);
};

function pickAlly(id) {
  const allies = PAIRS.filter(p => (p[0]===id||p[1]===id) && p[2]==='alliance');
  if (!allies.length) return 'Atlas';
  const pair = allies[Math.floor(Math.random()*allies.length)];
  return BY_ID[pair[0]===id?pair[1]:pair[0]].name;
}

// ── Tasks ────────────────────────────────────────────────────────────────────
let taskId = 1;
window.assignTask = (title, agentId) => {
  let id = agentId;
  if (!id) {
    // auto-route by keyword
    const t = title.toLowerCase();
    const match = AGENTS.find(a => a.id !== 'debug' && (t.includes(a.name.toLowerCase()) || t.includes(a.role.toLowerCase()) || a.thoughts.some(x => t.includes(x.toLowerCase().split(' ')[0]))));
    id = match?.id || AGENTS[Math.floor(Math.random()*12)].id;
  }
  const a = BY_ID[id];
  const task = { id: taskId++, title, agentId: id, agentName: a.name, agentColor: a.color, agentEmoji: a.emoji, status: 'pending', progress: 0 };
  window.STORE.tasks.unshift(task);
  window.emit('tasks');
  addLog(id, 'use_tool', `task: ${title}`);
  // Kick it in-progress after short delay
  setTimeout(() => {
    task.status = 'in_progress';
    pulseAgent(id, `working: ${title.slice(0,22)}…`, 'work');
    window.emit('tasks');
    // Progress pulses
    const iv = setInterval(() => {
      task.progress = Math.min(100, (task.progress||0) + 8 + Math.random()*8);
      if (task.progress >= 100) {
        task.status = 'completed';
        addHighlight({ type:'work', title:`${a.name} finished`, body: title, color: a.color });
        addLog(id, 'work', `completed: ${title}`);
        clearInterval(iv);
      }
      window.emit('tasks');
    }, 900);
  }, 800);
};

// Seed a few tasks
function seedTasks() {
  ['Brief Lumina v2 pricing', 'Pull Q2 macros', 'Draft Berkeley aid memo', 'Plan volleyball block'].forEach(t => window.assignTask(t, null));
}

// ── Highlights / log ─────────────────────────────────────────────────────────
let hlId = 1, logId = 1;
function addHighlight({ type, title, body, color }) {
  window.STORE.highlights.unshift({ id: hlId++, type, title, body, color, time: new Date().toLocaleTimeString() });
  window.STORE.highlights = window.STORE.highlights.slice(0, 10);
  window.emit('highlight');
}
function addLog(id, action, thought) {
  const a = BY_ID[id];
  window.STORE.systemLog.push({ id: logId++, agent: a.name, color: a.color, action, thought, time: new Date().toLocaleTimeString() });
  window.STORE.systemLog = window.STORE.systemLog.slice(-60);
  window.emit('log');
}

// ── Scenarios / chaos ────────────────────────────────────────────────────────
window.startScenario = (scen) => {
  window.STORE.scenario = scen;
  window.STORE.lastEvent = `Scenario: ${scen}`;
  window.emit('last-event');
  addHighlight({ type:'scenario', title: scen, body: 'All agents pivoted. Atlas rebalancing load.', color:'#ffd6a5' });
  // Wake everyone
  AGENTS.filter(a=>a.id!=='debug').forEach(a => pulseAgent(a.id, `${scen} mode`, 'work'));
  showBanner(`▶ ${scen.toUpperCase()}`);
};

window.triggerChaos = (id, label, icon) => {
  window.STORE.lastEvent = label;
  window.emit('last-event');
  addHighlight({ type:'chaos', title:`${icon} ${label}`, body:'Office reacted — Mental flagged to Atlas.', color:'#ff6b6b' });
  showBanner(`${icon} ${label.toUpperCase()}`);
  // Route based on id
  const routes = {
    server_outage: ['it','atlas','comms'],
    funding_cut:   ['finance','biz','atlas','mental'],
    client_escalation: ['comms','biz','atlas'],
    surprise_launch: ['biz','social','comms','atlas'],
    viral_tweet:   ['social','comms','atlas'],
  };
  (routes[id] || ['atlas']).forEach((aid, i) => {
    setTimeout(() => {
      pulseAgent(aid, `${icon} ${label}`, 'work');
      addLog(aid, 'use_tool', `[${label}] triaging`);
    }, i*400);
  });
};

function showBanner(txt) {
  const b = document.getElementById('fx-banner');
  b.textContent = txt;
  b.classList.add('on');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.remove('on'), 2500);
}

// ── Idle thought chatter (+ occasional Claude-generated thoughts) ─────────────
setInterval(() => {
  if (!assetsReady()) return;
  const pool = AGENTS.filter(a => a.id !== 'debug');
  const a = pool[Math.floor(Math.random()*pool.length)];
  const s = state[a.id];
  if (s.action !== 'idle') addLog(a.id, s.action, s.thought);
  // Every ~5 ticks, ask Claude to give this agent a fresh thought
  if (!offline() && s.busy && Math.random() < 0.25) {
    generateThought(a.id).then(t => {
      if (t) { logEvent('thought', `${a.name}: ${t.slice(0,80)}`, [a.id]); window.emit('think'); }
    });
  }
  if (Math.random() < 0.07) {
    const kinds = [
      { type:'alliance', title:`${a.name} synced with ${pickAlly(a.id)}`, body:'Context passed over lounge coffee.' },
      { type:'milestone', title:`${a.name} unblocked`, body: s.thoughts[0] },
      { type:'reflection', title:`Mental check-in`, body:'Stress delta neutral across pod.' },
    ];
    const k = kinds[Math.floor(Math.random()*kinds.length)];
    addHighlight({ ...k, color: a.color });
    logEvent(k.type, `${k.title} — ${k.body}`, [a.id]);
  }
}, 2000);

// ── Persona evolution every ~30s ─────────────────────────────────────────────
setInterval(() => {
  if (!assetsReady()) return;
  evolvePersonas();
  // Advance day-phase slowly (full day = 6 minutes real-time)
  setPhase(worldPhase + 1/360);
  document.getElementById('status-meta').dataset.phase = getPhaseName();
}, 1000);

// ── Advance story day every ~5 minutes ──────────────────────────────────────
setInterval(() => {
  const d = advanceDay();
  showBanner(`▷ DAY ${d}`);
  window.emit('story');
}, 5*60*1000);

window.advanceDayManual = () => {
  const d = advanceDay();
  showBanner(`▷ DAY ${d}`);
  window.emit('story');
};

// ── Panel chips (toolbar) ────────────────────────────────────────────────────
const PANEL_DEFS = [
  { id:'tasks',      name:'Tasks',       icon:'▤', defaultHidden:false },
  { id:'recap',      name:'Recap',       icon:'▶', defaultHidden:true  },
  { id:'story',      name:'Story',       icon:'✦', defaultHidden:true  },
  { id:'pulse',      name:'Pulse',       icon:'❚❚', defaultHidden:false },
  { id:'inspector',  name:'Inspect',     icon:'◈', defaultHidden:true  },
  { id:'graph',      name:'Graph',       icon:'⌘', defaultHidden:true  },
  { id:'highlights', name:'Highlights',  icon:'★', defaultHidden:true  },
  { id:'showrunner', name:'Showrunner',  icon:'✦', defaultHidden:false },
  { id:'log',        name:'Log',         icon:'≡', defaultHidden:true  },
  { id:'chat',       name:'Chat',        icon:'▸', defaultHidden:false },
  { id:'layout',     name:'Layout',      icon:'▦', defaultHidden:true  },
];
const chipsEl = document.getElementById('panel-chips');
const chipMap = {};
PANEL_DEFS.forEach(p => {
  const btn = document.createElement('button');
  btn.className = 'tb-btn' + (p.defaultHidden ? '' : ' on');
  btn.dataset.id = p.id;
  btn.innerHTML = `<span class="dot"></span>${p.icon} ${p.name}`;
  btn.onclick = () => {
    // Special case: Inspect requires an agent selection
    if (p.id === 'inspector' && !window.STORE.selectedId) {
      // Pick the first working agent to showcase
      window.selectAgent('atlas');
      return;
    }
    if (p.id === 'inspector' && window.STORE.selectedId && btn.classList.contains('on')) {
      window.clearSelection();
      return;
    }
    window.emit('panel-toggle', { id: p.id });
  };
  chipsEl.appendChild(btn);
  chipMap[p.id] = btn;
});
// Reflect real panel visibility (panels broadcast this on mount + on every toggle)
window.on('panel-visibility', (e) => {
  const { id, hidden } = e.detail;
  const btn = chipMap[id];
  if (btn) btn.classList.toggle('on', !hidden);
});

document.getElementById('tb-spawn').onclick = () => {
  const titles = ['Audit deploy', 'Write post-mortem', 'Ping client', 'Draft agenda', 'Rebalance macros', 'Book travel', 'Sync memories', 'Archive thread'];
  window.assignTask(titles[Math.floor(Math.random()*titles.length)], null);
};
document.getElementById('tb-reset').onclick = () => {
  Object.keys(localStorage).filter(k => k.startsWith('panel:')).forEach(k => localStorage.removeItem(k));
  location.reload();
};

// ── Tweaks wiring ─────────────────────────────────────────────────────────
const tweaks = { ...TWEAK_DEFAULTS };
function applyTweaks() {
  document.body.classList.remove('theme-neon','theme-terminal','theme-crt','theme-minimal');
  document.body.classList.add('theme-' + tweaks.theme);
  document.body.classList.remove('density-cozy','density-compact');
  document.body.classList.add('density-' + tweaks.density);
  document.body.style.setProperty('--accent-override', tweaks.accent);
  document.documentElement.style.setProperty('--accent', tweaks.accent);
  const hex = tweaks.accent;
  // derive accent-2 by lightening
  document.documentElement.style.setProperty('--accent-2', hex);
  window.dispatchEvent(new CustomEvent('accent-change'));
  window.dispatchEvent(new CustomEvent('scan-change', { detail: tweaks.scanlines }));
  cam.cinematic = tweaks.cinematic;
}
applyTweaks();

function bindSeg(sel, key) {
  document.querySelectorAll(`${sel} button`).forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(`${sel} button`).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const v = b.dataset.v;
      tweaks[key] = (v === 'on') ? true : (v === 'off') ? false : v;
      applyTweaks();
      persist();
    };
  });
}
bindSeg('#tw-theme', 'theme');
bindSeg('#tw-density', 'density');
bindSeg('#tw-scan', 'scanlines');
bindSeg('#tw-cine', 'cinematic');
document.querySelectorAll('#tw-accent .tw-swatch').forEach(s => {
  s.onclick = () => {
    document.querySelectorAll('#tw-accent .tw-swatch').forEach(x=>x.classList.remove('on'));
    s.classList.add('on');
    tweaks.accent = s.dataset.v;
    applyTweaks(); persist();
  };
});

function persist() {
  try { window.parent.postMessage({ type:'__edit_mode_set_keys', edits: { ...tweaks } }, '*'); } catch {}
}

// Edit mode (tweaks toggle from host toolbar)
let editModeOn = false;
window.addEventListener('message', (e) => {
  const t = e.data?.type;
  if (t === '__activate_edit_mode') { editModeOn = true; document.getElementById('tweaks').classList.add('on'); }
  if (t === '__deactivate_edit_mode') { editModeOn = false; document.getElementById('tweaks').classList.remove('on'); }
});
setTimeout(() => { try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {} }, 60);

// ── Layout overlay (cosmetic) ────────────────────────────────────────────────
function drawLayoutOverlay() {
  const items = window.LAYOUT_OVERLAY || [];
  items.forEach(i => {
    const x = i.col*S - cam.x, y = i.row*S - cam.y;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + S/2, y + S/2, 14, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(233,69,96,0.25)';
    ctx.strokeStyle = '#e94560'; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(i.emoji, x + S/2, y + S/2 + 1);
    ctx.restore();
  });
}

// ── Render loop ──────────────────────────────────────────────────────────────
let pcTick = 0, tick = 0, lastFrame = 0;
function render(ts) {
  try {
  const dt = Math.min((ts - lastFrame)/1000, 0.1);
  lastFrame = ts;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply user zoom (pinch/scroll) centered on canvas midpoint
  const uz = cam.userZoom || 1;
  ctx.save();
  if (uz !== 1) {
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(uz, uz);
    ctx.translate(-canvas.width/2, -canvas.height/2);
  }

  if (!assetsReady()) {
    const pct = Math.round(loadPct()*100);
    document.getElementById('lb-fill').style.width = pct + '%';
    document.getElementById('lb-pct').textContent = pct + '%';
    if (document.visibilityState === 'hidden') setTimeout(() => render(performance.now()), 100);
    else requestAnimationFrame(render);
    return;
  } else {
    const lb = document.getElementById('loading');
    if (lb && lb.style.display !== 'none') { lb.style.display = 'none'; seedTasks(); }
  }

  // Cinematic cam: follow most-busy or selected (skip while user is panning)
  if (cam.cinematic && !window.STORE.selectedId && !cam._userPanning) {
    // Pick an agent who is currently 'work' or 'talk'
    const busy = AGENTS.filter(d => state[d.id].busy && d.id !== 'debug');
    if (busy.length && Math.random() < 0.008) {
      centerCameraOnAgent(canvas, busy[Math.floor(Math.random()*busy.length)].id);
    }
  }
  updateCamera(dt);

  pcTick++;
  const pcKey = drawWorld(ctx, canvas, cam.x, cam.y, pcTick);
  drawDesks(ctx, cam.x, cam.y, AGENTS, pcKey);
  drawDogBed(ctx, cam.x, cam.y);
  drawLayoutOverlay();
  tickSimulation(Date.now());
  drawAgents(ctx, canvas, ts, window.STORE.selectedId || hoverId);

  ctx.restore();

  drawPostFx(ctx, canvas, tweaks.scanlines);

  tick++;
  if (tick % 30 === 0) {
    const active = AGENTS.filter(d => state[d.id].busy).length;
    document.getElementById('status-meta').textContent = `live sim · ${active} active · ${window.STORE.tasks.filter(t=>t.status!=='completed').length} open tasks`;
  }
  } catch(e) {
    console.error('render error:', e);
    window.__renderErr = (window.__renderErr || 0) + 1;
    if (window.__renderErr > 5) return; // stop after 5 errors
  }
  // Schedule next frame. Prefer raf, but fall back to setTimeout when the
  // page is hidden (preview iframe often is) so the scene keeps ticking.
  if (document.visibilityState === 'hidden') {
    setTimeout(() => render(performance.now()), 66); // ~15 fps background
  } else {
    requestAnimationFrame(render);
  }
}
// Kick off with a setTimeout so we always get at least one frame even if raf is throttled.
setTimeout(() => render(performance.now()), 30);
window.__main4.stage = 'raf started';
window.__main4.renderFn = render;
