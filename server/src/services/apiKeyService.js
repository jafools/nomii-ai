/**
 * NOMII AI — API Key Encryption Service
 *
 * Encrypts/decrypts tenant API keys using AES-256-GCM.
 * Keys are stored as base64 in the DB, never in plaintext.
 *
 * Encryption key is derived from API_KEY_ENCRYPTION_SECRET env var.
 * If not set, falls back to JWT_SECRET (not ideal for production).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // AES-256

function getEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'nomii-dev-encryption-key';
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt an API key.
 * @returns {{ encrypted: string, iv: string }} base64-encoded ciphertext and IV
 */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return {
    encrypted: encrypted + ':' + authTag,
    iv: iv.toString('base64'),
  };
}

/**
 * Decrypt an API key.
 * @param {string} encryptedWithTag - base64 encrypted data with auth tag (separated by ':')
 * @param {string} ivBase64 - base64 IV
 * @returns {string} plaintext API key
 */
function decrypt(encryptedWithTag, ivBase64) {
  const [encryptedData, authTag] = encryptedWithTag.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Get the last 4 characters of a key for display.
 */
function getLast4(apiKey) {
  return apiKey.slice(-4);
}

module.exports = { encrypt, decrypt, getLast4 };
