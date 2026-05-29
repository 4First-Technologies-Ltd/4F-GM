import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

declare const Deno: { env: { get(key: string): string | undefined } }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { email, name } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const firstName = name ? name.trim().split(' ')[0] : 'there'
    const unsubscribeUrl = 'https://4f-gas-monitor.4firsttechnologieslimited.workers.dev/unsubscribe.html?email=' + encodeURIComponent(email)

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('RESEND_API_KEY not set')
      return new Response(JSON.stringify({ error: 'email service not configured' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the waitlist!</title>
</head>
<body style="margin:0;padding:0;background:#EDF7ED;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF7ED;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #E0EEE0;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#2D7450;padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-block;">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;vertical-align:middle;">
                    <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">4FG Monitor</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#1A2E1A;letter-spacing:-0.5px;">
                You're on the list, ${firstName}!
              </h1>
              <p style="margin:0 0 20px;font-size:16px;color:#7A9A7A;line-height:1.65;">
                Thanks for joining the 4FG Smart Gas Monitor waitlist. You're now among the first to know when we launch.
              </p>

              <!-- Highlight box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#E8F5E8;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#2D7450;">
                      What you get as an early member
                    </p>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding:5px 0;font-size:14px;color:#1A2E1A;">
                          &#10003;&nbsp; <strong>Priority access</strong> before public launch
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:14px;color:#1A2E1A;">
                          &#10003;&nbsp; <strong>Exclusive launch discount</strong> on hardware
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;font-size:14px;color:#1A2E1A;">
                          &#10003;&nbsp; <strong>Early access</strong> to the 4FG mobile app
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:#1A2E1A;line-height:1.65;">
                We're putting the finishing touches on the sensor and app. We'll email you the moment early access opens — no spam, we promise.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#2D7450;border-radius:8px;">
                    <a href="https://4f-gas-monitor.4firsttechnologieslimited.workers.dev/" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Visit the Website &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#7A9A7A;line-height:1.6;">
                Questions? Reply to this email or reach us at
                <a href="mailto:4firsttechnologieslimited@gmail.com" style="color:#2D7450;text-decoration:none;">4firsttechnologieslimited@gmail.com</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F5FBF5;border-top:1px solid #E0EEE0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#7A9A7A;line-height:1.6;">
                &copy; 2026 4First Technologies Ltd. &bull; You received this because you signed up at 4FG Monitor.<br>
                <a href="${unsubscribeUrl}" style="color:#2D7450;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: '4FG Monitor <4first-gasmonitor@loadrunnerl.cloud>',
        to: [email],
        subject: "You're on the 4FG Smart Gas Monitor waitlist!",
        html: emailHtml,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend error:', data)
      return new Response(JSON.stringify({ error: 'failed to send email', detail: data }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
