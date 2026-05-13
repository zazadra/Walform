/**
 * Walform E2E Encryption Layer
 * 
 * Menggunakan standar industri AES-GCM 256-bit.
 * Kunci enkripsi dihasilkan secara deterministik dari tanda tangan wallet (Sui-native E2E).
 * Ini memastikan data hanya bisa dibaca oleh pihak yang memiliki wallet Admin.
 */

export const SEAL_AVAILABLE = true;

/**
 * Menghasilkan kunci AES dari signature wallet
 */
async function deriveKey(signature: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data
 * Mengembalikan JSON string berisi { iv, ciphertext } dalam base64
 */
export async function encryptData(
  data: string,
  signature: string
): Promise<string> {
  const key = await deriveKey(signature);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const result = {
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(new Uint8Array(encrypted)).toString('base64')
  };
  
  return JSON.stringify(result);
}

/**
 * Decrypt data
 */
export async function decryptData(
  payload: string,
  signature: string
): Promise<string> {
  try {
    const { iv, ciphertext } = JSON.parse(payload);
    const key = await deriveKey(signature);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
      key,
      Buffer.from(ciphertext, 'base64')
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('[Seal] Decryption failed:', err);
    throw new Error('Failed to decrypt data. Ensure you are using the correct wallet.');
  }
}
