# VoiceSwap Lip Sync Pipeline - Feature Specification

## Product Overview
A web application that syncs AI-generated video lip movements to match a user's authentic voice recording. Takes a VEO 3.1 video and user's voice recording, time-stretches the video to match the user's timing, then applies AI lip-sync using Sync Labs premium model.

**Target Users:** Content creators who want to use their own voice acting instead of VEO's synthetic voices.

---

## Core User Workflow

1. **Upload Inputs:**
   - VEO video file (MP4)
   - User's voice recording (MP3/WAV)

2. **Processing (automatic):**
   - Extract audio from VEO video
   - Clean user audio (noise reduction)
   - Trim silence from both audio files
   - Transcribe both with word-level timestamps
   - Align transcripts and calculate time-stretch ratios
   - Generate alignment report
   - Time-stretch video segments to match user timing
   - Apply AI lip-sync with Sync Labs
   - Download final synced video

3. **Results:**
   - Final lip-synced video download
   - Alignment report showing timing analysis

---

## Technical Stack

### Frontend
- React + TypeScript + Vite
- Wouter (routing)
- TanStack Query (server state)
- shadcn/ui + Tailwind CSS
- Dark theme, purple primary color

### Backend
- Express.js + TypeScript (ESM)
- Multer (file uploads)
- FFmpeg (video/audio processing)
- PostgreSQL + Drizzle ORM

### External APIs
1. **ElevenLabs Isolate API** - Audio cleaning (noise reduction, mic enhancement)
2. **OpenAI Whisper (Replicate)** - Transcription with word-level timestamps
3. **Sync Labs API** - Premium AI lip-sync (lipsync-2-pro model, temperature 0.6)
4. **Google Cloud Storage** - File storage with signed URLs

---

## Database Schema

### Table: `processing_jobs`
```typescript
{
  id: varchar (UUID)
  type: 'lipsync'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number (0-100)
  currentStep: string
  veoVideoUrl: string (GCS URL)
  userAudioUrl: string (GCS URL)
  outputVideoUrl: string | null
  alignmentReport: jsonb | null
  metadata: jsonb {
    veoOriginalDuration: number
    userOriginalDuration: number
    veoTrimmedDuration: number
    userTrimmedDuration: number
    silenceTrimmed: { veo: {...}, user: {...} }
    syncLabsCredits: number
    segments: Array<{
      index: number
      veoTiming: { start, end, duration }
      userTiming: { start, end, duration }
      timeStretchRatio: number
      appliedRatio: number
    }>
  }
  errorMessage: string | null
  createdAt: timestamp
}
```

---

## Processing Pipeline Details

### Step 1: Audio Extraction
```typescript
// Extract audio from VEO video
FFmpeg: video.mp4 → audio.mp3 (mono, 16kHz)
```

### Step 2: Audio Cleaning
```typescript
// ElevenLabs Isolate API
POST https://api.elevenlabs.io/v1/audio-isolation
Headers: { xi-api-key: ELEVENLABS_API_KEY }
Body: FormData with audio file
Result: Cleaned audio (noise reduced, mic enhanced)
```

### Step 3: Silence Trimming
```typescript
// FFmpeg silencedetect filter
Parameters:
  - noise: -50dB (threshold)
  - duration: 0.1s (minimum silence duration)

// Trim leading/trailing silence from both audio files
// Store trim amounts in metadata for transparency
```

### Step 4: Transcription with Word Timestamps
```typescript
// Replicate OpenAI Whisper
Model: openai/whisper:91ee9c0c3df30478510ff8c8a3a545add1ad0259ad3a9f78fba57fbc05ee64f7
Parameters:
  - audio: base64 data URI
  - model: "large-v3"
  - language: "en"
  - word_timestamps: true  // CRITICAL: Enables word-level timing
  - temperature: 0
  - condition_on_previous_text: true

Output format:
{
  text: string,
  segments: [{
    start: number,
    end: number,
    text: string,
    words: [{
      word: string,
      start: number,  // Word-level timestamp
      end: number     // Word-level timestamp
    }]
  }]
}
```

### Step 5: Segment Alignment
```typescript
// Calculate speech duration using WORD-LEVEL timestamps
// NOT segment boundaries (which include pauses)

For each segment:
  speechStart = segment.words[0].start
  speechEnd = segment.words[last].end
  speechDuration = speechEnd - speechStart

// Match VEO and user segments by text similarity
// Calculate time-stretch ratio: userDuration / veoDuration
// Clamp to FFmpeg safe limits: 0.5x - 2.0x
```

