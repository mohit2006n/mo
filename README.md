# Morph

A file converter for everyday work. It handles documents, PDFs, presentations, spreadsheets, images, audio, video, structured data, archives, ebooks, subtitles, and databases in one place—preserving original file resolution and quality.

## Purpose

Many online converters require uploading files to remote servers or downscaling quality. This project runs entirely on your device—no accounts, no tracking, no file downscaling, and no file uploads.
It supports mixed batches, so every file in a queue can be converted into its own compatible format while retaining original quality.

## How it works

1. **Add files**: Drag and drop or choose one file or a batch of files.
2. **Pick formats**: Choose an output format for each file or set a target for all compatible items.
3. **Convert**: Processing runs on your device using WebAssembly and JavaScript engines.
4. **Save outputs**: Download files individually or grab everything together in one ZIP package.

## Programmatic usage

The converter exposes a flat, functional API. Import the needed functions directly:

```js
import {
  transform,
  inspect,
  formats,
  beginBatch,
  createZip,
  readResult,
  deleteResult,
  clearExpiredResults,
  dispose,
} from './index.js';
```

### Core API Reference

#### `transform(request, options)`

Converts individual files or batch arrays of files on the client-side task queue. Enforces a 2 GB per-file size limit and 4 GB total size limit.

- **Arguments**:
  - `request`: A request object `{ file, target, persistResult }` or an array of request objects.
  - `options`: Optional configuration object (e.g. `{ onProgress, onStart, onComplete, onError }`).
- **Returns**: A Promise resolving to the conversion results.

#### `inspect(file)`

Analyzes file metadata to determine its category kind and supported output target formats.

- **Returns**: A Promise resolving to `{ rawExt, ext, kind, outputs }`.

#### `formats()`

Retrieves all configured format groups in the system.

- **Returns**: An array of supported format groups.

## Supported formats

Common formats covered across major categories:

- **Documents & Presentations**: DOCX, PPTX, ODT, ODP, HTML, Markdown, TXT, EPUB, RTF
- **PDF**: Convert PDF to DOCX, PPTX, TXT, PNG, and JPG
- **Spreadsheets & Data**: XLSX, XLS, ODS, CSV, TSV, JSON, NDJSON, YAML, XML, TOML, INI, DBF, DIF, SYLK
- **Images & RAW**: PNG, JPEG, WebP, SVG, AVIF, HEIC, TIFF, TGA, and camera RAW formats (CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF)
- **Audio & Video**: MP4, WebM, MKV, AVI, MOV, MP3, WAV, OGG, FLAC, AAC, M4A, OPUS, AIFF
- **Archives**: ZIP, RAR, 7Z, TAR, GZIP, TGZ
- **Subtitles & Ebooks**: SRT, WebVTT, ASS, SSA, MOBI, AZW
- **Databases**: SQLite (.sqlite, .db)

## Lossless Conversion Quality

Every conversion preserves original file quality and dimensions:

- **Video & Media**: Retains 100% original resolution, frame rates, and audio bitrates without downscaling or quality degradation.
- **Documents & Rich Formats**: Same-format outputs preserve original file layouts, text styling, fonts, tables, formulas, positioning, and embedded images whenever supported by the target format.
  Plain formats (TXT, CSV, JSON) focus on raw content. Output styling may vary if a source file relies on missing fonts or custom formatting.

## Data handling

Files are never uploaded anywhere. Processing happens directly on the device with 100% lossless fidelity, and completed files remain in memory until downloaded or cleared.

## Progressive Web App & Offline Support

Morph is fully installable as a Progressive Web App (PWA) on desktop and mobile browsers. Once loaded or installed, all static assets and conversion modules are cached locally via `sw.js` so you can use Morph completely offline without an internet connection.

## Development and setup

To run with full features (including multithreaded WebAssembly for DOCX, PPTX, and spreadsheets):

1. Serve the files from an HTTP server on a single origin.
2. Include the required headers from `serve.json`:
   - `Cross-Origin-Opener-Policy: same-origin`
   - `Cross-Origin-Embedder-Policy: require-corp`
     _(When hosted on static services like GitHub Pages without header configuration, `sw.js` automatically attaches these headers to responses)._

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more details.
Check out the [GitHub profile](https://github.com/mohit-ksahu) for updates and related projects.