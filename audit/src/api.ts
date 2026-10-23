export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await res.json().catch(() => {
    throw new Error(
      "Audit is temporarily unavailable. Please refresh and try again.",
    );
  });
  if (!res.ok)
    throw new Error(
      data.error?.message ??
        data.error ??
        data.message ??
        "Something went wrong. Please try again.",
    );
  return data;
}
export interface Project {
  id: string;
  name: string;
  url: string;
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
}
export interface Account {
  user: { id: string; name: string; email: string };
  billing: string;
  billingConfigured: boolean;
  googleConfigured: boolean;
  limits: { pages: number; projects: number; crawlsPerMonth: number };
}
export interface Job {
  id: string;
  projectId: string;
  status: string;
  pageLimit: number;
  pagesDone: number;
  discovered: number;
  error: string | null;
  createdAt: string;
}

// Small authenticated responses keep large reports within Vercel's response limit.
export async function loadAudit(
  url: string,
  signal?: AbortSignal,
): Promise<import("./types").Audit> {
  const parts: string[] = [];
  let next: number | null = 0;
  let version: string | undefined;
  do {
    const result: { chunk: string; version: string; next: number | null } =
      await api(`${url}?chunk=${next}`, { signal });
    if (version && version !== result.version)
      throw new Error(
        "This report changed while loading. Please refresh to load the latest version.",
      );
    version = result.version;
    parts.push(result.chunk);
    next = result.next;
  } while (next !== null);
  return JSON.parse(parts.join(""));
}
