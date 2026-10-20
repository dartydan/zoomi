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
