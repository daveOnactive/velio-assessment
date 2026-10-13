import crypto from 'node:crypto';

export class InviteService {
  generateCode() {
    return crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  }
}
