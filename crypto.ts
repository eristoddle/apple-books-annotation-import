// crypto.ts
import { createHash } from 'crypto';

export class CryptoUtils {
	/**
	 * Computes the SHA-256 hash of a string.
	 * @param data The string to hash.
	 * @returns A promise that resolves to the hex-encoded SHA-256 hash.
	 */
	static async generateSha256(data: string): Promise<string> {
		const hash = createHash('sha256');
		hash.update(data);
		return hash.digest('hex');
	}
}
