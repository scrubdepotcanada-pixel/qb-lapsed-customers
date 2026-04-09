// pages/api/qb/callback.js
import { exchangeCodeForTokens, setTokenCookie } from '../../../lib/quickbooks';

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    setTokenCookie(res, tokens);
    res.redirect('/?connected=true');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
