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

### Pacing Report System
The application includes an optional pacing analysis system that provides users with detailed feedback on their voice performance timing. This feature is **separate from the main processing pipeline** and requires users to manually upload files for analysis.

**Speech-Only Duration Measurement**: The system uses Silero VAD (Voice Activity Detection) to calculate pure speech duration, excluding all silence and pauses. This ensures accurate pacing measurements that reflect actual speaking speed rather than total segment duration.

**Technical Implementation**:
- **Python Service** (`server/vad-service.py`): Uses Silero VAD model from Torch Hub with soundfile for audio I/O
- **Backend Endpoint** (`/api/jobs/:id/analyze-pacing`): Accepts file uploads, extracts audio from VEO video using FFmpeg, runs VAD analysis, and stores results in job metadata
- **Frontend Component** (`VadPacingAnalysis`): Provides upload interface for VEO video and user audio files, displays detailed results with visual feedback
- **Audio Processing**: Handles mono/stereo conversion, resamples to 16kHz, uses 0.5 confidence threshold for speech detection

**7-Tier Classification System**:
- **Perfect** (97-103% of VEO speed): Timing matches the video perfectly
- **Slightly Fast** (90-97%): Minor speed adjustment needed
- **Fast** (75-90%): Noticeable speed difference
- **Critically Fast** (<75%): Major pacing issue requiring significant adjustment
- **Slightly Slow** (103-110%): Minor slowdown detected
- **Slow** (110-125%): Noticeable slowdown
- **Critically Slow** (>125%): Major pacing issue requiring significant adjustment

**Report Components**:
- **Summary Statistics**: Overall pacing ratio, VEO speech duration, user speech duration, and classification badge
- **Actionable Guidance**: Specific recommendations based on pacing classification (e.g., "Try speaking slightly faster" or "Perfect match!")
- **Visual Indicators**: Color-coded badges and icons (green for perfect, yellow/orange for moderate issues, red for critical issues)

**Workflow**: After a lip-sync job completes, users can optionally run pacing analysis by uploading the VEO video file and their user audio file. The analysis result is stored in job metadata and displayed on the creation page. This decoupled approach ensures the main processing pipeline remains fast and reliable while still providing pacing insights when needed.

## External Dependencies

*   **ElevenLabs Speech-to-Speech API**: Used for instant voice cloning, speech-to-speech conversion with timing preservation, and background noise removal.
*   **FFmpeg**: Integrated for audio extraction, format conversion, and metadata extraction from video files.
*   **Google Cloud Storage**: Utilized for scalable object storage of project files.
*   **PostgreSQL (via Neon)**: The primary database for application data.
*   **Drizzle ORM**: Used for type-safe database interactions with PostgreSQL.
*   **Sync Labs API**: Integrated for high-quality, AI-driven lip-sync capabilities, specifically using the `lipsync-2-pro` model.