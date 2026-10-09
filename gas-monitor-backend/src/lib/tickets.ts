import { TicketCategory, TicketChannel, TicketPriority } from '@prisma/client';
import { prisma } from './prisma';

/** Hours allowed before a first response is overdue, by priority. */
export const SLA_HOURS: Record<TicketPriority, number> = {
  URGENT: 2,
  HIGH: 8,
  NORMAL: 24,
  LOW: 72
};

export const slaDueFor = (priority: TicketPriority, from = new Date()) =>
  new Date(from.getTime() + SLA_HOURS[priority] * 60 * 60 * 1000);

/** Open a ticket with its opening message. Links the requester to an account when the email matches one. */
export async function createTicket(input: {
  subject: string;
  message: string;
  requesterName: string;
  requesterEmail: string;
  channel: TicketChannel;
  category?: TicketCategory;
  priority?: TicketPriority;
  orderId?: string | null;
}) {
  const email = input.requesterEmail.trim().toLowerCase();
  const priority = input.priority ?? 'NORMAL';
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  return prisma.ticket.create({
    data: {
      subject: input.subject,
      category: input.category ?? 'OTHER',
      priority,
      channel: input.channel,
      requesterName: input.requesterName,
      requesterEmail: email,
      requesterId: user?.id ?? null,
      orderId: input.orderId ?? null,
      slaDueAt: slaDueFor(priority),
      messages: { create: { author: 'REQUESTER', authorName: input.requesterName, body: input.message } }
    }
  });
}
