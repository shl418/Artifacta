import type { Database, Project, User } from "@/lib/types"

export function canViewProject(database: Database, user: User | null, project: Project) {
  if (project.visibility === "public") return true
  if (!user) return false
  if (user.role === "admin" && user.organizationId === project.organizationId) return true
  if (project.ownerId === user.id) return true
  if (project.visibility === "team" && user.organizationId === project.organizationId) return true

  return database.projectMembers.some((member) => member.projectId === project.id && member.userId === user.id)
}

export function canEditProject(database: Database, user: User, project: Project) {
  if (user.role === "admin" && user.organizationId === project.organizationId) return true
  if (project.ownerId === user.id) return true

  return database.projectMembers.some(
    (member) => member.projectId === project.id && member.userId === user.id && member.permission === "edit"
  )
}

export function canManageTeam(user: User) {
  return user.role === "admin"
}
