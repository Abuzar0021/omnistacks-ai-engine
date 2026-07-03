/**
 * Minimal typed fetch wrapper for talking to the OmniStacks API.
 * All frontend data access should go through this module.
 */

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API request failed: ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}
