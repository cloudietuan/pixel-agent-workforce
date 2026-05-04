// All 10 command-center panels. Each reads STORE + listens to BUS.
const { useState, useEffect, useRef, useMemo } = React;
const FP = window.FloatingPanel;

// ── ChatPanel ────────────────────────────────────────────────────────────────
function ChatPanel({ accent }) {
  const [msgs, setMsgs] = useState(window.STORE.messages);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState('auto');
  const endRef = useRef(null);
  useEffect(() => {
    const off = window.on('chat', (e) => setMsgs([...window.STORE.messages]));
    return off;
  }, []);
  useEffect(() => {
    if (endRef.current) endRef.current.parentElement.scrollTop = endRef.current.parentElement.scrollHeight;
  }, [msgs]);
  const send = () => {
    if (!input.trim()) return;
    window.sendChat(input, target);
    setInput('');
  };
  return (
    <FP id="chat" title="Chat Console" subtitle="Talk to the workforce" icon="▸" accent={accent} width={320} defaultX={16} defaultY={window.innerHeight - 320} z={30}>
      <div className="chat-list">
        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.self ? 'me' : ''}`}>
            <span className="chat-who" style={{ color: m.color || '#8ac6ff' }}>{m.sender}</span>
            <span className="chat-txt">{m.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <select value={target} onChange={e=>setTarget(e.target.value)} className="inp sm">
          <option value="auto">🤖 Auto</option>
          {window.AGENTS.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
        </select>
        <input className="inp" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ask the office…" />
        <button className="btn primary" onClick={send}>▸</button>
      </div>
    </FP>
  );
}

// ── TaskBoard ────────────────────────────────────────────────────────────────
function TaskBoard({ accent }) {
  const [tasks, setTasks] = useState(window.STORE.tasks);
  const [title, setTitle] = useState('');
  const [agent, setAgent] = useState('auto');
  useEffect(() => window.on('tasks', () => setTasks([...window.STORE.tasks])), []);
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    window.assignTask(title, agent === 'auto' ? null : agent);
    setTitle('');
  };
  const icon = (s) => s==='completed'?'✔':s==='in_progress'?'◐':'○';
  const color = (s) => s==='completed'?'#7ee787':s==='in_progress'?'#ffcc00':'#8b93b8';
  return (
    <FP id="tasks" title="Task Board" subtitle={`${tasks.filter(t=>t.status!=='completed').length} active`} icon="▤" accent={accent} width={290} defaultX={16} defaultY={56}>
      <form onSubmit={submit} className="stack">
        <input className="inp" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Assign a task…" />
        <div className="row">
          <select className="inp sm" value={agent} onChange={e=>setAgent(e.target.value)}>
            <option value="auto">🤖 Auto-route</option>
            {window.AGENTS.filter(a=>a.id!=='debug').map(a=><option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
          </select>
          <button className="btn primary">Assign</button>
        </div>
      </form>
      <div className="task-list">
        {tasks.length === 0 && <div className="empty">No tasks yet. Hit ⚡ on the toolbar to spawn a backlog.</div>}
        {tasks.map(t => (
          <div key={t.id} className="task" style={{ borderLeftColor: color(t.status) }}>
            <div className="task-top">
              <span className="task-icon" style={{ color: color(t.status) }}>{icon(t.status)}</span>
              <span className="task-title">{t.title}</span>
            </div>
            <div className="task-meta">
              <span className="chip" style={{ color: t.agentColor, borderColor: t.agentColor+'55' }}>{t.agentEmoji} {t.agentName || 'Unassigned'}</span>
              <span className="task-status">{t.status.replace('_',' ')}</span>
            </div>
            {t.status === 'in_progress' && <div className="progress"><div className="bar" style={{ width: `${t.progress||0}%`, background: color(t.status) }}/></div>}
          </div>
        ))}
      </div>
      <div className="footnote">engine · Ollama local · SQLite</div>
    </FP>
  );
}

// ── AgentInspector ───────────────────────────────────────────────────────────
function AgentInspector({ accent }) {
  const [selId, setSelId] = useState(window.STORE.selectedId);
  const [tick, setTick] = useState(0);
  useEffect(() => window.on('select', (e) => setSelId(window.STORE.selectedId)), []);
  useEffect(() => { const iv = setInterval(() => setTick(t=>t+1), 500); return () => clearInterval(iv); }, []);
  // Broadcast visibility so the Inspect chip reflects real state
  useEffect(() => { window.emit && window.emit('panel-visibility', { id: 'inspector', hidden: !selId }); }, [selId]);
  if (!selId) return null;
  const a = window.SIM.state[selId];
  if (!a) return null;
  const pulse = window.STORE.telemetry[selId] || {};
  const bar = (v, c) => <div className="mini-bar"><div style={{ width:`${Math.round((v||0)*100)}%`, background: c }} /></div>;
  return (
    <FP id="inspector" title={`${a.emoji} ${a.name}`} subtitle={a.role} icon="◈" accent={a.color} width={280} defaultX={window.innerWidth - 304} defaultY={410} z={25}>
      <div className="insp">
        <div className="insp-mission">{a.mission}</div>
        <div className="insp-thought">
          <span className="mono small dim">current thought</span>
          <div className="mono" style={{ color: a.color }}>"{a.thought}"</div>
        </div>
        <div className="stats">
          <div><span className="mono small dim">mood</span>{bar(a.mood, '#7ee787')}</div>
          <div><span className="mono small dim">reputation</span>{bar(a.reputation, '#8ac6ff')}</div>
          <div><span className="mono small dim">risk</span>{bar(a.risk, '#ff9f7a')}</div>
          <div><span className="mono small dim">momentum</span>{bar(a.momentum, a.color)}</div>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => window.pulseFromUI(selId)}>Nudge</button>
          <button className="btn ghost" onClick={() => window.focusAgent(selId)}>Focus cam</button>
          <button className="btn ghost" onClick={() => window.clearSelection()}>Deselect</button>
        </div>
      </div>
    </FP>
  );
}

// ── AgentPulseBoard ──────────────────────────────────────────────────────────
function AgentPulseBoard({ accent }) {
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force(v=>v+1), 700); return () => clearInterval(iv); }, []);
  const rows = window.AGENTS.filter(a => a.id !== 'debug').map(d => {
    const s = window.SIM.state[d.id];
    return { ...d, mood: s.mood, rep: s.reputation, risk: s.risk, mom: s.momentum, action: s.action };
  }).sort((a,b) => b.mom - a.mom);
  const bar = (v, c) => <div className="mini-bar tight"><div style={{ width:`${Math.round((v||0)*100)}%`, background: c }} /></div>;
  return (
    <FP id="pulse" title="Agent Pulse" subtitle="mood · rep · risk · momentum" icon="❚❚" accent={accent} width={300} defaultX={window.innerWidth - 324} defaultY={56} z={18}>
      <div className="pulse">
        {rows.map(r => (
          <div key={r.id} className="pulse-row" onClick={() => window.selectAgent(r.id)}>
            <div className="pulse-l">
              <span className="dot" style={{ background: r.color, boxShadow: r.action!=='idle' ? `0 0 6px ${r.color}` : 'none' }} />
              <span className="pulse-nm" style={{ color: r.color }}>{r.name}</span>
              <span className="pulse-ac">{r.action}</span>
            </div>
            <div className="pulse-bars">
              {bar(r.mood, '#7ee787')}
              {bar(r.rep, '#8ac6ff')}
              {bar(r.risk, '#ff9f7a')}
              {bar(r.mom, r.color)}
            </div>
          </div>
        ))}
      </div>
    </FP>
  );
}

// ── RelationshipGraph ────────────────────────────────────────────────────────
function RelationshipGraph({ accent }) {
  const edges = useMemo(() => window.PAIRS.map(([a,b,s]) => {
    const A = window.BY_ID[a], B = window.BY_ID[b];
    const intensity = 0.3 + Math.random()*0.6;
    return { a, b, aName:A.name, bName:B.name, status: s, intensity, aColor:A.color, bColor:B.color };
  }), []);
  const visible = edges.filter(e => e.status !== 'neutral');
  return (
    <FP id="graph" title="Relationship Graph" subtitle="alliances & rivalries" icon="⌘" accent={accent} width={290} defaultX={window.innerWidth - 314} defaultY={60} defaultHidden z={16}>
      {visible.map((e,i)=>(
        <div key={i} className="edge" onClick={() => window.highlightPair(e.a, e.b)}>
          <div className="edge-top">
            <span style={{ color: e.aColor, fontWeight: 700 }}>{window.BY_ID[e.a].emoji} {e.aName}</span>
            <span className="edge-mid" style={{ color: e.status==='alliance'?'#7ee787':'#ff9f7a' }}>
              {e.status==='alliance' ? '──' : '╳─'}
            </span>
            <span style={{ color: e.bColor, fontWeight: 700 }}>{window.BY_ID[e.b].emoji} {e.bName}</span>
          </div>
          <div className="edge-bot">
            <span className="chip" style={{ color: e.status==='alliance'?'#7ee787':'#ff9f7a', borderColor: 'currentColor' }}>{e.status}</span>
            <span className="mono small dim">{Math.round(e.intensity*100)} intensity</span>
          </div>
        </div>
      ))}
    </FP>
  );
}

// ── HighlightsFeed ───────────────────────────────────────────────────────────
function HighlightsFeed({ accent }) {
  const [items, setItems] = useState(window.STORE.highlights);
  useEffect(() => window.on('highlight', () => setItems([...window.STORE.highlights])), []);
  return (
    <FP id="highlights" title="Highlight Timeline" subtitle="live dramatic moments" icon="★" accent={accent} width={320} defaultX={window.innerWidth - 344} defaultY={320} defaultHidden z={15}>
      {items.length === 0 && <div className="empty">Awaiting dramatic moments…</div>}
      {items.map(it => (
        <div key={it.id} className="hl">
          <div className="hl-meta"><span style={{ color: it.color || accent }}>{it.type}</span> · {it.time}</div>
          <div className="hl-title">{it.title}</div>
          <div className="hl-body">{it.body}</div>
        </div>
      ))}
    </FP>
  );
}

// ── EpisodeRecap (Claude-backed) ─────────────────────────────────────────────
function EpisodeRecap({ accent }) {
  const [recap, setRecap] = useState(null);
  const [status, setStatus] = useState('');
  const [narrative, setNarrative] = useState('');
  const [day, setDay] = useState(window.ENGINE?.Story?.day || 1);
  useEffect(() => window.on('story', () => setDay(window.ENGINE.Story.day)), []);
  const load = async () => {
    setStatus(window.ENGINE?.offline() ? 'Compiling (offline)…' : 'Calling Claude…');
    const hl = window.STORE.highlights.slice(0, 3);
    const lb = window.AGENTS.filter(a=>a.id!=='debug').map(a => ({ name: a.name, impact: (window.SIM.state[a.id].reputation + window.SIM.state[a.id].momentum)/2 })).sort((a,b)=>b.impact-a.impact).slice(0,5);
    let narr = '';
    try { narr = await window.ENGINE.generateRecap(); } catch {}
    setNarrative(narr);
    setRecap({
      scenario: window.STORE.scenario,
      day: window.ENGINE.Story.day,
      narrative: narr,
      outcomeCard: { title: `${window.STORE.scenario} · Day ${window.ENGINE.Story.day}`, summary: narr || 'Workforce stayed on-mission.', activeRelationships: window.PAIRS.filter(p=>p[2]!=='neutral').length },
      topHighlights: hl,
      leaderboard: lb,
      milestones: window.ENGINE.Story.milestones,
    });
    setStatus('Recap ready.');
  };
  const exp = () => {
    if (!recap) return;
    const blob = new Blob([JSON.stringify(recap, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `episode-recap-day${recap.day}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <FP id="recap" title="Episode Recap" subtitle={`day ${day} · narrative`} icon="▶" accent={accent} width={340} defaultX={16} defaultY={230} defaultHidden z={15}>
      <div className="row gap">
        <button className="btn primary" onClick={load}>Generate</button>
        <button className="btn ghost" onClick={exp} disabled={!recap}>Export JSON</button>
      </div>
      <div className="mono small dim" style={{ margin: '8px 0' }}>{status}</div>
      {recap && <>
        <div className="mono small" style={{ color:'#ffd6a5', marginBottom:6 }}>{recap.outcomeCard.title}</div>
        {narrative && <div className="mono small" style={{ color:'#efe1ff', background:'rgba(255,214,165,0.06)', padding:8, borderLeft:'2px solid #ffd6a5', marginBottom:8, lineHeight:1.55 }}>{narrative}</div>}
        <div className="mono small" style={{ marginBottom:4 }}>Top highlights</div>
        {recap.topHighlights.map((h,i)=><div key={i} className="mono small" style={{ color:'#efe1ff', marginBottom:2 }}>• {h.title}</div>)}
        {recap.topHighlights.length === 0 && <div className="empty">(no highlights yet)</div>}
        <div className="mono small" style={{ marginTop:6, marginBottom:4 }}>Leaderboard</div>
        {recap.leaderboard.map((a,i)=><div key={i} className="mono small" style={{ color:'#efe1ff', marginBottom:2 }}>{i+1}. {a.name} · {Math.round(a.impact*100)} impact</div>)}
        {recap.milestones?.length > 0 && <>
          <div className="mono small" style={{ marginTop:6, marginBottom:4 }}>Story milestones</div>
          {recap.milestones.slice(-5).map((m,i)=><div key={i} className="mono small dim">D{m.day} · {m.text}</div>)}
        </>}
      </>}
    </FP>
  );
}

