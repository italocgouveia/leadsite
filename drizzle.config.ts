import { loadEnvConfig } from "@next/env";
import type { Config } from "drizzle-kit";

// O drizzle-kit roda fora do Next, então não enxerga o .env.local sozinho.
// `loadEnvConfig` é o mesmo carregador que o Next usa — respeita a precedência
// entre .env, .env.local e .env.production.
loadEnvConfig(process.cwd());

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
