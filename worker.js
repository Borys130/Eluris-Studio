export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/kontakt' && request.method === 'POST') {
      return handleKontakt(request, env);
    }

    if (url.pathname === '/api/opinie' && request.method === 'GET') {
      return handleOpinie(request, env, ctx);
    }

    // Wszystko inne → statyczne pliki (index.html, css, foto itd.)
    return env.ASSETS.fetch(request);
  },
};

// Pobiera ocenę i liczbę opinii z Google Maps (Places API).
// Wynik jest cache'owany na 6 h — Google odpytywane jest najwyżej kilka razy
// dziennie, niezależnie od ruchu na stronie (oszczędność limitu i szybkość).
async function handleOpinie(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request('https://eluris.internal/opinie');

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: 'ELURIS STUDIO Gabinet Kosmetyczny, ul. 3 Maja 36, Rawicz',
      languageCode: 'pl',
    }),
  });

  if (!res.ok) {
    console.error('Places error:', res.status, await res.text());
    return json({ ok: false }, 502);
  }

  const data = await res.json();
  const place = data.places && data.places[0];
  if (!place) return json({ ok: false }, 404);

  const response = new Response(
    JSON.stringify({
      ok: true,
      rating: place.rating ?? null,
      count: place.userRatingCount ?? null,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=21600',
      },
    }
  );

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleKontakt(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const { name, email, phone, service, message } = data;

  if (!name || !email || !message) {
    return json({ ok: false, error: 'Brakujące pola' }, 400);
  }

  const html = `
    <p><strong>Imię i nazwisko:</strong> ${esc(name)}</p>
    ${phone ? `<p><strong>Telefon:</strong> ${esc(phone)}</p>` : ''}
    <p><strong>E-mail:</strong> ${esc(email)}</p>
    ${service ? `<p><strong>Interesuje mnie:</strong> ${esc(service)}</p>` : ''}
    <p><strong>Wiadomość:</strong></p>
    <p style="white-space:pre-line">${esc(message)}</p>
    <hr>
    <p style="color:#888;font-size:12px">Formularz kontaktowy — Eluris Studio, Rawicz</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Eluris Studio <onboarding@resend.dev>',
      to: ['borrys.spiaczka@gmail.com'],
      reply_to: email,
      subject: `Nowa wiadomość od ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', res.status, err);
    return json({ ok: false }, 500);
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
