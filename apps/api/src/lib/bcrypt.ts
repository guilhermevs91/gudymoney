import bcrypt from 'bcrypt';

const ROUNDS = 12;

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, ROUNDS);

export const comparePassword = (
  password: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(password, hash);
