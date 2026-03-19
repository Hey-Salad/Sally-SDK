export class WDAClient {
  constructor(private readonly baseUrl: string) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

