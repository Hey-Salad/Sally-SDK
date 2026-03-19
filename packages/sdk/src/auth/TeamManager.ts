export interface TeamMember {
  id: string;
  email: string;
  role: "owner" | "admin" | "developer" | "viewer";
}

export class TeamManager {
  async listMembers(): Promise<TeamMember[]> {
    return [];
  }
}

