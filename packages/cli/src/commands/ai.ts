import { Command } from "commander";

export function registerAiCommand(program: Command): void {
  const command = program.command("ai").description("Run Sally AI utilities");

  command.command("ask").description("Ask an AI provider").action(noop);
  command.command("run").description("Run a named AI workflow").action(noop);
  command.command("agent").description("Launch an AI sub-agent").action(noop);
}

function noop(): void {}

