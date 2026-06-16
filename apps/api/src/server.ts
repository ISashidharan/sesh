import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { ZodError } from "zod";
import "./lib/context.js"; // registers Fastify request augmentation
import { env } from "./lib/env.js";
import { HttpError } from "./lib/errors.js";
import { prisma } from "./lib/prisma.js";
import { calendarConnectionRoutes } from "./modules/calendar-connections.js";
import { calendarRoutes } from "./modules/calendars.js";
import { healthRoutes } from "./modules/health.js";
import { publicRoutes } from "./modules/public.js";
import { seshRoutes } from "./modules/seshes.js";
import { seshTypeRoutes } from "./modules/sesh-types.js";
import { tenantRoutes } from "./modules/tenants.js";
import { workingHoursRoutes } from "./modules/working-hours.js";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  app.register(cors, {
    origin: env.WEB_ORIGIN === "*" ? true : env.WEB_ORIGIN.split(","),
    credentials: true,
  });

  // ---- Global error handler ------------------------------------------------
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "ValidationError",
        message: "Request validation failed",
        details: error.flatten(),
      });
      return;
    }

    if (error instanceof HttpError) {
      reply
        .code(error.statusCode)
        .send({ error: error.name, message: error.message, details: error.details });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation → 409.
      if (error.code === "P2002") {
        reply
          .code(409)
          .send({ error: "Conflict", message: "Resource already exists" });
        return;
      }
      if (error.code === "P2025") {
        reply.code(404).send({ error: "NotFound", message: "Resource not found" });
        return;
      }
    }

    req.log.error(error);
    reply
      .code(500)
      .send({ error: "InternalServerError", message: "Something went wrong" });
  });

  // ---- Routes --------------------------------------------------------------
  app.register(healthRoutes);
  app.register(tenantRoutes);
  app.register(calendarRoutes);
  app.register(workingHoursRoutes);
  app.register(seshTypeRoutes);
  app.register(seshRoutes);
  app.register(publicRoutes);
  app.register(calendarConnectionRoutes);

  return app;
}

async function main() {
  const app = buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
