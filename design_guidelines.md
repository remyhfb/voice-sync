# AI Voice Cloning Application - Design Guidelines

## Design Approach
**Reference-Based**: Drawing inspiration from professional AI/audio tools (ElevenLabs, Descript, Runway ML) with emphasis on clarity, processing visualization, and technical professionalism. This is a utility-focused application where functionality and user confidence are paramount.

## Core Design Principles
1. **Processing Transparency**: Clear visual feedback for all AI operations
2. **Technical Trust**: Professional aesthetics that inspire confidence in AI processing
3. **Workflow Clarity**: Obvious step-by-step progression through the voice cloning pipeline
4. **Minimal Distraction**: Subtle animations only for processing states, no decorative motion

---

## Color Palette

### Dark Mode (Primary)
- **Background**: 220 15% 8% (deep slate, near-black)
- **Surface**: 220 13% 12% (slightly elevated cards/panels)
- **Surface Elevated**: 220 12% 16% (active states, dropzones)
- **Primary**: 260 95% 65% (vibrant purple, AI/tech association)
- **Primary Muted**: 260 50% 45% (borders, subtle accents)
- **Success**: 142 76% 45% (processing complete, cloning success)
- **Text Primary**: 0 0% 98%
- **Text Secondary**: 220 10% 65%

### Light Mode
- **Background**: 0 0% 98%
- **Surface**: 0 0% 100%
- **Primary**: 260 85% 55%
- **Text Primary**: 220 15% 15%

---

## Typography

**Font Stack**: 
- Primary: 'Inter', system-ui, sans-serif (via Google Fonts CDN)
- Monospace: 'JetBrains Mono', monospace (for technical data: file names, timestamps, audio specs)

**Hierarchy**:
- **Hero/Page Titles**: text-4xl md:text-5xl, font-bold, tracking-tight
- **Section Headers**: text-2xl md:text-3xl, font-semibold
- **Card Titles**: text-lg font-semibold
- **Body Text**: text-base, font-normal, leading-relaxed
- **Labels**: text-sm font-medium, uppercase tracking-wide (for form labels)
- **Technical Data**: text-sm font-mono (file names, durations, formats)
- **Captions**: text-xs text-muted

---

## Layout System

**Spacing Primitives**: Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., p-4, gap-6, mt-8)

**Container Strategy**:
- App Layout: max-w-7xl mx-auto px-6 lg:px-8
- Processing Cards: max-w-4xl for focused workflows
- Sidebar Panels: w-80 for voice library/history

**Grid Patterns**:
- File Upload Zone: Full-width prominent cards
- Voice Library: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Processing Steps: Vertical timeline layout

---

## Component Library

### A. File Upload Zone
- **Drag-and-drop areas**: Large (min-h-64), dashed borders (border-2 border-dashed), hover state with bg-surface-elevated
- **Active drop state**: border-primary bg-primary/5
- **File preview cards**: Show waveform visualization, filename, duration, file size
- **Multiple file support**: Visual stack with +N more indicator

### B. Voice Clone Cards
- **Compact cards** showing: Voice name, audio sample count, creation date, clone quality indicator
- **Action buttons**: Play sample (preview), Use voice, Delete
- **Status badges**: "Cloning..." (animated pulse), "Ready" (success green)

### C. Processing Pipeline
- **Step Indicator**: Vertical timeline with icons and progress bars
  - Upload → Extract Audio → Transcribe → Clone Voice → Generate → Download
- **Expandable details**: Click step to view logs, processing time, quality metrics
- **Progress visualization**: Animated progress bars with percentage, estimated time remaining

### D. Audio Player
- **Waveform visualization**: Canvas-based with playback scrubbing
- **Minimal controls**: Play/pause, timestamp, speed controls (0.5x, 1x, 1.5x, 2x)
- **A/B Comparison**: Toggle between original and cloned audio

### E. Transcription Editor
- **Editable text area**: Large, readable text with word highlighting during playback
- **Timestamp markers**: Click word to jump to audio position
- **Edit indicators**: Unsaved changes badge, auto-save status

### F. Download Section
- **Prominent CTA**: Large button "Download AI Audio" with file format options
- **File info card**: Shows output format, bitrate, file size, duration
- **Secondary actions**: Download transcription (TXT/SRT), Download metadata (JSON)

### G. Navigation
- **Sidebar layout**: 
  - Logo + app name top-left
  - Main workflow tabs: Create, Voice Library, Projects, Settings
  - User profile bottom-left
- **Tab indicators**: Border-l-2 border-primary for active state

### H. Settings Panel
- **API Configuration**: ElevenLabs API key input (password field with show/hide)
- **Voice Quality Settings**: Slider for similarity, stability, style exaggeration
- **Output Preferences**: Format selection (MP3, WAV), bitrate options
- **Processing Options**: Toggle background noise removal, auto-transcribe

---

## Icons
**Library**: Heroicons (outline style via CDN)
- Upload: cloud-arrow-up
- Processing: cog-6-tooth (animated spin during processing)
- Voice: microphone
- Video: video-camera
- Audio: musical-note
- Success: check-circle
- Download: arrow-down-tray
- Edit: pencil
- Play/Pause: play/pause
- Delete: trash

---

## Images
**Hero Section**: NO large hero image - this is a utility app
**Product Screenshots**: Small inline screenshots showing example waveforms or processing results in feature cards if needed
**Empty States**: Use illustrations for empty voice library (Heroicons + text)

---

## Interaction Patterns

### File Upload Flow
1. Drag-and-drop zone prominent on page load
2. Files appear as preview cards below upload zone
3. Automatic validation (file type, size) with error states
4. Batch processing support with queue visualization

### Processing States
- **Idle**: Neutral colors, clear CTAs
- **Processing**: Animated spinner + progress bar, disable interactions
- **Complete**: Success color flash, enable download
- **Error**: Red accent, clear retry button, error message detail

### Accessibility
- **Focus indicators**: 2px ring-primary ring-offset-2 on all interactive elements
- **Keyboard navigation**: Tab through all controls, Enter/Space to activate
- **Screen reader labels**: Descriptive aria-labels for all icons and actions
- **Color contrast**: WCAG AAA compliance for all text (7:1 ratio minimum)
- **Dark mode**: Consistent implementation across all inputs, modals, dropdowns

---

## Unique Elements

**Waveform Visualizer**: Canvas-based audio waveform with:
- Gradient fill (primary color at 50% opacity)
- Playhead indicator (vertical line, primary color)
- Scrubbing interaction (click/drag to navigate)
- Dual waveform comparison view for original vs. cloned

**Quality Meter**: Visual indicator for voice clone quality:
- Circular progress ring showing similarity percentage
- Color-coded: 90-100% (success green), 70-89% (warning amber), <70% (error red)
- Tooltip explaining quality factors

**Processing Timeline**: Animated step visualization:
- Each step: Icon + label + estimated time
- Active step: Pulsing animation, primary color
- Completed steps: Success check, muted color
- Failed steps: Error icon, red accent with retry option