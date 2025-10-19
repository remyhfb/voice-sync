# Testing Sound Design Regeneration Locally

## 🎉 Metadata Clobbering Bug FIXED!

The 400 error has been resolved! The issue was that the `originalVideoPath` was being saved initially, but then **overwritten** by subsequent metadata updates during processing. I've refactored all metadata updates to use object spread operators instead of mutation to preserve all fields.

## ✅ What Was Fixed:
1. **Metadata persistence**: All metadata updates now use `currentMetadata = { ...currentMetadata, newField }` pattern
2. **Original video storage**: VEO video is uploaded to object storage at the start of processing
3. **Type safety**: Using object spread ensures TypeScript properly handles all metadata fields

## Quick Start

### 1. Start the Main Application (Already Running ✅)
Your main VoiceSwap application is already running on port 5000.

### 2. Start the Python Sound Detection Service (Optional for full testing)

Open a **new terminal/shell** and run:

```bash
cd python-services/sound-detection
./start.sh
```

**First-time setup:** The script will install Python dependencies (may take 2-5 minutes). You'll see:
- ✅ Dependencies installed successfully!
- 🚀 Starting FastAPI service on http://localhost:8001

**Verify it's running:**
```bash
curl http://localhost:8001/health
```

Expected response: `{"status":"healthy"}`

### 3. Create a NEW Lip-Sync Job

**CRITICAL:** You **MUST** create a **brand new job** to test sound regeneration. The fix was just applied, so:
- ✅ **New jobs** (created after the fix) → Will work with sound regeneration
- ❌ **Old jobs** (created before the fix) → Missing originalVideoPath, will fail with 400 error

**How to create a new job:**
1. Go to http://localhost:5000
2. Click **"Create"** → **"Create Another"**
3. Upload your VEO video + audio files
4. Wait for lip-sync to complete (status: "completed")
5. Then click **"Regenerate Sound Design (Beta)"**

---

## Testing Flow

### Step 1: Complete a Lip-Sync Job First
The sound regeneration feature only appears **after** a successful lip-sync job. So first:

1. Go to http://localhost:5000
2. Click "Create" in sidebar
3. Upload:
   - **Video file**: Any MP4 video (ideally with ambient sounds or music)
   - **Audio file**: Your voice recording (MP3 or WAV)
4. Click "Start Lip-Sync Processing"
5. Wait for processing to complete (~2-5 minutes depending on video length)

### Step 2: Regenerate Sound Design
Once the lip-sync job completes successfully:

1. You'll see the final video player
2. Scroll down to "Next Steps" section
3. Click **"Regenerate Sound Design (Beta)"** button
4. Watch the processing timeline update in real-time
5. After ~1-3 minutes, you'll see the **Sound Design Report** showing:
   - Detected sounds with timestamps
   - Confidence scores
   - Generated audio prompts
   - File paths for generated audio

### Step 3: Compare Results
- **Original video**: Your uploaded VEO video
- **Lip-synced video**: Video with your voice and adjusted timing
- **Sound-regenerated video**: Lip-synced video + AI-regenerated ambient sounds/effects

---

## What Gets Detected?

The AI can detect 527 different sound types including:
- **Ambient**: Ocean waves, rain, wind, traffic, crowd noise
- **Effects**: Door slam, glass break, footsteps, explosions
- **Music**: Various instruments and genres
- **Other**: Speech, animals, nature sounds

---

## Troubleshooting

### Python service won't start
If `./start.sh` fails, try manual installation:
```bash
python3 -m pip install --user fastapi uvicorn numpy soundfile librosa torch panns_inference
python3 -m uvicorn app:app --host 0.0.0.0 --port 8001
```

### "Connection refused" error
Make sure the Python service is running on port 8001:
```bash
curl http://localhost:8001/health
```

### Button doesn't appear
The "Regenerate Sound Design" button only shows:
- ✅ After a **successful** lip-sync job completion
- ✅ After a **failed** regeneration (for retry)

It won't show if regeneration is already completed successfully.

### Want to test again?
Click "Create Another" to start a new job, or retry regeneration on a failed attempt.

---

## Example Test Video

For best results, use a video with:
- Clear ambient sounds (background noise, music, nature)
- Sound effects (doors, footsteps, mechanical sounds)
- Duration: 10-60 seconds (shorter = faster processing)

The AI will analyze the original VEO video's audio track and recreate similar ambient soundscapes!