### Step 6: Alignment Report Generation
```typescript
// Generate user-actionable report focused on timing/pace

Report structure:
{
  summary: {
    totalSegments: number
    avgTimeStretchRatio: number
    alignmentQuality: "excellent" | "good" | "acceptable" | "poor"
    overallTiming: "too_fast" | "too_slow" | "perfect"
    criticalIssues: number  // >50% deviation
    majorIssues: number     // 30-50% deviation
    minorIssues: number     // 15-30% deviation
  },
  segments: [{
    segmentIndex: number
    veoText: string
    userText: string
    textSimilarity: number
    veoTiming: { start, end, duration }
    userTiming: { start, end, duration }
    timeStretchRatio: number
    appliedRatio: number  // After clamping
    adjustment: "stretched" | "compressed" | "unchanged"
    speedChange: "25% slower" | "15% faster" | etc
    severity: "critical" | "major" | "minor" | "perfect"
  }],
  recommendations: [
    "Speed up segment 2 by 20%, shaving 0.5 seconds off"
  ],
  topProblemSegments: [
    {
      segmentIndex: number
      text: string
      issue: "41% slower than VEO video"
      recommendation: "Speed up delivery or re-record"
    }
  ]
}

// Severity calculation based on timing deviation from VEO
// NOT text similarity (that's already handled by auto-correction)
```

### Step 7: Video Time-Stretching
```typescript
// FFmpeg setpts filter for each segment
Ratio formula: userDuration / veoDuration

Example: User takes 3.0s, VEO takes 2.0s → ratio = 1.5x
FFmpeg command:
  ffmpeg -i segment.mp4 -filter:v "setpts=1.5*PTS" -an output.mp4

// Concatenate all stretched segments
// Maintains visual quality, adjusts timing only
```

### Step 8: Sync Labs Lip-Sync
```typescript
// Architecture:
// 1. Upload stretched video + user audio to GCS private storage
// 2. Generate signed GET URLs (1-hour TTL)
// 3. POST to Sync Labs with URLs
// 4. Poll for completion
// 5. Download result

// Upload files to GCS
await uploadToGCS(stretchedVideo, 'private')
await uploadToGCS(userAudio, 'private')

// Generate signed URLs
const videoUrl = await getSignedReadURL(stretchedVideo, 3600) // 1 hour
const audioUrl = await getSignedReadURL(userAudio, 3600)

// Create Sync Labs job
POST https://api.sync.so/v2/generate
Headers: { x-api-key: SYNCLABS_API_KEY }
Body: {
  model: "lipsync-2-pro",
  input: [
    { type: "video", url: videoUrl },
    { type: "audio", url: audioUrl }
  ],
  options: { temperature: 0.6 }
}

Response: { id: "job-id" }

// Poll for completion (5s intervals, max 10 minutes)
GET https://api.sync.so/v2/generate/{jobId}

// When status === "COMPLETED":
// Download from output.outputUrl
// Track output.credits_deducted
// Store final video in GCS

// Known limits:
// - 1 concurrent job on free/basic plan
// - Returns 429 if limit exceeded
// - User can upgrade at: https://sync.so/billing/subscription
```

---

## Frontend Requirements

### Upload Page
- Drag-and-drop for VEO video + user audio
- File validation (video: MP4, audio: MP3/WAV)
- Upload progress indicators
- Auto-start processing after upload

### Processing Page
- Real-time progress bar (0-100%)
- Current step display with descriptions:
  - "Extracting VEO audio..."
  - "Cleaning your audio..."
  - "Trimming silence..."
  - "Transcribing audio..."
  - "Analyzing alignment..."
  - "Time-stretching video..."
  - "Applying lip-sync..."
  - "Finalizing video..."
- Estimated time remaining
- Error display with retry option

### Results Page
- Video player for final result
- Download button
- Alignment report visualization:
  - Summary metrics with color coding
  - Segment-by-segment timing comparison
  - Top problem areas highlighted
  - Actionable recommendations
- "Process Another" button

### Projects List
- Table of all processed jobs
- Columns: Created, VEO Video, Status, Actions
- Filter by status
- Auto-refresh every 2 seconds during processing
- Click to view results/reports

---

## Key Features & Requirements

### Automatic Silence Trimming
- **Purpose:** Remove leading/trailing silence before transcription
- **Method:** FFmpeg silencedetect filter (-50dB, 0.1s min duration)
- **Transparency:** Log exact amounts trimmed (e.g., "0.31s from start, 0.10s from end")
- **Storage:** Save trim metadata in job record

