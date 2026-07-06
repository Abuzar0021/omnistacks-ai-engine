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
 * Some models wrap their JSON response in a markdown code fence, or precede it
 * with reasoning/prose, despite being told to respond with only JSON (observed
 * in production via OpenRouter: both a fenced response and a "thinking" model
 * that led with "We need to..." before its JSON object). Recovers the JSON
 * object from either case before parsing.
 */
function extractJsonPayload(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenced ? (fenced[1] ?? '') : trimmed;
  if (unfenced.startsWith('{')) return unfenced;

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

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
      parsed = JSON.parse(extractJsonPayload(content));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (attempt < MAX_ATTEMPTS) {
        messages = [...messages, buildRetryMessage(`Response was not valid JSON: ${message}`)];
        continue;
      }
      const finishReason = response.choices[0]?.finish_reason ?? 'unknown';
      throw new Error(
        `Model returned invalid JSON after retry — never stored: ${message} ` +
          `(finish_reason=${finishReason}, responseLength=${content.length})`,
      );
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      if (attempt < MAX_ATTEMPTS) {
        messages = [...messages, buildRetryMessage(validated.error.message)];
        continue;
      }
      throw new Error(
        `Model response failed schema validation after retry — never stored: ${validated.error.message}`,
      );
    }

    return { result: validated.data, model: response.model, usage: response.usage };
  }

  // Unreachable: the loop always returns or throws on its final iteration.
  throw new Error('Model call exhausted retries without a result');
}
