/** Browser side of the §10 API shape: `{ data }` on success, `{ error }` otherwise. */

export class ApiClientError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 when the server couldn't be reached. */
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type FetchOptions = { method: "POST" | "PATCH" | "DELETE"; body?: unknown };

/** Calls an admin route handler and returns `data`, or throws `ApiClientError` with the server's message. */
export async function apiFetch<T>(url: string, options: FetchOptions): Promise<T> {
  return (await apiFetchWithWarning<T>(url, options)).data;
}

/**
 * Like `apiFetch`, but also returns the `error` of a 207 (brief §10: the main
 * write succeeded, a follow-up write failed) so the caller can show it.
 */
export async function apiFetchWithWarning<T>(
  url: string,
  { method, body }: FetchOptions,
): Promise<{ data: T; warning: string | null }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError("Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.", 0);
  }

  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok) {
    throw new ApiClientError(payload?.error ?? "Terjadi kesalahan di server. Coba lagi.", response.status);
  }
  return { data: payload?.data as T, warning: response.status === 207 ? (payload?.error ?? null) : null };
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Terjadi kesalahan. Coba lagi.";
}
