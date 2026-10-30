import { describe, it, expect } from 'vitest';
import { createToken, verifyToken, hashPassword, verifyPassword, periodDates, currentPeriodStart, today } from '../netlify/functions/_utils.mjs';

describe('today()', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('JWT', () => {
  it('sign then verify returns userId', () => {
    const token = createToken('user123');
    const payload = verifyToken(token);
    expect(payload.userId).toBe('user123');
  });

  it('tampered signature throws', () => {
    const token = createToken('user1');
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -2) + 'xx';
    expect(() => verifyToken(parts.join('.'))).toThrow('Invalid token');
  });

  it('tampered body throws', () => {
    const token = createToken('user1');
    const parts = token.split('.');
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    body.userId = 'hacker';
    parts[1] = Buffer.from(JSON.stringify(body)).toString('base64url');
    expect(() => verifyToken(parts.join('.'))).toThrow('Invalid token');
  });

  it('expired token throws', () => {
    const token = createToken('user1', -1); // expired yesterday
    expect(() => verifyToken(token)).toThrow('Token expired');
  });

  it('wrong-length signature throws Invalid token, not TypeError', () => {
    const token = createToken('user1');
    const parts = token.split('.');
    parts[2] = 'tooshort'; // shorter than the 43-char base64url HMAC-SHA256 sig
    expect(() => verifyToken(parts.join('.'))).toThrow('Invalid token');
  });

  it('longer-than-expected signature throws Invalid token, not TypeError', () => {
    const token = createToken('user1');
    const parts = token.split('.');
    parts[2] = parts[2] + 'AAAAAAAAAA'; // longer than expected
    expect(() => verifyToken(parts.join('.'))).toThrow('Invalid token');
  });

  it('malformed token throws', () => {
    expect(() => verifyToken('not.a.valid.token.parts')).toThrow();
    expect(() => verifyToken('')).toThrow('No token');
  });
});

describe('password hash/verify', () => {
  it('roundtrip succeeds', () => {
    const { hash, salt } = hashPassword('secret123');
    expect(verifyPassword('secret123', hash, salt)).toBe(true);
  });

  it('wrong password returns false, does not throw', () => {
    const { hash, salt } = hashPassword('correct');
    expect(() => verifyPassword('wrong', hash, salt)).not.toThrow();
    expect(verifyPassword('wrong', hash, salt)).toBe(false);
  });


  it('different salts produce different hashes', () => {
    const a = hashPassword('same');
    const b = hashPassword('same');
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });
});

describe('periodDates()', () => {
  it('1w returns 7 dates', () => {
    const dates = periodDates('1w', '2024-01-01');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2024-01-01');
    expect(dates[6]).toBe('2024-01-07');
  });

  it('1m returns 30 dates', () => {
    expect(periodDates('1m', '2024-01-01')).toHaveLength(30);
  });
});

describe('currentPeriodStart()', () => {
  it('returns activatedAt date when in first period', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const activatedAt = yesterday.toISOString();
    const start = currentPeriodStart('1w', activatedAt);
    expect(start).toBe(yesterday.toISOString().split('T')[0]);
  });

  it('advances to next period after period length elapses', () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const start = currentPeriodStart('1w', tenDaysAgo.toISOString());
    const expected = new Date(tenDaysAgo);
    expected.setDate(expected.getDate() + 7);
    expect(start).toBe(expected.toISOString().split('T')[0]);
  });
});
