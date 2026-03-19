export interface AuthIdentity {
  email: string;
  teamSlug: string;
}

export class AuthClient {
  async whoami(): Promise<AuthIdentity | null> {
    return null;
  }
}