// ── StoryPanel ────────────────────────────────────────────────────────────────
function StoryPanel({ accent }) {
  const [, force] = useState(0);
  const [note, setNote] = useState(window.ENGINE?.UserContext?.note || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const h1 = window.on('story', () => force(x=>x+1));
    const h2 = window.on('think', () => force(x=>x+1));
    return () => {};
  }, []);
  const S = window.ENGINE?.Story || { day:1, milestones:[], unlockedRooms:['workspace','lounge'] };
  const M = window.ENGINE?.Memory || { events:[] };
  const events = M.events.slice(0, 10);
  const saveNote = () => {
    window.ENGINE.setUserContext(note);
    setSaved(true);
    setTimeout(()=>setSaved(false), 1200);
  };
  const advance = () => { window.advanceDayManual?.(); force(x=>x+1); };
  return (
    <FP id="story" title="Story" subtitle="world state · memory" icon="✦" accent={accent} width={340} defaultX={16} defaultY={460} defaultHidden z={15}>
      <div className="row gap" style={{ justifyContent:'space-between', marginBottom:8 }}>
        <div className="mono small" style={{ color:accent }}>DAY {S.day}</div>
        <button className="btn ghost small" onClick={advance}>+1 day</button>
      </div>
      <div className="mono small dim" style={{ marginBottom:4 }}>Rooms unlocked</div>
      <div className="row gap" style={{ flexWrap:'wrap', marginBottom:8 }}>
        {S.unlockedRooms.map(r => <span key={r} className="chip on" style={{ fontSize:10 }}>{r}</span>)}
      </div>
      <div className="mono small dim" style={{ marginBottom:4 }}>Recent world events</div>
      <div style={{ maxHeight:120, overflow:'auto', marginBottom:8, borderLeft:'1px solid rgba(255,255,255,0.08)', paddingLeft:6 }}>
        {events.length === 0 && <div className="empty">(no events yet)</div>}
        {events.map((e,i)=>(
          <div key={i} className="mono small" style={{ color:'#efe1ff', marginBottom:2 }}>
            <span style={{ color:'#ffd6a5' }}>[{e.type}]</span> {e.text}
          </div>
        ))}
      </div>
      <div className="mono small dim" style={{ marginBottom:4 }}>Your context (shared with agents)</div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. 'I'm preparing to fundraise. Lumina is our main competitor.'"
        style={{ width:'100%', minHeight:60, background:'rgba(0,0,0,0.4)', color:'#efe1ff', border:'1px solid rgba(255,255,255,0.12)', borderRadius:4, padding:6, fontFamily:'inherit', fontSize:10, resize:'vertical' }} />
      <div className="row gap" style={{ marginTop:6 }}>
        <button className="btn primary" onClick={saveNote}>{saved ? '✓ Saved' : 'Save context'}</button>
        <div className="mono small dim" style={{ alignSelf:'center' }}>{window.ENGINE?.offline() ? 'offline mode' : 'Claude online'}</div>
      </div>
    </FP>
  );
}

