// pages/api/qb/excludes.js
// Manages an exclude list stored in a cookie

import crypto from 'crypto';

const COOKIE_NAME = 'qb_excludes';
const ENCRYPTION_KEY = (process.env.QB_CLIENT_SECRET || '').padEnd(32, '0').slice(0, 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function getExcludesFromReq(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').find(c => c.trim().startsWith(COOKIE_NAME + '='));
  if (!match) return [];
  try {
    const val = decodeURIComponent(match.split('=').slice(1).join('=').trim());
    return JSON.parse(decrypt(val));
  } catch (e) {
    return [];
  }
}

function setExcludesCookie(res, excludes) {
  const encrypted = encrypt(JSON.stringify(excludes));
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
  res.setHeader('Set-Cookie', [...arr, cookie]);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const excludes = getExcludesFromReq(req);
    return res.json({ excludes });
  }

  if (req.method === 'POST') {
    const { action, keyword } = req.body || {};
    let excludes = getExcludesFromReq(req);

    if (action === 'add' && keyword) {
      const kw = keyword.trim().toLowerCase();
      if (!excludes.includes(kw)) {
        excludes.push(kw);
      }
      setExcludesCookie(res, excludes);
      return res.json({ excludes });
    }

    if (action === 'remove' && keyword) {
      const kw = keyword.trim().toLowerCase();
      excludes = excludes.filter(e => e !== kw);
      setExcludesCookie(res, excludes);
      return res.json({ excludes });
    }

    if (action === 'set' && Array.isArray(req.body.excludes)) {
      excludes = req.body.excludes.map(e => e.trim().toLowerCase());
      setExcludesCookie(res, excludes);
      return res.json({ excludes });
    }

    return res.status(400).json({ error: 'Invalid action. Use add, remove, or set.' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
