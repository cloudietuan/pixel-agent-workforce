// PORTFOLIO LOADER — Johns Command Center
//
// Pulls portfolio "items" (projects, roles, achievements) from a resume file
// the user drops at context/resume.md. If that file is missing, falls back to
// context-bible.md so the system still has something to work with on day one.
//
// An "item" is anything the user wants the agents to know about as a discrete
// thing: a company, a school, a project, a role. The parser is intentionally
// loose — markdown headings, bullet lists, and bolded leading phrases all
// become items. We err on inclusion; the user can edit the resume file to
// shape what shows up.

import fs from 'fs';
import path from 'path';

export interface PortfolioItem {
    id: string;
    title: string;
    detail: string;
    source: 'resume' | 'bible';
}

const CONTEXT_DIR = path.join(process.cwd(), '..', 'context');
const RESUME_PATH = path.join(CONTEXT_DIR, 'resume.md');
const BIBLE_PATH = path.join(CONTEXT_DIR, 'context-bible.md');

function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
}

// Minimal markdown parser: every '## ' heading + every leading-bold bullet
// becomes an item. Detail = the rest of that section, trimmed.
function parseMarkdown(content: string, source: 'resume' | 'bible'): PortfolioItem[] {
    const items: PortfolioItem[] = [];
    const lines = content.split('\n');

    let currentHeading: string | null = null;
    let currentBuf: string[] = [];

    const flush = () => {
        if (currentHeading) {
            const detail = currentBuf.join('\n').trim().slice(0, 600);
            if (detail.length > 0) {
                items.push({
                    id: slugify(currentHeading),
                    title: currentHeading,
                    detail,
                    source,
                });
            }
        }
        currentHeading = null;
        currentBuf = [];
    };

    for (const line of lines) {
        const h2 = line.match(/^##\s+(.+?)\s*$/);
        if (h2) {
            flush();
            currentHeading = h2[1].replace(/[—–-]\s*$/, '').trim();
            continue;
        }
        if (currentHeading) currentBuf.push(line);
    }
    flush();

    // Also extract leading-bold bullets ("- **Lumina Sites** — subscription...")
    // even when they're not under a heading we cared about.
    for (const line of lines) {
        const bullet = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*[—:-]?\s*(.*)$/);
        if (bullet) {
            const title = bullet[1].trim();
            const detail = bullet[2].trim().slice(0, 400);
            if (title.length > 1 && detail.length > 1) {
                const id = slugify(title);
                if (!items.find((it) => it.id === id)) {
                    items.push({ id, title, detail, source });
                }
            }
        }
    }

    return items;
}

export function loadPortfolio(): { items: PortfolioItem[]; sourcePath: string | null } {
    if (fs.existsSync(RESUME_PATH)) {
        const content = fs.readFileSync(RESUME_PATH, 'utf-8');
        return { items: parseMarkdown(content, 'resume'), sourcePath: RESUME_PATH };
    }
    if (fs.existsSync(BIBLE_PATH)) {
        const content = fs.readFileSync(BIBLE_PATH, 'utf-8');
        return { items: parseMarkdown(content, 'bible'), sourcePath: BIBLE_PATH };
    }
    return { items: [], sourcePath: null };
}
