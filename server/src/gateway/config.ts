const secret = process.env.GATEWAY_SECRET;
if (!secret) {
  throw new Error('GATEWAY_SECRET is not set. Add it to server/.env');
}
export const GATEWAY_SECRET: string = secret;