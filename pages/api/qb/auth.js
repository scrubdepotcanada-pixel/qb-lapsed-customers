// pages/api/qb/auth.js
import { getAuthUrl } from '../../../lib/quickbooks';

export default function handler(req, res) {
  const url = getAuthUrl();
  res.redirect(url);
}
