import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

// Custom authentication: a random, expiring, single-use invitation must pass
// a service-only database check before an account can be created.
// No account creation emails are sent. Existing account passwords are never changed.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowed = origin === 'https://proway-pedidos.netlify.app' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': allowed ? origin : 'https://proway-pedidos.netlify.app',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Vary': 'Origin' };
  const reply = (data: object, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST' || (origin && !allowed)) return reply({ error: 'Solicitud no permitida.' }, 403);
  try {
    const raw = await req.text(); if (raw.length > 6000) return reply({ error: 'Solicitud demasiado grande.' }, 413);
    const body = JSON.parse(raw);
    const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || ''), token = String(body.token || '');
    const name = String(body.name || '').trim().slice(0,200);
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length>254 || password.length<12 || password.length>200 || !name)
      return reply({ error: 'Escribe tu nombre, correo y una contraseña de al menos 12 caracteres. Abre una invitación válida.' }, 400);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: check, error: checkError } = await client.rpc('proway_signup_check', { token, email });
    if (checkError) return reply({ error: 'La invitación no es válida, venció o ya se utilizó.' }, 403);
    if (check.existing) return reply({ existing: true, message: 'Ya existe una cuenta con este correo. Entra con tu contraseña actual para aceptar la invitación.' });
    const { error } = await client.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { display_name: name }, app_metadata: { proway_created: true } });
    if (error) return reply({ error: 'No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión si ya tienes cuenta.' }, 400);
    return reply({ created: true });
  } catch { return reply({ error: 'No se pudo completar la solicitud.' }, 400); }
});
