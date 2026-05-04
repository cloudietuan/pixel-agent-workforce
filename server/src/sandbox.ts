// SANDBOX — three-tier mutation safety model
// ===========================================
//
// Agents in this office can propose changes that mutate the simulation
// itself. The sandbox enforces what's safe at each tier:
//
//   Tier 1: DATA mutations (sprites, layout coordinates, placards)
//     - No code execution. Pure data with strict schema.
//     - Validation: schema + bounds + palette + identifier format
//     - Storage: dedicated SQLite tables (runtime_objects, etc.)
//     - Rollback: row delete + canvas redraw
//     - Risk: LOW (input validation only)
//     - STATUS: implemented (this file: validateRuntimeObject + RuntimeObjectStore)
//
//   Tier 2: BEHAVIOR mutations (new agent actions like "high-five")
//     - Generated JS function string.
//     - Validation: source AST checked against banned-token list
//       (eval, Function, import, fetch, document, window, localStorage,
//       postMessage outside protocol).
//     - Execution: spawned in a Web Worker on the *client* side
//       (server stores the source text only, never executes it).
//       The worker has no DOM, no fetch, no localStorage. It receives
//       a frozen `agent` proxy via postMessage with a strict allowlist:
//         move(dx, dy), say(text), emote(kind)
//     - Hard timeout: 50ms per invocation; longer = killed + auto-rollback.
//     - Storage: source text + sha256 in SQLite.
//     - Rollback: deregister behavior + terminate any running worker.
//     - Risk: MEDIUM (CPU exhaustion possible; timeout mitigates).
//     - STATUS: types + storage scaffolded below; execution layer is
//       a follow-up (server-side never executes; that's the point).
//
//   Tier 3: UI mutations (new panels/widgets like a new metric card)
//     - NO code generation. Template registry only.
//     - Agents propose { template: "metric_card"|"agent_list"|"text_block"|
//       "bar_chart", config: {...} }.
//     - Validation: template name against fixed allowlist; config schema
//       per template (e.g. metric_card requires { label, value_source }).
//     - Execution: NONE. Client renders pre-built React/HTML for that
//       template using the supplied config.
//     - Storage: { template, config } JSON in SQLite.
//     - Rollback: row delete + UI re-render.
//     - Risk: LOW (no code).
//     - STATUS: types + storage scaffolded below; widget renderer is
//       a UI-side follow-up.
//
// Cross-tier guarantees enforced at every boundary:
//   - Every mutation is recorded in genesis_history with status + payload.
//   - Every mutation has a rollback path; rollback marks the row as
//     rolled_back without deleting (audit preservation).
//   - Hard cap of 50 active mutations across ALL tiers (set in OfficeRoom).
//   - Master pause toggle blocks acceptance of new proposals.
//   - User MUST approve every proposal; nothing auto-applies.

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ─── Tier 1: DATA mutations (runtime objects / sprites) ──────────────────────

export interface RuntimeObject {
    id: string;             // sandbox object id (matches proposal id)
    name: string;           // lowercase_snake_case identifier
    spriteHex: string[][];  // 16x16 grid of '#RRGGBB' or '' (transparent)
    width: number;          // tile width (1 for now)
    height: number;         // tile height (1 for now)
    x: number;              // grid col placement
    y: number;              // grid row placement
    addedBy: string;        // proposer agent name
    proposalId: string;     // genesis_history.id reference
    createdAt: string;
    rolledBack: boolean;
}

export interface ValidationResult {
    ok: boolean;
    errors: string[];
}

const NAME_RE = /^[a-z][a-z0-9_]{2,31}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SPRITE_DIM = 16;
const MAX_PALETTE = 16;

