import type { FastifyInstance } from "fastify";
import { createExceptionSchema, setWorkingHoursSchema } from "@sesh/shared";
import { authenticate, requireAuth } from "../lib/auth.js";
import {
  deleteException,
  getWorkingHours,
  listExceptions,
  setWorkingHours,
  upsertException,
} from "../services/working-hours.service.js";

export async function workingHoursRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/calendars/:id/working-hours", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return getWorkingHours(tenantId, id);
  });

  // Replace the full weekly schedule in one call.
  app.put("/calendars/:id/working-hours", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    const input = setWorkingHoursSchema.parse(req.body);
    return setWorkingHours(tenantId, id, input);
  });

  app.get("/calendars/:id/exceptions", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return listExceptions(tenantId, id);
  });

  // Upsert a closure / custom-hours override for a date.
  app.post("/calendars/:id/exceptions", async (req, reply) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    const input = createExceptionSchema.parse(req.body);
    reply.code(201);
    return upsertException(tenantId, id, input);
  });

  app.delete(
    "/calendars/:id/exceptions/:exceptionId",
    async (req, reply) => {
      const { tenantId } = requireAuth(req);
      const { id, exceptionId } = req.params as {
        id: string;
        exceptionId: string;
      };
      await deleteException(tenantId, id, exceptionId);
      reply.code(204);
    },
  );
}
