// pages/api/qb/debug.js
import { getValidToken, getTokenStore } from '../../../lib/quickbooks';

export default async function handler(req, res) {
  const store = getTokenStore();
  const realmId = process.env.QB_REALM_ID;
  const sandbox = process.env.QB_SANDBOX;
  const baseUrl = sandbox === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
    : 'https://quickbooks.api.intuit.com/v3/company';

  const debug = {
    realmId,
    sandbox,
    baseUrl,
    hasAccessToken: !!store.accessToken,
    hasRefreshToken: !!store.refreshToken,
    tokenExpiresAt: store.expiresAt ? new Date(store.expiresAt).toISOString() : null,
    tokenExpired: store.expiresAt ? Date.now() > store.expiresAt : true,
    redirectUri: process.env.QB_REDIRECT_URI,
    clientIdPrefix: process.env.QB_CLIENT_ID ? process.env.QB_CLIENT_ID.substring(0, 10) + '...' : 'NOT SET',
  };

  // Try a simple API call
  if (store.accessToken) {
    try {
      const token = await getValidToken();
      const url = `${baseUrl}/${realmId}/companyinfo/${realmId}?minorversion=65`;
      const apiRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      const body = await apiRes.text();
      debug.apiTest = {
        status: apiRes.status,
        statusText: apiRes.statusText,
        url,
        response: body.substring(0, 500),
      };
    } catch (e) {
      debug.apiTest = { error: e.message };
    }
  }

  res.json(debug);
}
