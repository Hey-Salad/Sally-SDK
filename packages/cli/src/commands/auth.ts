import { Command } from "commander";
import { readConfig, updateConfig, writeConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

export function registerAuthCommand(program: Command): void {
  const command = program.command("auth").description("Manage Sally auth");
  const logger = createLogger();

  command
    .command("login")
    .description("Persist API endpoint and optional Access token locally")
    .option("--api-base-url <url>", "Sally worker URL")
    .option("--team-slug <slug>", "HeySalad team slug")
    .option("--token <token>", "Cloudflare Access JWT or API bearer token")
    .action(async (options: { apiBaseUrl?: string; teamSlug?: string; token?: string }) => {
      const existing = await readConfig();
      const config = await writeConfig({
        apiBaseUrl: options.apiBaseUrl ?? existing.apiBaseUrl,
        ...(options.teamSlug ?? existing.teamSlug ? { teamSlug: options.teamSlug ?? existing.teamSlug } : {}),
        ...(options.token ?? existing.authToken ? { authToken: options.token ?? existing.authToken } : {}),
        ...(existing.activeDaemon ? { activeDaemon: existing.activeDaemon } : {})
      });
      logger.success(`Saved Sally config for ${config.apiBaseUrl}`);
    });

  command
    .command("logout")
    .description("Clear the stored auth token")
    .action(async () => {
      await updateConfig((config) => ({
        ...(config.activeDaemon ? { activeDaemon: config.activeDaemon } : {}),
        apiBaseUrl: config.apiBaseUrl,
        ...(config.teamSlug ? { teamSlug: config.teamSlug } : {})
      }));
      logger.success("Cleared local Sally auth token");
    });

  command
    .command("whoami")
    .description("Show the current Sally identity")
    .action(async () => {
      const config = await readConfig();
      const claims = config.authToken ? decodeJwtPayload(config.authToken) : null;

      logger.info(`API base URL: ${config.apiBaseUrl}`);
      if (config.teamSlug) {
        logger.info(`Team slug: ${config.teamSlug}`);
      }
      if (!claims) {
        logger.warn("No auth token saved. Use `sally auth login --token <jwt>` for Access-backed commands.");
        return;
      }
      logger.success(`Authenticated as ${claims.email ?? claims.sub ?? "unknown-user"}`);
    });
}

function decodeJwtPayload(token: string): Record<string, string> | null {
  const segments = token.split(".");
  const payload = segments[1];
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}
