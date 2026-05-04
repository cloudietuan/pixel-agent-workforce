// Tiny event bus + shared store for all panels. No server.
window.BUS = new EventTarget();
window.STORE = {
  messages: [],         // chat
  highlights: [],
  systemLog: [],
  tasks: [],
  selectedId: null,
  scenario: 'Startup Crunch',
  lastEvent: 'Idle',
  edges: [],            // relationship edges
  telemetry: {},        // per-agent pulse
  tick: 0,
};

window.emit = (type, detail) => window.BUS.dispatchEvent(new CustomEvent(type, { detail }));
window.on = (type, fn) => { window.BUS.addEventListener(type, fn); return () => window.BUS.removeEventListener(type, fn); };
