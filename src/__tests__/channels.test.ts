import { channelState, claimSignupReturn, parseSignupReturn, type Channel } from '@/services/crm/channels';

const channel = (over: Partial<Channel> & { registration?: 'pending' | 'completed'; category?: string }): Channel =>
  ({
    id: 'c1',
    active: true,
    basic_details: { name: 'Sales', color_code: '#25D366', channel_identity: '919812345678' },
    meta: { category: over.category ?? 'whatsapp' },
    cloud: { wa_biz_registration: over.registration ?? 'completed' },
    wallet: { balance: 0, currency: 'INR' },
    ...over,
  }) as unknown as Channel;

describe('channel signup return', () => {
  it('reads the outcome off the return URL params', () => {
    expect(parseSignupReturn({ status: 'ready', token: 'abc', numbers: '1', from: 'x' })).toMatchObject({ status: 'ready', token: 'abc', numbers: '1' });
    expect(parseSignupReturn({ status: 'error', code: 'quota_exceeded', message: 'No room' })).toMatchObject({ status: 'error', code: 'quota_exceeded' });
    expect(parseSignupReturn({ status: ['select'], token: ['t2'] })).toMatchObject({ status: 'select', token: 't2' });
  });

  it('ignores anything that is not a signup outcome', () => {
    expect(parseSignupReturn({})).toBeNull();
    expect(parseSignupReturn({ status: 'done' })).toBeNull();
  });

  it('handles each return once, whichever way it arrives first', () => {
    const ret = parseSignupReturn({ status: 'ready', token: 'once' })!;
    expect(claimSignupReturn(ret)).toBe(true);
    expect(claimSignupReturn({ ...ret })).toBe(false);
  });
});

describe('channel state', () => {
  it('flags a WhatsApp number that still needs registering', () => {
    expect(channelState(channel({ registration: 'pending', active: false }))).toBe('setup');
    expect(channelState(channel({}))).toBe('live');
    expect(channelState(channel({ active: false }))).toBe('off');
    expect(channelState(channel({ category: 'sms', registration: 'pending' }))).toBe('live');
  });
});
