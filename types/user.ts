export type UserRole = "agent" | "admin" | "super_admin";

export interface User {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: UserRole;
  territory?: string;
  createdAt: string;
}
