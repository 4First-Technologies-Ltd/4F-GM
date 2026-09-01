import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return Response.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const result = await resend.emails.send({
      from: 'noreply@notifications.4fgmonitor.com',
      to: '4firsttechnologieslimited@gmail.com',
      replyTo: email,
      subject: 'New App Launch Notification Signup',
      html: `
        <h2>New Subscriber</h2>
        <p>Email: <strong>${email}</strong></p>
        <p>This user wants to be notified when the app launches.</p>
      `,
    });

    if (result.error) {
      return Response.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    return Response.json(
      { success: true, message: 'Subscribed successfully!' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Subscription error:', error);
    return Response.json(
      { error: 'Failed to process subscription' },
      { status: 500 }
    );
  }
}
