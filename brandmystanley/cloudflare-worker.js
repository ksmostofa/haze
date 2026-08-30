// Dedicated preview worker; does not touch the production HAZE worker.
const SOURCE = 'https://raw.githubusercontent.com/ksmostofa/haze/brandmystanley-live/brandmystanley/index.html';

export default {
  async fetch() {
    const upstream = await fetch(SOURCE, {
      headers: { 'user-agent': 'BrandMyStanleyPreview/1.0' },
      cf: { cacheTtl: 60, cacheEverything: true },
    });

    if (!upstream.ok) {
      return new Response('Preview source unavailable', { status: 502 });
    }

    const html = await upstream.text();
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'cache-control': 'public, max-age=60',
        'x-content-type-options': 'nosniff',
      },
    });
  },
};
