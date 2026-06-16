import type { OnboardTenantInput } from "@sesh/shared";
import { Role } from "@sesh/shared";
import { badRequest, conflict } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertTimezone } from "../lib/time.js";

/**
 * Create a tenant and its owner user in one transaction. This is the onboarding
 * entry point; the owner's Clerk user id is what subsequent auth resolves against.
 */
export async function onboardTenant(input: OnboardTenantInput) {
  assertTimezone(input.timezone, badRequest);

  const clerkUserId = input.ownerClerkUserId;
  if (!clerkUserId) {
    // In production this comes from the verified session, not the request body.
    throw badRequest("ownerClerkUserId is required");
  }

  const existing = await prisma.tenant.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) throw conflict(`Slug "${input.slug}" is taken`);

  return prisma.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
      timezone: input.timezone,
      users: {
        create: {
          clerkUserId,
          email: input.ownerEmail,
          role: Role.owner,
        },
      },
    },
    include: { users: true },
  });
}

export async function getTenant(tenantId: string) {
  return prisma.tenant.findUnique({ where: { id: tenantId } });
}
