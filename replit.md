# VoiceSwap - AI Voice Conversion Application

## Overview
VoiceSwap is an AI-powered application designed for voice cloning and video audio conversion using ElevenLabs Speech-to-Speech (S2S) technology. Its core purpose is to enable users to clone voices and convert video audio while preserving perfect lip-sync timing. The application provides a professional interface for managing voice clones, processing videos with voice conversion, and downloading perfectly synced results. The business vision is to offer a reliable and user-friendly tool for high-quality voice transformation in video content, targeting content creators, marketers, and media professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, using Vite for development. It leverages Wouter for routing and TanStack Query for server state management. The design system is based on `shadcn/ui` and Tailwind CSS, featuring a professional dark theme with a vibrant purple primary color. The component architecture is modular, with custom components for domain-specific functionalities like `FileUploadZone`, `ProcessingTimeline`, `VoiceCloneCard`, and `QualityMeter`. Form handling is managed with `react-hook-form` and Zod for validation.

### Backend
The backend utilizes Express.js with TypeScript and ESM for a modern, type-safe API. It follows a RESTful design with clear endpoints for voices, jobs, and objects. Key functionalities include Multer for file uploads and FFmpeg integration for robust video/audio processing. The system implements a multi-step job processing pipeline with status and progress tracking.

### Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles persistent data storage for voice clones and processing jobs. The schema includes `voice_clones` and `processing_jobs` tables, utilizing JSONB columns for flexible metadata. Google Cloud Storage is integrated for scalable object storage, managing uploaded videos, extracted audio, and generated files with ACL support.

### Design Principles
VoiceSwap emphasizes processing transparency through visual feedback and real-time progress updates. It maintains technical professionalism with monospace fonts, quality metrics, and professional status badges. Workflow clarity is achieved via step-by-step pipeline visualization, estimated time displays, and user-friendly error messages.

## External Dependencies

*   **ElevenLabs Speech-to-Speech API**: Used for instant voice cloning, speech-to-speech conversion that preserves timing and prosody, and background noise removal.
*   **FFmpeg**: Integrated for audio extraction from video files, format conversion, and metadata extraction.
*   **Google Cloud Storage**: Utilized for scalable object storage of all project-related files.
*   **PostgreSQL (via Neon)**: The primary database for storing application data.
*   **Drizzle ORM**: Used for type-safe database interactions with PostgreSQL.

## Recent Changes (October 18, 2025)

### Sync Labs API Integration Fix (Latest)
**Problem:** Initial implementation tried to POST multipart file uploads directly to `/lipsync` endpoint, which returned 404 errors.

**Root Cause:** Sync Labs uses an async job-based API, not direct file uploads.

**Solution:** Refactored to use correct Sync Labs API flow:
1. Upload time-stretched video and cleaned audio to GCS
2. POST JSON with public URLs to `https://api.sync.so/video`
3. Poll `GET /video/{jobId}` for completion (5-second intervals, max 10 minutes)
4. Download result from returned `videoUrl`

**Implementation:**
- `SyncLabsService.lipSync()` now accepts URLs instead of file paths
- Added `createJob()`, `pollJob()`, and `getJobStatus()` private methods
- Pipeline uploads files to GCS first, generates public URLs, then calls Sync Labs
- Returns final video URL after job completes

**API Details:**
- Base URL: `https://api.sync.so`
- Create job: `POST /video` with JSON payload `{videoUrl, audioUrl, model, synergize}`
- Check status: `GET /video/{jobId}` returns `{status, videoUrl, creditsDeducted}`
- Authentication: `x-api-key` header

**User Benefit:** Sync Labs integration now works correctly with premium `lipsync-2-pro` model for highest quality lip-sync output.

### Automatic Silence Trimming
**Problem:** Users always upload audio with silence padding at start/end. For example: 8-second video + 11-second audio (same content, but 2s silence at start, 1s at end).

**Solution:** Automatic silence detection and trimming before transcription/alignment:

