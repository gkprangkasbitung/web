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

/** Calls an admin route handler and returns `data`, or throws `ApiClientError` with the server's message. */
export async function apiFetch<T>(
  url: string,
  { method, body }: { method: "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
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
  return payload?.data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Terjadi kesalahan. Coba lagi.";
}
