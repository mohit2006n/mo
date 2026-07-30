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
  canUseDocuments,
  maxFileBytes,
  maxTotalBytes,
  parallel,
} from './index.js';
```

### Core API Reference

#### `transform(request, options)`

Converts individual files or batch arrays of files on the client-side task queue. Maximum 2 GB per file and 4 GB total per batch.

- **Arguments**:
  - `request`: A request object `{ file, target, save }` or an array of request objects.
  - `options`: Optional configuration object (e.g. `{ onProgress, onStart, onComplete, onError }`).
- **Returns**: A Promise resolving to the conversion results.

#### `inspect(file)`

Analyzes file metadata to determine its category kind and supported output target formats.

- **Returns**: A Promise resolving to `{ rawExt, ext, kind, outputs }`.

#### `formats()`

Retrieves all configured format groups in the system.

- **Returns**: An array of supported format groups.

## Supported formats

Morph supports a comprehensive set of file format categories locally:

- **Images & Camera RAW**:
  - *Inputs*: PNG, APNG, JPG, JPEG, JFIF, WebP, BMP, GIF, SVG, ICO, AVIF, TIFF, TIF, HEIC, HEIF, TGA, RAW, DNG, CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2, RAF, ORF, RW2, PEF, RWL, 3FR, MRW, X3F
  - *Outputs*: PNG, JPG, WebP, BMP, TIFF, ICO, PDF, PPTX
- **Video & Animations**:
  - *Inputs*: MP4, WebM, MOV, MKV, AVI, WMV, FLV, M4V, F4V, MPEG, MPG, 3GP, 3G2, OGV, TS, MTS, M2TS, VOB, ASF, MXF, RM, RMVB, DIVX
  - *Outputs*: MP4, WebM, MOV, MKV, AVI, GIF, MP3, WAV, OGG, OPUS, FLAC, AIFF, M4A, AAC, SRT, WebVTT, ASS, TXT, HTML
- **Audio**:
  - *Inputs*: MP3, MP2, WAV, OGG, OGA, OPUS, FLAC, M4A, M4B, AAC, CAF, VOC, WMA, AC3, EAC3, AMR, APE, AU, MKA, AIFF, AIF, RA, TTA, DSF, DFF
  - *Outputs*: MP3, WAV, OGG, OPUS, FLAC, AIFF, M4A, AAC
- **Documents & Presentations**:
  - *Inputs*: DOCX, DOC, DOCM, DOTX, DOTM, PPTX, PPT, PPTM, PPS, PPSX, POTX, POTM, ODT, OTT, FODT, ODP, OTP, FODP, RTF, HTML, HTM, Markdown (MD), TXT, LOG
  - *Outputs*: DOCX, PPTX, PDF, HTML, Markdown, TXT
- **PDF & Ebooks**:
  - *Inputs*: PDF, EPUB, MOBI, AZW, AZW3
  - *Outputs*: PDF, DOCX, PPTX, HTML, Markdown, TXT, PNG, JPG
- **Spreadsheets, Data & Databases**:
  - *Inputs*: XLSX, XLS, XLSM, XLSB, XLTX, XLTM, ODS, OTS, FODS, CSV, TSV, JSON, NDJSON, YAML, YML, XML, TOML, INI, DBF, DIF, SYLK, SQLite (.sqlite, .sqlite3, .db)
  - *Outputs*: XLSX, ODS, CSV, TSV, JSON, NDJSON, YAML, XML, TOML, INI, PDF, HTML
- **Archives**:
  - *Inputs*: ZIP, RAR, 7Z, TAR, GZIP (GZ), TGZ
  - *Outputs*: ZIP, TAR, TGZ, GZIP (GZ)
- **Subtitles**:
  - *Inputs*: SRT, WebVTT, ASS, SSA
  - *Outputs*: SRT, WebVTT, ASS, TXT, HTML

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