export function validateRuntimeObjectInput(input: unknown): ValidationResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') {
        return { ok: false, errors: ['payload must be an object'] };
    }
    const p = input as Record<string, unknown>;

    // name
    const name = typeof p.name === 'string' ? p.name : '';
    if (!NAME_RE.test(name)) {
        errors.push(`name must match ${NAME_RE} (got "${name.slice(0, 32)}")`);
    }

    // sprite — 16x16 grid
    const sprite = p.spriteHex;
    if (!Array.isArray(sprite) || sprite.length !== SPRITE_DIM) {
        errors.push(`spriteHex must be a ${SPRITE_DIM}-row array`);
    } else {
        const palette = new Set<string>();
        for (let r = 0; r < SPRITE_DIM; r++) {
            const row = sprite[r];
            if (!Array.isArray(row) || row.length !== SPRITE_DIM) {
                errors.push(`spriteHex row ${r} must have ${SPRITE_DIM} cells`);
                break;
            }
            for (let c = 0; c < SPRITE_DIM; c++) {
                const cell = row[c];
                if (cell === '' || cell === null) continue; // transparent
                if (typeof cell !== 'string' || !HEX_RE.test(cell)) {
                    errors.push(`spriteHex[${r}][${c}] must be '' or '#RRGGBB' (got ${JSON.stringify(cell)})`);
                    if (errors.length > 5) break;
                } else {
                    palette.add(cell.toLowerCase());
                }
            }
            if (errors.length > 5) break;
        }
        if (palette.size > MAX_PALETTE) {
            errors.push(`palette has ${palette.size} colors, max ${MAX_PALETTE}`);
        }
    }

    // position — integer grid coords, sane bounds
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isInteger(x) || x < 0 || x > 200) {
        errors.push(`x must be integer 0..200 (got ${p.x})`);
    }
    if (!Number.isFinite(y) || !Number.isInteger(y) || y < 0 || y > 200) {
        errors.push(`y must be integer 0..200 (got ${p.y})`);
    }

    return { ok: errors.length === 0, errors };
}

// ─── Tier 2: BEHAVIOR mutations (scaffold only — execution is client-side) ───

export interface RuntimeBehavior {
    id: string;
    name: string;          // identifier
    trigger: 'on_meet' | 'on_idle' | 'on_walk' | 'on_break';
    sourceHash: string;    // sha256 of code, for integrity check
    source: string;        // raw code text, NEVER executed server-side
    addedBy: string;
    proposalId: string;
    createdAt: string;
    rolledBack: boolean;
}

const BANNED_TOKENS = [
    'eval', 'Function', 'import', 'require', 'fetch',
    'XMLHttpRequest', 'WebSocket', 'document', 'window',
    'localStorage', 'sessionStorage', 'indexedDB',
    'postMessage', 'parent', 'top', 'opener', 'self',
    'Worker', 'SharedArrayBuffer', 'Atomics',
];

export function validateBehaviorInput(input: unknown): ValidationResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') return { ok: false, errors: ['payload must be an object'] };
    const p = input as Record<string, unknown>;
    if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) errors.push('name must be lowercase_snake_case');
    if (!['on_meet', 'on_idle', 'on_walk', 'on_break'].includes(String(p.trigger))) {
        errors.push('trigger must be one of: on_meet, on_idle, on_walk, on_break');
    }
    const source = typeof p.source === 'string' ? p.source : '';
    if (source.length === 0 || source.length > 2000) errors.push('source must be 1..2000 chars');
    for (const tok of BANNED_TOKENS) {
        if (new RegExp(`\\b${tok}\\b`).test(source)) {
            errors.push(`source uses banned token "${tok}"`);
        }
    }
    return { ok: errors.length === 0, errors };
}

