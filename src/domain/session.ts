import type { Project } from "./project";

export interface ProjectSession {
  project: Project;
  revision: number;
  savedRevision: number;
}

export function beginSession(project: Project): ProjectSession {
  return { project, revision: 0, savedRevision: 0 };
}

export function editSession(session: ProjectSession, project: Project): ProjectSession {
  return { ...session, project, revision: session.revision + 1 };
}

export function recordSaved(
  session: ProjectSession,
  snapshot: Pick<ProjectSession, "project" | "revision">,
): ProjectSession {
  if (snapshot.project.projectId !== session.project.projectId) return session;
  return { ...session, savedRevision: Math.max(session.savedRevision, snapshot.revision) };
}

export function hasUnsavedChanges(session: ProjectSession): boolean {
  return session.revision !== session.savedRevision;
}
