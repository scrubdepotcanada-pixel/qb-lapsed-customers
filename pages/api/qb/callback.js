// pages/api/qb/callback.js
import { exchangeCodeForTokens, setTokenCookie } from '../../../lib/quickbooks';

export default async function handler(req, res) {
  const { code, realmId } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code', query: req.query });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    // Store the realmId that QBO returned with the tokens
    tokens.realmId = realmId || process.env.QB_REALM_ID;
    setTokenCookie(res, tokens);
    res.redirect('/?connected=true&realmId=' + (realmId || ''));
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
