# Deployment Guide - Tata ClassEdge Whiteboard

## 📋 Prerequisites

- Node.js 20+ installed
- Built production files (`npm run build`)
- (Optional) Gemini API key if using AI features

## 🚀 Deployment Options

### Option 1: Render (Recommended - Easy & Free)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
     - **Environment**: Node
   - Add environment variables if needed:
     - `GEMINI_API_KEY` (optional)
     - `APP_URL` (will be auto-set)
   - Click "Create Web Service"

### Option 2: Railway

1. **Push to GitHub** (same as above)

2. **Deploy on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js and deploys
   - Add environment variables in Settings:
     - `GEMINI_API_KEY` (optional)

### Option 3: Vercel + Separate Backend

**Frontend (Vercel):**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Backend:** Deploy server.ts separately on Render/Railway

### Option 4: Self-Hosted (VPS/Server)

#### Using PM2

1. **Install PM2**
   ```bash
   npm install -g pm2
   ```

2. **Create ecosystem file**
   ```bash
   pm2 init
   ```

3. **Edit ecosystem.config.js**
   ```javascript
   module.exports = {
     apps: [{
       name: 'whiteboard',
       script: 'server.ts',
       interpreter: 'node_modules/.bin/tsx',
       env: {
         NODE_ENV: 'production',
         PORT: 3001
       }
     }]
   }
   ```

4. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

#### Using Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 3001
   CMD ["npm", "start"]
   ```

2. **Build and Run**
   ```bash
   docker build -t whiteboard .
   docker run -p 3001:3001 whiteboard
   ```

### Option 5: Netlify

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod
   ```

3. **Configure**
   - Build command: `npm run build`
   - Publish directory: `dist`

## 🔧 Production Setup

### Update server.ts for Production

Replace line 17 in server.ts:
```typescript
const PORT = process.env.PORT || 3001;
```

### Environment Variables

Create `.env.production`:
```bash
# Optional - Only if using AI features
GEMINI_API_KEY=your_api_key_here

# Will be set automatically by hosting platform
APP_URL=https://your-app.com
PORT=3001
```

### Update package.json Start Script

Ensure your start script is production-ready:
```json
{
  "scripts": {
    "start": "NODE_ENV=production tsx server.ts"
  }
}
```

## 🌐 Custom Domain

### Render/Railway
- Go to Settings → Custom Domains
- Add your domain (e.g., whiteboard.yourcompany.com)
- Update DNS records as instructed

### Cloudflare (for any deployment)
1. Add CNAME record pointing to your deployment URL
2. Enable Cloudflare proxy for DDoS protection
3. Enable SSL/TLS encryption

## 📊 Monitoring

### PM2 (Self-hosted)
```bash
pm2 monit          # Monitor in real-time
pm2 logs           # View logs
pm2 restart all    # Restart app
```

### Platform Dashboards
- Render: Built-in metrics and logs
- Railway: Metrics tab
- Vercel: Analytics dashboard

## 🔒 Security Checklist

- [ ] Set up HTTPS (auto with Render/Railway/Vercel)
- [ ] Add rate limiting for Socket.IO
- [ ] Set CORS to specific domains
- [ ] Use environment variables for secrets
- [ ] Enable firewall rules
- [ ] Regular dependency updates

## 🚦 Testing Production Build Locally

```bash
# Build
npm run build

# Test production build
NODE_ENV=production npm start

# Visit http://localhost:3001
```

## 📱 Scaling Considerations

For high traffic:

1. **Redis for Socket.IO** (multi-instance support)
2. **Load Balancer** (nginx or cloud LB)
3. **Database** (PostgreSQL/MongoDB instead of in-memory)
4. **CDN** (Cloudflare/CloudFront for static assets)

## 🆘 Troubleshooting

### Build Fails
```bash
# Clear node_modules and rebuild
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Port Already in Use
```bash
# Find and kill process
lsof -ti:3001 | xargs kill -9
```

### Socket.IO Connection Issues
- Check CORS settings in server.ts
- Ensure WebSocket is enabled on hosting platform
- Verify APP_URL environment variable

## 📚 Additional Resources

- [Render Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app)
- [PM2 Guide](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Docker Node.js Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
