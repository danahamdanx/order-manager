import { MockGateway } from './mock.js';
import type { PaymentGateway } from './types.js';

// لما نضيف بوابة حقيقية، بنبدل هالسطر بس
export const gateway: PaymentGateway = new MockGateway();