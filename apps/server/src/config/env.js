import dotenv from 'dotenv';
import path from 'path';
import { EnvSchema } from '@doodlr/shared';

// Load root .env or local .env
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
