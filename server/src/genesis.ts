// GENESIS — meta-evolution feature
//
// Tracks the full lifecycle of agent-proposed office changes: who proposed,
// who voted, whether it was applied or rejected, and a rollback hook for
// every applied change. Persists to SQLite so evolution survives restarts.
//
// Safety rails (intentionally conservative for MVP):
//   - Hard cap: max 50 ACTIVE (non-rolled-back) applied changes; oldest
//     auto-archives but stays in history.
//   - Master pause toggle disables both new proposals and voting cycles.
//   - No code generation; only parameter-style mutations applied via the
//     existing OfficeRoom.applyProposal pipeline.

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { mkdir } from 'fs/promises';

export interface GenesisHistoryEntry {
    id: string;
    kind: string;
    by: string;
    reason: string;
    payloadJson: string;
    status: 'pending' | 'applied' | 'rejected';
    createdAt: string;
    appliedAt: string | null;
    rolledBack: boolean;
}

export interface GenesisVote {
    proposalId: string;
    by: string;
    vote: 'yes' | 'no';
    reason: string;
    at: string;
}

export interface CharterVersion {
    version: number;
    text: string;
    draftedAt: string;
    appliedProposalsAtDraft: number;
}

export class GenesisStore {
    private db?: Database;
    private _paused = false;
    private _charter = 'No charter yet. Agents will draft one as they evolve the office.';

    async initialize(dbPath: string = './data/office-memory.db') {
        await mkdir(path.dirname(dbPath), { recursive: true });
        this.db = await open({ filename: dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS genesis_history (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                by TEXT NOT NULL,
                reason TEXT,
                payload TEXT,
                status TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                applied_at TEXT,
                rolled_back INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS genesis_votes (
                proposal_id TEXT NOT NULL,
                by TEXT NOT NULL,
                vote TEXT NOT NULL,
                reason TEXT,
                at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS genesis_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS genesis_charter_history (
                version INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                drafted_at TEXT DEFAULT (datetime('now')),
                applied_proposals_at_draft INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_genesis_status ON genesis_history(status);
        `);

        // Restore charter + paused
        const charterRow = await this.db.get<{ value: string }>("SELECT value FROM genesis_meta WHERE key = 'charter'");
        if (charterRow?.value) this._charter = charterRow.value;
        const pausedRow = await this.db.get<{ value: string }>("SELECT value FROM genesis_meta WHERE key = 'paused'");
        if (pausedRow?.value === '1') this._paused = true;
    }

    get paused() { return this._paused; }
    async setPaused(v: boolean) {
        this._paused = v;
        if (this.db) {
            await this.db.run("INSERT OR REPLACE INTO genesis_meta (key, value) VALUES ('paused', ?)", [v ? '1' : '0']);
        }
    }

    get charter() { return this._charter; }
    async setCharter(text: string) {
        this._charter = text;
        if (this.db) {
            await this.db.run("INSERT OR REPLACE INTO genesis_meta (key, value) VALUES ('charter', ?)", [text]);
        }
    }

    async record(entry: { id: string; kind: string; by: string; reason: string; payload: unknown; status: 'pending' | 'applied' | 'rejected' }): Promise<void> {
        if (!this.db) return;
        const appliedAt = entry.status === 'applied' ? new Date().toISOString() : null;
        await this.db.run(
            'INSERT OR REPLACE INTO genesis_history (id, kind, by, reason, payload, status, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [entry.id, entry.kind, entry.by, entry.reason, JSON.stringify(entry.payload || {}), entry.status, appliedAt]
        );
    }

    async markApplied(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run("UPDATE genesis_history SET status = 'applied', applied_at = datetime('now') WHERE id = ?", [id]);
    }

    async markRejected(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run("UPDATE genesis_history SET status = 'rejected' WHERE id = ?", [id]);
    }

    async markRolledBack(id: string): Promise<void> {
        if (!this.db) return;
        await this.db.run('UPDATE genesis_history SET rolled_back = 1 WHERE id = ?', [id]);
    }

    async addVote(v: GenesisVote): Promise<void> {
        if (!this.db) return;
        await this.db.run(
            'INSERT INTO genesis_votes (proposal_id, by, vote, reason, at) VALUES (?, ?, ?, ?, ?)',
            [v.proposalId, v.by, v.vote, v.reason, v.at]
        );
    }

    async getRecentHistory(limit: number = 50): Promise<GenesisHistoryEntry[]> {
        if (!this.db) return [];
        const rows = await this.db.all(
            'SELECT id, kind, by, reason, payload as payloadJson, status, created_at as createdAt, applied_at as appliedAt, rolled_back as rolledBack FROM genesis_history ORDER BY created_at DESC LIMIT ?',
            [limit]
        );
        return rows.map((r) => ({ ...r, rolledBack: !!r.rolledBack })) as GenesisHistoryEntry[];
    }

    async getActiveAppliedCount(): Promise<number> {
        if (!this.db) return 0;
        const row = await this.db.get<{ c: number }>("SELECT COUNT(*) as c FROM genesis_history WHERE status = 'applied' AND rolled_back = 0");
        return row?.c || 0;
    }

    async getStats(): Promise<{ proposals: number; applied: number; rejected: number }> {
        if (!this.db) return { proposals: 0, applied: 0, rejected: 0 };
        const r = await this.db.get<{ p: number; a: number; r: number }>(
            "SELECT COUNT(*) as p, SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END) as a, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as r FROM genesis_history"
        );
        return { proposals: r?.p || 0, applied: r?.a || 0, rejected: r?.r || 0 };
    }

    // Save a new charter version. Bumps the version, persists current text
    // to genesis_meta (for fast read), appends to history table.
    async saveCharterVersion(text: string, appliedProposalsCount: number): Promise<CharterVersion> {
        if (!this.db) throw new Error('GenesisStore not initialized');
        await this.db.run(
            'INSERT INTO genesis_charter_history (text, applied_proposals_at_draft) VALUES (?, ?)',
            [text, appliedProposalsCount]
        );
        const row = await this.db.get<{ version: number; drafted_at: string }>(
            'SELECT version, drafted_at FROM genesis_charter_history ORDER BY version DESC LIMIT 1'
        );
        await this.setCharter(text);
        return {
            version: row?.version || 1,
            text,
            draftedAt: row?.drafted_at || new Date().toISOString(),
            appliedProposalsAtDraft: appliedProposalsCount,
        };
    }

    async getCharterHistory(limit: number = 10): Promise<CharterVersion[]> {
        if (!this.db) return [];
        const rows = await this.db.all(
            'SELECT version, text, drafted_at as draftedAt, applied_proposals_at_draft as appliedProposalsAtDraft FROM genesis_charter_history ORDER BY version DESC LIMIT ?',
            [limit]
        );
        return rows as CharterVersion[];
    }

    async getEntry(id: string): Promise<GenesisHistoryEntry | null> {
        if (!this.db) return null;
        const r = await this.db.get(
            'SELECT id, kind, by, reason, payload as payloadJson, status, created_at as createdAt, applied_at as appliedAt, rolled_back as rolledBack FROM genesis_history WHERE id = ?',
            [id]
        );
        if (!r) return null;
        return { ...r, rolledBack: !!r.rolledBack } as GenesisHistoryEntry;
    }
}
