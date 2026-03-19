import { Command } from "commander";
import { createApiClient } from "../utils/api.js";
import { readConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

export function registerTunnelCommand(program: Command): void {
  const command = program.command("tunnel").description("Manage Cloudflare tunnels");
  const logger = createLogger();

  command
    .command("open")
    .description("Alias for `sally device start`")
    .action(() => {
      logger.warn("Use `sally device start` to launch the local agent and open device tunnels.");
    });

  command
    .command("close")
    .description("Alias for `sally device stop`")
    .action(() => {
      logger.warn("Use `sally device stop` to shut down the local agent and close device tunnels.");
    });

  command
    .command("list")
    .description("List tunnels currently registered in the Sally worker")
    .action(async () => {
      const config = await readConfig();
      const api = createApiClient({
        baseUrl: config.apiBaseUrl,
        ...(config.authToken ? { accessToken: config.authToken } : {})
      });

      const devices = await api.listDevices();
      const active = devices.filter((device) => device.tunnelUrl);
      if (active.length === 0) {
        logger.warn("No active tunnel URLs are registered.");
        return;
      }
      for (const device of active) {
        logger.info(`${device.id} ${device.status} ${device.tunnelUrl ?? "n/a"}`);
      }
    });
}
