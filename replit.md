# VoiceSwap - AI Voice Conversion Application

## Overview

VoiceSwap is an AI-powered voice conversion application that enables users to clone voices using ElevenLabs and convert video audio using Speech-to-Speech (S2S) technology while preserving perfect lip-sync timing. The application provides a professional interface for managing voice clones, processing videos with voice conversion, and downloading perfectly synced results.

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
- DatabaseStorage class implementing IStorage interface for all CRUD operations
- Persistent data storage for voice clones and processing jobs

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

**ElevenLabs Speech-to-Speech API**
- Voice cloning from audio samples (instant, no training wait time)
- Speech-to-Speech conversion that preserves timing and prosody perfectly
- Transforms existing audio to match cloned voice while maintaining exact timing
- Maintains perfect lip-sync with original video
- Background noise removal built-in

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

## Recent Changes (October 18, 2025)

### Speech-to-Speech Voice Conversion Fix (October 18, 2025)
**Problem Solved:** S2S conversion preserved source accent instead of fully converting to cloned voice. British accent remained when converting to American voice clone.

**Root Cause:** ElevenLabs defaults `voice_conversion_strength` to 0.3, which only mixes 30% of target voice with 70% of source, preserving original accent characteristics.

**Solution:** Added voice_settings parameter to speechToSpeech() with optimal defaults:
- `voice_conversion_strength: 1.0` - Full voice replacement (was defaulting to 0.3)
- `similarity_boost: 0.75` - High similarity to cloned voice
- `stability: 0.5` - Balanced stability for natural speech
- All parameters configurable via options for fine-tuning

**Technical Implementation:**
- Updated `ElevenLabsService.speechToSpeech()` to accept voiceSettings option
- FormData now includes voice_settings JSON with optimal conversion parameters
- Maintains backward compatibility with existing calls

### Dialog UI Fix (October 18, 2025)
**Problem Solved:** "Create Voice Clone" button disappeared when uploading multiple audio files in the voice creation dialog.

**Root Cause:** DialogContent was a single scrollable column, causing DialogFooter to scroll off-screen when FileUploadZone expanded with selected file cards.

**Solution:** Restructured dialog layout using flex column architecture:
- DialogContent: `flex flex-col` for vertical stacking
- Form body: `flex-1 overflow-y-auto` for scrollable content area
- DialogFooter: `flex-shrink-0` to pin at bottom (never scrolls)

**Technical Implementation:**
- Ensures action buttons remain accessible regardless of content height
- Works across all screen sizes and viewport heights
- Maintains proper spacing with `pr-2` for scrollbar clearance

### Database Persistence Implementation (October 18, 2025)
**Problem Solved:** Application was using in-memory storage, causing data loss on server restarts and preventing production deployments.

**Solution:** Implemented PostgreSQL database persistence using Drizzle ORM:
- Created `server/db.ts` with Neon serverless database connection
- Implemented `DatabaseStorage` class using Drizzle queries for all CRUD operations
- Replaced in-memory storage with persistent database storage
- Fixed production DNS error by simplifying WebSocket configuration
- Fixed temp file path cleanup: Using `null` instead of `undefined` to properly clear paths
- Made `samplePaths` nullable in schema to allow cleanup after processing
- Added missing `GET /api/jobs` endpoint for fetching all jobs

**Technical Implementation:**
- PostgreSQL database with Drizzle ORM for type-safe queries
- Neon serverless driver for scalable database connections
- DatabaseStorage implements IStorage interface for consistency
- Proper null handling for optional fields (temp file paths cleared after processing)
- Automatic schema migrations with `npm run db:push`

### Complete Pivot to ElevenLabs Speech-to-Speech (October 18, 2025)
**Problem Solved:** Replicate's RVC training endpoint became completely disabled ("Version not trainable" errors across all versions). Previous TTS approach also broke lip-sync by generating entirely new audio.

**Solution:** Migrated to ElevenLabs Speech-to-Speech API, which provides:
- Instant voice cloning (no multi-minute training wait)
- Speech-to-Speech conversion that preserves exact timing/prosody
- Perfect lip-sync preservation
- Production-ready, reliable API

**Changes Made:**
- Created ElevenLabs service with `speechToSpeech()` method for voice conversion
- Updated database schema: replaced `rvcModelUrl` and `rvcTrainingId` with `elevenLabsVoiceId`
- Updated voice training route to use ElevenLabs voice cloning (instant completion)
- Updated video processing route to use ElevenLabs S2S instead of RVC
- Updated frontend to reference ElevenLabs instead of RVC
- Added `errorStack` field to job metadata for better error tracking

**Technical Implementation:**
- Voice cloning: Upload audio samples → Get voice ID (seconds, not minutes)
- Video processing: Extract audio → S2S conversion → Merge audio back to video
- Progress tracking: 0-30% (extraction) → 30-80% (S2S) → 80-100% (merge)
- Automatic cleanup of temp files with try/finally blocks

## Previous Changes

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
- Used for voice cloning and speech-to-speech conversion
- Without this key, voice creation and processing will return 503 errors

**Object Storage** (Auto-configured by Replit)
- DEFAULT_OBJECT_STORAGE_BUCKET_ID
- PRIVATE_OBJECT_DIR
- PUBLIC_OBJECT_SEARCH_PATHS


## Current Status

The application uses ElevenLabs Speech-to-Speech for perfect lip-sync:
- ✅ Instant voice cloning with ElevenLabs
- ✅ Video upload and audio extraction with FFmpeg
- ✅ Speech-to-Speech conversion (preserves timing perfectly)
- ✅ Audio-video merging with perfect lip-sync
- ✅ Object storage for file persistence
- ✅ Real-time progress tracking
- ✅ Professional UI with dark theme and purple accent
- ✅ ElevenLabs API integration

**Key Technology:** Speech-to-Speech conversion transforms the existing audio to match your cloned voice while preserving the exact same timing, pauses, and delivery - resulting in perfect lip-sync!
