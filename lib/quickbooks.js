// lib/quickbooks.js
// QuickBooks Online API helper — OAuth2, token refresh, and data queries
// Uses encrypted cookies for token persistence across Vercel serverless invocations

const crypto = require('crypto');

const QBO_BASE = process.env.QB_SANDBOX === 'true'
  ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
  : 'https://quickbooks.api.intuit.com/v3/company';
const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPES = 'com.intuit.quickbooks.accounting';
const COOKIE_NAME = 'qb_tokens';

// ---------------------------------------------------------------------------
// Encryption helpers — encrypt tokens before storing in cookie
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Cookie-based token storage
// ---------------------------------------------------------------------------

function getTokensFromReq(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').find(c => c.trim().startsWith(COOKIE_NAME + '='));
  if (!match) return null;
  try {
    const val = decodeURIComponent(match.split('=').slice(1).join('=').trim());
    const decrypted = decrypt(val);
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function setTokenCookie(res, tokens) {
  const encrypted = encrypt(JSON.stringify(tokens));
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(encrypted)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
  res.setHeader('Set-Cookie', [...arr, cookie]);
}

function clearTokenCookie(res) {
  const cookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  res.setHeader('Set-Cookie', cookie);
}

// ---------------------------------------------------------------------------
// OAuth2 helpers
// ---------------------------------------------------------------------------

function getAuthUrl(state = 'random_state') {
  const params = new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID,
    redirect_uri: process.env.QB_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const basicAuth = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64');

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QB_REDIRECT_URI,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await r.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(tokens) {
  const basicAuth = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64');

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await r.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getValidTokens(req, res) {
  let tokens = getTokensFromReq(req);
  if (!tokens || !tokens.accessToken) {
    throw new Error('NO_TOKEN');
  }
  if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
    tokens = await refreshAccessToken(tokens);
    setTokenCookie(res, tokens);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// QBO Query helper
// ---------------------------------------------------------------------------

async function qboQuery(query, tokens, req, res) {
  const realmId = tokens.realmId || process.env.QB_REALM_ID;
  const url = `${QBO_BASE}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;

  let r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (r.status === 401) {
    tokens = await refreshAccessToken(tokens);
    setTokenCookie(res, tokens);
    r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`QBO query failed after refresh: ${r.status} — ${err}`);
    }
    return { data: await r.json(), tokens };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`QBO query failed: ${r.status} — ${err}`);
  }

  return { data: await r.json(), tokens };
}

async function qboQueryAll(baseQuery, tokens, req, res) {
  let startPosition = 1;
  const pageSize = 1000;
  let allResults = [];

  while (true) {
    const pagedQuery = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const result = await qboQuery(pagedQuery, tokens, req, res);
    tokens = result.tokens;
    const response = result.data.QueryResponse;
    const entityKey = Object.keys(response).find((k) => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount');

    if (!entityKey || !response[entityKey] || response[entityKey].length === 0) break;

    allResults = allResults.concat(response[entityKey]);

    if (response[entityKey].length < pageSize) break;
    startPosition += pageSize;
  }

  return allResults;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidTokens,
  getTokensFromReq,
  setTokenCookie,
  clearTokenCookie,
  qboQuery,
  qboQueryAll,
};
