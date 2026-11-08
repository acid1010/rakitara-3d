export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public details: { path: (string | number)[]; message: string }[] = [],
    public uncertain = false,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: {
    method?: "POST" | "PATCH" | "PUT";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const writing = !!options.method;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
      ...(writing
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body ?? {}),
          }
        : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      writing
        ? "The connection was interrupted. This action may have been saved. Check the records before trying again."
        : "Cannot reach the operations API. Check your connection and that the API is running.",
      0,
      [],
      writing,
    );
  }
  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event("session-expired"));
  }
  if (response.status === 204) return undefined as T;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      writing
        ? "The server response was interrupted. Check the records before repeating this action."
        : "The API returned an unreadable response.",
      response.status,
      [],
      writing,
    );
  }
  if (!response.ok)
    throw new ApiError(
      data.error ?? `Request failed (${response.status}).`,
      response.status,
      data.details ?? [],
      writing && response.status >= 500,
    );
  return data as T;
}

export async function allRows<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let offset = 0; offset <= 100000; offset += 100) {
    const page = await api<T[]>(
      `${path}${separator}limit=100&offset=${offset}`,
      { signal },
    );
    rows.push(...page);
    if (page.length < 100) return rows;
  }
  throw new ApiError(
    "This list exceeds the API pagination limit. Ask for server-side search before continuing; incomplete data has not been shown.",
  );
}
