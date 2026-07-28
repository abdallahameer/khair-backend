// helpers/password.ts

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function fromHex(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

const ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(16));

	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);

	const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);

	return { hash: toHex(new Uint8Array(derivedBits)), salt: toHex(salt) };
}

export async function verifyPassword(password: string, hash: string, saltHex: string): Promise<boolean> {
	const salt = fromHex(saltHex);

	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);

	const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, keyMaterial, 256);

	return toHex(new Uint8Array(derivedBits)) === hash;
}
