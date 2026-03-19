export interface TeamMember {
    id: string;
    email: string;
    role: "owner" | "admin" | "developer" | "viewer";
}
export declare class TeamManager {
    listMembers(): Promise<TeamMember[]>;
}
//# sourceMappingURL=TeamManager.d.ts.map