// ── SystemLog ────────────────────────────────────────────────────────────────
function SystemLog({ accent, scanlines }) {
  const [logs, setLogs] = useState(window.STORE.systemLog);
  const ref = useRef(null);
  useEffect(() => window.on('log', () => setLogs([...window.STORE.systemLog])), []);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const icons = { work:'⚙', talk:'✦', idle:'·', use_tool:'⚒', move:'→', think:'💡' };
  return (
    <FP id="log" title="System Activity Log" subtitle={`${logs.length}/60 events`} icon="≡" accent={accent} width={300} defaultX={window.innerWidth - 324} defaultY={window.innerHeight - 340} defaultHidden z={14} scanlines={scanlines}>
      <div ref={ref} className="log" style={{ maxHeight: 220 }}>
        {logs.length === 0 && <div className="empty">Waiting for events…</div>}
        {logs.map(l => (
          <div key={l.id} className="log-row">
            <span className="mono small dim" style={{ minWidth: 46 }}>{l.time}</span>
            <span className="mono small" style={{ color: l.color }}>{icons[l.action]||'·'}</span>
            <span className="mono small" style={{ color: l.color }}>{l.agent}</span>
            <span className="mono small dim">{l.action}</span>
            {l.thought && <span className="mono small" style={{ color:'#8b93b8', fontStyle:'italic' }}>"{l.thought.slice(0,44)}"</span>}
          </div>
        ))}
      </div>
    </FP>
  );
}

