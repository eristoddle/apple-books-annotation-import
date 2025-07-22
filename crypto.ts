// crypto.ts
import { webcrypto } from 'crypto';

export class CryptoUtils {
	/**
	 * Computes the SHA-256 hash of a string.
	 * @param data The string to hash.
	 * @returns A promise that resolves to the hex-encoded SHA-256 hash.
	 */
	static async generateSha256(data: string): Promise<string> {
		const encoder = new TextEncoder();
		const buffer = encoder.encode(data);
		const hashBuffer = await webcrypto.subtle.digest('SHA-256', buffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		return hashHex;
	}
}
