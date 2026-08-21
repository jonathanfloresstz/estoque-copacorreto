import { Redis } from '@upstash/redis';

// Conecta ao banco de dados usando as variáveis do Upstash/Vercel
export const redis = new Redis({
  url: import.meta.env.VITE_KV_REST_API_URL || import.meta.env.VITE_UPSTASH_REDIS_REST_URL,
  token: import.meta.env.VITE_KV_REST_API_TOKEN || import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN,
});
