import type { ZodType } from 'zod';
import type { ChatCompletionOptions, ChatMessage, chatCompletion } from './openrouter.js';

export type ChatFn = typeof chatCompletion;

export interface JsonCallResult<T> {
  result: T;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const MAX_ATTEMPTS = 2;

/**
 * Calls the model, validates the JSON response against `schema`, and retries once
 * (with the validation error appended to the conversation via `buildRetryMessage`)
 * before throwing. Never returns unvalidated output — callers must not fall back
 * to raw content on failure. Shared by every module that expects structured JSON
 * from an LLM (business-audit, email-draft, ...).
 */
export async function callJsonWithRetry<T>(
  chat: ChatFn,
  initialMessages: ChatMessage[],
  schema: ZodType<T>,
  options: ChatCompletionOptions,
  buildRetryMessage: (validationError: string) => ChatMessage,
): Promise<JsonCallResult<T>> {
  let messages = initialMessages;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await chat(messages, options);
    const content = response.choices[0]?.message.content ?? '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (cause) {
      if (attempt < MAX_ATTEMPTS) {
        const message = cause instanceof Error ? cause.message : String(cause);
        messages = [...messages, buildRetryMessage(`Response was not valid JSON: ${message}`)];
        continue;
      }
      throw new Error('Model returned invalid JSON after retry — never stored');
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      if (attempt < MAX_ATTEMPTS) {
        messages = [...messages, buildRetryMessage(validated.error.message)];
        continue;
      }
      throw new Error('Model response failed schema validation after retry — never stored');
    }

    return { result: validated.data, model: response.model, usage: response.usage };
  }

  // Unreachable: the loop always returns or throws on its final iteration.
  throw new Error('Model call exhausted retries without a result');
}
