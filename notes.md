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

### Documents & Presentations
- **Inputs**: DOCX, DOC, DOCM, DOTX, DOTM, PPTX, PPT, PPTM, PPS, PPSX, POTX, POTM, ODT, OTT, FODT, ODP, OTP, FODP, RTF, HTML, HTM, Markdown (MD), TXT, LOG, EPUB
- **Outputs**: DOCX, PPTX, PDF, HTML, Markdown, TXT
Rich routes preserve fonts, colors, tables, images, layout, pages, and positioning when possible.

### PDF & Ebooks
- **Inputs**: PDF, EPUB, MOBI, AZW, AZW3
- **Outputs**:
  - *PDF*: TXT, DOCX, PPTX, PNG, JPG
  - *Ebooks (MOBI/AZW/AZW3)*: HTML, TXT, PDF, DOCX, PPTX
Recognized text remains editable with approximate positioning, size, font, weight, and color. Complex graphics stay in a high-quality background layer.

### Spreadsheets, Data & Databases
- **Inputs**: XLSX, XLS, XLSM, XLSB, XLTX, XLTM, ODS, OTS, FODS, CSV, TSV, JSON, NDJSON, YAML, YML, XML, TOML, INI, DBF, DIF, SYLK (SLK), SQLite (.sqlite, .sqlite3, .db)
- **Outputs**:
  - *Spreadsheets & Data*: XLSX, ODS, CSV, TSV, JSON, NDJSON, YAML, XML, TOML, INI, PDF, HTML
  - *Databases (SQLite)*: JSON, XLSX, CSV, HTML
XLSX and ODS conversion retains formulas, formatting, sheets, data types, and column information.

### Images & Camera RAW
- **Inputs**: PNG, APNG, JPG, JPEG, JFIF, WebP, BMP, GIF, SVG, ICO, AVIF, TIFF, TIF, HEIC, HEIF, TGA, RAW, DNG, CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2, RAF, ORF, RW2, PEF, RWL, 3FR, MRW, X3F
- **Outputs**: PNG, JPG, WebP, BMP, TIFF, ICO, PDF, PPTX

### Video & Animations
- **Inputs**: MP4, WebM, MOV, MKV, AVI, WMV, FLV, M4V, F4V, MPEG, MPG, 3GP, 3G2, OGV, TS, MTS, M2TS, VOB, ASF, MXF, RM, RMVB, DIVX
- **Outputs**: MP4, WebM, MOV, MKV, AVI, GIF, MP3, WAV, OGG, OPUS, FLAC, AIFF, M4A, AAC

### Audio
- **Inputs**: MP3, MP2, WAV, OGG, OGA, OPUS, FLAC, M4A, M4B, AAC, CAF, VOC, WMA, AC3, EAC3, AMR, APE, AU, MKA, AIFF, AIF, RA, TTA, DSF, DFF
- **Outputs**: MP3, WAV, OGG, OPUS, FLAC, AIFF, M4A, AAC

### Archives
- **Inputs**: ZIP, RAR, 7Z, TAR, GZIP (GZ), TGZ
- **Outputs**: ZIP, TAR, TGZ, GZIP (GZ)

### Subtitles
- **Inputs**: SRT, WebVTT, ASS, SSA
- **Outputs**: SRT, WebVTT, ASS, TXT, HTML

## Project ideas

- **Decoupled Architecture**: Strict isolation between UI representation and processing pipeline.
- **Parallel Work Scheduling**: Task concurrency and memory weighting based on available system RAM and logical processors (`parallel`).
- **Unified Transformation Interface**: A single polymorphic `transform()` function handling individual objects and array batches automatically.
- **Client-Side Heavy Processing**: Utilizing WebAssembly engines (`ZetaOffice/LibreOffice`, `FFmpeg`, `libarchive`, `sql.js`) and client-side JavaScript/Canvas engines (`PDF.js`, `SheetJS`, `mammoth`, `marked`, `turndown`, `js-yaml`, `smol-toml`, `docx`, `pptxgenjs`) for on-device processing.
- **Modular Domain Processing**: Dedicated converter domain handlers (`media`, `document`/`suite`, `word`, `presentation`, `image`, `data`, `database`, `archive`, `ebook`, `subtitle`) ensuring clear separation of format logic.
  The processing code does not depend on the frontend.

## Programmatic usage

The converter can be imported directly into other JavaScript applications:

```js
import {
  transform,
  inspect,
  formats,
  canUseDocuments,
  maxFileBytes,
  maxTotalBytes,
  parallel,
  storeFile,
  readFile,
  deleteFile,
  clearStorage,
  zipFiles,
} from './index.js';

// 1. Get all supported file format groups
const allFormats = formats();

// 2. Check if rich Wasm document suite conversion is available
if (canUseDocuments()) {
  console.log('Cross-Origin Isolation is active.');
}

// 3. Inspect target outputs for a file
const fileInfo = await inspect(file);
// fileInfo.outputs -> ['docx', 'pptx', 'png', 'jpg', 'txt']

// 4. Convert a single file (with OPFS storage option)
const output = await transform({
  file,
  target: 'pdf',
  save: true,
});

// 5. Convert multiple files with concurrency and progress tracking
const outputs = await transform(
  [
    { file: fileA, target: 'pdf' },
    { file: fileB, target: 'png' },
  ],
  {
    onProgress: (task, progress, index) => {
      console.log(`Item ${index} progress: ${progress}%`);
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
3. On static hosts without header customization, `coi-sw.js` registers as a Service Worker to dynamically inject `COOP` and `COEP` headers, enabling `SharedArrayBuffer` for WebAssembly multithreading.

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

- Maximum accepted input is 2 GB per individual file (`maxFileBytes`) and 4 GB total per conversion session (`maxTotalBytes`) based on available memory.
- Large media, documents, and camera RAW files require more memory and time.
- Scanned PDFs require OCR before their text can become editable.
- Background tabs may be slowed by the browser.
- Offline support and COOP/COEP isolation are powered by `coi-sw.js` and `sw.js`, caching app assets and WebAssembly modules locally after initial load.