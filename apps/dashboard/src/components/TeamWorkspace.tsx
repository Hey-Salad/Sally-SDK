"use client";

import { startTransition, useEffect, useState } from "react";

import { createTeam, createUser, listTeams, listUsers, makeSlug } from "../lib/api";
import type { TeamRecord, TeamRole, UserRecord } from "../lib/types";

const roles: TeamRole[] = ["owner", "admin", "developer", "viewer"];

export function TeamWorkspace() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const [nextTeams, nextUsers] = await Promise.all([listTeams(), listUsers()]);
    startTransition(() => {
      setTeams(nextTeams);
      setUsers(nextUsers);
    });
  }

  return (
    <section className="two-column-layout">
      <article className="detail-card">
        <p className="eyebrow">Invite flow</p>
        <h1>Bring the right people into the room.</h1>
        <p className="hero-copy">
          Invite teammates with the role they need from day one. Keep ownership crisp and device access calm.
        </p>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            void createUser({
              email: String(formData.get("email") ?? ""),
              name: String(formData.get("name") ?? ""),
              role: String(formData.get("role") ?? "viewer") as TeamRole,
              teamId: (formData.get("teamId") as string) || null
            })
              .then(async () => {
                event.currentTarget.reset();
                setMessage("User invited");
                await refresh();
              })
              .catch((error) => {
                setMessage(error instanceof Error ? error.message : "Unable to invite user");
              });
          }}
        >
          <input name="name" placeholder="Name" required />
          <input name="email" placeholder="Email" required type="email" />
          <select defaultValue="developer" name="role">
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select defaultValue="" name="teamId">
            <option value="">No team yet</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button className="hs-btn-primary" type="submit">
            Invite teammate
          </button>
        </form>
      </article>

      <article className="detail-card detail-card--soft">
        <p className="eyebrow">Team spaces</p>
        <h2>Create a new squad</h2>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const name = String(formData.get("teamName") ?? "");
            void createTeam({
              name,
              slug: makeSlug(name)
            })
              .then(async () => {
                event.currentTarget.reset();
                setMessage("Team created");
                await refresh();
              })
              .catch((error) => {
                setMessage(error instanceof Error ? error.message : "Unable to create team");
              });
          }}
        >
          <input name="teamName" placeholder="Team name" required />
          <button className="hs-btn-secondary" type="submit">
            Create team
          </button>
        </form>

        {message ? <p className="touch-feedback">{message}</p> : null}

        <div className="collection-card">
          <h3>Current teams</h3>
          {teams.length === 0 ? (
            <p className="muted-copy">No teams yet. Create one above.</p>
          ) : (
            <ul className="entity-list">
              {teams.map((team) => (
                <li key={team.id}>
                  <strong>{team.name}</strong>
                  <span>{team.slug}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="collection-card">
          <h3>Active users</h3>
          {users.length === 0 ? (
            <p className="muted-copy">No invites yet. Add your first teammate.</p>
          ) : (
            <ul className="entity-list">
              {users.map((user) => (
                <li key={user.id}>
                  <strong>{user.name ?? user.email}</strong>
                  <span>{user.role ?? "viewer"} · {user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </section>
  );
}
