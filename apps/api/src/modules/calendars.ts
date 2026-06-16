import type { FastifyInstance } from "fastify";
import {
  Role,
  createCalendarSchema,
  updateCalendarSchema,
} from "@sesh/shared";
import { authenticate, requireAuth, requireRole } from "../lib/auth.js";
import {
  createCalendar,
  deleteCalendar,
  getCalendar,
  listCalendars,
  updateCalendar,
} from "../services/calendar.service.js";

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  // Every route in this module requires an authenticated admin/staff user.
  app.addHook("preHandler", authenticate);

  app.get("/calendars", async (req) => {
    const { tenantId } = requireAuth(req);
    return listCalendars(tenantId);
  });

  app.get("/calendars/:id", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return getCalendar(tenantId, id);
  });

  app.post("/calendars", async (req, reply) => {
    const { tenantId } = requireAuth(req);
    const input = createCalendarSchema.parse(req.body);
    reply.code(201);
    return createCalendar(tenantId, input);
  });

  app.patch("/calendars/:id", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    const input = updateCalendarSchema.parse(req.body);
    return updateCalendar(tenantId, id, input);
  });

  app.delete(
    "/calendars/:id",
    { preHandler: requireRole(Role.admin) },
    async (req, reply) => {
      const { tenantId } = requireAuth(req);
      const { id } = req.params as { id: string };
      await deleteCalendar(tenantId, id);
      reply.code(204);
    },
  );
}
