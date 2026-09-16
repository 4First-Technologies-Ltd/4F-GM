import { prisma } from './prisma';

/** The PlatformSettings singleton, created with schema defaults on first read. */
export async function getOrCreateSettings() {
  return prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });
}
