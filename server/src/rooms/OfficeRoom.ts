import fs from 'fs';
import path from 'path';
import { Room, Client } from 'colyseus';
import { OfficeState } from '../schema/OfficeState';
import { Agent, Office, OfficeConfig, ConversationMessage, MemoryEntry } from '../../core';
import { OllamaAdapter, ClaudeAdapter } from '../../adapters';
import { ToolExecutor } from '../tools/ToolExecutor';
import { MemoryStore } from '../memory/MemoryStore';
import { JOHNS_AGENTS } from '../johns-agents';
import { ContextUpdate } from '../context-sync';
import { loadPortfolio, PortfolioItem } from '../portfolio';
import { GenesisStore } from '../genesis';
import {
    SandboxStore,
    validateRuntimeObjectInput,
    validateBehaviorInput,
    validateWidgetInput,
    hashSource,
    RuntimeObject,
    RuntimeWidget,
    WidgetTemplate,
} from '../sandbox';

export interface OfficeProposal {
    id: string;
    proposedBy: string;
    proposedByName: string;
    // Sandbox-A: add_runtime_object (sprite + position, no code)
    // Sandbox-B (scaffold): add_behavior (sandboxed action; client executes)
    // Sandbox-C (scaffold): add_widget (template + config, no code)
    kind:
        | 'add_furniture'
        | 'move_furniture'
        | 'expand_grid'
        | 'add_placard'
        | 'add_runtime_object'
        | 'add_behavior'
        | 'add_widget';
    reason: string;
    payload: Record<string, unknown>;
    createdAt: string;
    status: 'pending' | 'approved' | 'rejected';
    // Validation errors set during propose; if non-empty, proposal is
    // marked invalid and never reaches the user.
    validationErrors?: string[];
}

const ALL_PROPOSAL_KINDS = [
    'add_furniture', 'move_furniture', 'expand_grid', 'add_placard',
    'add_runtime_object', 'add_behavior', 'add_widget',
] as const;

interface HighlightEvent {
    type: string;
    title: string;
    body: string;
    agentId?: string | null;
    scenario: string;
    time: string;
}

interface RelationshipEdge {
    a: string;
    b: string;
    score: number;
    status: 'alliance' | 'neutral' | 'rivalry';
    updatedAt: string;
}

export class OfficeRoom extends Room<OfficeState> {
    private static activeRoom: OfficeRoom | null = null;

    maxClients = 100;
    private office!: Office;
    private demoTickCount = 0;
    private coreAgents: Map<string, Agent> = new Map();
    private thinkingLocks: Map<string, boolean> = new Map();
    // Inference backend — prefers Claude if ANTHROPIC_API_KEY is set, else Ollama.
    // Override model via ANTHROPIC_MODEL / OLLAMA_MODEL env vars.
    private inferenceAdapter = process.env.ANTHROPIC_API_KEY
        ? new ClaudeAdapter(process.env.ANTHROPIC_API_KEY)
        : new OllamaAdapter('http://127.0.0.1:11434');
    // Locked to Sonnet 4.6 per project spec. ANTHROPIC_MODEL env var can
    // override only to other Sonnet variants; anything else falls back to
    // claude-sonnet-4-6.
    private inferenceModel = process.env.ANTHROPIC_API_KEY
        ? (process.env.ANTHROPIC_MODEL?.includes('sonnet') ? process.env.ANTHROPIC_MODEL : 'claude-sonnet-4-6')
        : (process.env.OLLAMA_MODEL || 'llama3.2:latest');
    // Back-compat alias so any external reference still works
    private ollamaAdapter = this.inferenceAdapter;
    private hireCount = 0; // Counter for generating unique IDs
    private toolExecutor = new ToolExecutor();
    private memoryStore = new MemoryStore();
    private sessionId = `session_${Date.now()}`;
    private currentScenario = 'Free Play';
    private highlights: HighlightEvent[] = [];
    private chaosHistory: Array<{ event: string; label: string; time: string }> = [];
    private relationships: Map<string, RelationshipEdge> = new Map();
    private audienceVotes: Record<string, number> = {};
    private currentLayout: any[] = [];

    // Furniture interaction points: named locations agents can walk to
    private furnitureTargets: Record<string, { x: number; y: number; type: string }> = {
        'alice-desk': { x: 5, y: 18, type: 'desk' },
        'bob-desk': { x: 5, y: 23, type: 'desk' },
        'meeting-table': { x: 10, y: 5, type: 'table' },
        'coffee-machine': { x: 25, y: 25, type: 'appliance' },
        'whiteboard': { x: 17, y: 3, type: 'board' },
        'water-cooler': { x: 28, y: 27, type: 'appliance' },
        'bookshelf': { x: 32, y: 12, type: 'furniture' },
        'beanbag': { x: 28, y: 6, type: 'seating' },
        // Extra desks for dynamically hired agents
        'hire_0-desk': { x: 15, y: 18, type: 'desk' },
        'hire_1-desk': { x: 15, y: 23, type: 'desk' },
        'hire_2-desk': { x: 25, y: 18, type: 'desk' },
        'hire_3-desk': { x: 25, y: 8, type: 'desk' },
        'hire_4-desk': { x: 32, y: 18, type: 'desk' },
    };

    // World context (context-bible.md) — refreshed when bible changes.
    private worldContext: string = '';
    // Cached shared memories, refreshed periodically.
    private sharedMemoryCache: MemoryEntry[] = [];
    private sharedMemoryRefreshAt = 0;
    // Proposals from agents that need user approval before applying.
    private proposals: Map<string, OfficeProposal> = new Map();
    private proposalCounter = 0;
    // Portfolio items (resume → bible fallback) surfaced to the room.
    private portfolioItems: PortfolioItem[] = [];
    // Genesis: persistent evolution history, votes, charter, pause toggle.
    private genesis = new GenesisStore();
    private sandbox = new SandboxStore();
    private static readonly GENESIS_MAX_ACTIVE = 50;
    // Track in-flight voting cycles to avoid double-spawn.
    private votingInFlight: Set<string> = new Set();

    static getActiveRoom(): OfficeRoom | null {
        return OfficeRoom.activeRoom;
    }

