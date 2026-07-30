import { baseName, extensionOf, MIME, outputName } from './formats.js';
import { absoluteUrl, runBackground } from './runtime.js';

let archiveLibrary;

async function parseZip(e) {
  const { data } = e;
  importScripts(data.jszipUrl);
  const { buffer } = data;

  const archive = await JSZip.loadAsync(buffer);
  const listed = Object.values(archive.files).filter((entry) => !entry.dir);

  const files = [];
  const transfers = [];
  for (let index = 0; index < listed.length; index++) {
    const entry = listed[index];
    const fileBuffer = await entry.async('arraybuffer');
    files.push({ name: entry.name, buffer: fileBuffer });
    transfers.push(fileBuffer);

    self.postMessage({ type: 'progress', progress: 12 + ((index + 1) / Math.max(1, listed.length)) * 52 });
  }

  self.postMessage({ files }, transfers);
}

async function buildZip(e) {
  const { data } = e;
  importScripts(data.jszipUrl);
  const { entries } = data;

  const zip = new JSZip();

  for (const entry of entries) {
    zip.file(entry.name, entry.buffer);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  self.postMessage({ bytes: zipBuffer }, [zipBuffer]);
}

function uniqueName(name, used) {
  const safe = String(name || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  const candidate = safe || 'file';
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  const ext = extensionOf(candidate);
  const base = baseName(candidate);
  let index = 2;
  let next;
  do {
    next = `${base}-${index++}${ext ? `.${ext}` : ''}`;
  } while (used.has(next));
  used.add(next);
  return next;
}

async function ensureArchiveLibrary() {
  if (archiveLibrary) return archiveLibrary;
  archiveLibrary = import(absoluteUrl('libarchive/libarchive.js')).then((library) => {
    library.Archive.init({ workerUrl: absoluteUrl('libarchive/worker-bundle.js') });
    return library;
  });
  return archiveLibrary;
}

function validateEntries(entries) {
  if (!entries.length) throw new Error('The archive contains no readable files');
  return entries;
}

async function extractZip(file, onProgress) {
  const buffer = await file.arrayBuffer();
  const { files } = await runBackground(
    parseZip,
    { jszipUrl: absoluteUrl('jszip.min.js'), buffer },
    [buffer],
    (progress) => onProgress(progress)
  );
  const entries = [];
  const used = new Set();
  for (const f of files) {
    entries.push({ name: uniqueName(f.name, used), file: new Blob([f.buffer]) });
  }
  return validateEntries(entries);
}

function tarText(bytes, start, length) {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end < 0 ? slice : slice.subarray(0, end)).trim();
}

function extractTar(blob, onProgress) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const entries = [];
    const used = new Set();
    for (let offset = 0; offset + 512 <= bytes.length; ) {
      const header = bytes.subarray(offset, offset + 512);
      if (header.every((byte) => byte === 0)) break;
      const name = tarText(header, 0, 100);
      const prefix = tarText(header, 345, 155);
      const size = Number.parseInt(tarText(header, 124, 12).replace(/\0/g, '').trim() || '0', 8);
      const type = String.fromCharCode(header[156] || 0);
      if (!Number.isFinite(size) || size < 0 || offset + 512 + size > bytes.length) {
        throw new Error('Invalid or truncated TAR archive');
      }
      if ((header[156] === 0 || type === '0') && name) {
        const path = prefix ? `${prefix}/${name}` : name;
        const file = new Blob([buffer.slice(offset + 512, offset + 512 + size)]);
        entries.push({ name: uniqueName(path, used), file });
        onProgress(12 + Math.min(52, ((offset + 512 + size) / bytes.length) * 52));
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return validateEntries(entries);
  });
}

async function gunzip(file) {
  return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
}

async function extractWithLibrary(file, onProgress) {
  const { Archive } = await ensureArchiveLibrary();
  const archive = await Archive.open(file);
  const extract = async () => {
    const listed = await archive.getFilesArray();
    const entries = [];
    const used = new Set();
    for (let index = 0; index < listed.length; index++) {
      const entry = listed[index];
      if (!entry.file) continue;
      const extracted = await entry.file.extract();
      const name = uniqueName(`${entry.path || ''}${extracted.name || entry.file.name}`, used);
      entries.push({ name, file: extracted });
      onProgress(12 + ((index + 1) / Math.max(1, listed.length)) * 52);
    }
    return validateEntries(entries);
  };
  return extract()
    .catch((error) => {
      throw new Error(`The archive could not be extracted: ${error.message || error}`);
    })
    .finally(() => archive.close().catch((e) => console.warn('Archive cleanup failed:', e)));
}

