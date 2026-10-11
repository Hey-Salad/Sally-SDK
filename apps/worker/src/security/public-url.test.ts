import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { fetchPublicHttpsText, UnsafeUrlError } from "./public-url.js";

describe("public URL fetch", () => {
  it.each([
    "http://127.0.0.1/",
    "https://127.0.0.1/",
    "https://127.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://0.0.0.0/",
    "https://10.0.0.1/",
    "https://172.16.0.1/",
    "https://192.168.1.20/",
    "https://169.254.169.254/latest/meta-data",
    "https://100.100.100.200/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:169.254.169.254]/",
    "https://[fd00:ec2::254]/",
    "https://[2002:7f00:1::]/",
    "https://[64:ff9b::7f00:1]/",
    "https://[::a9fe:a9fe]/",
    "https://[::7f00:1]/",
    "https://[64:ff9b:1::a9fe:a9fe]/",
    "https://[64:ff9b:1::7f00:1]/",
    "https://[fec0::1]/",
    "https://[2001::1]/",
    "https://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/",
    "https://[2002:808:808::]/",
    "https://[2001:db8::1]/",
    "https://[3fff::1]/",
    "https://192.0.2.1/",
    "https://198.51.100.1/",
    "https://203.0.113.1/",
    "https://198.18.0.1/",
    "https://192.0.0.1/",
    "https://192.88.99.1/",
    "https://api-sally-sdk.heysalad.app/health",
    "https://heysalad.app/",
    "https://foo.heysalad.app/",
    "https://heysalad-sally-worker.heysalad-o.workers.dev/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://example.com.internal/recipe",
    "https://user:pass@example.com/recipe",
    "https://example.com:8443/recipe",
    "file:///etc/passwd"
  ])("blocks %s before any network call", async (url) => {
    const fetchImpl = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(fetchPublicHttpsText(url, { fetchImpl })).rejects.toMatchObject({
      code: "blocked",
      message: "URL is not allowed"
    });
  });

  it("blocks a public hostname that resolves to a private address", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const href = String(input);
      calls.push(href);
      const type = new URL(href).searchParams.get("type");
      const data = type === "A" ? "10.1.2.3" : "fd00::1";
      const recordType = type === "A" ? 1 : 28;
      return new Response(JSON.stringify({ Answer: [{ data, type: recordType }], Status: 0 }), { status: 200 });
    };

    await expect(
      fetchPublicHttpsText("https://evil.example/recipe", { fetchImpl })
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(calls.every((href) => href.startsWith("https://cloudflare-dns.com/dns-query"))).toBe(true);
  });

  it("does not follow redirects", async () => {
    const fetchImpl = publicDnsFetch(async (href) => {
      expect(href).toBe("https://example.com/recipe");
      return new Response(null, { headers: { Location: "http://169.254.169.254/" }, status: 302 });
    });

    await expect(fetchPublicHttpsText("https://example.com/recipe", { fetchImpl })).rejects.toMatchObject({
      code: "blocked"
    });
  });

  it("stops reading once the response exceeds the size cap", async () => {
    const fetchImpl = publicDnsFetch(async () => new Response(new Uint8Array(64), {
      headers: { "content-length": "999999" },
      status: 200
    }));

    await expect(
      fetchPublicHttpsText("https://example.com/recipe", { fetchImpl, maxBytes: 32 })
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("times out a hanging fetch", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
        });
      });

    await expect(
      fetchPublicHttpsText("https://example.com/recipe", { fetchImpl, timeoutMs: 20 })
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it.each(["https://8.8.8.8/", "https://172.32.0.1/", "https://[2606:4700:4700::1111]/"])(
    "fetches the global address %s without a DNS lookup",
    async (url) => {
      const calls: string[] = [];
      const fetchImpl: typeof fetch = async (input) => {
        calls.push(String(input));
        return new Response("ok", { status: 200 });
      };

      await expect(fetchPublicHttpsText(url, { fetchImpl })).resolves.toBe("ok");
      expect(calls).toEqual([url]);
    }
  );

  it("allows a name that only looks like the zone", async () => {
    const fetchImpl = publicDnsFetch(async () => new Response("ok", { status: 200 }));
    await expect(fetchPublicHttpsText("https://notheysalad.app/", { fetchImpl })).resolves.toBe("ok");
  });

  it("returns a bounded public page", async () => {
    const fetchImpl = publicDnsFetch(async () => new Response("<p>Tomato pasta</p>", { status: 200 }));
    await expect(fetchPublicHttpsText("https://example.com/recipe", { fetchImpl })).resolves.toContain("Tomato pasta");
  });
});

function publicDnsFetch(page: (href: string) => Promise<Response>): typeof fetch {
  return async (input) => {
    const href = String(input);
    if (href.startsWith("https://cloudflare-dns.com/dns-query")) {
      const type = new URL(href).searchParams.get("type");
      const answer = type === "A" ? [{ data: "93.184.216.34", type: 1 }] : [];
      return new Response(JSON.stringify({ Answer: answer, Status: 0 }), { status: 200 });
    }
    return page(href);
  };
}

describe("committed worker config", () => {
  it("does not disable auth or open CORS in the deployed wrangler config", () => {
    const toml = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
    const assigned = toml
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    expect(assigned).toContain('compatibility_flags = ["global_fetch_strictly_public"]');
    expect(assigned).toContain('SALLY_ENV = "production"');
    expect(assigned).toContain('ALLOWED_ORIGINS = "https://heysalad-sally-dashboard.pages.dev"');
    expect(assigned).not.toContain("ALLOW_INSECURE_LOCAL_DEV");
    expect(assigned).not.toContain("REQUIRE_ACCESS_AUTH");
    expect(assigned).not.toMatch(/ALLOWED_ORIGINS[^\n]*\*/);
  });

  it("keeps the insecure local flag in the dev vars example only", () => {
    const example = readFileSync(new URL("../../.dev.vars.example", import.meta.url), "utf8");
    expect(example).toContain("SALLY_ENV=development");
    expect(example).toContain("ALLOW_INSECURE_LOCAL_DEV=true");
  });
});
