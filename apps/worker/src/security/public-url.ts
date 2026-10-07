export const PUBLIC_PAGE_MAX_BYTES = 256 * 1024;
export const PUBLIC_FETCH_TIMEOUT_MS = 8_000;
const DNS_RESPONSE_MAX_BYTES = 64 * 1024;

export type UnsafeUrlCode = "blocked" | "timeout" | "too_large";

export class UnsafeUrlError extends Error {
  readonly code: UnsafeUrlCode;

  constructor(code: UnsafeUrlCode) {
    super(
      code === "too_large"
        ? "Fetched page is too large"
        : code === "timeout"
          ? "Timed out fetching URL"
          : "URL is not allowed"
    );
    this.name = "UnsafeUrlError";
    this.code = code;
  }
}

export interface PublicFetchOptions {
  fetchImpl?: typeof fetch | undefined;
  maxBytes?: number | undefined;
  timeoutMs?: number | undefined;
}

interface DohResponse {
  Answer?: Array<{ data?: string; type?: number }> | undefined;
  Status?: number | undefined;
}

export async function fetchPublicHttpsText(input: string, options: PublicFetchOptions = {}): Promise<string> {
  const target = assertPublicHttpsUrl(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PUBLIC_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? PUBLIC_PAGE_MAX_BYTES;

  if (!isIpAddress(target.host)) {
    await assertPublicDns(target.host, fetchImpl, timeoutMs);
  }

  let response: Response;
  try {
    response = await fetchImpl(target.url.toString(), {
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "User-Agent": "Sally Recipe Extractor"
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw toFetchError(error);
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new UnsafeUrlError("blocked");
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Unable to fetch recipe URL: ${response.status}`);
  }

  return readBoundedText(response, maxBytes);
}

export function assertPublicHttpsUrl(input: string): { host: string; url: URL } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("blocked");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeUrlError("blocked");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("blocked");
  }
  if (url.port !== "" && url.port !== "443") {
    throw new UnsafeUrlError("blocked");
  }

  const host = normalizeHost(url.hostname);
  if (!host || isBlockedHost(host)) {
    throw new UnsafeUrlError("blocked");
  }

  return { host, url };
}

async function assertPublicDns(host: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<void> {
  const [ipv4, ipv6] = await Promise.all([
    resolveDns(host, "A", fetchImpl, timeoutMs),
    resolveDns(host, "AAAA", fetchImpl, timeoutMs)
  ]);
  const addresses = [...ipv4, ...ipv6];
  if (addresses.length === 0) {
    throw new UnsafeUrlError("blocked");
  }

  for (const address of addresses) {
    if (classifyAddress(address) !== "public") {
      throw new UnsafeUrlError("blocked");
    }
  }
}

async function resolveDns(
  host: string,
  type: "A" | "AAAA",
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<string[]> {
  const endpoint = new URL("https://cloudflare-dns.com/dns-query");
  endpoint.searchParams.set("name", host);
  endpoint.searchParams.set("type", type);

  let response: Response;
  try {
    response = await fetchImpl(endpoint.toString(), {
      headers: { Accept: "application/dns-json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw toFetchError(error);
  }

  if (response.status !== 200) {
    await response.body?.cancel();
    throw new UnsafeUrlError("blocked");
  }

  let payload: DohResponse;
  try {
    payload = JSON.parse(await readBoundedText(response, DNS_RESPONSE_MAX_BYTES)) as DohResponse;
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw error;
    }
    throw new UnsafeUrlError("blocked");
  }

  if (payload.Status === 3) {
    return [];
  }
  if (payload.Status !== 0) {
    throw new UnsafeUrlError("blocked");
  }

  const wanted = type === "A" ? 1 : 28;
  return (payload.Answer ?? [])
    .filter((answer) => answer.type === wanted && answer.data)
    .map((answer) => answer.data!.trim());
}

function toFetchError(error: unknown): Error {
  if (error instanceof UnsafeUrlError) {
    return error;
  }
  if (isTimeout(error)) {
    return new UnsafeUrlError("timeout");
  }
  return error instanceof Error ? error : new UnsafeUrlError("blocked");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new UnsafeUrlError("too_large");
  }

  const body = response.body;
  if (!body) {
    throw new Error("Unable to fetch recipe URL: empty body");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        throw new UnsafeUrlError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() may already have released the reader.
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function normalizeHost(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  return host;
}

function isBlockedHost(host: string): boolean {
  const kind = classifyAddress(host);
  if (kind === "blocked") {
    return true;
  }
  if (kind === "public") {
    return false;
  }

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  return (
    host === "metadata" ||
    host === "metadata.goog" ||
    host === "metadata.google.internal" ||
    host === "instance-data" ||
    host.endsWith(".instance-data")
  );
}

function isIpAddress(host: string): boolean {
  return classifyAddress(host) !== "name";
}

function classifyAddress(host: string): "blocked" | "name" | "public" {
  const normalized = normalizeHost(host);
  const ipv4 = parseIPv4(normalized);
  if (ipv4) {
    return isBlockedIPv4(ipv4) ? "blocked" : "public";
  }
  if (!normalized.includes(":")) {
    return "name";
  }

  const groups = expandIPv6(normalized);
  if (!groups) {
    return "blocked";
  }

  const mapped = embeddedIPv4(groups);
  if (mapped) {
    return isBlockedIPv4(mapped) ? "blocked" : "public";
  }
  if (isBlockedIPv6(groups)) {
    return "blocked";
  }
  return "public";
}

function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return Number.NaN;
    }
    return Number(part);
  });
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return octets as [number, number, number, number];
}

function isBlockedIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return a >= 224;
}

function expandIPv6(host: string): number[] | null {
  if (host.includes(".")) {
    return null;
  }

  const halves = host.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseSide = (side: string): number[] | null => {
    if (!side) {
      return [];
    }
    const groups = side.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
      return null;
    }
    return groups.map((group) => Number.parseInt(group, 16));
  };

  const head = parseSide(halves[0] ?? "");
  if (!head) {
    return null;
  }
  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tail = parseSide(halves[1] ?? "");
  if (!tail) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 0) {
    return null;
  }
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

function embeddedIPv4(groups: number[]): [number, number, number, number] | null {
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const nat64 =
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups.slice(2, 6).every((group) => group === 0);
  const sixToFour = groups[0] === 0x2002;

  if (mapped || nat64) {
    return toIPv4(groups[6] ?? 0, groups[7] ?? 0);
  }
  if (sixToFour) {
    return toIPv4(groups[1] ?? 0, groups[2] ?? 0);
  }
  return null;
}

function toIPv4(high: number, low: number): [number, number, number, number] {
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
}

function isBlockedIPv6(groups: number[]): boolean {
  const [first] = groups;
  if (first === undefined) {
    return true;
  }
  if (groups.every((group) => group === 0)) {
    return true;
  }
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }
  if (first >= 0xfc00 && first <= 0xfdff) {
    return true;
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }
  return (first & 0xff00) === 0xff00;
}
