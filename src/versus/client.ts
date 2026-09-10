import type { Snapshot } from './types';

/**
 * Calls to the room API. One endpoint, one shape back: the whole room.
 *
 * Failures come back as `ApiError` with the server's status and wording, so
 * a screen can say "that room is full" rather than "request failed". A
 * status of zero means the request never got there.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const OFFLINE = 'Could not reach the server. Check your connection and try again.';

export async function callVersus(input: Record<string, unknown>): Promise<Snapshot> {
  let res: Response;
  try {
    res = await fetch('/api/versus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A body that is not JSON is handled as no body below.
  }
  if (!res.ok) {
    const error = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `The server answered ${res.status}.`;
    throw new ApiError(res.status, error);
  }
  return body as Snapshot;
}
