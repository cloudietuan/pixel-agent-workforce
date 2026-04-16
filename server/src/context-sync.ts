// CONTEXT SYNC — Johns Command Center
// Watches the /context folder for conversation exports from Claude.ai
// and syncs them into agent memories so agents always know what was discussed.
//
// HOW TO USE:
// 1. In Claude.ai, copy any conversation you want agents to know about
// 2. Save it as a .txt or .md file in ~/johns-command-center/context/
// 3. This module auto-detects it, extracts key info, and updates agent memories
//
// The context-bible.md is always loaded on startup.

import fs from 'fs';
import path from 'path';

const CONTEXT_DIR = path.join(process.cwd(), '..', 'context');
const CONTEXT_BIBLE = path.join(CONTEXT_DIR, 'context-bible.md');

export interface ContextUpdate {
  source: string;
  content: string;
  timestamp: string;
  relevantAgents: string[];
}

// Maps keywords to relevant agent IDs
const AGENT_KEYWORD_MAP: Record<string, string[]> = {
  'lumina': ['biz', 'finance', 'social', 'comms'],
  'sunset nails': ['biz', 'finance', 'social'],
  'berkeley': ['scholar', 'finance', 'atlas'],
  'volleyball': ['exercise', 'atlas', 'mental'],
  'ap stats': ['scholar', 'atlas'],
  'ap research': ['scholar', 'knowledge'],
  'philosophy': ['scholar'],
  'hinksey': ['research', 'scholar', 'comms'],
  'internship': ['research', 'scholar', 'atlas'],
  'workout': ['exercise', 'nutrition'],
  'meal': ['nutrition', 'exercise'],
  'stress': ['mental', 'atlas'],
  'deadline': ['atlas', 'scholar'],
  'invoice': ['biz', 'finance', 'comms'],
  'client': ['biz', 'comms', 'social'],
  'stock': ['research', 'finance'],
  'portfolio': ['it', 'research'],
  'github': ['it'],
  'website': ['biz', 'it', 'social'],
  'email': ['comms'],
  'scholarship': ['finance', 'scholar'],
  'fafsa': ['finance'],
};

function detectRelevantAgents(content: string): string[] {
  const lower = content.toLowerCase();
  const agents = new Set<string>();
  for (const [keyword, agentIds] of Object.entries(AGENT_KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      agentIds.forEach(id => agents.add(id));
    }
  }
  // Default: atlas always gets context updates
  agents.add('atlas');
  return Array.from(agents);
}

function extractKeyInfo(content: string): string {
  // Extract the most important lines (decisions, plans, todos, names)
  const lines = content.split('\n').filter(l => l.trim().length > 20);
  const important = lines.filter(l => {
    const lower = l.toLowerCase();
    return lower.includes('need') || lower.includes('want') || lower.includes('plan') ||
      lower.includes('should') || lower.includes('will') || lower.includes('going to') ||
      lower.includes('decided') || lower.includes('update') || lower.includes('add') ||
      lower.includes('build') || lower.includes('create') || lower.includes('fix');
  });
  return (important.length > 0 ? important : lines).slice(0, 10).join('\n');
}

export class ContextSync {
  private watcher: fs.FSWatcher | null = null;
  private processedFiles = new Set<string>();
  private onUpdate: (update: ContextUpdate) => void;

  constructor(onUpdate: (update: ContextUpdate) => void) {
    this.onUpdate = onUpdate;
  }

  start() {
    // Ensure context dir exists
    if (!fs.existsSync(CONTEXT_DIR)) {
      fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    }

    // Always load context bible first
    this.loadContextBible();

    // Watch for new files
    this.watcher = fs.watch(CONTEXT_DIR, (eventType, filename) => {
      if (!filename || (!filename.endsWith('.txt') && !filename.endsWith('.md'))) return;
      const filepath = path.join(CONTEXT_DIR, filename);
      if (this.processedFiles.has(filepath)) return;
      setTimeout(() => this.processFile(filepath), 500); // small delay for write to complete
    });

    console.log(`[ContextSync] Watching ${CONTEXT_DIR} for conversation exports`);
    console.log(`[ContextSync] Drop .txt or .md files here to update agent memories`);
  }

  private loadContextBible() {
    if (fs.existsSync(CONTEXT_BIBLE)) {
      const content = fs.readFileSync(CONTEXT_BIBLE, 'utf-8');
      const update: ContextUpdate = {
        source: 'context-bible.md',
        content: content.slice(0, 4000), // cap size
        timestamp: new Date().toISOString(),
        relevantAgents: Object.keys(AGENT_KEYWORD_MAP).reduce((acc, _) => {
          return ['scholar','biz','research','atlas','finance','exercise','social','nutrition','mental','comms','knowledge','it'];
        }, [] as string[]),
      };
      this.onUpdate(update);
      console.log(`[ContextSync] Loaded context bible — all agents updated`);
    }
  }

  private processFile(filepath: string) {
    try {
      if (!fs.existsSync(filepath)) return;
      this.processedFiles.add(filepath);
      const content = fs.readFileSync(filepath, 'utf-8');
      const keyInfo = extractKeyInfo(content);
      const relevantAgents = detectRelevantAgents(content);
      const update: ContextUpdate = {
        source: path.basename(filepath),
        content: keyInfo,
        timestamp: new Date().toISOString(),
        relevantAgents,
      };
      this.onUpdate(update);
      console.log(`[ContextSync] Processed ${path.basename(filepath)} → agents: ${relevantAgents.join(', ')}`);
    } catch (err) {
      console.error(`[ContextSync] Error processing ${filepath}:`, err);
    }
  }

  stop() {
    this.watcher?.close();
  }
}
