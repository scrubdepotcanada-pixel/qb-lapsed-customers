// lib/quickbooks.js
// QuickBooks Online API helper — OAuth2, token refresh, and data queries


const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPES = 'com.intuit.quickbooks.accounting';

// ---------------------------------------------------------------------------
// In-memory token store. In production you'd persist these to a DB/KV store.
// For a single-user internal tool this works fine — tokens survive as long as
// the serverless function stays warm. On cold start you re-auth once.
// ---------------------------------------------------------------------------
let tokenStore = {
  accessToken: process.env.QB_ACCESS_TOKEN || '',
  refreshToken: process.env.QB_REFRESH_TOKEN || '',
  expiresAt: 0,
};

function getTokenStore() {
  return tokenStore;
}

function setTokenStore(data) {
  tokenStore = { ...tokenStore, ...data };
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

  const res = await fetch(TOKEN_URL, {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  setTokenStore({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data;
}

async function refreshAccessToken() {
  const basicAuth = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenStore.refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json();
  setTokenStore({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data;
}

async function getValidToken() {
  if (!tokenStore.accessToken) {
    throw new Error('NO_TOKEN');
  }
  // Refresh if token expires in < 5 minutes
  if (Date.now() > tokenStore.expiresAt - 5 * 60 * 1000) {
    await refreshAccessToken();
  }
  return tokenStore.accessToken;
}

// ---------------------------------------------------------------------------
// QBO Query helper
// ---------------------------------------------------------------------------

async function qboQuery(query) {
  const token = await getValidToken();
  const realmId = process.env.QB_REALM_ID;
  const url = `${QBO_BASE}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=65`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 401) {
    // Try one refresh
    await refreshAccessToken();
    const retryToken = tokenStore.accessToken;
    const retry = await fetch(url, {
      headers: {
        Authorization: `Bearer ${retryToken}`,
        Accept: 'application/json',
      },
    });
    if (!retry.ok) throw new Error(`QBO query failed after refresh: ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO query failed: ${res.status} — ${err}`);
  }

  return res.json();
}

// Paginated query — QBO limits to 1000 results per request
async function qboQueryAll(baseQuery) {
  let startPosition = 1;
  const pageSize = 1000;
  let allResults = [];

  while (true) {
    const pagedQuery = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
    const data = await qboQuery(pagedQuery);
    const response = data.QueryResponse;
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
  getValidToken,
  getTokenStore,
  setTokenStore,
  qboQuery,
  qboQueryAll,
};
