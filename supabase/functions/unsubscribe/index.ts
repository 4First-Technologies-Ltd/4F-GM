import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: { env: { get(key: string): string | undefined } }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })


/** HMAC of the email, so only links we sent can remove an address. */
export async function unsubscribeToken(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email.toLowerCase()))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

    const params = new URL(req.url).searchParams
    const email = params.get('email')
    const token = params.get('token') ?? ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid or missing email.' }, 400)
    }

    const secret = Deno.env.get('UNSUBSCRIBE_SECRET')
    if (!secret) return json({ error: 'Unsubscribe is not configured.' }, 500)
    const expected = await unsubscribeToken(email, secret)
    // Constant-time comparison of equal-length hex strings.
    let diff = expected.length ^ token.length
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (token.charCodeAt(i) || 0)
    if (diff !== 0) return json({ error: 'This unsubscribe link is invalid. Contact us to be removed manually.' }, 403)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await db.from('waitlist').delete().eq('email', email)

    if (error) {
      console.error('Unsubscribe error:', error)
      return json({ error: 'Failed to remove email. Please try again.' }, 500)
    }

    return json({ ok: true })
  },
}
