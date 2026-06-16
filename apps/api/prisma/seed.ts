import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds a demo tenant for local development.
 *
 * After seeding, authenticate admin requests with the dev header:
 *   x-dev-clerk-user: dev_owner
 */
async function main() {
  const slug = "acme";

  await prisma.tenant.deleteMany({ where: { slug } });

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: "Acme Studio",
      timezone: "America/New_York",
      users: {
        create: [
          { clerkUserId: "dev_owner", email: "owner@acme.test", role: "owner" },
          { clerkUserId: "dev_staff", email: "staff@acme.test", role: "staff" },
        ],
      },
      seshTypes: {
        create: [
          { name: "Quick Sesh", durationMin: 30, bufferAfterMin: 10 },
          { name: "Standard Sesh", durationMin: 60, bufferAfterMin: 15 },
        ],
      },
    },
  });

  const calendar = await prisma.calendar.create({
    data: {
      tenantId: tenant.id,
      name: "Main Room",
      timezone: tenant.timezone,
      // Mon–Fri, 09:00–17:00 (minutes from midnight).
      workingHours: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMin: 9 * 60,
          endMin: 17 * 60,
        })),
      },
    },
  });

  console.log(`Seeded tenant "${tenant.slug}" (${tenant.id})`);
  console.log(`  calendar "${calendar.name}" (${calendar.id})`);
  console.log(`  dev auth header → x-dev-clerk-user: dev_owner`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
