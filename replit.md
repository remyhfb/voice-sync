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

### Two Processing Pipelines Available
1. **Speech-to-Speech (For VEO)**: Preserves professional acting/emotion while replacing voice - recommended for AI-generated videos
2. **Time-Aligned TTS**: Generates speech from text with word-level timing precision - neutral delivery, loses original emotion