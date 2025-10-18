# VoiceSwap - AI Voice Conversion Application

## Overview

VoiceSwap is an AI-powered voice conversion application that enables users to train RVC (Retrieval-based Voice Conversion) models from audio samples and convert video audio to match the trained voice while preserving perfect lip-sync timing. The application provides a professional interface for managing voice models, processing videos with voice conversion, and downloading perfectly synced results.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & UI Library**
- React with TypeScript for type safety and better developer experience
- Vite as the build tool and development server for fast hot module replacement
- Wouter for lightweight client-side routing without the overhead of React Router
- TanStack Query (React Query) for server state management, caching, and data synchronization

**Design System**
- shadcn/ui component library built on Radix UI primitives for accessible, unstyled components
- Tailwind CSS for utility-first styling with custom design tokens
- Dark mode as the primary theme with light mode support via ThemeProvider
- Custom CSS variables for consistent spacing, colors, and elevation states
- Professional color palette inspired by AI/audio tools (ElevenLabs, Descript) with vibrant purple primary color

**Component Architecture**
- Modular component structure with separation of UI components, pages, and business logic
- Custom components for domain-specific functionality (FileUploadZone, ProcessingTimeline, VoiceCloneCard, QualityMeter)
- Form handling with react-hook-form and Zod for validation
- Toast notifications for user feedback using custom toast hook

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for type-safe API development
- ESM (ES Modules) for modern JavaScript module support
- Custom route registration pattern for organized API endpoints

**API Structure**
- RESTful API design with clear resource separation:
  - `/api/voices` - Voice clone management
  - `/api/jobs` - Processing job tracking
  - `/api/objects` - File storage and retrieval
  - `/public-objects` - Public file access
- Multer middleware for multipart form data and file uploads
- FormData handling for file uploads to external services

**Processing Pipeline**
- FFmpeg integration for video/audio processing (extraction, metadata, format conversion)
- Multi-step job processing with status tracking (pending → processing → completed/failed)
- Progress reporting for long-running operations

### Data Storage

**Database**
- PostgreSQL via Neon serverless driver for production scalability
- Drizzle ORM for type-safe database queries and schema management
- In-memory storage fallback for development/testing (MemStorage class)

**Schema Design**
- `voice_clones` table: Stores voice clone metadata, ElevenLabs voice IDs, sample references, status, and quality scores
- `processing_jobs` table: Tracks video processing workflows with type, status, progress, file paths, and metadata
- JSONB columns for flexible metadata storage without schema changes

**File Storage**
- Google Cloud Storage integration for scalable object storage
- Custom ObjectStorageService with ACL (Access Control List) support
- Public and private object access patterns with search capabilities
- Replit-specific authentication using external account credentials with sidecar endpoint

### External Dependencies

**Replicate API (RVC)**
- Voice model training from audio samples using RVC (Retrieval-based Voice Conversion)
- Voice-to-voice conversion that preserves timing and prosody perfectly
- Training cost: ~$0.11 per model (~2 minutes)
- Conversion cost: ~$0.002 per video (~8 seconds)
- Maintains exact lip-sync with original video

**FFmpeg**
- Audio extraction from video files
- Format conversion (MP3, various audio codecs)
- Metadata extraction (duration, format, size)
- Installed via @ffmpeg-installer/ffmpeg for cross-platform compatibility

**Google Cloud Storage**
- Object storage for uploaded videos, extracted audio, and generated files
- Credential management via Replit sidecar service
- Bucket-based organization with custom ACL policies

**Development Tools**
- Replit-specific plugins for development experience (cartographer, dev-banner, runtime error overlay)
- TypeScript for static type checking across the entire codebase
- Drizzle Kit for database migrations and schema management

### Authentication & Authorization

- Object-level access control using custom ACL system
- Owner-based permissions with visibility controls (public/private)
- Permission types: READ and WRITE
- Extensible group-based access control structure (prepared for future user/group features)

### Design Principles

**Processing Transparency**
- Visual feedback for all AI operations through ProcessingTimeline component
- Real-time progress updates via polling (2-second intervals for active jobs)
- Clear status indicators (pending, processing, completed, failed)

**Technical Professionalism**
- Monospace fonts (JetBrains Mono) for technical data display
- Quality metrics with visual representations (QualityMeter component)
- Professional color-coded status badges

**Workflow Clarity**
- Step-by-step processing pipeline visualization
- Estimated time displays for operations
- Error message handling with user-friendly feedback

## Recent Changes (October 2025)

### Manual Transcription Editing (Completed)
- Added transcription editor that pauses processing at "awaiting_review" status
- Users can review and edit transcribed text before voice generation
- Save/Continue workflow with proper state management
- Race condition prevention: Continue button disabled during unsaved changes
- Error handling ensures edits are persisted before continuing
- Backend re-fetches job to use edited transcription for voice synthesis

### Audio-Video Merging (Completed)
- FFmpeg-based merging produces final MP4 files with cloned voice audio
- Automatically replaces original audio track with generated voice
- Both audio-only and merged video files uploaded to object storage
- Download UI shows prominent video download with audio as secondary option
- Conditional merging: Only processes video if original upload included video
- Progress tracking through merge phase (70% → 80% → 95% → 100%)

### Object Storage Integration
- Completed full integration with Google Cloud Storage for file persistence
- Generated audio files are now uploaded to object storage after creation
- Download links use proper `/objects/...` paths that work with the object storage service
- Automatic cleanup of temporary files after upload

### Error Handling Improvements
- Added API key validation at endpoint level (returns 503 Service Unavailable when ELEVENLABS_API_KEY is missing)
- Improved error messages to guide users on configuration requirements
- Better error propagation with failed job status updates

### Job Processing Fixes
- Fixed job polling to fetch specific jobs by ID instead of all jobs
- Proper progress tracking through all pipeline stages (extraction → transcription → review → generation → merge → upload)
- Real-time status updates via TanStack Query with 2-second polling intervals

## Setup Requirements

### Required Environment Variables

**ELEVENLABS_API_KEY** (Required)
- Obtain from https://elevenlabs.io/
- Used for voice cloning and text-to-speech generation
- Without this key, voice creation and processing will return 503 errors

**Object Storage** (Auto-configured by Replit)
- DEFAULT_OBJECT_STORAGE_BUCKET_ID
- PRIVATE_OBJECT_DIR
- PUBLIC_OBJECT_SEARCH_PATHS

**OpenAI** (Auto-configured via integration)
- OPENAI_API_KEY - Used for Whisper transcription

## Current Status

The application is rebuilt with RVC voice conversion for perfect lip-sync:
- ✅ RVC voice model training from audio samples
- ✅ Video upload and audio extraction with FFmpeg
- ✅ Voice-to-voice conversion (preserves timing perfectly)
- ✅ Audio-video merging with perfect lip-sync
- ✅ Object storage for file persistence
- ✅ Real-time progress tracking
- ✅ Professional UI with dark theme and purple accent
- ✅ Replicate API integration

**Key Difference:** Instead of text-to-speech (which changes timing), we use voice conversion that transforms the audio while keeping the exact same timing as the original - resulting in perfect lip-sync!
