export interface StreamServerConfig {
  port: number;
}

export class StreamServer {
  constructor(private readonly config: StreamServerConfig) {}

  getConfig(): StreamServerConfig {
    return this.config;
  }
}

