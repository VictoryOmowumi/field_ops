export interface AuthSession {
  userId: string;
  role: "agent" | "admin" | "supervisor";
  accessToken: string;
  expiresAt: string;
}
