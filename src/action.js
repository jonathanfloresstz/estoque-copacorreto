'use server';

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function buscarEstoque() {
  try {
    const dados = await redis.get('estoque_copa_limpeza');
    return dados || [];
  } catch (error) {
    console.error('Erro ao buscar estoque:', error);
    throw new Error('Falha ao carregar dados.');
  }
}

export async function salvarEstoqueNaNuvem(novoEstoque) {
  try {
    await redis.set('estoque_copa_limpeza', novoEstoque);
    return { success: true };
  } catch (error) {
    console.error('Erro ao salvar estoque:', error);
    throw new Error('Falha ao salvar dados.');
  }
}
