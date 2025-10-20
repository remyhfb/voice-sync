# VoiceSwap - AI Voice Conversion Application

## Overview
VoiceSwap is an AI-powered application for voice cloning and video audio conversion using ElevenLabs Speech-to-Speech (S2S) technology. Its primary purpose is to enable users to clone voices and convert video audio while maintaining perfect lip-sync timing. The application offers a professional interface for managing voice clones, processing videos with voice conversion, and downloading perfectly synced results. The business vision is to provide a reliable and user-friendly tool for high-quality voice transformation in video content, targeting content creators, marketers, and media professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, using Vite, Wouter for routing, and TanStack Query for server state management. It utilizes `shadcn/ui` and Tailwind CSS for a professional dark theme with a vibrant purple primary color. The component architecture is modular, with custom components for functionalities like `FileUploadZone`, `ProcessingTimeline`, `VoiceCloneCard`, and `QualityMeter`. Form handling is managed with `react-hook-form` and Zod for validation.

### Backend
The backend uses Express.js with TypeScript and ESM, following a RESTful design. It includes Multer for file uploads and FFmpeg integration for video/audio processing. The system implements a multi-step job processing pipeline with status and progress tracking.

#### Audio Loudness Normalization
All processed videos automatically receive professional loudness normalization to ensure consistent audio levels across all outputs, regardless of input volume variations. This uses two-pass EBU R128 loudness normalization targeting -14 LUFS (YouTube/streaming platform standard) with true peak limiting at -1.5 dB and loudness range of 11 LU. The normalization happens automatically during the final browser re-encoding step, ensuring professional audio quality without user configuration.

### Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles persistent data for voice clones and processing jobs. Google Cloud Storage is integrated for scalable object storage of uploaded videos, extracted audio, and generated files with ACL support.

### Design Principles
VoiceSwap emphasizes processing transparency through visual feedback and real-time progress updates. It maintains technical professionalism with monospace fonts, quality metrics, and professional status badges, ensuring workflow clarity via step-by-step pipeline visualization and user-friendly messages.

### Feature Specifications
The system offers three primary processing pipelines:
1.  **Speech-to-Speech (For VEO)**: Preserves professional acting/emotion while replacing the voice.
2.  **Time-Aligned TTS**: Generates speech from text with word-level timing precision but neutral delivery.
3.  **Lip-Sync (Your Voice)**: A hybrid approach using the user's authentic voice acting combined with AI lip-sync technology. This pipeline includes audio cleanup (ElevenLabs), transcription (Whisper), segment alignment, video time-stretching (FFmpeg), and final lip-sync (Sync Labs).

The system also offers two optional post-processing enhancements:
4.  **Ambient Sound Enhancement**: Adds professional ambient atmosphere to finished videos using ElevenLabs Sound Effects API (see below).
5.  **Voice Effects**: Applies acoustic effects to voice audio using FFmpeg built-in filters.

#### Ambient Sound Enhancement (Optional)
A simplified optional feature that adds professional ambient atmosphere to the finished lip-synced video. Uses ElevenLabs Sound Effects API to generate high-quality ambient sounds based on preset selection or custom user prompts.

**Available Preset Ambient Types:**
- **Office**: Gentle office ambience with soft typing and paper shuffling
- **Café**: Busy coffee shop atmosphere with distant chatter and espresso machine sounds
- **Nature**: Peaceful outdoor ambience with birds chirping and wind rustling leaves
- **City**: Urban street ambience with distant traffic and city sounds
- **Studio**: Professional recording studio ambience with subtle room tone
- **Home**: Quiet home ambience with soft ambient room tone

**Custom Prompts:**
- Users can enter custom ambient sound descriptions (5-200 characters)
- Examples: "Gentle rain with distant thunder", "Busy restaurant with soft jazz music", "Quiet library with page turning"
- Custom prompts override preset selections when provided

**Technical Implementation:**
- **ElevenLabs Sound Effects API**: Generates 30-second ambient loops using v2 model with 0.5 prompt influence
- **FFmpeg Audio Mixing**: Loops ambient audio and mixes at user-configurable volume (0-100%, default 15%) with original lip-synced video (preserving 100% original audio)
- **Volume Control**: User-adjustable slider with real-time feedback, stored in metadata to ensure preview and final mix use identical volume
- **No External Services**: All processing happens in single Replit environment using built-in integrations

**API Endpoints:**
- `POST /api/jobs/:jobId/preview-ambient`
  - Request body: `{ preset?: string, customPrompt?: string, volume: number }`
  - Generates 30-second preview audio for listening before committing
  - Stores volume in metadata for consistency with final mix
- `POST /api/jobs/:jobId/enhance-ambient`
  - Request body: `{ preset?: string, customPrompt?: string, volume: number }`
  - Validation: Either preset or customPrompt must be provided (not both)
  - Volume range: 0-100 (converted to 0.0-1.0 decimal for FFmpeg)
  - Runs asynchronously in background
  - Stores enhanced video path, prompt details, and volume in job metadata under `ambientEnhancement`

**UI Flow:**
- After successful lip-sync completion, user sees:
  - Preset selector dropdown (6 options)
  - Custom prompt text input (5-200 characters)
  - Volume slider (0-100%, default 15%)
  - Preset dropdown is disabled when custom prompt is entered
- **Preview Workflow (Optional)**: User selects preset/prompt → clicks "Preview Ambient Sound" → hears 30-second sample → volume slider controls preview playback in real-time via HTML5 audio volume property
- **Apply Workflow**: User adjusts volume slider to desired level → clicks "Apply to Video" → system mixes at current slider volume
- Volume slider always controls final mixing level (can be adjusted after preview without re-previewing)
- Polling updates status every 3 seconds until completion
- Enhanced video becomes available for download alongside original result
- Completion message shows which preset or custom prompt was used and the applied volume
- **Iteration Support**: After enhanced video is ready, "Try Different Ambient" button allows users to reset and experiment with different presets, prompts, or volumes without reprocessing the lip-sync