// ── ViralControl / Showrunner ────────────────────────────────────────────────
function ShowrunnerControls({ accent }) {
  const [scen, setScen] = useState(window.STORE.scenario);
  const [last, setLast] = useState(window.STORE.lastEvent);
  const [cine, setCine] = useState(true);
  useEffect(() => window.on('last-event', () => setLast(window.STORE.lastEvent)), []);
  useEffect(() => { window.SIM.cam.cinematic = cine; }, [cine]);
  return (
    <FP id="showrunner" title="Showrunner Controls" subtitle="Viral mode console" icon="✦" accent={accent} width={320} defaultX={window.innerWidth - 344} defaultY={window.innerHeight - 360} z={18}>
      <div className="mono small dim" style={{ marginBottom: 8 }}>last event: <span style={{ color:'#ffd6a5' }}>{last}</span></div>
      <div className="row gap">
        <select className="inp" value={scen} onChange={e=>setScen(e.target.value)}>
          {window.SCENARIOS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn gradient" onClick={() => window.startScenario(scen)}>Start</button>
      </div>
      <label className="chk"><input type="checkbox" checked={cine} onChange={e=>setCine(e.target.checked)} /> Cinematic camera auto-focus</label>
      <div className="mono small" style={{ margin:'8px 0 4px', color:'#ffcad4' }}>Chaos buttons</div>
      <div className="chaos-grid">
        {window.CHAOS_EVENTS.map(ev => (
          <button key={ev.id} className="chaos-btn" onClick={() => window.triggerChaos(ev.id, ev.label, ev.icon)}>
            <span>{ev.icon}</span> {ev.label}
          </button>
        ))}
      </div>
    </FP>
  );
}

// ── LayoutEditor (cosmetic: spawn & nudge furniture overlay dots) ───────────
function LayoutEditor({ accent }) {
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState('plant');
  const palette = [
    { k:'desk', e:'🖥️', l:'Desk' }, { k:'plant', e:'🌿', l:'Plant' },
    { k:'book', e:'📚', l:'Bookshelf' }, { k:'coffee', e:'☕', l:'Coffee' },
    { k:'table', e:'🪑', l:'Table' }, { k:'chair', e:'💺', l:'Chair' },
    { k:'board', e:'📝', l:'Board' },
  ];
  useEffect(() => { window.LAYOUT_OVERLAY = items; window.emit('layout'); }, [items]);
  const add = () => {
    const p = palette.find(p=>p.k===sel);
    setItems([...items, { id: Date.now()+Math.random(), k: sel, emoji: p.e, label: p.l, col: 4 + Math.floor(Math.random()*40), row: 4 + Math.floor(Math.random()*14) }]);
  };
  const nudge = (id, dx, dy) => setItems(items.map(i=>i.id===id?{...i, col: Math.max(1, Math.min(46, i.col+dx)), row: Math.max(1, Math.min(18, i.row+dy))}:i));
  const rm = id => setItems(items.filter(i=>i.id!==id));
  return (
    <FP id="layout" title="Office Layout Editor" subtitle="spawn cosmetic markers" icon="▦" accent={accent} width={290} defaultX={16} defaultY={window.innerHeight - 360} defaultHidden z={20}>
      <div className="pal">
        {palette.map(p => (
          <button key={p.k} className={`btn pal-btn ${sel===p.k?'on':''}`} onClick={()=>setSel(p.k)}>{p.e} {p.l}</button>
        ))}
      </div>
      <button className="btn primary full" onClick={add}>+ Add {palette.find(p=>p.k===sel).l}</button>
      <div className="lay-list">
        {items.length === 0 && <div className="empty">Pick a type then Add. Markers appear on the canvas.</div>}
        {items.map(i => (
          <div key={i.id} className="lay-row">
            <span>{i.emoji} {i.label} <span className="dim mono small">({i.col},{i.row})</span></span>
            <div className="row gap-xs">
              <button className="btn xs" onClick={()=>nudge(i.id,-1,0)}>◀</button>
              <button className="btn xs" onClick={()=>nudge(i.id,1,0)}>▶</button>
              <button className="btn xs" onClick={()=>nudge(i.id,0,-1)}>▲</button>
              <button className="btn xs" onClick={()=>nudge(i.id,0,1)}>▼</button>
              <button className="btn xs danger" onClick={()=>rm(i.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </FP>
  );
}

window.Panels = { ChatPanel, TaskBoard, AgentInspector, AgentPulseBoard, RelationshipGraph, HighlightsFeed, EpisodeRecap, StoryPanel, SystemLog, ShowrunnerControls, LayoutEditor };
