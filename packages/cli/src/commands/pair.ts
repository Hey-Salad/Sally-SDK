import os from "node:os";
import { Command } from "commander";
import { SallyClient } from "@heysalad/sally-sdk";

import { readConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";
import {
  generateMachineKeypair,
  getMachineIdentityPath,
  readMachineIdentity,
  writeMachineIdentity
} from "../utils/machineIdentity.js";

export function registerPairCommand(program: Command): void {
  const logger = createLogger();

  program
    .command("pair <code>")
    .description("Pair this computer with your HeySalad account using a one-time code")
    .option("--name <name>", "Display name for this computer (defaults to the hostname)")
    .option("--api-base-url <url>", "Override the Sally worker URL")
    .option("--force", "Replace an existing machine identity on this computer")
    .action(async (code: string, options: { apiBaseUrl?: string; force?: boolean; name?: string }) => {
      const config = await readConfig();
      const apiBaseUrl = options.apiBaseUrl ?? config.apiBaseUrl;

      const existing = await readMachineIdentity();
      if (existing && !options.force) {
        logger.error(
          `This computer is already paired as "${existing.name}" (agent ${existing.agentId}).`
        );
        logger.info("Re-run with --force to generate a new identity and pair again.");
        process.exitCode = 1;
        return;
      }

      if (!config.authToken) {
        logger.warn(
          "No auth token saved. Run `sally auth login --token <jwt>` first if the worker requires Cloudflare Access."
        );
      }

      const client = new SallyClient(apiBaseUrl, config.authToken);
      const name = options.name ?? os.hostname();
      const spinner = logger.start(`Pairing ${name} with ${apiBaseUrl}`);

      try {
        const claim = await client.claimComputerPairingSession(code);
        const keypair = generateMachineKeypair();
        const agent = await client.registerComputerAgent({
          hostname: os.hostname(),
          name,
          platform: process.platform,
          publicKey: keypair.publicKey,
          registrationToken: claim.registrationToken
        });
        await writeMachineIdentity({
          agentId: agent.id,
          apiBaseUrl,
          createdAt: Date.now(),
          name: agent.name,
          privateKeyPem: keypair.privateKeyPem,
          publicKey: keypair.publicKey
        });
        spinner.succeed(`Paired "${agent.name}" (agent ${agent.id})`);
        logger.info(`Machine identity saved to ${getMachineIdentityPath()}`);
        logger.info(`Capabilities: ${agent.capabilities.join(", ")}`);
      } catch (error) {
        spinner.fail("Pairing failed");
        logger.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
