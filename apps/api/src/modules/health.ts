import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Friendly root so hitting the base URL isn't a bare 404.
  app.get("/", async () => ({
    service: "sesh-api",
    status: "ok",
    docs: "See README.md — this is a JSON API, not a website.",
    endpoints: {
      health: "GET /health",
      dbHealth: "GET /health/db",
      onboard: "POST /tenants",
      myTenant: "GET /me/tenant  (auth)",
      admin: {
        calendars: "GET|POST /calendars, GET|PATCH|DELETE /calendars/:id",
        workingHours: "GET|PUT /calendars/:id/working-hours",
        exceptions:
          "GET|POST /calendars/:id/exceptions, DELETE /calendars/:id/exceptions/:exceptionId",
        seshTypes: "GET|POST /sesh-types, GET|PATCH|DELETE /sesh-types/:id",
        seshes:
          "GET|POST /seshes, GET /seshes/:id, PATCH /seshes/:id/reschedule, POST /seshes/:id/cancel",
      },
      public: {
        calendars: "GET /t/:slug/calendars",
        seshTypes: "GET /t/:slug/sesh-types",
        availability:
          "GET /t/:slug/availability?calendarId&seshTypeId&from&to",
        book: "POST /t/:slug/seshes",
      },
    },
  }));

  app.get("/health", async () => ({ status: "ok", service: "sesh-api" }));

  app.get("/health/db", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: "up" };
    } catch (err) {
      reply.code(503);
      return { status: "error", db: "down", message: (err as Error).message };
    }
  });
}
