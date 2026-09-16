import crypto from 'crypto';

function getSecret() {
  const raw = String(process.env.API_KEY_ENCRYPTION_SECRET || '').trim();
  if (!raw) {
    throw new Error('缺少 API_KEY_ENCRYPTION_SECRET');
  }
  return raw;
}

function getKey() {
  return crypto.createHash('sha256').update(getSecret()).digest();
}

export function encryptText(plainText) {
  const text = String(plainText || '');
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptText(payload) {
  const raw = Buffer.from(String(payload || ''), 'base64');
  if (raw.length < 28) {
    throw new Error('密文格式无效');
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}
