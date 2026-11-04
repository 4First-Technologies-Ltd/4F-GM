import axios from 'axios';
import { prisma } from './prisma';

/**
 * Expo push delivery, shared by admin broadcasts and device alerts.
 * Best effort by design: callers keep their own durable record (the in-app
 * notification), so a push outage never loses a message.
 */

const PUSH_BATCH = 100;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/** Sends to each token. Returns how many the Expo service accepted. Never throws. */
export async function sendExpoPush(
  tokens: { token: string }[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  tag = 'push',
): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < tokens.length; i += PUSH_BATCH) {
    const batch = tokens.slice(i, i + PUSH_BATCH);
    try {
      const { data: res } = await axios.post<{ data: ExpoTicket[] }>(
        EXPO_PUSH_URL,
        // channelId matches the channel the app creates; high priority wakes a dozing Android phone.
        batch.map((t) => ({ to: t.token, title, body, sound: 'default', channelId: 'default', priority: 'high', data })),
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          timeout: 15_000,
        },
      );
      const dead: string[] = [];
      res.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') accepted += 1;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[idx].token);
        // Anything else (e.g. InvalidCredentials = the FCM key is missing in Expo) used to vanish silently.
        else console.error(`[${tag}] Expo rejected a push:`, ticket.details?.error ?? 'unknown error');
      });
      // The app was uninstalled: stop sending to that token.
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    } catch (err) {
      console.error(`[${tag}] Expo push failed:`, err instanceof Error ? err.message : err);
    }
  }
  return accepted;
}
