import type { Role, User } from "./types";

export function homePath(user: Pick<User, "role" | "facultyId">): string {
  if (user.role === "STUDENT") return "/student/assignments";
  if (user.role === "PARENT") return "/parent/grades";
  if (user.role === "ANALYST") return "/analytics";
  if (user.role === "EDUCATOR" && user.facultyId) return "/campus/today";
  return "/documents";
}

export function canExtractGenerate(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDUCATOR";
}

export function canMutateCampus(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDUCATOR";
}

export function canMutateAssessment(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDUCATOR";
}

export function needsFacultyLink(user: Pick<User, "role" | "facultyId"> | undefined): boolean {
  return user?.role === "EDUCATOR" && !user.facultyId;
}

export function isStaff(role: Role | undefined): boolean {
  return role === "ADMIN" || role === "EDUCATOR" || role === "ANALYST";
}
