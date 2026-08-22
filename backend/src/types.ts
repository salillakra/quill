import type { SessionUser } from "./services/auth.service";

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser;
    correlationId: string;
  }
}

export {};
