export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

export interface CardFields {
  number: string;
  expiry: string;
  cvc: string;
  name: string;
}

export interface CardErrors {
  number?: string;
  expiry?: string;
  cvc?: string;
  name?: string;
}

export const emptyCard: CardFields = { number: '', expiry: '', cvc: '', name: '' };

export const BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  other: 'Card',
};

const LENGTHS: Record<CardBrand, number[]> = {
  visa: [13, 16, 19],
  mastercard: [16],
  amex: [15],
  discover: [16, 17, 18, 19],
  other: [13, 14, 15, 16, 17, 18, 19],
};

export const digitsOnly = (value: string) => value.replace(/\D/g, '');

export function detectBrand(digits: string): CardBrand {
  if (digits.startsWith('4')) return 'visa';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^5[1-5]/.test(digits)) return 'mastercard';
  if (digits.length >= 4) {
    const prefix = Number(digits.slice(0, 4));
    if (prefix >= 2221 && prefix <= 2720) return 'mastercard';
  }
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  return 'other';
}

// خوارزمية Luhn: بتكشف أخطاء الكتابة بالرقم (مش دليل إنه البطاقة حقيقية)
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function formatCardNumber(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 19);
  const groups = detectBrand(digits) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const parts: string[] = [];
  let i = 0;
  for (const size of groups) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  return parts.join(' ');
}

export function formatExpiry(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function validateCard(card: CardFields, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  const digits = digitsOnly(card.number);
  const brand = detectBrand(digits);

  if (!card.name.trim()) errors.name = 'Enter the name on the card';

  if (digits.length === 0) errors.number = 'Enter your card number';
  else if (!LENGTHS[brand].includes(digits.length) || !luhnValid(digits)) errors.number = 'This card number is not valid';

  const match = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
  if (!match) {
    errors.expiry = 'Use the format MM/YY';
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) errors.expiry = 'Enter a valid month (01 to 12)';
    else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      errors.expiry = 'This card has expired';
    }
  }

  const cvcLength = brand === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(card.cvc)) errors.cvc = `Enter the ${cvcLength}-digit security code`;

  return errors;
}