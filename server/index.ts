import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({
  ok: true,
  model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5',
  aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
}));

// Localhost only: the server will hold the API key.
await app.listen({ port: Number(process.env.PORT ?? 8787), host: '127.0.0.1' });
