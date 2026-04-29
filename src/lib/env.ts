import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ANTHROPIC_API_KEY: z.string().min(1),
  CISCO_TOKEN_ENDPOINT: z
    .string()
    .url()
    .default("https://id.cisco.com/oauth2/default/v1/token"),
  CISCO_API_BASE_URL: z
    .string()
    .url()
    .default("https://apix.cisco.com"),
  CISCO_API_MODE: z.enum(["mock", "live"]).default("mock"),
  CISCO_MOCK_ERROR: z
    .enum(["rate_limit", "auth_failure", "timeout", ""])
    .optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export function isMockMode(): boolean {
  return (process.env.CISCO_API_MODE || "mock") === "mock";
}

export function getMockError(): string | undefined {
  return process.env.CISCO_MOCK_ERROR || undefined;
}
