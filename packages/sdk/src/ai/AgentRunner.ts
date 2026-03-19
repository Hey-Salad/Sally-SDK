export interface AgentRunRequest {
  name: string;
}

export class AgentRunner {
  async run(request: AgentRunRequest): Promise<string> {
    return `pending:${request.name}`;
  }
}