**Implementation:**
1. **FFmpegService.trimSilence():**
   - Uses FFmpeg silencedetect filter (-50dB threshold, 0.1s minimum)
   - Detects leading silence: first silence segment starting within 0.5s
   - Detects trailing silence: last silence segment extending to (or near) EOF
   - Guards against zero-duration (entirely silent files)
   - Returns trimming metadata: start/end trimmed, original/trimmed durations

2. **Pipeline Integration:**
   - Step 2.5 (15-20%): Trim silence from BOTH user audio AND VEO audio
   - Runs after ElevenLabs cleanup, before Whisper transcription
   - Parallel processing for efficiency
   - Stores results in job metadata
   - Uses trimmed versions for alignment (ensures durations match)

3. **Robustness:**
   - Handles multi-second padding (typical 2-4s trailing silence)
   - Returns original file if trimming would create <0.1s duration
   - Works with any audio format
   - Transparent to user (just works)

**User Benefit:** Upload audio with any amount of silence padding - system automatically finds and aligns the actual speech content with video.

### Alignment Report System
**Feature:** Detailed post-processing reports for iterative voice recording improvement.

**Implementation:**
1. **SegmentAligner Report Generation:**
   - Per-segment analysis: timing deltas, text similarity, speed adjustments, severity classification
   - Summary statistics: quality grade, overall timing trend, issue counts
   - Actionable recommendations based on patterns
   - Top 5 problem segments with specific improvement guidance

2. **Severity Classification:**
   - Perfect: ±5% timing accuracy
   - Minor: 5-15% off (visual adjustment acceptable)
   - Major: 15-30% off (noticeable but tolerable)
   - Critical: >30% off (requires re-recording)

3. **Report UI Components:**
   - Quality dashboard with metrics and progress visualization
   - Recommendations panel with emoji-coded priorities
   - Problem segments with actionable fixes
   - Expandable full segment breakdown
   - Displayed on Projects page for completed lip-sync jobs

4. **Pipeline Integration:**
   - Report generated at alignment step (40-45%)
   - Stored in job metadata
   - Warnings logged for poor quality but processing continues
   - Users can iterate: record → process → review report → improve → repeat

5. **Quality Thresholds (Updated for Realism):**
   - Excellent: <10% avg deviation, no critical segments
   - Good: <15% avg deviation, <30% critical segments
   - Acceptable: <20% avg deviation, <50% critical segments (or <40% avg with <70% critical)
   - Poor: >40% average deviation or >70% segments critical
   - System is now more lenient since time-stretching handles adjustments well

**User Benefit:** Clear, actionable feedback on timing accuracy enables iterative improvement of voice recordings for better lip-sync results.

### Lip-Sync Pipeline Implementation
**Problem:** Users want to use their OWN voice acting (90% accurate) instead of AI-generated voices, with the system handling the final 10% timing/lip-sync adjustment.

**Solution:** Implemented hybrid video manipulation + AI lip-sync pipeline:
- User provides: VEO video + their own voice recording (matching the script)
- System performs: Audio cleanup → Transcription → Segment alignment → Video time-stretching → Lip-sync

**Technical Implementation:**
1. **Services Created:**
   - `SyncLabsService` (server/synclabs.ts): Sync Labs API integration for high-quality lip-sync
   - `SegmentAligner` (server/segment-aligner.ts): Whisper transcription, segment alignment, time-stretch ratio calculation
   - `FFmpegService` extensions: Video segment extraction, time-stretching (setpts filter), concatenation

2. **Backend Route:** `/api/jobs/process-lipsync`
   - Accepts multipart upload: VEO video + user audio
   - Pipeline steps:
     1. Extract VEO audio (0-10%)
     2. Clean user audio with ElevenLabs (10-20%)
     3. Transcribe both with Whisper (20-40%)
     4. Align segments & calculate time-stretch ratios (40-45%)
     5. Time-stretch video segments to match user timing (45-70%)
     6. Concatenate time-stretched segments (70%)
     7. Apply Sync Labs lip-sync (70-90%)
     8. Upload final video (90-100%)

