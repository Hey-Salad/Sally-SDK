export interface AiPrompt {
  prompt: string;
}

export class ClaudeClient {
  async ask(input: AiPrompt): Promise<string> {
    return `pending:${input.prompt}`;
  }
}

