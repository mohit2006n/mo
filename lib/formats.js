export const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  gif: 'image/gif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  json: 'application/json;charset=utf-8',
  ndjson: 'application/x-ndjson;charset=utf-8',
  yaml: 'application/yaml;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  xml: 'application/xml;charset=utf-8',
  toml: 'application/toml;charset=utf-8',
  ini: 'text/plain;charset=utf-8',
  srt: 'application/x-subrip;charset=utf-8',
  vtt: 'text/vtt;charset=utf-8',
  ass: 'text/x-ssa;charset=utf-8',
  sqlite: 'application/vnd.sqlite3',
  zip: 'application/zip',
  tar: 'application/x-tar',
  tgz: 'application/gzip',
  gz: 'application/gzip',
};

export const FORMAT_GROUPS = [
  {
    kind: 'image',
    inputs: [
      'png',
      'apng',
      'jpg',
      'jpeg',
      'jfif',
      'webp',
      'bmp',
      'gif',
      'svg',
      'ico',
      'avif',
      'tif',
      'tiff',
      'heic',
      'heif',
      'tga',
      'raw',
      'dng',
      'cr2',
      'cr3',
      'crw',
      'nef',
      'nrw',
      'arw',
      'srf',
      'sr2',
      'raf',
      'orf',
      'rw2',
      'pef',
      'rwl',
      '3fr',
      'mrw',
      'x3f',
    ],
    outputs: ['png', 'jpg', 'webp', 'bmp', 'tiff', 'ico', 'pdf', 'pptx'],
  },
  {
    kind: 'video',
    inputs: [
      'mp4',
      'webm',
      'mov',
      'mkv',
      'avi',
      'wmv',
      'flv',
      'm4v',
      'f4v',
      'mpeg',
      'mpg',
      '3gp',
      '3g2',
      'ogv',
      'ts',
      'mts',
      'm2ts',
      'vob',
      'asf',
      'mxf',
      'rm',
      'rmvb',
      'divx',
      'srt',
      'vtt',
      'ass',
      'ssa',
    ],
    outputs: [
      'mp4',
      'webm',
      'mov',
      'mkv',
      'avi',
      'gif',
      'mp3',
      'wav',
      'ogg',
      'opus',
      'flac',
      'aiff',
      'm4a',
      'aac',
      'srt',
      'vtt',
      'ass',
      'txt',
      'html',
    ],
  },
  {
    kind: 'audio',
    inputs: [
      'mp3',
      'mp2',
      'wav',
      'ogg',
      'oga',
      'opus',
      'flac',
      'm4a',
      'm4b',
      'aac',
      'caf',
      'voc',
      'wma',
      'ac3',
      'eac3',
      'amr',
      'ape',
      'au',
      'mka',
      'aiff',
      'aif',
      'ra',
      'tta',
      'dsf',
      'dff',
    ],
    outputs: ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aiff', 'm4a', 'aac'],
  },
  {
    kind: 'document',
    inputs: [
      'txt',
      'log',
      'md',
      'markdown',
      'html',
      'htm',
      'doc',
      'docx',
      'docm',
      'dotx',
      'dotm',
      'odt',
      'ott',
      'fodt',
      'rtf',
      'epub',
      'ppt',
      'pptx',
      'pptm',
      'pps',
      'ppsx',
      'potx',
      'potm',
      'odp',
      'otp',
      'fodp',
    ],
    outputs: ['txt', 'md', 'html', 'pdf', 'docx', 'pptx'],
  },
  {
    kind: 'pdf',
    inputs: ['pdf', 'mobi', 'azw', 'azw3'],
    outputs: ['txt', 'md', 'html', 'docx', 'pptx', 'png', 'jpg'],
  },
  {
    kind: 'data',
    inputs: [
      'csv',
      'tsv',
      'json',
      'ndjson',
      'yaml',
      'yml',
      'xml',
      'toml',
      'ini',
      'dbf',
      'dif',
      'sylk',
      'slk',
      'xls',
      'xlsx',
      'xlsm',
      'xlsb',
      'xltx',
      'xltm',
      'ods',
      'ots',
      'fods',
      'sqlite',
      'sqlite3',
      'db',
    ],
    outputs: [
      'csv',
      'tsv',
      'json',
      'ndjson',
      'yaml',
      'xml',
      'toml',
      'ini',
      'xlsx',
      'ods',
      'html',
      'pdf',
    ],
  },
  {
    kind: 'archive',
    inputs: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'],
    outputs: ['zip', 'tar', 'tgz', 'gz'],
  },
];

