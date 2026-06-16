import type { FastifyInstance, FastifyRequest } from "fastify";
import { onboardTenantSchema, type OnboardTenantInput } from "@sesh/shared";
import { authenticate, requireAuth, resolveClerkUserId } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { badRequest } from "../lib/errors.js";
import { getTenant, onboardTenant } from "../services/tenant.service.js";

/**
 * Resolve the Clerk user id to install as the tenant owner during onboarding.
 *
 * Production (DEV_AUTH=false): the owner is the verified Clerk session subject.
 * A brand-new signed-in user has a session but no provisioned User row yet, so
 * we use `resolveClerkUserId` (which doesn't require provisioning) rather than
 * the full `authenticate` hook. The request body's `ownerClerkUserId` is ignored.
 *
 * Dev (DEV_AUTH=true): bootstrap from the `x-dev-clerk-user` header, falling
 * back to the body's `ownerClerkUserId` for scripted/seed onboarding.
 */
async function resolveOnboardingOwner(
  req: FastifyRequest,
  input: OnboardTenantInput,
): Promise<string> {
  if (env.DEV_AUTH) {
    const devHeader = req.headers["x-dev-clerk-user"];
    const id =
      (typeof devHeader === "string" && devHeader) || input.ownerClerkUserId;
    if (!id) throw badRequest("ownerClerkUserId is required in dev auth");
    return id;
  }
  return resolveClerkUserId(req);
}

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  // Onboarding: create a tenant + owner. Not gated by `authenticate` — the owner
  // is signed into Clerk but not yet provisioned in any tenant. The owner identity
  // is derived from the verified session, never the request body.
  app.post("/tenants", async (req, reply) => {
    const input = onboardTenantSchema.parse(req.body);
    const ownerClerkUserId = await resolveOnboardingOwner(req, input);
    const tenant = await onboardTenant(input, ownerClerkUserId);
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
