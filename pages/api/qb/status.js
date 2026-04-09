// pages/api/qb/status.js
import { getTokenStore } from '../../../lib/quickbooks';

export default function handler(req, res) {
  const store = getTokenStore();
  res.json({
    connected: !!store.accessToken,
    expiresAt: store.expiresAt,
    hasRefreshToken: !!store.refreshToken,
  });
}
