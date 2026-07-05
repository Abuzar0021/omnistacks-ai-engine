import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { callJsonWithRetry } from './llm-json.js';
import type { ChatCompletionResult, ChatMessage } from './openrouter.js';

const schema = z.object({ value: z.number().int().min(0).max(100) }).strict();

function chatResult(content: string): ChatCompletionResult {
  return {
    id: 'chatcmpl_1',
    model: 'anthropic/claude-sonnet-4.5',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function buildRetryMessage(validationError: string): ChatMessage {
  return { role: 'user', content: `retry: ${validationError}` };
}

describe('callJsonWithRetry', () => {
  it('returns the validated result on the first valid response', async () => {
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify({ value: 42 })));

    const result = await callJsonWithRetry(
      chat,
      [{ role: 'user', content: 'go' }],
      schema,
      { temperature: 0 },
      buildRetryMessage,
    );

    expect(chat).toHaveBeenCalledTimes(1);
    expect(result.result).toEqual({ value: 42 });
    expect(result.model).toBe('anthropic/claude-sonnet-4.5');
    expect(result.usage?.total_tokens).toBe(15);
  });

  it('retries once on malformed JSON and succeeds on the second attempt', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(chatResult('not json'))
      .mockResolvedValueOnce(chatResult(JSON.stringify({ value: 7 })));

    const result = await callJsonWithRetry(
      chat,
      [{ role: 'user', content: 'go' }],
      schema,
      { temperature: 0 },
      buildRetryMessage,
    );

    expect(chat).toHaveBeenCalledTimes(2);
    const secondMessages = chat.mock.calls[1]?.[0] as ChatMessage[];
    expect(secondMessages).toHaveLength(2);
    expect(secondMessages[1]?.content).toContain('not valid JSON');
    expect(result.result).toEqual({ value: 7 });
  });

  it('retries once on schema-invalid JSON and succeeds on the second attempt', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(chatResult(JSON.stringify({ value: 999 })))
      .mockResolvedValueOnce(chatResult(JSON.stringify({ value: 7 })));

    const result = await callJsonWithRetry(
      chat,
      [{ role: 'user', content: 'go' }],
      schema,
      { temperature: 0 },
      buildRetryMessage,
    );

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.result).toEqual({ value: 7 });
  });

  it('throws after two invalid-JSON responses, never returning raw content', async () => {
    const chat = vi.fn().mockResolvedValue(chatResult('still not json'));

    await expect(
      callJsonWithRetry(chat, [{ role: 'user', content: 'go' }], schema, {}, buildRetryMessage),
    ).rejects.toThrow('invalid JSON');
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('throws after two schema-invalid responses', async () => {
    const chat = vi.fn().mockResolvedValue(chatResult(JSON.stringify({ value: -1 })));

    await expect(
      callJsonWithRetry(chat, [{ role: 'user', content: 'go' }], schema, {}, buildRetryMessage),
    ).rejects.toThrow('schema validation');
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
