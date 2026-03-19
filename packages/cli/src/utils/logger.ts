import chalk from "chalk";
import ora, { type Ora } from "ora";

export interface Logger {
  error(message: string): void;
  info(message: string): void;
  start(message: string): Ora;
  success(message: string): void;
  warn(message: string): void;
}

export function createLogger(): Logger {
  return {
    error(message) {
      console.error(chalk.red(message));
    },
    info(message) {
      console.log(chalk.cyan(message));
    },
    start(message) {
      return ora({
        isEnabled: process.stdout.isTTY,
        text: message
      }).start();
    },
    success(message) {
      console.log(chalk.green(message));
    },
    warn(message) {
      console.warn(chalk.yellow(message));
    }
  };
}
