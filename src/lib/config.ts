// Configuration and utilities

import dotenv from "dotenv";

// Ensure local .env values override any system environment variables so the
// project connects to the intended Docker Postgres instance during local dev.
dotenv.config({ override: true });

export const config = {
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4000"),
  mastraProvider: process.env.MASTRA_PROVIDER || "openai",
  mastraModel: process.env.MASTRA_MODEL || "gpt-4o",
  mastraPlaygroundPort: parseInt(process.env.MASTRA_PLAYGROUND_PORT || "4111"),
};

export function validateConfig() {
  const errors: string[] = [];

  if (!config.openaiApiKey) {
    errors.push("OPENAI_API_KEY not set in .env");
  }

  if (!config.databaseUrl) {
    errors.push("DATABASE_URL not set in .env");
  }

  if (!process.env.MASTRA_MODEL) {
    errors.push("MASTRA_MODEL not set in .env (e.g. gpt-4o)");
  }

  return errors;
}
