// crypto.ts
import * as crypto from 'crypto';

export class CryptoUtils {
  static generateSha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
