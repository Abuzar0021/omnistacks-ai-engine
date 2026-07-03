/**
 * Minimal typed fetch wrapper for talking to the OmniStacks API.
 * All frontend data access should go through this module.
 */

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: ApiErrorDetail[] };
}

export async function apiFetch<T>(
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<T> {
  const { headers, ...rest } = init;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

  if (!response.ok) {
    let envelope: ErrorEnvelope | undefined;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      response.status,
      envelope?.error?.message ?? `API request failed: ${response.status} ${path}`,
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
