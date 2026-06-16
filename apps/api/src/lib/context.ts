import type { Role } from "@sesh/shared";

/** Authenticated admin/staff principal, resolved from Clerk (or dev auth). */
export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}

/** Public-route tenant, resolved from the :slug path param. */
export interface TenantContext {
  id: string;
  slug: string;
  timezone: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Present on admin routes after the `authenticate` preHandler. */
    auth?: AuthContext;
    /** Present on public routes after the `resolveTenant` preHandler. */
    tenant?: TenantContext;
  }
}
