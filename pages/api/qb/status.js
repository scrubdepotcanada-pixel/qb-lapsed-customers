// pages/api/qb/status.js
import { getTokensFromReq } from '../../../lib/quickbooks';

export default function handler(req, res) {
  const tokens = getTokensFromReq(req);
  res.json({
    connected: !!(tokens && tokens.accessToken),
    expiresAt: tokens?.expiresAt || null,
    hasRefreshToken: !!(tokens && tokens.refreshToken),
  });
}
