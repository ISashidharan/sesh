import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@sesh/shared";
import type { AuthContext } from "./context.js";
import { env } from "./env.js";
import { forbidden, unauthorized } from "./errors.js";
import { prisma } from "./prisma.js";

/**
 * Resolve the Clerk user id for a request, without requiring the user to be
 * provisioned in a tenant yet (onboarding relies on this).
 *
 * - Dev auth: trust the `x-dev-clerk-user` header (local development only).
 * - Production: verify the Bearer token with Clerk's backend SDK.
 */
export async function resolveClerkUserId(req: FastifyRequest): Promise<string> {
  if (env.DEV_AUTH) {
    const devUser = req.headers["x-dev-clerk-user"];
    if (typeof devUser !== "string" || devUser.length === 0) {
      throw unauthorized("Missing x-dev-clerk-user header (dev auth)");
    }
    return devUser;
  }

  if (!env.CLERK_SECRET_KEY) {
    throw unauthorized("Auth is not configured");
  }

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw unauthorized("Missing bearer token");

  // Imported lazily so the API can boot in dev without Clerk installed/configured.
  const { verifyToken } = await import("@clerk/backend");
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    if (!payload.sub) throw new Error("token has no subject");
    return payload.sub;
  } catch {
    throw unauthorized("Invalid session token");
  }
}

/**
 * Fastify preHandler that authenticates an admin/staff request and attaches the
 * tenant-scoped `req.auth`. Routes after this can trust `req.auth` is set.
 */
export async function authenticate(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const clerkUserId = await resolveClerkUserId(req);

  const user = await prisma.user.findUnique({ where: { clerkUserId } });
  if (!user) {
    throw forbidden("User is not provisioned in any tenant");
  }

  req.auth = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role as Role,
  };
}

/** Read `req.auth`, throwing if the route forgot the `authenticate` preHandler. */
export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

const ROLE_RANK: Record<Role, number> = { staff: 0, admin: 1, owner: 2 };

/** Guard a route by minimum role. Use as an additional preHandler. */
export function requireRole(min: Role) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = requireAuth(req);
    if (ROLE_RANK[auth.role] < ROLE_RANK[min]) {
      throw forbidden(`Requires ${min} role`);
    }
  };
}
