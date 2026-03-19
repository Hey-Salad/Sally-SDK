import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

import { jsonError } from "../http.js";
import type { AccessClaims, WorkerBindings, WorkerEnv } from "../types.js";

const accessClaimsSchema = z.object({
  aud: z.array(z.string()).min(1),
  email: z.string().email().optional(),
  iss: z.string().min(1),
  sub: z.string().min(1)
});

export interface AccessMiddlewareOptions {
  verifier?: AccessTokenVerifier | undefined;
}

export type AccessTokenVerifier = (
  token: string,
  bindings: WorkerBindings
) => Promise<AccessClaims>;

export function createAccessMiddleware(
  options: AccessMiddlewareOptions = {}
): MiddlewareHandler<WorkerEnv> {
  const verifier = options.verifier ?? verifyAccessToken;

  return async (context, next) => {
    context.set("auth", null);
    if (context.req.path === "/") {
      await next();
      return;
    }

    const token = resolveToken(context.req.header("Authorization"), context.req.header("Cf-Access-Jwt-Assertion"));
    if (!token) {
      if (!requiresAuth(context.env)) {
        await next();
        return;
      }
      return jsonError(context, 401, "Missing Cloudflare Access token");
    }

    try {
      const claims = await verifier(token, context.env);
      context.set("auth", claims);
      await next();
    } catch (error) {
      return jsonError(context, 401, "Invalid Cloudflare Access token", toMessage(error));
    }
  };
}

export async function verifyAccessToken(
  token: string,
  bindings: WorkerBindings
): Promise<AccessClaims> {
  const teamDomain = bindings.CF_ACCESS_TEAM_DOMAIN;
  const audience = bindings.CF_ACCESS_AUD;

  if (!teamDomain || !audience) {
    throw new Error("Cloudflare Access verification is not configured");
  }

  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, jwks, { audience, issuer });
  const aud = Array.isArray(payload.aud) ? payload.aud : [String(payload.aud)];
  const claims = payload.email
    ? { aud, email: payload.email, iss: payload.iss ?? "", sub: payload.sub ?? "" }
    : { aud, iss: payload.iss ?? "", sub: payload.sub ?? "" };

  return accessClaimsSchema.parse(claims);
}

function requiresAuth(bindings: WorkerBindings): boolean {
  return bindings.REQUIRE_ACCESS_AUTH === "true";
}

function resolveToken(
  authorizationHeader?: string,
  accessHeader?: string
): string | undefined {
  if (accessHeader) {
    return accessHeader;
  }

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorizationHeader.slice("Bearer ".length);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Access verification error";
}
