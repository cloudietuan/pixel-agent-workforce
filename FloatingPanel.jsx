// FloatingPanel — draggable, minimizable window. Persists position in localStorage.
const { useState, useEffect, useMemo, useRef } = React;

function clampPosition(pos, width) {
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - 44);
  return { x: Math.max(8, Math.min(maxX, pos.x)), y: Math.max(8, Math.min(maxY, pos.y)) };
}

function FloatingPanel({ id, title, subtitle, width=300, defaultX, defaultY=20, defaultMin=false, defaultHidden=false, accent='#e94560', z=14, children, icon, scanlines }) {
  const storageKey = useMemo(() => `panel:${id}:state`, [id]);
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return clampPosition(JSON.parse(raw), width);
    } catch {}
    return { x: defaultX ?? Math.max(8, window.innerWidth - width - 24), y: defaultY };
  });
  const [min, setMin] = useState(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const p = JSON.parse(raw); if (typeof p.min === 'boolean') return p.min; } } catch {}
    return defaultMin;
  });
  const [hidden, setHidden] = useState(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) { const p = JSON.parse(raw); if (typeof p.hidden === 'boolean') return p.hidden; } } catch {}
    return defaultHidden;
  });

  // Broadcast visibility so toolbar chips can reflect real state
  useEffect(() => {
    window.emit && window.emit('panel-visibility', { id, hidden });
  }, [hidden, id]);
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...pos, min, hidden }));
  }, [pos, min, hidden, storageKey]);

  useEffect(() => {
    const showHandler = (e) => { if (e.detail && e.detail.id === id) setHidden(false); };
    const toggleHandler = (e) => { if (e.detail && e.detail.id === id) setHidden(h => !h); };
    window.BUS.addEventListener('panel-show', showHandler);
    window.BUS.addEventListener('panel-toggle', toggleHandler);
    return () => {
      window.BUS.removeEventListener('panel-show', showHandler);
      window.BUS.removeEventListener('panel-toggle', toggleHandler);
    };
  }, [id]);

  useEffect(() => {
    if (!drag) return;
    const onMove = e => setPos(clampPosition({ x: e.clientX - drag.dx, y: e.clientY - drag.dy }, width));
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag, width]);

  if (hidden) return null;

  return (
    <div className="fp" style={{ position:'absolute', left: pos.x, top: pos.y, width, zIndex: z, '--accent': accent }}>
      <div
        className="fp-head"
        onMouseDown={(e) => {
          const t = e.target;
          if (t.closest('button') || t.closest('input') || t.closest('select')) return;
          setDrag({ dx: e.clientX - pos.x, dy: e.clientY - pos.y });
        }}
      >
        <div className="fp-title">
          <span className="fp-icon" style={{ color: accent }}>{icon}</span>
          <div>
            <div className="fp-t">{title}</div>
            {subtitle && <div className="fp-s">{subtitle}</div>}
          </div>
        </div>
        <div className="fp-actions">
          <button className="fp-btn" onClick={() => setMin(v => !v)} title={min ? 'Expand' : 'Collapse'}>{min ? '+' : '–'}</button>
          <button className="fp-btn" onClick={() => setHidden(true)} title="Close">×</button>
        </div>
      </div>
      {!min && <div className="fp-body" style={{ '--scan': scanlines ? 'block' : 'none' }}>{children}</div>}
    </div>
  );
}

window.FloatingPanel = FloatingPanel;