#### Voice Effects
An optional feature that applies acoustic effects to the voice audio using FFmpeg's built-in audio filters. No external APIs required - all processing happens server-side using FFmpeg.

**Naming Convention:**
- **Expert-Validated** - Effects with "(Expert)" suffix use proven audio engineering parameters from production systems
- **New Outdoor Environments** - Forest, Canyon, Open Field, Beach, Mountain Valley
- **Communication** - Telephone, Radio (fixed with aggressive filtering for audibility)
- **Original** - Outdoor (Experimental), Outdoor (Pro) kept for backward compatibility

**Available Effect Presets (13 Total):**

*Expert-Validated Reverb Effects (proven parameters from professional audio engineering):*
- **Concert Hall (Expert)**: Expert parameters proven in production audio systems with carefully balanced early reflections and decay
- **Cathedral (Expert)**: Massive cathedral space with extremely long decay, ideal for dramatic vocal presence
- **Stadium (Expert)**: Large arena with strong early reflections from hard surfaces, bright arena sound
- **Small Room (Expert)**: Intimate close-miked acoustic with tight, fast reverb

*Outdoor Environment Effects (NEW - comprehensive outdoor acoustic catalog):*
- **Forest**: Heavy absorption from trees/foliage, minimal reflections, soft diffuse reverb with high-frequency dampening
- **Canyon**: Dramatic long echoes with 1-2 second delays, strong late reflections for natural echo effect
- **Open Field**: Almost no reflections, pure sound absorption, very minimal reverb for ultra-natural outdoor sound
- **Beach**: Water reflections, wind filtering, distant wave echoes with high-frequency rolloff
- **Mountain Valley**: Complex multi-path echoes from surrounding peaks with medium-long delays

*Communication Effects (FIXED - now properly audible):*
- **Telephone**: Very narrow band-pass (300-3000Hz), aggressive mid boost at 1500Hz, 3x volume for authentic phone sound
- **Radio**: AM radio effect with band-pass (500-4000Hz), strong resonance at 2000Hz, 2.5x volume for classic broadcast sound

*Original Outdoor Effects (kept for backward compatibility):*
- **Outdoor (Experimental)**: Original experimental outdoor with minimal reverb
- **Outdoor (Pro)**: Original professional outdoor with air absorption (70-100ms pre-delay, 400Hz HPF, 2.5kHz LPF)

**Technical Implementation:**
- **FFmpeg Audio Filters**: Uses `aecho` for reverb effects with frequency shaping via `equalizer`. Telephone/radio use `highpass`/`lowpass` with `equalizer` and `volume` filters.
- **Acoustic Standards**: Reverb presets based on professional RT60 measurements and early reflection timing for each space type.
- **Strength Control**: User-adjustable slider (0-100%) controls wet/dry mix using comma-separated amix weights - 0% = original voice, 100% = full effect.
- **No External API**: All processing server-side using FFmpeg built-in filters.
- **Applies to Best Available Video**: Uses ambient-enhanced video if available, otherwise uses lip-synced video.
- **Implementation Note**: Uses `child_process.spawn()` directly instead of fluent-ffmpeg to ensure proper argument escaping for complex filter chains.

**API Endpoints:**
- `POST /api/jobs/:jobId/preview-voice-effect`
  - Request body: `{ preset: string, mix: number }`
  - Generates 30-second audio preview with effect applied
  - Stores preview in object storage
  - Updates job metadata with status and previewAudioPath
- `POST /api/jobs/:jobId/apply-voice-filter`
  - Request body: `{ preset: string, mix: number }`
  - Preset validation: Must be one of the 13 available presets (4 expert, 5 outdoor, 2 communication, 2 original)
  - Mix range: 0-100 (converted to 0.0-1.0 decimal for FFmpeg, representing effect strength)
  - Runs asynchronously in background
  - Stores video path with effect, preset, and strength level in job metadata under `voiceFilter`

**UI Flow:**
- After successful lip-sync completion (with or without ambient enhancement), user sees:
  - Preset selector dropdown (13 options organized by category: Expert, Outdoor, Communication)
  - Effect strength slider (0-100%, default 50%)
- **Preview Workflow (Optional)**: User selects preset and adjusts strength → clicks "Preview Voice Effect" → hears 30-second audio sample → audio player displays at full volume regardless of strength slider
- **Apply Workflow**: User adjusts strength slider to desired level → clicks "Apply to Video" → system processes video with selected effect at current slider strength
- Preview audio always plays at full volume so users can hear the effect clearly; strength slider only controls FFmpeg wet/dry blend
- Polling updates status every 3 seconds with 2-minute timeout until completion
- Video with effect becomes available for download alongside other results
- **Iteration Support**: After video with effect is ready, "Try Different Effect" button allows users to reset and experiment with different presets or strength levels without reprocessing the lip-sync

## External Dependencies

*   **ElevenLabs API**: Used for instant voice cloning, speech-to-speech conversion with timing preservation, background noise removal, and ambient sound generation via Sound Effects API.
*   **FFmpeg**: Integrated for audio extraction, format conversion, video time-stretching, audio mixing, and metadata extraction.
*   **Google Cloud Storage**: Utilized for scalable object storage of project files.
*   **PostgreSQL (via Neon)**: The primary database for application data.
*   **Drizzle ORM**: Used for type-safe database interactions with PostgreSQL.
*   **Sync Labs API**: Integrated for high-quality, AI-driven lip-sync capabilities, specifically using the `lipsync-2-pro` model.