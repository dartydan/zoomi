import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";

export function normalizeUrl(input: string): URL {
  const url = new URL(
    /^https?:\/\//i.test(input.trim())
      ? input.trim()
      : `https://${input.trim()}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Enter a public website using http or https, without a password or custom port.",
    );
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  )
    throw new Error(
      "Enter a public website address, such as yourbusiness.com.",
    );
  url.hash = "";
  return url;
}
export function isPublicIp(address: string): boolean {
  try {
    const parsed = ipaddr.process(address.replace(/^\[|\]$/g, ""));
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export interface ResponseData {
  url: string;
  status: number;
  body: string;
  type: string;
  headers: http.IncomingHttpHeaders;
}
export async function safeFetch(
  input: string,
  options: {
    redirects?: number;
    followRedirects?: boolean;
    allowedOrigin?: string;
    allow?: (url: string) => boolean;
    signal?: AbortSignal;
  } = {},
): Promise<ResponseData> {
  const url = normalizeUrl(input);
  options.signal?.throwIfAborted();
  if (options.allowedOrigin && url.origin !== options.allowedOrigin)
    throw new Error("Redirect leaves this website; page skipped.");
  if (options.allow && !options.allow(url.href))
    throw new Error("This page is excluded by robots.txt.");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    dns.lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(
        () =>
          reject(
            new Error("The website address could not be resolved in time."),
          ),
        10000,
      );
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  options.signal?.throwIfAborted();
  if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
    throw new Error("Only publicly accessible websites can be audited.");
  // Pin the validated address into the connection. A second DNS resolution cannot redirect us to a private network.
  const address = addresses[0];
  const response = await new Promise<ResponseData>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        headers: {
          "user-agent": "ZoomiAudit/0.1 (+https://zoomi.co)",
          accept: "text/html,text/plain,application/xml;q=0.9",
          "accept-encoding": "identity",
        },
        lookup: (_host, opts, cb) => {
          if (typeof opts === "object" && opts.all)
            (cb as Function)(null, [address]);
          else (cb as Function)(null, address.address, address.family);
        },
        signal: options.signal,
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000)
            req.destroy(
              new Error("This page is larger than the 2 MB scan limit."),
            );
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            url: url.href,
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            type: String(res.headers["content-type"] ?? ""),
            headers: res.headers,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("This page took too long to respond.")),
      12_000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
  if (
    options.followRedirects !== false &&
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.headers.location
  ) {
    const redirects = options.redirects ?? 0;
    if (redirects >= 4) throw new Error("This website has too many redirects.");
    return safeFetch(new URL(response.headers.location, url).href, {
      ...options,
      redirects: redirects + 1,
    });
  }
  return response;
}
