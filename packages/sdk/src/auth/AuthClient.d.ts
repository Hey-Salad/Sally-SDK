export interface AuthIdentity {
    email: string;
    teamSlug: string;
}
export declare class AuthClient {
    whoami(): Promise<AuthIdentity | null>;
}
//# sourceMappingURL=AuthClient.d.ts.map