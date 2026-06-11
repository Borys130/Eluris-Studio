export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/kontakt' && request.method === 'POST') {
      return handleKontakt(request, env);
    }

    // Wszystko inne → statyczne pliki (index.html, css, foto itd.)
    return env.ASSETS.fetch(request);
  },
};

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
      to: ['szymon.ptaszysko@gmail.com'],
      reply_to: email,
      subject: `Nowa wiadomość od ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', res.status, err);
    // Zwracamy szczegóły błędu tymczasowo — do usunięcia po debugowaniu
    return json({ ok: false, debug: `Resend ${res.status}: ${err}` }, 500);
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
