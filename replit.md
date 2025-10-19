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

#### Stage 2: Sound Design Regeneration (Beta)
An optional post-processing feature that recreates the VEO video's professional sound design (ambient noise + sound effects) using AI detection and generation. This is a completely separate pipeline triggered by an optional button after lip-sync completion.

**Technical Implementation:**
- **Python FastAPI Microservice** (`python-services/sound-detection/`): Uses `panns_inference` for precise temporal sound detection (10ms precision, 527 AudioSet classes)
- **Node.js Orchestrator** (`server/sound-regenerator.ts`): Coordinates detection, prompt generation, and audio mixing
- **ElevenLabs v2 API**: Generates ambient sounds and effects from AI-generated prompts
- **FFmpeg Integration**: Mixes generated audio with lip-synced video

**Deployment Requirements:**
The Python service requires separate deployment:
1. Install dependencies: `fastapi`, `uvicorn`, `panns_inference`, `torch`, `librosa`, `soundfile`, `numpy`
2. Run service: `uvicorn app:app --host 0.0.0.0 --port 8001`
3. Service must be accessible at `http://localhost:8001` for the orchestrator to work

**UI Flow:**
- Button appears after successful lip-sync completion (or after failed regeneration for retry)
- Polling updates status every 3 seconds, stops on completion/failure
- SoundDesignReport component displays detected sounds, confidence scores, generated prompts, and file paths

## External Dependencies

*   **ElevenLabs Speech-to-Speech API**: Used for instant voice cloning, speech-to-speech conversion with timing preservation, and background noise removal.
*   **FFmpeg**: Integrated for audio extraction, format conversion, and metadata extraction from video files.
*   **Google Cloud Storage**: Utilized for scalable object storage of project files.
*   **PostgreSQL (via Neon)**: The primary database for application data.
*   **Drizzle ORM**: Used for type-safe database interactions with PostgreSQL.
*   **Sync Labs API**: Integrated for high-quality, AI-driven lip-sync capabilities, specifically using the `lipsync-2-pro` model.