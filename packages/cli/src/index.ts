#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerAiCommand } from "./commands/ai.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerDeviceCommand } from "./commands/device.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerTunnelCommand } from "./commands/tunnel.js";

const program = new Command();
const packageVersion = readPackageVersion();

program
  .name("sally")
  .description("HeySalad Sally CLI")
  .showHelpAfterError()
  .version(packageVersion);

registerDeviceCommand(program);
registerAiCommand(program);
registerAuthCommand(program);
registerTunnelCommand(program);
registerLogsCommand(program);

void program.parseAsync(process.argv);

function readPackageVersion(): string {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as {
    version?: string;
  };
  return packageJson.version ?? "0.0.0";
}