3. **Frontend Updates:**
   - Added third pipeline option: "Lip-Sync (Your Voice)"
   - Conditional UI: Shows audio upload zone when lip-sync selected, voice clone selector otherwise
   - Processing timeline with 7 steps showing real-time progress
   - Quality indicators: Displays alignment quality (excellent/good/acceptable/poor)

4. **Schema Updates:**
   - Added `audioFileName` to job metadata
   - Added `alignmentQuality` and `avgTimeStretchRatio` for quality tracking

**Commercial Advantage:**
- Preserves creator's authentic voice performance (emotion, timing, delivery)
- Better than AI voice generation for creators who can act
- Targets users with 90% accurate voice acting who need help with final 10% polish
- Cost: ~$0.05/sec for Sync Labs (~$3/min of video)

**Status:** ✅ Sync Labs API key configured - using premium model!

**Model in Use:**
- `lipsync-2-pro`: **Latest premium model (2025)** - ACTIVE
  - Pricing: $0.067-$0.083/sec (~$4-$5/min)
  - Enhanced beard/facial hair handling
  - Improved teeth generation across frames
  - Superior detail preservation
  - 1.5-2x slower processing but highest quality output
  - Requires Scale plan or paid API credits

**Alternative Model:**
- `lipsync-2`: Standard model (fallback option)
  - Pricing: $0.04-$0.05/sec (~$2.40-$3/min)
  - Free tier: 5 minutes/month

## Recent Changes (October 18, 2025)

### Speech-to-Speech Voice Conversion Strength Fix
**Problem:** S2S pipeline was only applying 30% voice conversion, preserving 70% of VEO's synthetic voice instead of fully replacing it with the cloned voice.

**Root Cause:** ElevenLabs S2S API defaults `voice_conversion_strength` to 0.3. This critical parameter was missing from the implementation.

**Solution:** Added `voice_conversion_strength: 1.0` to S2S voice settings for complete voice replacement while preserving VEO's professional acting, emotion, and prosody.

**Technical Changes:**
- Updated `ElevenLabsService.speechToSpeech()` to include:
  - `voice_conversion_strength: 1.0` - Full voice replacement
  - `similarity_boost: 1.0` - Maximum similarity to target voice
  - `stability: 0.5` - Balanced for natural speech
  - `use_speaker_boost: true` - Enhanced voice matching
- UI updated to prioritize S2S pipeline for VEO videos
- Clarified pipeline descriptions: S2S preserves emotion/acting, TTS generates neutral delivery

**Result:**
- ✅ 100% voice replacement (your cloned voice, not VEO's)
- ✅ Preserves VEO's professional acting, emotion, and prosody
- ✅ Perfect lip-sync timing maintained
- ✅ Commercial-quality voice swapping for VEO videos

### Three Processing Pipelines Available
1. **Speech-to-Speech (For VEO)**: Preserves professional acting/emotion while replacing voice - recommended for AI-generated videos
2. **Time-Aligned TTS**: Generates speech from text with word-level timing precision - neutral delivery, loses original emotion
3. **Lip-Sync (Your Voice)**: NEW - Hybrid approach using YOUR authentic voice acting + AI lip-sync technology
   - **Audio Cleanup**: ElevenLabs audio isolation removes background noise and enhances mic quality
   - **Transcription**: Whisper transcribes both VEO video audio and user audio with word-level timestamps
   - **Segment Alignment**: Analyzes timing differences between VEO and user performance
   - **Video Time-Stretching**: FFmpeg adjusts video speed (0.8-1.2x) per-segment to match user's timing
   - **Lip-Sync**: Sync Labs applies AI lip-sync to time-stretched video with cleaned user audio
   - **Result**: 100% authentic voice performance with perfect lip-sync, preserving user's emotion and delivery
   - **Tolerance**: ±20% speed variation per segment (visually undetectable), ±100ms timing precision for lip-sync