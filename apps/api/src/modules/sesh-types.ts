import type { FastifyInstance } from "fastify";
import {
  Role,
  createSeshTypeSchema,
  updateSeshTypeSchema,
} from "@sesh/shared";
import { authenticate, requireAuth, requireRole } from "../lib/auth.js";
import {
  createSeshType,
  deleteSeshType,
  getSeshType,
  listSeshTypes,
  updateSeshType,
} from "../services/sesh-type.service.js";

export async function seshTypeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/sesh-types", async (req) => {
    const { tenantId } = requireAuth(req);
    return listSeshTypes(tenantId);
  });

  app.get("/sesh-types/:id", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    return getSeshType(tenantId, id);
  });

  app.post("/sesh-types", async (req, reply) => {
    const { tenantId } = requireAuth(req);
    const input = createSeshTypeSchema.parse(req.body);
    reply.code(201);
    return createSeshType(tenantId, input);
  });

  app.patch("/sesh-types/:id", async (req) => {
    const { tenantId } = requireAuth(req);
    const { id } = req.params as { id: string };
    const input = updateSeshTypeSchema.parse(req.body);
    return updateSeshType(tenantId, id, input);
  });

  app.delete(
    "/sesh-types/:id",
    { preHandler: requireRole(Role.admin) },
    async (req, reply) => {
      const { tenantId } = requireAuth(req);
      const { id } = req.params as { id: string };
      await deleteSeshType(tenantId, id);
      reply.code(204);
    },
  );
}
