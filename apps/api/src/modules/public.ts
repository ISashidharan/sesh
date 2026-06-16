import type { FastifyInstance } from "fastify";
import { availabilityQuerySchema, createBookingSchema } from "@sesh/shared";
import { resolveTenant, requireTenant } from "../lib/tenant.js";
import { computeAvailability } from "../services/availability.service.js";
import { createSesh } from "../services/booking.service.js";
import { listActiveCalendars } from "../services/calendar.service.js";
import { listSeshTypes } from "../services/sesh-type.service.js";

/**
 * Public booking surface, mounted under /t/:slug. No auth — the tenant is
 * resolved from the slug. This is what the embeddable widget and hosted booking
 * page call.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", resolveTenant);

  app.get("/t/:slug/calendars", async (req) => {
    return listActiveCalendars(requireTenant(req).id);
  });

  app.get("/t/:slug/sesh-types", async (req) => {
    return listSeshTypes(requireTenant(req).id, { activeOnly: true });
  });

  app.get("/t/:slug/availability", async (req) => {
    const query = availabilityQuerySchema.parse(req.query);
    return computeAvailability(requireTenant(req).id, query);
  });

  app.post("/t/:slug/seshes", async (req, reply) => {
    const input = createBookingSchema.parse(req.body);
    reply.code(201);
    return createSesh(requireTenant(req).id, input, { enforceFuture: true });
  });
}
