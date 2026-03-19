import { Command } from "commander";

export function registerLogsCommand(program: Command): void {
  const command = program.command("logs").description("Inspect Sally logs");

  command.command("device").description("Show device logs").action(noop);
  command.command("session").description("Show session logs").action(noop);
  command.command("audit").description("Show audit logs").action(noop);
}

function noop(): void {}