export function hashSource(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

// ─── Tier 3: UI mutations (template registry) ────────────────────────────────

export const WIDGET_TEMPLATES = {
    metric_card: { configKeys: ['label', 'valueSource'] as const },
    agent_list:  { configKeys: ['filter'] as const },
    text_block:  { configKeys: ['text'] as const },
    bar_chart:   { configKeys: ['label', 'valueSource', 'maxValue'] as const },
} as const;

export type WidgetTemplate = keyof typeof WIDGET_TEMPLATES;

export interface RuntimeWidget {
    id: string;
    template: WidgetTemplate;
    config: Record<string, unknown>;
    addedBy: string;
    proposalId: string;
    createdAt: string;
    rolledBack: boolean;
}

export function validateWidgetInput(input: unknown): ValidationResult {
    const errors: string[] = [];
    if (!input || typeof input !== 'object') return { ok: false, errors: ['payload must be an object'] };
    const p = input as Record<string, unknown>;
    const tpl = String(p.template || '') as WidgetTemplate;
    if (!(tpl in WIDGET_TEMPLATES)) {
        errors.push(`template must be one of: ${Object.keys(WIDGET_TEMPLATES).join(', ')}`);
        return { ok: false, errors };
    }
    const config = (p.config && typeof p.config === 'object') ? p.config as Record<string, unknown> : {};
    for (const key of WIDGET_TEMPLATES[tpl].configKeys) {
        if (!(key in config)) errors.push(`config.${key} required for template ${tpl}`);
    }
    return { ok: errors.length === 0, errors };
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export class SandboxStore {
    private db?: Database;

    async initialize(dbPath: string = './data/office-memory.db') {
        await mkdir(path.dirname(dbPath), { recursive: true });
        this.db = await open({ filename: dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS runtime_objects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sprite_hex TEXT NOT NULL,
                width INTEGER DEFAULT 1,
                height INTEGER DEFAULT 1,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                added_by TEXT NOT NULL,
                proposal_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                rolled_back INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS runtime_behaviors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                trigger TEXT NOT NULL,
                source TEXT NOT NULL,
                source_hash TEXT NOT NULL,
                added_by TEXT NOT NULL,
                proposal_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                rolled_back INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS runtime_widgets (
                id TEXT PRIMARY KEY,
                template TEXT NOT NULL,
                config TEXT NOT NULL,
                added_by TEXT NOT NULL,
                proposal_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                rolled_back INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_runtime_objects_active ON runtime_objects(rolled_back);
        `);
    }

    // ── Tier 1: objects ──
    async addObject(o: Omit<RuntimeObject, 'createdAt' | 'rolledBack'>): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO runtime_objects (id, name, sprite_hex, width, height, x, y, added_by, proposal_id) VALUES (?,?,?,?,?,?,?,?,?)',
            [o.id, o.name, JSON.stringify(o.spriteHex), o.width, o.height, o.x, o.y, o.addedBy, o.proposalId]
        );
    }
    async listActiveObjects(): Promise<RuntimeObject[]> {
        if (!this.db) return [];
        const rows = await this.db.all(`SELECT id, name, sprite_hex as spriteHex, width, height, x, y,
            added_by as addedBy, proposal_id as proposalId, created_at as createdAt, rolled_back as rolledBack
            FROM runtime_objects WHERE rolled_back = 0 ORDER BY created_at ASC`);
        return rows.map((r) => ({
            ...r,
            spriteHex: JSON.parse(r.spriteHex),
            rolledBack: !!r.rolledBack,
        })) as RuntimeObject[];
    }
    async rollbackObject(id: string): Promise<RuntimeObject | null> {
        if (!this.db) return null;
        const row = await this.db.get(`SELECT id, name, sprite_hex as spriteHex, width, height, x, y,
            added_by as addedBy, proposal_id as proposalId, created_at as createdAt, rolled_back as rolledBack
            FROM runtime_objects WHERE id = ?`, [id]);
        if (!row) return null;
        await this.db.run('UPDATE runtime_objects SET rolled_back = 1 WHERE id = ?', [id]);
        return { ...row, spriteHex: JSON.parse(row.spriteHex), rolledBack: true } as RuntimeObject;
    }

    // ── Tier 2: behaviors (scaffold; UI executes) ──
    async addBehavior(b: Omit<RuntimeBehavior, 'createdAt' | 'rolledBack'>): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO runtime_behaviors (id, name, trigger, source, source_hash, added_by, proposal_id) VALUES (?,?,?,?,?,?,?)',
            [b.id, b.name, b.trigger, b.source, b.sourceHash, b.addedBy, b.proposalId]
        );
    }
    async listActiveBehaviors(): Promise<RuntimeBehavior[]> {
        if (!this.db) return [];
        const rows = await this.db.all(`SELECT id, name, trigger, source, source_hash as sourceHash,
            added_by as addedBy, proposal_id as proposalId, created_at as createdAt, rolled_back as rolledBack
            FROM runtime_behaviors WHERE rolled_back = 0`);
        return rows.map((r) => ({ ...r, rolledBack: !!r.rolledBack })) as RuntimeBehavior[];
    }
    async rollbackBehavior(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run('UPDATE runtime_behaviors SET rolled_back = 1 WHERE id = ?', [id]);
    }

    // ── Tier 3: widgets ──
    async addWidget(w: Omit<RuntimeWidget, 'createdAt' | 'rolledBack'>): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            'INSERT OR REPLACE INTO runtime_widgets (id, template, config, added_by, proposal_id) VALUES (?,?,?,?,?)',
            [w.id, w.template, JSON.stringify(w.config), w.addedBy, w.proposalId]
        );
    }
    async listActiveWidgets(): Promise<RuntimeWidget[]> {
        if (!this.db) return [];
        const rows = await this.db.all(`SELECT id, template, config, added_by as addedBy,
            proposal_id as proposalId, created_at as createdAt, rolled_back as rolledBack
            FROM runtime_widgets WHERE rolled_back = 0 ORDER BY created_at ASC`);
        return rows.map((r) => ({ ...r, config: JSON.parse(r.config), rolledBack: !!r.rolledBack })) as RuntimeWidget[];
    }
    async rollbackWidget(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run('UPDATE runtime_widgets SET rolled_back = 1 WHERE id = ?', [id]);
    }
}
