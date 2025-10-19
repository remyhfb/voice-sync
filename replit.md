# VoiceSwap - AI Voice Conversion Application

## Overview
VoiceSwap is an AI-powered application for voice cloning and video audio conversion using ElevenLabs Speech-to-Speech (S2S) technology. It enables users to clone voices and convert video audio while preserving lip-sync timing. The application offers a professional interface for managing voice clones, processing videos, and downloading perfectly synced results. The business vision is to provide a reliable and user-friendly tool for high-quality voice transformation in video content, targeting content creators, marketers, and media professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React, TypeScript, Vite, Wouter for routing, and TanStack Query for server state management. It features a professional dark theme with a vibrant purple primary color, built with `shadcn/ui` and Tailwind CSS. Modular components handle specific functionalities, and forms are managed with `react-hook-form` and Zod.

### Backend
The backend is built with Express.js, TypeScript, and ESM, following a RESTful design. It includes Multer for file uploads and FFmpeg for video/audio processing. A multi-step job processing pipeline handles status and progress tracking.

### Data Storage
PostgreSQL, accessed via Neon serverless driver and Drizzle ORM, stores persistent data for voice clones and processing jobs. Google Cloud Storage is integrated for scalable object storage of uploaded videos, extracted audio, and generated files with ACL support.

### Design Principles
VoiceSwap emphasizes processing transparency with visual feedback and real-time progress updates. It maintains technical professionalism with monospace fonts, quality metrics, and status badges. Workflow clarity is achieved through step-by-step pipeline visualization, estimated time displays, and user-friendly error messages.

### Core Features
*   **Speech-to-Speech (S2S) Voice Conversion:** Replaces the voice in a video while preserving the original acting, emotion, and prosody, maintaining perfect lip-sync. Uses ElevenLabs S2S API with `voice_conversion_strength: 1.0` for full voice replacement.
*   **Lip-Sync (Your Voice) Pipeline:** Allows users to provide their own voice recording for a video. The system cleans the audio, transcribes it, aligns segments, time-stretches video segments to match user timing, and applies AI lip-sync using Sync Labs. This preserves the creator's authentic voice performance.
*   **Automatic Silence Trimming:** Detects and trims leading/trailing silence from audio using FFmpeg's `silencedetect` filter before transcription/alignment, ensuring accurate speech content processing.
*   **Alignment Report System:** Generates detailed reports focused on timing and pace adjustments for iterative voice recording improvement. It provides specific, actionable feedback on segment timing deviations, categorizing them by severity and recommending re-recording for major issues.
*   **Three Processing Pipelines:**
    1.  **Speech-to-Speech (For VEO):** Recommended for AI-generated videos, preserving original emotion while replacing the voice.
    2.  **Time-Aligned TTS:** Generates speech from text with precise timing, resulting in neutral delivery.
    3.  **Lip-Sync (Your Voice):** Uses user's authentic voice acting with AI lip-sync for perfect synchronization.

## External Dependencies

*   **ElevenLabs Speech-to-Speech API**: For voice cloning, S2S conversion, and background noise removal.
*   **WhisperX (Replicate)**: For audio transcription with precise word-level timestamps.
*   **FFmpeg**: For audio extraction, format conversion, metadata extraction, and video time-stretching.
*   **Google Cloud Storage**: For scalable object storage.
*   **PostgreSQL (via Neon)**: Primary database for application data.
*   **Drizzle ORM**: For type-safe database interactions.
*   **Sync Labs API**: For high-quality AI lip-sync capabilities (using `lipsync-2-pro` model).