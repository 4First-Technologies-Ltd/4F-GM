# gas-monitor-web-v2 Deployment Guide

## Netlify Deployment

This Next.js 15 application is configured for Netlify deployment with `output: standalone`.

### Prerequisites

- Netlify account
- GitHub/GitLab/Bitbucket repository connected to Netlify

### Setup Steps

1. **Connect Repository**
   - Log in to Netlify
   - Click "New site from Git"
   - Select your repository
   - Netlify will auto-detect Next.js and use the `netlify.toml` configuration

2. **Environment Variables**
   - In Netlify Dashboard → Site Settings → Build & Deploy → Environment
   - Add the following variables:
     ```
     NEXT_PUBLIC_API_URL=https://gas-monitor-backend-production.up.railway.app
     NEXT_PUBLIC_SENTRY_DSN=[optional]
     NODE_VERSION=20
     NPM_VERSION=10
     ```

3. **Deploy**
   - Push to main branch
   - Netlify will automatically build and deploy
   - Production URL will be assigned (or use custom domain)

### Configuration

The deployment is configured in `netlify.toml`:
- **Build command**: `npm run build`
- **Node.js version**: 20
- **Next.js output**: `standalone` (see `next.config.mjs`)

### Troubleshooting

**Build fails with module errors:**
- Ensure all dependencies in `package.json` are listed
- Check that `three` is in `transpilePackages` in `next.config.mjs`

**API calls fail in production:**
- Verify `NEXT_PUBLIC_API_URL` is set to the production backend URL
- Check CORS headers on the backend

**Large build size:**
- The 3D/R3F components and Three.js libraries add ~5-8MB to the bundle
- Use dynamic imports for heavy components if needed

### Local Testing

Before deploying, test locally:
```bash
npm install
npm run build
npm run start
```

This runs the standalone Next.js server exactly as it will run on Netlify.