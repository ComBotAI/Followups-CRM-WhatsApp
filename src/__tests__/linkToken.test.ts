import { linkToken } from '@/lib/linkToken';

describe('linkToken', () => {
  const token = 'U2FsdGVkX18JBGzbxCUYVVzwcieou2cq76o9HkuCPZ4hgNX19+8Q3qj3qvYORup';

  it('keeps a path token as issued', () => {
    expect(linkToken(token)).toBe(token);
  });

  it('rejoins a base64 token split on "/" by a catch-all route', () => {
    expect(linkToken(['abc+de', 'fg=='])).toBe('abc+de/fg==');
  });

  it('puts back a "+" a query string turned into a space', () => {
    expect(linkToken(token.replace('+', ' '))).toBe(token);
  });

  it('is empty without a token', () => {
    expect(linkToken(undefined)).toBe('');
  });
});
