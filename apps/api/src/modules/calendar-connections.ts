import type { FastifyInstance } from "fastify";
import { authenticate, requireAuth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import {
  completeGoogleOAuth,
  deleteConnection,
  initiateGoogleOAuth,
  listConnections,
  listExternalCalendars,
  toggleSync,
} from "../services/calendar-connection.service.js";

export async function calendarConnectionRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ---- OAuth initiation (authenticated admin) --------------------------------

  app.get(
    "/calendar-connections/google/auth",
    { preHandler: authenticate },
    async (req, reply) => {
      const { tenantId } = requireAuth(req);
      const { calendarId } = req.query as { calendarId?: string };
      if (!calendarId) {
        return reply
          .code(400)
          .send({ error: "BadRequest", message: "calendarId is required" });
      }
      const url = initiateGoogleOAuth(tenantId, calendarId);
      return { url };
    },
  );

  // ---- OAuth callback (no auth — Google redirects here) ----------------------
  // After exchanging the code we redirect the browser back to the admin UI.

  app.get("/calendar-connections/google/callback", async (req, reply) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const returnUrl = `${env.APP_BASE_URL}/calendars`;

    if (error || !code || !state) {
      return reply.redirect(
        `${returnUrl}?gcal_error=${encodeURIComponent(error ?? "missing_params")}`,
      );
    }

    try {
      await completeGoogleOAuth(code, state);
      return reply.redirect(`${returnUrl}?gcal_connected=1`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      return reply.redirect(
        `${returnUrl}?gcal_error=${encodeURIComponent(msg)}`,
      );
    }
  });

  // ---- CRUD (authenticated admin) --------------------------------------------

  app.get(
    "/calendar-connections",
    { preHandler: authenticate },
    async (req) => {
      const { tenantId } = requireAuth(req);
      return listConnections(tenantId);
    },
  );

  app.delete(
    "/calendar-connections/:id",
    { preHandler: authenticate },
    async (req, reply) => {
      const { tenantId } = requireAuth(req);
      const { id } = req.params as { id: string };
      await deleteConnection(tenantId, id);
      reply.code(204);
    },
  );

  app.patch(
    "/calendar-connections/:id",
    { preHandler: authenticate },
    async (req) => {
      const { tenantId } = requireAuth(req);
      const { id } = req.params as { id: string };
      const { syncEnabled } = req.body as { syncEnabled: boolean };
      return toggleSync(tenantId, id, syncEnabled);
    },
  );

  // List external (Google) calendars for the picker in the UI.
  app.get(
    "/calendar-connections/google/calendars",
    { preHandler: authenticate },
    async (req) => {
      const { tenantId } = requireAuth(req);
      const { calendarId } = req.query as { calendarId?: string };
      if (!calendarId) {
        return { calendars: [] };
      }
      return { calendars: await listExternalCalendars(tenantId, calendarId) };
    },
  );
}
