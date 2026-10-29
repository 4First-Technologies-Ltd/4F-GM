import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { paystackGateway } from '../src/lib/gateways/paystackGateway';

vi.mock('axios', async (orig) => {
  const real = await orig<typeof import('axios')>();
  return { ...real, default: { ...real.default, get: vi.fn(), post: vi.fn() } };
});

const get = axios.get as unknown as ReturnType<typeof vi.fn>;
const reply = (data: object) => get.mockResolvedValue({ data: { data } });

describe('paystackGateway.verify amount check', () => {
  beforeEach(() => get.mockReset());

  it('accepts the exact order total', async () => {
    reply({ status: 'success', amount: 10000, fees: 153 });
    expect((await paystackGateway.verify('r', 100)).state).toBe('paid');
  });

  it('accepts the total plus the fee the customer carried', async () => {
    reply({ status: 'success', amount: 10153, fees: 153 });
    expect((await paystackGateway.verify('r', 100)).state).toBe('paid');
  });

  it('rejects any other difference', async () => {
    reply({ status: 'success', amount: 10200, fees: 153 });
    expect((await paystackGateway.verify('r', 100)).state).toBe('amount_mismatch');
    reply({ status: 'success', amount: 9000, fees: 0 });
    expect((await paystackGateway.verify('r', 100)).state).toBe('amount_mismatch');
  });
});
