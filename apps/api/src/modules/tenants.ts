import type { FastifyInstance } from "fastify";
import { onboardTenantSchema } from "@sesh/shared";
import { authenticate, requireAuth } from "../lib/auth.js";
import { getTenant, onboardTenant } from "../services/tenant.service.js";

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // Onboarding: create a tenant + owner. Unauthenticated by design — this is how
  // a brand-new business gets its first tenant. (Production hardening: rate-limit
  // and derive ownerClerkUserId from a verified Clerk session.)
  app.post("/tenants", async (req, reply) => {
    const input = onboardTenantSchema.parse(req.body);
    const tenant = await onboardTenant(input);
    reply.code(201);
    return tenant;
  });

  // The current authenticated user's tenant.
  app.get(
    "/me/tenant",
    { preHandler: authenticate },
    async (req) => {
      const { tenantId } = requireAuth(req);
      return getTenant(tenantId);
    },
  );
}