const EXT_ALIASES = {
  apng: 'png',
  jpeg: 'jpg',
  jpe: 'jpg',
  jfif: 'jpg',
  markdown: 'md',
  htm: 'html',
  yml: 'yaml',
  log: 'txt',
  tif: 'tiff',
  heif: 'heic',
  slk: 'sylk',
  aif: 'aiff',
  oga: 'ogg',
  ssa: 'ass',
  sqlite3: 'sqlite',
  db: 'sqlite',
};
export function extensionOf(name) {
  const match = String(name)
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

const MIME_INPUT_EXTENSIONS = {
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/x-ndjson': 'ndjson',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/x-tga': 'tga',
  'video/3gpp2': '3g2',
  'audio/x-caf': 'caf',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/toml': 'toml',
  'text/vtt': 'vtt',
  'application/x-subrip': 'srt',
  'application/vnd.sqlite3': 'sqlite',
  'application/x-sqlite3': 'sqlite',
  'application/zip': 'zip',
  'application/x-7z-compressed': '7z',
  'application/vnd.rar': 'rar',
  'application/x-rar-compressed': 'rar',
  'application/x-tar': 'tar',
  'application/gzip': 'gz',
  'application/x-gzip': 'gz',
  'application/x-mobipocket-ebook': 'mobi',
  'application/vnd.amazon.ebook': 'azw3',
  'application/vnd.apple.keynote': 'key',
  'application/vnd.apple.numbers': 'numbers',
};

async function sniffPackageExtension(file) {
  if (!file.size || file.size < 4) return '';
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) return '';
  const decoder = new TextDecoder('latin1');
  const start = decoder.decode(await file.slice(0, Math.min(file.size, 2048)).arrayBuffer());
  if (start.includes('application/vnd.oasis.opendocument.presentation')) return 'odp';
  if (start.includes('application/vnd.oasis.opendocument.text')) return 'odt';
  if (start.includes('application/vnd.oasis.opendocument.spreadsheet')) return 'ods';
  const tailSize = Math.min(file.size, 2 * 1024 * 1024);
  const tail = decoder.decode(await file.slice(file.size - tailSize).arrayBuffer());
  if (tail.includes('ppt/presentation.xml')) return 'pptx';
  if (tail.includes('word/document.xml')) return 'docx';
  if (tail.includes('xl/workbook.xml')) return 'xlsx';
  return '';
}

export async function identify(file) {
  let rawExt = extensionOf(file.name);
  let ext = canonicalExt(rawExt);
  let kind = kindForExtension(rawExt);
  if (!kind && MIME_INPUT_EXTENSIONS[file.type]) {
    rawExt = MIME_INPUT_EXTENSIONS[file.type];
    ext = canonicalExt(rawExt);
    kind = kindForExtension(rawExt);
  }
  if (!kind) {
    const detected = await sniffPackageExtension(file).catch(() => '');
    if (detected) {
      rawExt = detected;
      ext = canonicalExt(detected);
      kind = kindForExtension(detected);
    }
  }
  return { rawExt, ext, kind };
}

function canonicalExt(ext) {
  return EXT_ALIASES[ext] || ext;
}

export function baseName(name) {
  return String(name).replace(/\.[^.]+$/, '') || 'converted-file';
}

export function safeName(name) {
  return (
    baseName(name)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'converted-file'
  );
}

export function outputName(file, target, suffix = '') {
  return `${safeName(file.name)}${suffix}.${target}`;
}

function kindForExtension(rawExt) {
  const ext = canonicalExt(rawExt);
  for (const group of FORMAT_GROUPS) {
    if (group.inputs.some((input) => canonicalExt(input) === ext)) return group.kind;
  }
  return '';
}

export function outputs(kind, ext) {
  const norm = canonicalExt(ext);
  let list = [];
  if (kind === 'image') list = ['png', 'jpg', 'webp', 'bmp', 'tiff', 'ico', 'pdf', 'pptx'];
  else if (kind === 'video')
    list = [
      'mp4',
      'webm',
      'mov',
      'mkv',
      'avi',
      'gif',
      'mp3',
      'wav',
      'ogg',
      'opus',
      'flac',
      'aiff',
      'm4a',
      'aac',
    ];
  else if (kind === 'audio') list = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aiff', 'm4a', 'aac'];
  else if (kind === 'ebook') list = ['txt', 'html', 'pdf', 'docx', 'pptx'];
  else if (kind === 'subtitle') list = ['srt', 'vtt', 'ass', 'txt', 'html'];
  else if (kind === 'database') list = ['json', 'csv', 'xlsx', 'html'];
  else if (kind === 'archive') list = ['zip', 'tar', 'tgz', 'gz'];
  else if (kind === 'pdf') list = ['txt', 'docx', 'pptx', 'png', 'jpg'];
  else if (kind === 'data') {
    list = [
      'csv',
      'tsv',
      'json',
      'ndjson',
      'yaml',
      'xml',
      'toml',
      'ini',
      'xlsx',
      'ods',
      'html',
    ];
    if (
      ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'ods', 'ots', 'fods'].includes(ext)
    )
      list.push('pdf');
  } else if (kind === 'document') {
    if (ext === 'pptx') list = ['txt', 'md', 'html', 'pdf', 'docx'];
    else if (ext === 'docx') list = ['txt', 'md', 'html', 'pdf', 'pptx'];
    else if (
      [
        'doc',
        'docm',
        'dotx',
        'dotm',
        'odt',
        'ott',
        'fodt',
        'rtf',
        'epub',
        'ppt',
        'pptm',
        'pps',
        'ppsx',
        'potx',
        'potm',
        'odp',
        'otp',
        'fodp',
      ].includes(ext)
    )
      list = ['pdf'];
    else list = ['txt', 'md', 'html', 'pdf', 'docx', 'pptx'];
  }
  return list.filter((target) => canonicalExt(target) !== norm);
}