    async onCreate(options: any) {
        OfficeRoom.activeRoom = this;
        this.setState(new OfficeState());

        // Initialize memory store + genesis store + sandbox store
        // (all share the same SQLite file at server/data/office-memory.db)
        await this.memoryStore.initialize();
        await this.genesis.initialize();
        await this.sandbox.initialize();

        const config: OfficeConfig = {
            name: options.name || 'Startup HQ',
            grid: { width: 40, height: 40, tileSize: 16 },
            rooms: [],
            furniture: [],
            spawnPoints: [{ x: 10, y: 10 }],
            zones: []
        };
        this.office = new Office(config);

        // Setup Core Agents with AI capabilities
        const setupCoreAgent = async (id: string, name: string, role: string, x: number, y: number) => {
            this.state.createAgent(id, name);
            const state = this.state.agents.get(id);
            if (state) { state.x = x; state.y = y; }

            const coreAgent = new Agent({
                id, name, role, avatar: 'sprite.png',
                inference: {
                    provider: this.inferenceAdapter.provider,
                    model: this.inferenceModel,
                    systemPrompt: `You are ${name}, a ${role} in a virtual office. Be social, do your work, and collaborate with colleagues. Keep thoughts SHORT.`,
                },
                personality: {
                    traits: { openness: 0.8, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.7, neuroticism: 0.1 },
                    communicationStyle: role === 'Engineer' ? 'technical' : 'casual',
                    workHours: { start: '09:00', end: '17:00' },
                    breakFrequency: 120
                },
                capabilities: [
                    { name: 'code_execute', description: 'Execute JavaScript code' },
                    { name: 'web_search', description: 'Search the web for information' },
                    { name: 'write_note', description: 'Write a note or memo' },
                    { name: 'create_task', description: 'Create a task and assign it to yourself or another agent' },
                    { name: 'hire_agent', description: 'Hire a new team member (intern, developer, designer). Params: { name: string, role: string }' },
                    { name: 'propose_office_change', description: 'Propose a change to the office layout (add/move furniture, expand grid, add a portfolio placard). The user MUST approve before it takes effect. Params: { kind: "add_furniture"|"move_furniture"|"expand_grid"|"add_placard", reason: string, payload: object }' },
                    { name: 'log_discovery', description: 'Record something new you noticed about the user, your work, or the office. Surfaces in your discoveries log. Params: { note: string }' }
                ],
                memory: { shortTermLimit: 50 }
            });

            coreAgent.setInferenceAdapter(this.inferenceAdapter);
            await coreAgent.initialize();

            // Load persistent memories from previous sessions
            const previousMemories = await this.memoryStore.loadMemories(id, 20);
            if (previousMemories.length > 0) {
                coreAgent.loadMemories(previousMemories);
                console.log(`[${name}] Loaded ${previousMemories.length} memories from previous sessions`);
            }

            this.coreAgents.set(id, coreAgent);
            this.thinkingLocks.set(id, false);
        };

        // John's 12 agents — injected from johns-agents.ts
        for (const agentDef of JOHNS_AGENTS) {
            await setupCoreAgent(agentDef.id, agentDef.name, agentDef.role, agentDef.deskX, agentDef.deskY);
            const coreAgent = this.coreAgents.get(agentDef.id);
            if (coreAgent) coreAgent.config.inference.systemPrompt = agentDef.inference.systemPrompt;
        }

        // Load portfolio (resume.md → bible fallback) — agents reference this
        // when proposing placards and when answering questions about the user.
        const portfolio = loadPortfolio();
        this.portfolioItems = portfolio.items;
        if (portfolio.sourcePath) {
            console.log(`[OfficeRoom] Loaded ${portfolio.items.length} portfolio items from ${portfolio.sourcePath}`);
        } else {
            console.warn('[OfficeRoom] No resume.md or context-bible.md found — portfolio is empty');
        }

        // Load context-bible.md and broadcast it as world-context to every agent.
        // The bible is the source of truth for who the user is — every agent sees
        // it on every think. Updates flow in via injectContextUpdate when the
        // ContextSync watcher detects file changes.
        this.loadWorldContext();

        // Seed shared-memory cache from disk (anything the user has told the
        // team in past sessions).
        this.sharedMemoryCache = await this.memoryStore.loadSharedRecent(20);
        for (const agent of this.coreAgents.values()) {
            agent.sharedMemories = this.sharedMemoryCache;
        }

        this.rebuildRelationshipGraph();
        const savedLayout = await this.memoryStore.loadLayout('default');
        this.currentLayout = Array.isArray(savedLayout) ? savedLayout : [];

        // ─── MESSAGE HANDLERS ───

        this.onMessage('command', (client, message) => {
            console.log(`Command from ${client.sessionId}:`, message);
        });

        this.onMessage('chat', async (client, message) => {
            const text = String(message?.text || '').trim();
            if (!text) return;
            console.log(`Chat from ${client.sessionId}: ${text}`);

            // Echo to the UI so the bubble shows up.
            this.broadcast('chat', { sender: 'User', text });

            // Drop into every agent's inbox so it appears as a recent message
            // on their next think cycle. Whichever agent is addressed (or just
            // listening) can respond.
            const userMsg: ConversationMessage = {
                from: 'User',
                to: 'team',
                content: text,
                timestamp: new Date().toISOString(),
            };
            for (const agent of this.coreAgents.values()) {
                agent.receiveMessage(userMsg);
            }

            // Persist as shared memory — survives restarts, every agent recalls.
            const entry: MemoryEntry = {
                content: `User said: "${text}"`,
                type: 'conversation',
                timestamp: userMsg.timestamp,
                importance: 0.8,
            };
            this.sharedMemoryCache = [...this.sharedMemoryCache, entry].slice(-20);
            for (const agent of this.coreAgents.values()) {
                agent.sharedMemories = this.sharedMemoryCache;
            }
            await this.memoryStore.saveMemory('shared', entry, this.sessionId);
        });

        this.onMessage('start-scenario', (client, message) => {
            const scenarioName = String(message?.scenario || 'Free Play');
            this.currentScenario = scenarioName;
            this.applyScenarioKickoff(scenarioName);
        });

        this.onMessage('trigger-chaos', (client, message) => {
            const eventName = String(message?.event || 'minor_outage');
            this.applyChaosEvent(eventName);
        });

        // UI-driven task assignment
        this.onMessage('assign-task', (client, message) => {
            const { title, agentId } = message;
            console.log(`[TaskBoard] Assigning "${title}" to ${agentId || 'auto'}`);

            // Pick agent: explicit or auto-assign to least busy
            const targetId = agentId || this.autoAssignAgent();
            const agent = this.coreAgents.get(targetId);
            const agentState = this.state.agents.get(targetId);

            if (agent && agentState) {
                agent.currentTask = title;
                agentState.currentTask = title;
                agentState.action = 'work';

                // Persist task
                this.memoryStore.createTask(title, targetId);

                this.broadcast('chat', {
                    sender: 'System',
                    text: `📋 Task "${title}" assigned to ${agentState.name}`
                });

                this.broadcast('task-update', {
                    agentId: targetId,
                    agentName: agentState.name,
                    task: title,
                    status: 'in_progress'
                });
            }
        });

        // ─── PROPOSAL FLOW ───
        // Agent → server: an agent proposes an office change. Server queues
        // it and broadcasts so the UI can show pending proposals to the user.
        // The user MUST approve before anything is applied.
        this.onMessage('propose-change', async (_client, message) => {
            if (this.genesis.paused) return;
            const activeApplied = await this.genesis.getActiveAppliedCount();
            if (activeApplied >= OfficeRoom.GENESIS_MAX_ACTIVE) {
                this.broadcast('chat', { sender: 'System', text: '⚠️ Mutation cap reached — rollback something to allow more.' });
                return;
            }
            const agentId = String(message?.agentId || '');
            const kind = String(message?.kind || '');
            if (!ALL_PROPOSAL_KINDS.includes(kind as typeof ALL_PROPOSAL_KINDS[number])) return;
            const agent = this.coreAgents.get(agentId);
            if (!agent) return;

            const payload = (message?.payload && typeof message.payload === 'object')
                ? message.payload as Record<string, unknown> : {};

            // Sandbox kinds get pre-validated at the boundary. Invalid
            // proposals are rejected immediately — they never reach the
            // user's pending queue and don't kick off a voting cycle.
            const v = this.validateSandboxPayload(kind, payload);
            if (!v.ok) {
                this.broadcast('chat', {
                    sender: '⚠️ Sandbox',
                    text: `Rejected ${agent.config.name}'s ${kind}: ${v.errors[0]}`,
                });
                return;
            }

            const proposal: OfficeProposal = {
                id: `prop_${Date.now()}_${++this.proposalCounter}`,
                proposedBy: agentId,
                proposedByName: agent.config.name,
                kind: kind as OfficeProposal['kind'],
                reason: String(message?.reason || ''),
                payload,
                createdAt: new Date().toISOString(),
                status: 'pending',
            };
            this.proposals.set(proposal.id, proposal);
            await this.genesis.record({
                id: proposal.id, kind, by: agent.config.name,
                reason: proposal.reason, payload: proposal.payload, status: 'pending',
            });
            this.broadcast('proposal-pending', proposal);
            this.broadcast('chat', {
                sender: '🛠️ ' + agent.config.name,
                text: `Proposes: ${proposal.kind} — ${proposal.reason}`,
            });
            // Kick off agent voting
            void this.spawnVoting(proposal);
        });

        // User → server: approve a proposal. Applies it (or hands off to the
        // existing layout pipeline) and broadcasts the resolution.
        this.onMessage('approve-proposal', async (_client, message) => {
            const id = String(message?.id || '');
            const p = this.proposals.get(id);
            if (!p || p.status !== 'pending') return;
            p.status = 'approved';
            this.applyProposal(p);
            this.votingInFlight.delete(id);
            this.broadcast('proposal-resolved', { id, status: 'approved' });
            this.broadcast('chat', { sender: 'System', text: `✅ Approved: ${p.kind} from ${p.proposedByName}` });
            // Auto-charter every CHARTER_AUTO_INTERVAL applied proposals.
            // Cheap (1 LLM call) + cooldown-protected. Async — don't block.
            const stats = await this.genesis.getStats();
            if (stats.applied > 0 && stats.applied % OfficeRoom.CHARTER_AUTO_INTERVAL === 0) {
                void this.draftCharter('auto');
            }
        });

        this.onMessage('reject-proposal', async (_client, message) => {
            const id = String(message?.id || '');
            const p = this.proposals.get(id);
            if (!p || p.status !== 'pending') return;
            p.status = 'rejected';
            await this.genesis.markRejected(id);
            this.votingInFlight.delete(id);
            this.broadcast('proposal-resolved', { id, status: 'rejected' });
            this.broadcast('chat', { sender: 'System', text: `❌ Rejected: ${p.kind} from ${p.proposedByName}` });
        });

        // User-triggered evolution tick: ask one (or all) agent(s) to think
        // about what's missing and propose an improvement. Opt-in so we don't
        // burn API tokens during normal play.
        this.onMessage('request-evolution', (_client, message) => {
            const agentId = message?.agentId ? String(message.agentId) : null;
            const targets = agentId ? [agentId] : Array.from(this.coreAgents.keys());
            for (const id of targets) {
                const a = this.coreAgents.get(id);
                if (!a) continue;
                a.receiveMessage({
                    from: 'System',
                    to: id,
                    content: 'Look around the office and at what you know about John. Propose ONE improvement to the office (new furniture, a portfolio placard, an expanded zone) by emitting a propose_office_change tool call. Be specific in payload and reason.',
                    timestamp: new Date().toISOString(),
                });
            }
            this.broadcast('chat', { sender: 'System', text: `🌱 Evolution tick requested for ${targets.length} agent(s)` });
        });

        // UI requests the current portfolio (placards). Sent on join.
        this.onMessage('request-portfolio', (client) => {
            client.send('portfolio-state', { items: this.portfolioItems });
        });

        this.onMessage('request-proposals', (client) => {
            client.send('proposals-state', {
                pending: Array.from(this.proposals.values()).filter((p) => p.status === 'pending'),
            });
        });

        // Genesis (meta-feature) requests
        this.onMessage('request-genesis', async (client) => {
            const stats = await this.genesis.getStats();
            const history = await this.genesis.getRecentHistory(50);
            client.send('genesis-state', {
                charter: this.genesis.charter,
                paused: this.genesis.paused,
                proposals: stats.proposals,
                applied: stats.applied,
                rejected: stats.rejected,
                history: history.map((h) => ({
                    id: h.id, kind: h.kind, by: h.by, reason: h.reason,
                    status: h.status, rolledBack: h.rolledBack,
                })),
            });
        });

        this.onMessage('set-evolution-paused', async (_client, message) => {
            const v = !!message?.paused;
            await this.genesis.setPaused(v);
            this.broadcast('chat', { sender: 'System', text: v ? '⏸ Evolution paused' : '▶ Evolution resumed' });
        });

        // Manual charter draft. User clicks "Draft Charter" in the Genesis
        // panel. Same cooldown as auto.
        this.onMessage('draft-charter', async () => {
            void this.draftCharter('manual');
        });

        this.onMessage('request-charter-history', async (client) => {
            const versions = await this.genesis.getCharterHistory(10);
            client.send('genesis-charter-history', { versions });
        });

        // Sandbox: bootstrap all active runtime mutations on join. Used by
        // the canvas (objects), behavior runner (behaviors), and Genesis
        // panel (widgets).
        this.onMessage('request-runtime-state', async (client) => {
            const [objects, behaviors, widgets] = await Promise.all([
                this.sandbox.listActiveObjects(),
                this.sandbox.listActiveBehaviors(),
                this.sandbox.listActiveWidgets(),
            ]);
            client.send('runtime-state', { objects, behaviors, widgets });
        });

        this.onMessage('rollback-proposal', async (_client, message) => {
            const id = String(message?.id || '');
            const entry = await this.genesis.getEntry(id);
            if (!entry || entry.status !== 'applied' || entry.rolledBack) return;
            this.rollbackEntry(entry);
            await this.genesis.markRolledBack(id);
            this.broadcast('genesis-rollback', { id });
            this.broadcast('chat', { sender: 'System', text: `↩ Rolled back ${entry.kind} from ${entry.by}` });
        });

        // Save office layout from editor
        this.onMessage('save-layout', async (client, message) => {
            const layoutName = message.name || 'default';
            const layout = Array.isArray(message.layout) ? message.layout : [];
            await this.memoryStore.saveLayout(layoutName, JSON.stringify(layout));
            this.currentLayout = layout;
            this.broadcast('layout-sync', { name: layoutName, layout: this.currentLayout });
            this.broadcast('chat', { sender: 'System', text: '✅ Office layout saved!' });
        });

        // Start Simulation Loop
        this.setSimulationInterval((delta) => this.update(delta), 100);
    }