### Word-Level Timestamp Alignment
- **Critical:** Must use word timestamps, NOT segment boundaries
- **Why:** Segment boundaries include pauses, causing false "slower" reports
- **Calculation:** `speechDuration = lastWord.end - firstWord.start`
- **Verification:** Log word count: `[Replicate] Total words with timestamps: X`

### Error Handling
- Network failures → Retry with exponential backoff
- Sync Labs 429 → Show user-friendly message about concurrency limit + upgrade link
- FFmpeg errors → Log full command + stderr
- Transcription failures → Clear error message with audio requirements
- File size limits → Pre-upload validation

### Progress Tracking
- Update job status + progress percentage
- Store currentStep for UI display
- Frontend polls every 2 seconds
- Backend updates after each pipeline step

---

## Environment Variables Required

```bash
# Database
DATABASE_URL=postgresql://...

# Google Cloud Storage
DEFAULT_OBJECT_STORAGE_BUCKET_ID=...
PUBLIC_OBJECT_SEARCH_PATHS=...
PRIVATE_OBJECT_DIR=...

# APIs
ELEVENLABS_API_KEY=...
REPLICATE_API_TOKEN=...
SYNCLABS_API_KEY=...

# Session
SESSION_SECRET=...
```

---

## Testing Checklist

- [ ] Upload VEO video + user audio → process completes successfully
- [ ] Alignment report shows accurate timing (not false "slower" results)
- [ ] Word-level timestamps logged: "Total words with timestamps: X" (X > 0)
- [ ] Silence trimming logged with exact amounts
- [ ] Video time-stretching applied correctly
- [ ] Sync Labs lip-sync quality acceptable
- [ ] Download works for final video
- [ ] Concurrent job limit handled gracefully (429 error)
- [ ] Progress updates in real-time
- [ ] Error states display clearly

---

## Non-Goals (Out of Scope)

- ❌ Speech-to-Speech (S2S) pipeline
- ❌ Time-Aligned TTS pipeline
- ❌ Voice cloning management
- ❌ Multiple pipeline selection
- ❌ Bark TTS integration

---

## Success Criteria

1. **Alignment accuracy:** Report shows <5% timing deviation when user records at same pace as VEO
2. **Lip-sync quality:** Visually acceptable sync in final video
3. **Processing speed:** Complete pipeline in <5 minutes for 10-second video
4. **Error recovery:** All failures logged clearly with actionable messages
5. **User transparency:** Every processing step visible + alignment report actionable

---

## Technical Notes

### Why Word-Level Timestamps Matter
- Whisper's segment boundaries include pauses/silence
- Example: Segment 0.0-4.5s might contain speech from 0.5-3.8s
- Using segment duration (4.5s) vs speech duration (3.3s) = 36% false "slower"
- Solution: Use `segment.words[0].start → segment.words[last].end`

### FFmpeg Time-Stretching
- Uses `setpts` filter for video, `atempo` for audio if needed
- Safe range: 0.5x - 2.0x (outside this causes quality issues)
- Formula: `setpts=(veoDuration/userDuration)*PTS`
- Maintains frame rate, adjusts timing only

### Sync Labs Best Practices
- Use signed URLs (not public files) for security
- Set 1-hour TTL on signed URLs
- Temperature 0.6 balances quality vs consistency
- Model lipsync-2-pro is premium (~$4-5/min video)
- Free plan: 1 concurrent job, upgrade for more

---

## Recommended File Structure

```
server/
  routes.ts          // API endpoints
  storage.ts         // DB interface
  ffmpeg.ts          // Video/audio processing
  elevenlabs.ts      // Audio cleaning API
  replicate.ts       // Whisper transcription
  synclabs.ts        // Lip-sync API
  segment-aligner.ts // Alignment logic + reports
  objectStorage.ts   // GCS operations

client/src/
  pages/
    upload.tsx       // File upload form
    projects.tsx     // Job list + results
  components/
    FileUploadZone.tsx
    ProcessingTimeline.tsx
    AlignmentReport.tsx

shared/
  schema.ts          // Database schema + types
```

---

## Implementation Priority

1. **Core Pipeline (MVP):**
   - Upload → Extract audio → Transcribe → Time-stretch → Lip-sync → Download

2. **Alignment Report:**
   - Calculate timing deviations
   - Generate actionable recommendations
   - Display in frontend

3. **Polish:**
   - Progress tracking
   - Error handling
   - Silence trimming transparency
   - UI refinement
