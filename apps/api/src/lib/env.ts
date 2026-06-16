import { config } from "dotenv";
import { z } from "zod";

config();

const boolFromString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),

  // Auth. In dev we allow a header-based bypass so the API boots without Clerk.
  DEV_AUTH: boolFromString.default("false"),
  CLERK_SECRET_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (!env.DEV_AUTH && !env.CLERK_SECRET_KEY) {
  console.warn(
    "⚠️  DEV_AUTH is off and CLERK_SECRET_KEY is unset — authenticated routes will reject all requests.",
  );
}
