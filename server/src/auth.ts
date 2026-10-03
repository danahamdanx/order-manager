import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { Role } from './db.js';

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET is not set. Add it to server/.env');
}
export const JWT_SECRET: string = secret;

export interface AuthUser {
  user_id: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET) as jwt.JwtPayload;
    if (!decoded.user_id || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    req.user = { user_id: decoded.user_id, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const authorizeRoles = (...allowed: Role[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};