/** @jest-environment node */
import { skipRepeatedLargeBodies } from '../realDataLoader';

const responseOf = (headers: Record<string, string>) => new Response('{}', { headers });

describe('skipRepeatedLargeBodies', () => {
  it('reads the first large body of a size and skips the repeats of it', () => {
    const shouldRead = skipRepeatedLargeBodies();
    const big = { 'x-upstream-content-length': '8503954' };
    expect(shouldRead(responseOf(big))).toBe(true);
    expect(shouldRead(responseOf(big))).toBe(false);
    expect(shouldRead(responseOf(big))).toBe(false);
  });

  it('reads large bodies of different sizes, and every small one', () => {
    const shouldRead = skipRepeatedLargeBodies();
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '8503954' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '537499' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '8625' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '8625' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '2000000' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '1500000' }))).toBe(true);
  });

  it('reads a body whose size is unknown or unreadable', () => {
    const shouldRead = skipRepeatedLargeBodies();
    expect(shouldRead(responseOf({}))).toBe(true);
    expect(shouldRead(responseOf({}))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': 'abc' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': 'abc' }))).toBe(true);
  });

  it('falls back to content-length, and prefers the proxy header when both are there', () => {
    const shouldRead = skipRepeatedLargeBodies();
    expect(shouldRead(responseOf({ 'content-length': '9000000' }))).toBe(true);
    expect(shouldRead(responseOf({ 'content-length': '9000000' }))).toBe(false);
    expect(
      shouldRead(
        responseOf({ 'x-upstream-content-length': '7000000', 'content-length': '9000000' })
      )
    ).toBe(true);
  });

  it('keeps separate batches separate', () => {
    const big = { 'x-upstream-content-length': '8503954' };
    expect(skipRepeatedLargeBodies()(responseOf(big))).toBe(true);
    expect(skipRepeatedLargeBodies()(responseOf(big))).toBe(true);
  });

  it('honours a different threshold', () => {
    const shouldRead = skipRepeatedLargeBodies(100);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '500' }))).toBe(true);
    expect(shouldRead(responseOf({ 'x-upstream-content-length': '500' }))).toBe(false);
  });
});
