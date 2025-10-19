# Deploy Sound Detection Service to Render

## Quick Start

1. **Go to Render Dashboard**: https://dashboard.render.com/

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository (or use "Deploy from Git URL")
   - If using this Replit: Download the `python-services/sound-detection` folder as a zip

3. **Configure the Service**:
   - **Name**: `voiceswap-sound-detection` (or your choice)
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free (sufficient for testing)

4. **Environment Variables**:
   - Render automatically sets `PORT` - no need to configure

5. **Deploy**:
   - Click "Create Web Service"
   - Wait 5-10 minutes for first deployment (installing PyTorch takes time)
   - You'll get a URL like: `https://voiceswap-sound-detection.onrender.com`

6. **Verify It Works**:
   ```bash
   curl https://YOUR-RENDER-URL.onrender.com/health
   ```
   Should return: `{"status":"healthy","model_loaded":false}`

## Connect to Your VoiceSwap App

After deployment, you'll have a URL like:
```
https://voiceswap-sound-detection-abc123.onrender.com
```

**In your Replit project**, add this as a secret:
1. Go to Secrets (lock icon in left sidebar)
2. Add new secret:
   - Key: `PYTHON_SOUND_DETECTION_URL`
   - Value: `https://voiceswap-sound-detection-abc123.onrender.com`

That's it! Your app will now use the Render service instead of localhost.

## Important Notes

- **Free Tier Limits**: 
  - Service spins down after 15 min of inactivity
  - First request after spin-down takes ~30 seconds (cold start)
  - 750 hours/month free

- **Cold Starts**: When the service is asleep, the first sound regeneration request will be slow. Subsequent requests are fast.

- **Upgrade Path**: If you need always-on service, upgrade to Render's paid plan ($7/month) for instant responses.

## Troubleshooting

**Service won't start?**
- Check Render logs for errors
- Verify `requirements.txt` is present
- Ensure Python version is 3.10

**Health check failing?**
- Wait a few minutes - PyTorch installation is slow on first deploy
- Check if `/health` endpoint returns 200 OK

**Connection refused from Replit?**
- Verify the URL in your Replit secrets matches Render URL exactly
- Make sure it starts with `https://`
- Check Render logs to see if request is reaching the service
