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

### Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, handles persistent data for voice clones and processing jobs. Google Cloud Storage is integrated for scalable object storage of uploaded videos, extracted audio, and generated files with ACL support.

### Design Principles
VoiceSwap emphasizes processing transparency through visual feedback and real-time progress updates. It maintains technical professionalism with monospace fonts, quality metrics, and professional status badges, ensuring workflow clarity via step-by-step pipeline visualization and user-friendly messages.

### Feature Specifications
The system offers three primary processing pipelines:
1.  **Speech-to-Speech (For VEO)**: Preserves professional acting/emotion while replacing the voice.
2.  **Time-Aligned TTS**: Generates speech from text with word-level timing precision but neutral delivery.
3.  **Lip-Sync (Your Voice)**: A hybrid approach using the user's authentic voice acting combined with AI lip-sync technology. This pipeline includes audio cleanup (ElevenLabs), transcription (Whisper), segment alignment, video time-stretching (FFmpeg), and final lip-sync (Sync Labs).

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

## External Dependencies

*   **ElevenLabs API**: Used for instant voice cloning, speech-to-speech conversion with timing preservation, background noise removal, and ambient sound generation via Sound Effects API.
*   **FFmpeg**: Integrated for audio extraction, format conversion, video time-stretching, audio mixing, and metadata extraction.
*   **Google Cloud Storage**: Utilized for scalable object storage of project files.
*   **PostgreSQL (via Neon)**: The primary database for application data.
*   **Drizzle ORM**: Used for type-safe database interactions with PostgreSQL.
*   **Sync Labs API**: Integrated for high-quality, AI-driven lip-sync capabilities, specifically using the `lipsync-2-pro` model.