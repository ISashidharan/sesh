import type { FastifyInstance } from "fastify";
import {
  createBookingSchema,
  listSeshesQuerySchema,
  rescheduleSeshSchema,
} from "@sesh/shared";
import { authenticate, requireAuth } from "../lib/auth.js";
import {
  cancelSesh,
  createSesh,
  getSesh,
  listSeshes,
  rescheduleSesh,
  verifySesh,
} from "../services/booking.service.js";

export async function seshRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/seshes", async (req) => {
    const { tenantId } = requireAuth(req);
    const query = listSeshesQuerySchema.parse(req.query);
    return listSeshes(tenantId, query);
  });

  app.get("/seshes/:id", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return getSesh(tenantId, id);
  });

  // Admin-created booking; admins may backfill past times and are auto-verified.
  app.post("/seshes", async (req, reply) => {
    const { tenantId } = requireAuth(req);
    const input = createBookingSchema.parse(req.body);
    reply.code(201);
    return createSesh(tenantId, input, { enforceFuture: false, emailVerified: true });
  });

  app.patch("/seshes/:id/reschedule", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    const input = rescheduleSeshSchema.parse(req.body);
    return rescheduleSesh(tenantId, id, input, { enforceFuture: false });
  });

  app.post("/seshes/:id/cancel", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return cancelSesh(tenantId, id);
  });

  app.post("/seshes/:id/verify", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return verifySesh(tenantId, id);
  });
}
