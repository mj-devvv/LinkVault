// Supabase Edge Function: fetch-metadata. Deploy with `supabase functions deploy fetch-metadata`.
// Runs server-side (no browser CORS limits). JWT verification is on by default, so only signed-in users can call it.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });
const PRIVATE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe80)/i;

/** SSRF guard: only http(s), and every resolved address must be public. */
async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol) || /^(localhost|.*\.(local|internal))$/i.test(u.hostname)) throw new Error('blocked');
  const ips = [...(await Deno.resolveDns(u.hostname, 'A').catch(() => [])), ...(await Deno.resolveDns(u.hostname, 'AAAA').catch(() => []))];
  if (!ips.length || ips.some((ip) => PRIVATE.test(ip))) throw new Error('blocked');
}
const clean = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    let u = new URL((await req.json()).url), res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) { // follow a few redirects, re-checking each hop
      await assertPublic(u);
      res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'LinkVaultBot/1.0', Accept: 'text/html' } });
      const next = res.headers.get('location');
      if (res.status < 300 || res.status > 399 || !next) break;
      u = new URL(next, u);
    }
    if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return json({ title: null });
    const html = (await res.text()).slice(0, 300_000);
    const t = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return json({ title: t ? clean(t).slice(0, 200) : null });
  } catch { return json({ title: null }); }
});
