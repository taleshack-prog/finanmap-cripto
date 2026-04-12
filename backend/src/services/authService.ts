import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const SALT_ROUNDS = 12;
const SECRET = process.env.JWT_SECRET || 'dev_secret_mude_em_producao';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);

export const generateToken = (userId: string, email: string): string =>
  jwt.sign({ userId, email }, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);

export const verifyToken = (token: string): { userId: string; email: string } | null => {
  try {
    return jwt.verify(token, SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
};
