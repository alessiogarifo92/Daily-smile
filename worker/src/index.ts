import { handleApi, sendDue, type Env } from './app';

// Entry module: workerd accepts only handlers as exports here, so all logic lives in ./app.
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      sendDue(env).then((r) => {
        if (r.sent + r.removed + r.failed > 0) console.log('daily-smile cron', JSON.stringify(r));
      }),
    );
  },
} satisfies ExportedHandler<Env>;
