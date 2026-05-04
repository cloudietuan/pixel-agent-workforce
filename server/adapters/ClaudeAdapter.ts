import { InferenceAdapter, CompletionRequest, CompletionResponse } from '../core';

/**
 * Anthropic Claude adapter (Messages API).
 * https://docs.anthropic.com/en/api/messages
 *
 * Uses plain fetch (no SDK dependency). System prompts from OpenAI-style
 * messages are pulled out into the top-level `system` field. Tools use
 * Claude's tool-use schema.
 */
export class ClaudeAdapter implements InferenceAdapter {
    public readonly provider = 'anthropic';
    public readonly isLocal = false;

    constructor(
        private apiKey: string,
        private baseUrl: string = 'https://api.anthropic.com',
        private anthropicVersion: string = '2023-06-01',
    ) {
        if (!apiKey) throw new Error('ClaudeAdapter: missing API key');
    }

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
        const start = Date.now();

        // Split out system messages (Claude uses a top-level `system` field)
        const systemParts: string[] = [];
        const messages: Array<{ role: string; content: any }> = [];
        for (const m of request.messages || []) {
            if (m.role === 'system') {
                if (typeof m.content === 'string') systemParts.push(m.content);
            } else {
                messages.push({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: typeof m.content === 'string' ? m.content : m.content,
                });
            }
        }

        const tools = request.tools
            ? request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.parameters,
              }))
            : undefined;

        const body: any = {
            model: request.model,
            max_tokens: 1024,
            messages,
            temperature: request.temperature,
        };
        if (systemParts.length) body.system = systemParts.join('\n\n');
        if (tools) body.tools = tools;

        const response = await fetch(`${this.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': this.anthropicVersion,
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`Claude Error ${response.status}: ${response.statusText} ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const latency = Date.now() - start;

        let content = '';
        const toolCalls: Array<{ name: string; params: any }> = [];
        for (const block of data.content || []) {
            if (block.type === 'text') content += block.text;
            else if (block.type === 'tool_use') {
                toolCalls.push({ name: block.name, params: block.input });
            }
        }

        return {
            content,
            toolCalls: toolCalls.length ? toolCalls : undefined,
            usage: {
                prompt: data.usage?.input_tokens || 0,
                completion: data.usage?.output_tokens || 0,
            },
            latency,
        };
    }
}
