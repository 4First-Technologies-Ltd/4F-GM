/**
 * Create device records and their credentials (factory step).
 *
 *   npm run device:provision -- --id FG-2026-0001
 *   npm run device:provision -- --prefix FG-2026- --count 20 --start 1
 *
 * Without --confirm this is a DRY RUN: it shows which database it would write to
 * and which ids it would create, and writes nothing.
 *
 * Output is CSV on stdout: deviceId,secret,claimCode. The secret and the claim
 * code are shown ONCE. Only their hashes are stored, so they cannot be recovered.
 * Redirect to a file that goes to the flashing station, then delete it:
 *   npm run device:provision -- --prefix FG-2026- --count 20 --confirm > batch.csv
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { prisma } from '../src/lib/prisma';
import { generateClaimCode, generateDeviceSecret, hashClaimCode, hashDeviceSecret } from '../src/lib/deviceAuth';
import { DEFAULT_DEVICE_CONFIG, isValidDeviceId } from '../src/lib/deviceProtocol';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    prefix: { type: 'string' },
    count: { type: 'string' },
    start: { type: 'string', default: '1' },
    confirm: { type: 'boolean', default: false },
  },
});

function target(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(DATABASE_URL not set or unreadable)';
  }
}

async function main() {
  const ids: string[] = [];
  if (values.id) ids.push(values.id);
  else if (values.prefix && values.count) {
    const n = Number(values.count);
    const s = Number(values.start);
    if (!Number.isInteger(n) || n < 1 || n > 1000 || !Number.isInteger(s) || s < 0) throw new Error('--count must be 1..1000 and --start a non-negative integer');
    for (let i = 0; i < n; i++) ids.push(`${values.prefix}${String(s + i).padStart(4, '0')}`);
  } else {
    throw new Error('Give --id <id>, or --prefix <prefix> --count <n> [--start <n>]');
  }
  const bad = ids.filter((i) => !isValidDeviceId(i));
  if (bad.length) throw new Error(`Invalid device id(s): ${bad.slice(0, 5).join(', ')} (3-32 chars: letters, digits, hyphen; must start with a letter or digit)`);

  console.error(`Database: ${target()}`);
  const existing = new Set((await prisma.device.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((d) => d.id));
  const fresh = ids.filter((i) => !existing.has(i));
  if (existing.size) console.error(`Skipping ${existing.size} that already exist: ${[...existing].slice(0, 5).join(', ')}${existing.size > 5 ? ', ...' : ''}`);
  console.error(`${values.confirm ? 'Creating' : 'DRY RUN, would create'} ${fresh.length} device(s)`);
  if (!values.confirm) {
    console.error('Nothing written. Add --confirm to create them.');
    return;
  }

  console.log('deviceId,secret,claimCode');
  for (const id of fresh) {
    const secret = generateDeviceSecret();
    const claimCode = generateClaimCode();
    await prisma.device.create({
      data: {
        id,
        secretHash: hashDeviceSecret(secret),
        claimCodeHash: hashClaimCode(claimCode),
        config: { create: { version: 1, desired: DEFAULT_DEVICE_CONFIG } },
        state: { create: {} },
      },
    });
    console.log(`${id},${secret},${claimCode}`);
  }
  console.error('Done. The secrets above are not stored anywhere; keep the CSV safe and delete it after flashing.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