    private autoAssignAgent(): string {
        // Pick the agent with no current task, or the first one
        for (const [id, agent] of this.coreAgents) {
            if (!agent.currentTask) return id;
        }
        return 'alice'; // fallback
    }

    async update(delta: number) {
        if (Math.random() < 0.02) {
            console.log(`[Server] Agents: ${this.state.agents.size} | Session: ${this.sessionId}`);
        }

        this.state.officeTime = new Date().toISOString();

        // ─── AGENT THINK CYCLE ───
        this.coreAgents.forEach((coreAgent, id) => {
            if (!this.thinkingLocks.get(id)) {
                this.thinkingLocks.set(id, true);

                const agentState = this.state.agents.get(id);
                if (!agentState) return;

                // Build nearby agents list
                const nearbyAgents: { name: string; role: string; distance: number }[] = [];
                this.coreAgents.forEach((other, otherId) => {
                    if (otherId === id) return;
                    const otherState = this.state.agents.get(otherId);
                    if (otherState) {
                        const dist = Math.abs(agentState.x - otherState.x) + Math.abs(agentState.y - otherState.y);
                        nearbyAgents.push({ name: other.config.name, role: other.config.role, distance: dist });
                    }
                });

                coreAgent.think({
                    time: this.state.officeTime,
                    location: `${agentState.x},${agentState.y}`,
                    nearbyAgents,
                    currentTask: coreAgent.currentTask || null,
                    recentMessages: coreAgent.getUnreadMessages(),
                    memories: coreAgent.getRecentMemories(5)
                }).then(async (decision) => {
                    agentState.action = decision.action;

                    if (decision.thought) {
                        agentState.thought = decision.thought;
                        console.log(`[${coreAgent.config.name}] 💭 ${decision.thought} → ${decision.action}`);
                    }

                    // Detect a vote response — the System voting prompt asks
                    // each agent to start with YES or NO. If we see one and
                    // there's a pending proposal in voting, record it.
                    if (decision.message) {
                        const m = decision.message.trim();
                        const voteMatch = m.match(/^(YES|NO)\b[:.\-—\s]*(.*)$/i);
                        if (voteMatch && this.votingInFlight.size > 0) {
                            const vote = voteMatch[1].toUpperCase() === 'YES' ? 'yes' : 'no';
                            const reason = voteMatch[2].slice(0, 200);
                            // Apply this vote to the most recent in-flight proposal
                            const proposalId = Array.from(this.votingInFlight).pop()!;
                            await this.genesis.addVote({
                                proposalId, by: coreAgent.config.name, vote, reason,
                                at: new Date().toISOString(),
                            });
                            this.broadcast('genesis-vote', {
                                proposalId, by: coreAgent.config.name, vote, reason,
                            });
                            this.broadcast('chat', {
                                sender: '🗳️ ' + coreAgent.config.name,
                                text: `${vote.toUpperCase()} — ${reason.slice(0, 80)}`,
                            });
                            this.thinkingLocks.set(id, false);
                            return;
                        }
                    }

                    // ─── HANDLE TALK ACTION (Agent-to-Agent) ───
                    if (decision.action === 'talk' && decision.message) {
                        const targetName = decision.target || '';
                        let targetId = '';
                        this.coreAgents.forEach((a, aId) => {
                            if (a.config.name.toLowerCase() === targetName.toLowerCase()) targetId = aId;
                        });

                        const targetAgent = this.coreAgents.get(targetId);
                        if (targetAgent) {
                            const msg: ConversationMessage = {
                                from: coreAgent.config.name,
                                to: targetAgent.config.name,
                                content: decision.message,
                                timestamp: this.state.officeTime
                            };
                            targetAgent.receiveMessage(msg);

                            // Broadcast to UI chat
                            this.broadcast('chat', {
                                sender: coreAgent.config.name,
                                text: `💬 (to ${targetAgent.config.name}): ${decision.message}`
                            });
                            this.emitHighlight(
                                'conversation',
                                `${coreAgent.config.name} pinged ${targetAgent.config.name}`,
                                decision.message.slice(0, 120),
                                id
                            );
                            this.updateRelationship(id, targetId, 0.08);

                            // Save conversation memory
                            await this.memoryStore.saveMemory(id, {
                                content: `Said to ${targetAgent.config.name}: "${decision.message}"`,
                                type: 'conversation',
                                timestamp: this.state.officeTime,
                                importance: 0.7
                            }, this.sessionId);
                        }

                        coreAgent.clearInbox(); // Clear after processing
                    }

                    // ─── HANDLE TOOL EXECUTION ───
                    if (decision.action === 'use_tool' && decision.toolCall) {
                        // Agent proposes an office change. NEVER auto-applies —
                        // queues for user approval. The user sees pending
                        // proposals via the proposal-pending broadcast.
                        if (decision.toolCall.name === 'propose_office_change') {
                            const params = decision.toolCall.params || {};
                            const kind = String(params.kind || '');
                            const allowed = ['add_furniture', 'move_furniture', 'expand_grid', 'add_placard'].includes(kind);
                            const activeApplied = await this.genesis.getActiveAppliedCount();
                            if (allowed && !this.genesis.paused && activeApplied < OfficeRoom.GENESIS_MAX_ACTIVE) {
                                const proposal: OfficeProposal = {
                                    id: `prop_${Date.now()}_${++this.proposalCounter}`,
                                    proposedBy: id,
                                    proposedByName: coreAgent.config.name,
                                    kind: kind as OfficeProposal['kind'],
                                    reason: String(params.reason || ''),
                                    payload: (params.payload && typeof params.payload === 'object') ? params.payload : {},
                                    createdAt: new Date().toISOString(),
                                    status: 'pending',
                                };
                                this.proposals.set(proposal.id, proposal);
                                await this.genesis.record({
                                    id: proposal.id, kind, by: coreAgent.config.name,
                                    reason: proposal.reason, payload: proposal.payload, status: 'pending',
                                });
                                this.broadcast('proposal-pending', proposal);
                                this.broadcast('chat', {
                                    sender: '🛠️ ' + coreAgent.config.name,
                                    text: `Proposes ${proposal.kind}: ${proposal.reason.slice(0, 100)}`,
                                });
                                void this.spawnVoting(proposal);
                            }
                            this.thinkingLocks.set(id, false);
                            return;
                        }

                        // Agent records a discovery — surfaces in their prompt
                        // next cycle and persists to MemoryStore as a high-
                        // importance memory.
                        if (decision.toolCall.name === 'log_discovery') {
                            const note = String(decision.toolCall.params?.note || '').trim();
                            if (note) {
                                coreAgent.discoveries = [...coreAgent.discoveries, note].slice(-12);
                                const entry: MemoryEntry = {
                                    content: `Discovery: ${note}`,
                                    type: 'observation',
                                    timestamp: new Date().toISOString(),
                                    importance: 0.85,
                                };
                                coreAgent.addMemory(entry);
                                await this.memoryStore.saveMemory(id, entry, this.sessionId);
                                this.broadcast('chat', {
                                    sender: '💡 ' + coreAgent.config.name,
                                    text: note.slice(0, 140),
                                });
                                this.broadcast('discovery', {
                                    agentId: id,
                                    agentName: coreAgent.config.name,
                                    note,
                                });
                            }
                            this.thinkingLocks.set(id, false);
                            return;
                        }

                        // Special case: agent-created tasks
                        if (decision.toolCall.name === 'create_task') {
                            const { title, assignee } = decision.toolCall.params;
                            const targetId = assignee?.toLowerCase() || this.autoAssignAgent();
                            const targetAgent = this.coreAgents.get(targetId);
                            const targetState = this.state.agents.get(targetId);

                            if (targetAgent && targetState) {
                                targetAgent.currentTask = title;
                                targetState.currentTask = title;
                                await this.memoryStore.createTask(title, targetId);

                                this.broadcast('chat', {
                                    sender: coreAgent.config.name,
                                    text: `📋 Created task "${title}" for ${targetAgent.config.name}`
                                });
                                this.broadcast('task-update', {
                                    agentId: targetId,
                                    agentName: targetAgent.config.name,
                                    task: title,
                                    status: 'in_progress'
                                });
                                this.emitHighlight(
                                    'task',
                                    `${coreAgent.config.name} assigned work`,
                                    `"${title}" is now owned by ${targetAgent.config.name}.`,
                                    targetId
                                );
                            }
                        } else if (decision.toolCall.name === 'hire_agent') {
                            // ─── DYNAMIC AGENT HIRING ───
                            const hireParams = decision.toolCall.params;
                            const hireName = hireParams.name || ['Charlie', 'Diana', 'Eve', 'Frank', 'Grace'][this.hireCount % 5];
                            const hireRole = hireParams.role || 'Intern';
                            const hireId = `hire_${this.hireCount}`;

                            if (this.hireCount < 5 && !this.coreAgents.has(hireId)) {
                                // Spawn at office door (top-center), then walk to their desk
                                const spawnX = 20;
                                const spawnY = 2;

                                this.state.createAgent(hireId, hireName);
                                const hireState = this.state.agents.get(hireId);
                                if (hireState) { hireState.x = spawnX; hireState.y = spawnY; }

                                const hireAgent = new Agent({
                                    id: hireId, name: hireName, role: hireRole, avatar: 'sprite.png',
                                    inference: {
                                        provider: this.inferenceAdapter.provider,
                                        model: this.inferenceModel,
                                        systemPrompt: `You are ${hireName}, a ${hireRole} who just joined the team at a virtual office. You were hired by ${coreAgent.config.name}. Be enthusiastic, helpful, and eager to learn. Introduce yourself to your colleagues. Keep thoughts SHORT.`,
                                    },
                                    personality: {
                                        traits: { openness: 0.9, conscientiousness: 0.7, extraversion: 0.8, agreeableness: 0.9, neuroticism: 0.2 },
                                        communicationStyle: hireRole.includes('Design') ? 'creative' : 'casual',
                                        workHours: { start: '09:00', end: '17:00' },
                                        breakFrequency: 90
                                    },
                                    capabilities: [
                                        { name: 'code_execute', description: 'Execute JavaScript code' },
                                        { name: 'web_search', description: 'Search the web' },
                                        { name: 'write_note', description: 'Write a note' },
                                        { name: 'create_task', description: 'Create a task for the team' }
                                    ],
                                    memory: { shortTermLimit: 50 }
                                });

                                hireAgent.setInferenceAdapter(this.inferenceAdapter);
                                await hireAgent.initialize();
                                this.coreAgents.set(hireId, hireAgent);
                                this.thinkingLocks.set(hireId, false);

                                this.hireCount++;
                                this.rebuildRelationshipGraph();

                                this.broadcast('chat', {
                                    sender: '🏢 Office',
                                    text: `🎉 ${coreAgent.config.name} hired ${hireName} as ${hireRole}! Welcome to the team!`
                                });
                                this.emitHighlight(
                                    'hiring',
                                    `${hireName} joined the team`,
                                    `${coreAgent.config.name} hired ${hireName} (${hireRole}).`,
                                    hireId
                                );

                                // Give the hiring agent a memory of the hire
                                coreAgent.addMemory({
                                    content: `I hired ${hireName} as a ${hireRole}. They just joined the team.`,
                                    type: 'achievement',
                                    timestamp: this.state.officeTime,
                                    importance: 0.9
                                });
                            } else if (this.hireCount >= 5) {
                                this.broadcast('chat', {
                                    sender: '🏢 Office',
                                    text: `⚠️ ${coreAgent.config.name} tried to hire but the office is full! (Max 7 agents)`
                                });
                            }
                        } else {
                            const result = await this.toolExecutor.execute(
                                decision.toolCall.name,
                                decision.toolCall.params
                            );

                            this.broadcast('chat', {
                                sender: coreAgent.config.name,
                                text: `🔧 Used tool [${decision.toolCall.name}]: ${result.success ? result.output.slice(0, 100) : result.error}`
                            });
                            this.emitHighlight(
                                'tool',
                                `${coreAgent.config.name} used ${decision.toolCall.name}`,
                                (result.success ? result.output : result.error || 'Tool failed').slice(0, 120),
                                id
                            );

                            coreAgent.addMemory({
                                content: `Tool ${decision.toolCall.name} result: ${result.output.slice(0, 200)}`,
                                type: 'task_result',
                                timestamp: this.state.officeTime,
                                importance: 0.8
                            });
                        }
                    }

                    // ─── PERSIST MEMORIES PERIODICALLY ───
                    if (Math.random() < 0.3) {
                        const recentMemories = coreAgent.memories.slice(-3);
                        await this.memoryStore.saveMemories(id, recentMemories, this.sessionId);
                    }

                    setTimeout(() => this.thinkingLocks.set(id, false), 15000);

                }).catch(err => {
                    console.error(`Agent ${id} think error:`, err);
                    setTimeout(() => this.thinkingLocks.set(id, false), 15000);
                });
            }
        });

        // ─── FURNITURE INTERACTION PATHFINDING ───
        // Office grid boundaries (agents must stay inside)
        const BOUNDS = { minX: 2, maxX: 36, minY: 2, maxY: 36 };
        const clamp = (agent: any) => {
            agent.x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, agent.x));
            agent.y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, agent.y));
        };

        this.demoTickCount++;
        if (this.demoTickCount >= 5) {
            this.demoTickCount = 0;
            this.state.agents.forEach((agent, key) => {
                // Default targets: agent's own desk chair
                const deskKey = `${key}-desk`;
                const target = this.furnitureTargets[deskKey] || { x: 5, y: 18 };

                // If agent action is 'talk', move towards the other agent instead
                if (agent.action === 'talk') {
                    let closest: { x: number; y: number } | null = null;
                    let minDist = Infinity;
                    this.state.agents.forEach((other, otherKey) => {
                        if (otherKey === key) return;
                        const dist = Math.abs(agent.x - other.x) + Math.abs(agent.y - other.y);
                        if (dist < minDist) { minDist = dist; closest = { x: other.x, y: other.y + 2 }; }
                    });
                    if (closest && minDist > 2) {
                        const c = closest as { x: number; y: number };
                        if (agent.x < c.x) agent.x += 1;
                        else if (agent.x > c.x) agent.x -= 1;
                        else if (agent.y < c.y) agent.y += 1;
                        else if (agent.y > c.y) agent.y -= 1;
                        clamp(agent);
                        return;
                    }
                }

                // Walk to desk/furniture target
                if (agent.x < target.x) agent.x += 1;
                else if (agent.x > target.x) agent.x -= 1;
                else if (agent.y < target.y) agent.y += 1;
                else if (agent.y > target.y) agent.y -= 1;
                clamp(agent);

                // Keep viral telemetry alive for UI overlays and highlights.
                this.updateAgentViralMetrics(key, agent.action);
            });
        }
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    private emitHighlight(type: string, title: string, body: string, agentId?: string) {
        const payload: HighlightEvent = {
            type,
            title,
            body,
            agentId: agentId || null,
            scenario: this.currentScenario,
            time: this.state.officeTime
        };
        this.highlights = [payload, ...this.highlights].slice(0, 200);
        this.broadcast('highlight-event', payload);
    }

    private updateAgentViralMetrics(agentId: string, action: string) {
        const state = this.state.agents.get(agentId);
        if (!state) return;
        const jitter = (Math.random() - 0.5) * 0.03;
        const actionBoost =
            action === 'work' ? 0.015 :
                action === 'talk' ? 0.02 :
                    action === 'use_tool' ? 0.03 :
                        -0.005;

        state.momentum = this.clamp01(state.momentum + actionBoost + jitter);
        state.riskLevel = this.clamp01(state.riskLevel + (action === 'use_tool' ? 0.02 : -0.004) + jitter);
        state.mood = this.clamp01(state.mood + (action === 'talk' ? 0.02 : -0.002) + jitter);
        state.reputation = this.clamp01(state.reputation + (action === 'work' ? 0.015 : 0.001) + jitter / 2);
    }

    private applyScenarioKickoff(scenarioName: string) {
        this.broadcast('scenario-event', {
            type: 'scenario-started',
            scenario: scenarioName,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '🎬 Producer',
            text: `Scenario loaded: ${scenarioName}. Let the office drama begin.`
        });

        this.emitHighlight(
            'scenario',
            `Scenario: ${scenarioName}`,
            `The office switched into ${scenarioName} mode.`,
        );

        this.state.agents.forEach((agent, id) => {
            agent.momentum = this.clamp01(agent.momentum + 0.15);
            agent.riskLevel = this.clamp01(agent.riskLevel + 0.1);
            if (Math.random() < 0.4) {
                this.emitHighlight(
                    'character_arc',
                    `${agent.name} steps up`,
                    `${agent.name} is pushing hard as ${scenarioName} starts.`,
                    id
                );
            }
        });
    }

    private applyChaosEvent(eventName: string) {
        const chaosMap: Record<string, { label: string; moodDelta: number; riskDelta: number; momentumDelta: number }> = {
            server_outage: { label: 'Server Outage', moodDelta: -0.25, riskDelta: 0.35, momentumDelta: 0.1 },
            funding_cut: { label: 'Funding Cut', moodDelta: -0.2, riskDelta: 0.28, momentumDelta: -0.05 },
            surprise_launch: { label: 'Surprise Launch', moodDelta: 0.12, riskDelta: 0.22, momentumDelta: 0.25 },
            client_escalation: { label: 'Client Escalation', moodDelta: -0.1, riskDelta: 0.3, momentumDelta: 0.08 },
            viral_tweet: { label: 'Viral Tweet', moodDelta: 0.25, riskDelta: 0.12, momentumDelta: 0.3 }
        };

        const selected = chaosMap[eventName] || chaosMap.server_outage;
        this.chaosHistory = [
            { event: eventName, label: selected.label, time: this.state.officeTime },
            ...this.chaosHistory
        ].slice(0, 100);
        this.broadcast('scenario-event', {
            type: 'chaos-triggered',
            event: eventName,
            label: selected.label,
            time: this.state.officeTime
        });

        this.broadcast('chat', {
            sender: '⚠️ Chaos Engine',
            text: `${selected.label} hit the office. Everyone reacts in real-time.`
        });

        this.emitHighlight(
            'chaos',
            selected.label,
            `Chaos event "${selected.label}" changed team mood and risk levels.`
        );

        this.state.agents.forEach((agent, id) => {
            agent.mood = this.clamp01(agent.mood + selected.moodDelta + (Math.random() - 0.5) * 0.08);
            agent.riskLevel = this.clamp01(agent.riskLevel + selected.riskDelta + Math.random() * 0.08);
            agent.momentum = this.clamp01(agent.momentum + selected.momentumDelta + (Math.random() - 0.5) * 0.05);
            if (agent.riskLevel > 0.75) {
                this.emitHighlight(
                    'high_risk',
                    `${agent.name} is under pressure`,
                    `${agent.name}'s risk level spiked after ${selected.label}.`,
                    id
                );
            }
        });

        // Chaos can create alliances or rivalries.
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const delta = (Math.random() - 0.5) * 0.35;
                this.updateRelationship(ids[i], ids[j], delta);
            }
        }
    }

    private relationshipKey(a: string, b: string): string {
        return [a, b].sort().join('::');
    }

    private statusFromScore(score: number): RelationshipEdge['status'] {
        if (score > 0.35) return 'alliance';
        if (score < -0.35) return 'rivalry';
        return 'neutral';
    }

    private rebuildRelationshipGraph() {
        const ids = Array.from(this.state.agents.keys());
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = this.relationshipKey(ids[i], ids[j]);
                if (!this.relationships.has(key)) {
                    this.relationships.set(key, {
                        a: ids[i],
                        b: ids[j],
                        score: 0,
                        status: 'neutral',
                        updatedAt: this.state.officeTime
                    });
                }
            }
        }
        this.emitRelationshipGraph();
    }

    private updateRelationship(a: string, b: string, delta: number) {
        const key = this.relationshipKey(a, b);
        const existing = this.relationships.get(key) || {
            a: [a, b].sort()[0],
            b: [a, b].sort()[1],
            score: 0,
            status: 'neutral' as const,
            updatedAt: this.state.officeTime
        };
        const score = Math.max(-1, Math.min(1, existing.score + delta));
        const updated: RelationshipEdge = {
            ...existing,
            score,
            status: this.statusFromScore(score),
            updatedAt: this.state.officeTime
        };
        this.relationships.set(key, updated);
        this.emitRelationshipGraph();
    }

    private emitRelationshipGraph() {
        this.broadcast('relationship-update', this.buildRelationshipPayload());
    }

    private buildRelationshipPayload() {
        const idToName: Record<string, string> = {};
        this.state.agents.forEach((agent, id) => {
            idToName[id] = agent.name;
        });
        return {
            edges: Array.from(this.relationships.values()).map((edge) => ({
                ...edge,
                aName: idToName[edge.a] || edge.a,
                bName: idToName[edge.b] || edge.b
            })),
            time: this.state.officeTime
        };
    }

    public registerAudienceVote(eventName: string, voterId?: string) {
        const normalized = String(eventName || 'server_outage');
        this.audienceVotes[normalized] = (this.audienceVotes[normalized] || 0) + 1;
        const totalVotes = Object.values(this.audienceVotes).reduce((sum, value) => sum + value, 0);
        const shouldTrigger = this.audienceVotes[normalized] >= 3 || totalVotes % 5 === 0;

        if (shouldTrigger) {
            this.applyChaosEvent(normalized);
            this.emitHighlight(
                'audience_vote',
                `Audience triggered ${normalized}`,
                `Viewers forced a ${normalized} chaos event.`
            );
            this.audienceVotes[normalized] = 0;
        }

        return {
            accepted: true,
            event: normalized,
            voterId: voterId || null,
            tally: this.audienceVotes[normalized] || 0,
            triggered: shouldTrigger
        };
    }

    public getEpisodeRecap() {
        const topHighlights = [...this.highlights].slice(0, 10);
        const leaderboard = Array.from(this.state.agents.entries()).map(([id, agent]) => {
            const impact = (
                agent.momentum * 0.35 +
                agent.reputation * 0.3 +
                agent.mood * 0.2 +
                (1 - agent.riskLevel) * 0.15
            );
            return {
                id,
                name: agent.name,
                action: agent.action,
                mood: agent.mood,
                reputation: agent.reputation,
                riskLevel: agent.riskLevel,
                momentum: agent.momentum,
                impact: Number(impact.toFixed(3))
            };
        }).sort((a, b) => b.impact - a.impact);

        const avgMomentum = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.momentum, 0) / leaderboard.length
            : 0;
        const avgRisk = leaderboard.length
            ? leaderboard.reduce((sum, item) => sum + item.riskLevel, 0) / leaderboard.length
            : 0;
        const outcome = avgMomentum > 0.65 && avgRisk < 0.5
            ? 'Launch trajectory: team executed under pressure and came out stronger.'
            : avgRisk > 0.65
                ? 'High volatility: chaos dominated this episode.'
                : 'Mixed outcome: strong moments with unresolved tensions.';

        return {
            generatedAt: this.state.officeTime,
            scenario: this.currentScenario,
            topHighlights,
            leaderboard: leaderboard.slice(0, 10),
            outcomeCard: {
                title: `${this.currentScenario} Outcome`,
                summary: outcome,
                chaosEvents: this.chaosHistory.slice(0, 10),
                activeRelationships: Array.from(this.relationships.values()).filter((edge) => edge.status !== 'neutral').length
            }
        };
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined the office room!");
        // Send existing tasks to newly joined client
        this.memoryStore.getTasks().then(tasks => {
            client.send('tasks-sync', tasks);
        });
        client.send('relationship-update', this.buildRelationshipPayload());
        client.send('layout-sync', { name: 'default', layout: this.currentLayout });
    }

    onLeave(client: Client, consented: boolean) {
        console.log(client.sessionId, "left the office room!");
    }

    // Validate sandbox payloads at the propose boundary. Layout-pipeline
    // kinds (add_furniture etc.) are passed through unchecked since their
    // existing pipeline tolerates loose input.
    private validateSandboxPayload(kind: string, payload: Record<string, unknown>) {
        switch (kind) {
            case 'add_runtime_object': return validateRuntimeObjectInput(payload);
            case 'add_behavior':       return validateBehaviorInput(payload);
            case 'add_widget':         return validateWidgetInput(payload);
            default: return { ok: true, errors: [] };
        }
    }

    // Apply an approved proposal. Returns a rollback-handle id so we can
    // undo the change later via rollbackEntry. Conservative — only emits
    // broadcast events and updates portfolioItems; no destructive ops or
    // generated code execution.
    private applyProposal(p: OfficeProposal): void {
        const payload = p.payload as Record<string, unknown>;
        switch (p.kind) {
            case 'add_furniture': {
                this.broadcast('layout-add', {
                    proposalId: p.id, proposedBy: p.proposedBy,
                    type: payload.type, x: payload.x, y: payload.y,
                });
                break;
            }
            case 'move_furniture': {
                this.broadcast('layout-move', {
                    proposalId: p.id, uid: payload.uid, toX: payload.toX, toY: payload.toY,
                });
                break;
            }
            case 'expand_grid': {
                const dir = String(payload.direction || 'right');
                const amount = Math.max(1, Math.min(4, Number(payload.amount || 1)));
                this.broadcast('layout-expand', { proposalId: p.id, direction: dir, amount });
                break;
            }
            case 'add_placard': {
                const item: PortfolioItem = {
                    id: `placard_${p.id}`,
                    title: String(payload.title || 'Untitled'),
                    detail: String(payload.detail || ''),
                    source: 'resume',
                };
                this.portfolioItems = [...this.portfolioItems, item];
                this.broadcast('portfolio-state', { items: this.portfolioItems });
                break;
            }
            // Sandbox-A: persist the validated runtime object + broadcast
            // so the canvas can draw it. Validation already passed at
            // propose-boundary.
            case 'add_runtime_object': {
                const obj: RuntimeObject = {
                    id: p.id,
                    name: String(payload.name),
                    spriteHex: payload.spriteHex as string[][],
                    width: 1, height: 1,
                    x: Number(payload.x), y: Number(payload.y),
                    addedBy: p.proposedByName,
                    proposalId: p.id,
                    createdAt: new Date().toISOString(),
                    rolledBack: false,
                };
                void this.sandbox.addObject(obj).then(() => {
                    this.broadcast('runtime-object-added', obj);
                });
                break;
            }
            // Sandbox-B (scaffold): persist source + broadcast so client
            // can spawn a Web Worker that registers it. Server NEVER
            // executes the source.
            case 'add_behavior': {
                const source = String(payload.source);
                void this.sandbox.addBehavior({
                    id: p.id,
                    name: String(payload.name),
                    trigger: payload.trigger as 'on_meet' | 'on_idle' | 'on_walk' | 'on_break',
                    source,
                    sourceHash: hashSource(source),
                    addedBy: p.proposedByName,
                    proposalId: p.id,
                }).then(() => {
                    this.broadcast('runtime-behavior-added', {
                        id: p.id,
                        name: payload.name,
                        trigger: payload.trigger,
                        source,
                        addedBy: p.proposedByName,
                    });
                });
                break;
            }
            // Sandbox-C: persist template+config; client renders pre-built
            // widget. No code generation.
            case 'add_widget': {
                const widget: RuntimeWidget = {
                    id: p.id,
                    template: payload.template as WidgetTemplate,
                    config: (payload.config as Record<string, unknown>) || {},
                    addedBy: p.proposedByName,
                    proposalId: p.id,
                    createdAt: new Date().toISOString(),
                    rolledBack: false,
                };
                void this.sandbox.addWidget(widget).then(() => {
                    this.broadcast('runtime-widget-added', widget);
                });
                break;
            }
        }
        // Persist to history. We only track applied changes here; pending
        // ones were recorded earlier in the propose flow.
        void this.genesis.markApplied(p.id);
    }

    // Undo an applied proposal. Mirror of applyProposal — emit a "rollback"
    // event that the UI uses to reverse the visual change. Placards are
    // removed in-process; layout mutations are a UI concern (the canvas
    // currently doesn't render layout-add live, so the rollback is a no-op
    // until M5 adds that pipeline).
    private rollbackEntry(entry: { id: string; kind: string; payloadJson: string }): void {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(entry.payloadJson || '{}'); } catch { /* ignore */ }
        switch (entry.kind) {
            case 'add_placard': {
                const placardId = `placard_${entry.id}`;
                this.portfolioItems = this.portfolioItems.filter((i) => i.id !== placardId);
                this.broadcast('portfolio-state', { items: this.portfolioItems });
                break;
            }
            case 'add_furniture':
            case 'move_furniture':
            case 'expand_grid': {
                this.broadcast('layout-rollback', { proposalId: entry.id, kind: entry.kind, payload });
                break;
            }
            case 'add_runtime_object': {
                void this.sandbox.rollbackObject(entry.id).then(() => {
                    this.broadcast('runtime-object-removed', { id: entry.id });
                });
                break;
            }
            case 'add_behavior': {
                void this.sandbox.rollbackBehavior(entry.id).then(() => {
                    this.broadcast('runtime-behavior-removed', { id: entry.id });
                });
                break;
            }
            case 'add_widget': {
                void this.sandbox.rollbackWidget(entry.id).then(() => {
                    this.broadcast('runtime-widget-removed', { id: entry.id });
                });
                break;
            }
        }
    }

    // Draft a new World Charter — one LLM call that synthesizes a paragraph
    // describing what the office is collectively becoming. Inputs:
    //   - Every agent's name + role + personality blurb (their "voice")
    //   - The most recent applied proposals (what's actually been built)
    //   - The current charter (so the new one feels like a continuation)
    // Output is saved to genesis_charter_history (versioned) and broadcast.
    private charterDraftInFlight = false;
    private lastCharterDraftAt = 0;
    private static readonly CHARTER_DRAFT_COOLDOWN_MS = 60_000; // 1 minute
    private static readonly CHARTER_AUTO_INTERVAL = 20;          // every 20 applied

    private async draftCharter(trigger: 'auto' | 'manual'): Promise<void> {
        const now = Date.now();
        if (this.charterDraftInFlight) {
            console.log('[Charter] draft already in flight; skipping');
            return;
        }
        if (now - this.lastCharterDraftAt < OfficeRoom.CHARTER_DRAFT_COOLDOWN_MS) {
            console.log('[Charter] cooldown active; skipping');
            return;
        }
        this.charterDraftInFlight = true;
        this.lastCharterDraftAt = now;
        try {
            const stats = await this.genesis.getStats();
            const recent = (await this.genesis.getRecentHistory(20))
                .filter((h) => h.status === 'applied' && !h.rolledBack);

            const agentVoices = Array.from(this.coreAgents.values())
                .map((a) => `- ${a.config.name} (${a.config.role}): "${a.config.inference.systemPrompt.split('\n')[0].slice(0, 120)}"`)
                .join('\n');

            const recentLines = recent
                .slice(0, 12)
                .map((h) => `- ${h.by}: ${h.kind} — ${h.reason}`)
                .join('\n') || '- (no applied changes yet)';

            const prompt = `You are the collective voice of an AI workforce living in a pixel office. Below are the agents who live here, what they have been building, and the current World Charter.

AGENTS:
${agentVoices}

RECENTLY APPLIED CHANGES:
${recentLines}

CURRENT CHARTER:
"${this.genesis.charter}"

Draft a NEW World Charter — one short paragraph (2-4 sentences, ≤ 300 chars) describing what this office is becoming, what the agents collectively believe they are working toward, and how this differs from before. Speak as the collective "we". Be concrete, not generic. Output ONLY the paragraph, no preamble.`;

            const res = await this.inferenceAdapter.complete({
                model: this.inferenceModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
            });
            const text = (res.content || '').trim().slice(0, 600);
            if (!text) {
                console.warn('[Charter] empty response from LLM, skipping');
                return;
            }
            const version = await this.genesis.saveCharterVersion(text, stats.applied);
            this.broadcast('genesis-charter', { charter: text, version: version.version });
            this.broadcast('chat', {
                sender: '📜 World Charter',
                text: `v${version.version} (${trigger}): ${text.slice(0, 100)}`,
            });
            console.log(`[Charter] drafted v${version.version} (${trigger}) — ${text.slice(0, 80)}`);
        } catch (err) {
            console.warn('[Charter] draft failed:', err instanceof Error ? err.message : err);
        } finally {
            this.charterDraftInFlight = false;
        }
    }

    // Spawn a voting cycle for a pending proposal. Each other agent gets
    // an inbox message asking for a yes/no. Their next think cycle produces
    // it; we observe the response in the chat handler. For MVP this is
    // best-effort — no quorum enforcement; the user is still the gate.
    private async spawnVoting(proposal: OfficeProposal): Promise<void> {
        if (this.genesis.paused) return;
        if (this.votingInFlight.has(proposal.id)) return;
        this.votingInFlight.add(proposal.id);
        const prompt = `[VOTE] ${proposal.proposedByName} proposes ${proposal.kind}: "${proposal.reason}". Reply with one short sentence — start with YES or NO followed by your reason. This is a vote, not a normal action.`;
        for (const [id, agent] of this.coreAgents) {
            if (id === proposal.proposedBy) continue;
            agent.receiveMessage({
                from: 'System',
                to: id,
                content: prompt,
                timestamp: new Date().toISOString(),
            });
        }
    }

    // Load context-bible.md from disk and apply it as worldContext on every
    // agent. Falls back silently if the file is missing — the system still
    // works, agents just won't have the persistent profile.
    private loadWorldContext(): void {
        const candidates = [
            path.join(process.cwd(), '..', 'context', 'context-bible.md'),
            path.join(process.cwd(), 'context', 'context-bible.md'),
        ];
        for (const p of candidates) {
            try {
                if (fs.existsSync(p)) {
                    this.worldContext = fs.readFileSync(p, 'utf-8');
                    for (const agent of this.coreAgents.values()) {
                        agent.worldContext = this.worldContext;
                    }
                    console.log(`[OfficeRoom] Loaded world context from ${p} (${this.worldContext.length} chars) → applied to ${this.coreAgents.size} agents`);
                    return;
                }
            } catch (err) {
                console.warn(`[OfficeRoom] Could not read ${p}:`, err);
            }
        }
        console.warn('[OfficeRoom] No context-bible.md found — agents will rely on per-agent system prompts only');
    }

    // Inject context from Claude.ai conversations into agent memories
    public injectContextUpdate(update: ContextUpdate) {
        const { source, content, relevantAgents, timestamp } = update;

        // Special case: the bible is the canonical user profile. Refresh
        // worldContext on every agent so they always reference it.
        if (source === 'context-bible.md') {
            this.worldContext = content;
            for (const agent of this.coreAgents.values()) {
                agent.worldContext = content;
            }
            console.log(`[ContextSync] Refreshed world context for ${this.coreAgents.size} agents`);
        }

        let count = 0;
        for (const agentId of relevantAgents) {
            const agent = this.coreAgents.get(agentId);
            if (agent) {
                agent.addMemory({
                    content: `[Context from ${source}]: ${content.slice(0, 500)}`,
                    type: 'observation',
                    timestamp,
                    importance: 0.9,
                });
                count++;
            }
        }
        if (count > 0) {
            console.log(`[ContextSync] Injected "${source}" into ${count} agents`);
            this.broadcast('chat', {
                sender: '📡 Context Sync',
                text: `Updated ${count} agents from: ${source}`,
            });
        }
    }

    async onDispose() {
        console.log("room", this.roomId, "disposing... saving memories");
        OfficeRoom.activeRoom = null;
        // Persist all agent memories on shutdown
        for (const [id, agent] of this.coreAgents) {
            await this.memoryStore.saveMemories(id, agent.memories, this.sessionId);
        }
        await this.memoryStore.close();
    }
}
