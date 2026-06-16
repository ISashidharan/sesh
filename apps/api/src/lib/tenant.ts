import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantContext } from "./context.js";
import { notFound } from "./errors.js";
import { prisma } from "./prisma.js";

/**
 * Fastify preHandler for public routes mounted under `/t/:slug`. Resolves the
 * tenant from the slug and attaches `req.tenant`.
 */
export async function resolveTenant(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const { slug } = req.params as { slug?: string };
  if (!slug) throw notFound("Tenant not found");

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, timezone: true },
  });
  if (!tenant) throw notFound("Tenant not found");

  req.tenant = tenant satisfies TenantContext;
}

/** Read `req.tenant`, throwing if the route forgot the `resolveTenant` preHandler. */
export function requireTenant(req: FastifyRequest): TenantContext {
  if (!req.tenant) throw notFound("Tenant not found");
  return req.tenant;
}
