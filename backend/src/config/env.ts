import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_INDEX: z.string().default("quill"),
  PINECONE_CLOUD: z.enum(["aws", "gcp", "azure"]).default("aws"),
  PINECONE_REGION: z.string().default("us-east-1"),
  METRICS_USERNAME: z.string().optional().default(""),
  METRICS_PASSWORD: z.string().optional().default(""),
  // Virus scanning (ClamAV)
  CLAMAV_BINARY_PATH: z.string().optional().default("/usr/bin/clamscan"),
  CLAMAV_SOCKET: z.string().optional().default(""),
  CLAMAV_HOST: z.string().optional().default(""),
  CLAMAV_PORT: z.coerce.number().optional().default(3310),
  // Cloudflare R2 Object Storage (S3-compatible)
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET_NAME: z.string().optional().default("quill"),
});

export type Env = z.infer<typeof EnvSchema>;

/** Config is validated like input — the process refuses to boot on a typo. */
export function loadEnv(overrides: Partial<Env> = {}): Env {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isDemoMode = env.GEMINI_API_KEY.length === 0;
