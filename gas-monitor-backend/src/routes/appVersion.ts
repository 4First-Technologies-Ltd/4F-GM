import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { versionPolicy } from '../lib/appVersion';

/**
 * Public and read-only: a phone that is too old cannot be expected to sign in
 * first, so the version gate has to be answerable without a token.
 */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const platform = req.query.platform === 'ios' ? 'ios' : 'android';
    return res.json(await versionPolicy(platform));
  })
);

export default router;
