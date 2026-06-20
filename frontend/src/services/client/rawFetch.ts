/**
 * Thin fetch wrapper for endpoints that bypass the JSON {@link fetchApi} helper
 * (binary, SSE, multipart). Always sends credentials and, on a non-OK response,
 * throws an Error carrying the server's `message` field. Returns the raw
 * Response so the caller reads .json() / .blob() / .body itself.
 */
export async function rawFetch(url: string, init: RequestInit, errorLabel: string): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message ?? `${errorLabel} (${res.status})`);
  }
  return res;
}
