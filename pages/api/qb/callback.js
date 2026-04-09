// pages/api/qb/callback.js
import { exchangeCodeForTokens } from '../../../lib/quickbooks';

export default async function handler(req, res) {
  const { code, realmId } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    await exchangeCodeForTokens(code);
    // Redirect back to the app dashboard
    res.redirect('/?connected=true');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ error: err.message });
  }
}
