import { describe, expect, it } from 'vitest';
import { failureMessage, outcomeNotice } from './payments';

describe('failureMessage', () => {
  it('explains known reasons and falls back for unknown ones', () => {
    expect(failureMessage('card_declined')).toMatch(/declined/);
    expect(failureMessage('insufficient_funds')).toMatch(/insufficient/);
    expect(failureMessage('something_new')).toMatch(/could not be completed/);
    expect(failureMessage(null)).toMatch(/could not be completed/);
  });
});

describe('outcomeNotice', () => {
  it('tells the customer what to do next', () => {
    expect(outcomeNotice(null)).toMatch(/try again/);
    expect(outcomeNotice({ kind: 'invalid', message: 'The card has expired.' })).toMatch(/expired.*try again/);
    expect(outcomeNotice({ kind: 'pending', message: 'x' })).toMatch(/waiting/);
  });
});