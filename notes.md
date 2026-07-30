# Morph

## What it is

Morph is a static file converter that processes files directly on the user’s device. It supports individual files and mixed batches without requiring uploads, accounts, analytics, or a remote conversion service.
Users can select an output for each file, convert selected files together, and download converted files individually or together as a ZIP.

## Why it exists

Most online converters require file uploads and separate websites for documents, images, media, archives, and data. Morph combines those workflows into one project while keeping file processing on the device.
Its goals are:

- Broad practical format support
- Strong output quality
- Simple batch conversion
- No account requirement
- No file uploads
- Clear separation between frontend and processing code
- A stable contract for future server integration

## How it works

1. **Add files**: Drag and drop or choose one file or a batch of files.
2. **Pick formats**: Choose an output format for each file or set a target for all compatible items.
3. **Convert**: Processing runs on your device using WebAssembly and JavaScript engines.
4. **Save outputs**: Download files individually or grab everything together in one ZIP package.

## What it supports

### Documents and presentations

Word, PowerPoint, OpenDocument, HTML, Markdown, text, EPUB, RTF, and related formats.
Rich routes preserve fonts, colors, tables, images, layout, pages, and positioning when possible.

### PDF

PDF can be converted to:

- Editable DOCX
- Editable PPTX
- TXT
- PNG
- JPG
  Recognized text remains editable with approximate positioning, size, font, weight, and color. Complex graphics stay in a high-quality background layer.

### Spreadsheets and data

Excel, ODS, CSV, TSV, JSON, NDJSON, YAML, XML, TOML, INI, DBF, DIF, and SYLK.
XLSX and ODS conversion can retain formulas, formatting, sheets, data types, and column information.

### Images

Common images, SVG, AVIF, HEIC, TIFF, TGA, and camera RAW formats (CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF).
Same-format output preserves the original.

### Media

Common audio and video formats (MP4, WebM, MKV, AVI, MOV, MP3, WAV, OGG, FLAC, AAC, M4A) with support for metadata, chapters, multiple audio tracks, subtitles, attachments, and orientation where the target allows them.

### Additional formats

- ZIP, RAR, 7Z, TAR, GZIP, and TGZ archives
- DRM-free MOBI and AZW ebooks
- SRT, WebVTT, ASS, and SSA subtitles
- SQLite databases (.sqlite, .db)

## Project ideas

- **Decoupled Architecture**: Strict isolation between UI representation and processing pipeline.
- **Parallel Work Scheduling**: Task concurrency and memory weighting based on available system RAM and logical processors.
- **Unified Transformation Interface**: A single polymorphic `transform()` function handling individual objects and array batches automatically.
- **Client-Side Heavy Processing**: Utilizing WebAssembly engines (`LibreOffice`, `FFmpeg`, `PDF.js`, `SheetJS`, `libarchive`, `sql.js`) for on-device processing.
- **Modular Adapter System**: Pluggable converter adapters (`media`, `suite`, `browser`) allowing seamless expansion for future format handlers or network services.
  The processing code does not depend on the frontend.

## Programmatic usage

The converter can be imported directly into other JavaScript applications:

```js
import { transform, inspect, formats } from './index.js';
// 1. Get all supported file formats in the system
const allFormats = formats();
// 2. Check what formats a specific file can be converted into
const fileInfo = await inspect(file);
// fileInfo.outputs -> ['pdf', 'html', 'txt']
// 3. Convert a single file
const output = await transform({
  file,
  target: 'pdf',
});
// 4. Convert multiple files at once
const outputs = await transform(
  [
    { file: fileA, target: 'pdf' },
    { file: fileB, target: 'png' },
  ],
  {
    onProgress: (item) => {
      // Track progress (0 to 100%)
    },
  }
);
```

## Development and setup

To run with full features (including multithreaded WebAssembly for DOCX, PPTX, and spreadsheets):

1. Serve the files from an HTTP server on a single origin.
2. Include the required headers from `serve.json`:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`

## Do

- Serve the full project from one origin.
- Use HTTPS when hosted.
- Keep the required isolation headers (`COOP`/`COEP`).
- Keep all bundled libraries with the project.
- Test with real examples before publishing changes.
- Preserve the license (MIT License).
- Add separate server-compatible handlers if a paid network service is created later.

## Don’t

- Don’t open `index.html` directly through `file://`.
- Don’t remove `serve.json` for development use.
- Don’t expect plain formats such as TXT, CSV, or JSON to retain visual styling.
- Don’t expect macros, missing fonts, or unsupported embedded media to survive conversion.
- Don’t expect protected archives or DRM-protected ebooks to work.
- Don’t store billing secrets or service credentials in client code.
- Don’t treat the current processing code as a Node.js server.

## Practical limits

- Maximum accepted input is 2 GB per individual file and 4 GB total per conversion session, but available memory may lower the practical limit.
- Large media, documents, and camera RAW files require more memory and time.
- Scanned PDFs require OCR before their text can become editable.
- Background tabs may be slowed by the browser.
- Offline support is powered by `sw.js`, caching app assets and WebAssembly modules locally after initial load.