async function extractEntries(item, onProgress) {
  if (item.ext === 'zip') return extractZip(item.file, onProgress);
  if (item.ext === 'tar') return extractTar(item.file, onProgress);
  if (item.ext === 'tgz') return extractTar(await gunzip(item.file), onProgress);
  if (item.ext === 'gz') {
    const expanded = await gunzip(item.file);
    const signature = new Uint8Array(await expanded.slice(257, 262).arrayBuffer());
    if (new TextDecoder().decode(signature) === 'ustar') return extractTar(expanded, onProgress);
    const name = item.file.name.replace(/\.gz$/i, '') || 'file';
    return [{ name: uniqueName(name, new Set()), file: expanded }];
  }
  return extractWithLibrary(item.file, onProgress);
}

function writeString(target, offset, length, value) {
  const bytes = new TextEncoder().encode(String(value));
  target.set(bytes.subarray(0, length), offset);
}

function writeOctal(target, offset, length, value) {
  const octal = Math.max(0, Number(value) || 0)
    .toString(8)
    .padStart(length - 1, '0')
    .slice(-(length - 1));
  writeString(target, offset, length, `${octal}\0`);
}

function tarPath(name) {
  const encoded = new TextEncoder().encode(name);
  if (encoded.length <= 100) return { name, prefix: '' };
  for (let index = name.lastIndexOf('/'); index > 0; index = name.lastIndexOf('/', index - 1)) {
    const prefix = name.slice(0, index);
    const leaf = name.slice(index + 1);
    if (
      new TextEncoder().encode(prefix).length <= 155 &&
      new TextEncoder().encode(leaf).length <= 100
    ) {
      return { name: leaf, prefix };
    }
  }
  throw new Error(`Archive path is too long for TAR: ${name}`);
}

function tarHeader(entry) {
  const header = new Uint8Array(512);
  const path = tarPath(entry.name);
  writeString(header, 0, 100, path.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, entry.file.size);
  writeOctal(header, 136, 12, Math.floor((entry.file.lastModified || Date.now()) / 1000));
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, '');
  writeString(header, 297, 32, '');
  writeString(header, 345, 155, path.prefix);
  const checksum = header.reduce((total, byte) => total + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function createTar(entries) {
  const parts = [];
  for (const entry of entries) {
    parts.push(tarHeader(entry), entry.file);
    const padding = (512 - (entry.file.size % 512)) % 512;
    if (padding) parts.push(new Uint8Array(padding));
  }
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: MIME.tar });
}

async function gzipFile(file, type) {
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).blob();
  return new Blob([compressed], { type });
}

async function createZip(entries) {
  const workerEntries = [];
  const transfers = [];
  for (const entry of entries) {
    const buffer = await entry.file.arrayBuffer();
    workerEntries.push({ name: entry.name, buffer });
    transfers.push(buffer);
  }
  const { bytes } = await runBackground(
    buildZip,
    { jszipUrl: absoluteUrl('jszip.min.js'), entries: workerEntries },
    transfers
  );
  return new Blob([bytes], { type: MIME.zip });
}

export async function convertArchive(item, target, onProgress) {
  if (target === item.ext) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }
  onProgress(5);
  const entries = await extractEntries(item, onProgress);
  let blob;
  if (target === 'zip') blob = await createZip(entries);
  else if (target === 'tar') blob = createTar(entries);
  else if (target === 'tgz') blob = await gzipFile(createTar(entries), MIME.tgz);
  else if (target === 'gz') {
    if (entries.length !== 1)
      throw new Error('GZIP output requires an archive containing one file');
    blob = await gzipFile(entries[0].file, MIME.gz);
  } else throw new Error('Unsupported archive target');
  onProgress(96);
  return { files: [{ name: outputName(item.file, target), blob }] };
}