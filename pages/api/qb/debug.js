// pages/api/qb/debug.js
import { getValidTokens, getTokensFromReq } from '../../../lib/quickbooks';

export default async function handler(req, res) {
  const tokens = getTokensFromReq(req);
  const realmId = process.env.QB_REALM_ID;
  const sandbox = process.env.QB_SANDBOX;
  const baseUrl = sandbox === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
    : 'https://quickbooks.api.intuit.com/v3/company';

  const debug = {
    realmId,
    sandbox,
    baseUrl,
    hasAccessToken: !!(tokens && tokens.accessToken),
    hasRefreshToken: !!(tokens && tokens.refreshToken),
    tokenExpiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
    tokenExpired: tokens?.expiresAt ? Date.now() > tokens.expiresAt : true,
    redirectUri: process.env.QB_REDIRECT_URI,
    clientIdPrefix: process.env.QB_CLIENT_ID ? process.env.QB_CLIENT_ID.substring(0, 10) + '...' : 'NOT SET',
  };

  if (tokens && tokens.accessToken) {
    try {
      const validTokens = await getValidTokens(req, res);
      const url = `${baseUrl}/${realmId}/companyinfo/${realmId}?minorversion=65`;
      const apiRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${validTokens.accessToken}`,
          Accept: 'application/json',
        },
      });
      const body = await apiRes.text();
      debug.apiTest = {
        status: apiRes.status,
        url,
        response: body.substring(0, 500),
      };
    } catch (e) {
      debug.apiTest = { error: e.message };
    }
  }

  res.json(debug);
}
