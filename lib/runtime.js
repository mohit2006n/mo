import { state } from './state.js';

const baseDir = 'public/';

const scriptPaths = {
  jszip: ['jszip.min.js', 'JSZip'],
  pdfLib: ['pdf-lib.min.js', 'PDFLib'],
  xlsx: ['xlsx.full.min.js', 'XLSX'],
  mammoth: ['mammoth.browser.min.js', 'mammoth'],
  jspdf: ['jspdf.umd.min.js', 'jspdf'],
  marked: ['marked.umd.js', 'marked'],
  turndown: ['turndown.js', 'TurndownService'],
  yaml: ['js-yaml.min.js', 'jsyaml'],
  docx: ['docx.umd.js', 'docx'],
  pptxgen: ['pptxgen.bundle.js', 'PptxGenJS'],
  utif: ['utif.min.js', 'UTIF'],
  heic2any: ['heic2any.min.js', 'heic2any'],
  sqljs: ['sql/sql-wasm.js', 'initSqlJs'],
  ffmpeg: ['ffmpeg.js', 'FFmpegWASM'],
};

export function absoluteUrl(path) {
  const resolvedPath = path.startsWith(baseDir) ? path : baseDir + path;
  return new URL(resolvedPath, document.baseURI).href;
}

export function use(name) {
  if (state.active.has(name)) return state.active.get(name);
  const [path, globalName] = scriptPaths[name];
  if (window[globalName]) return Promise.resolve(window[globalName]);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = absoluteUrl(path);
    script.async = true;
    script.onload = () =>
      window[globalName]
        ? resolve(window[globalName])
        : reject(new Error(`${name} loaded without its expected global`));
    script.onerror = () => reject(new Error(`Could not load the ${name} conversion module`));
    document.head.append(script);
  }).catch((error) => {
    state.active.delete(name);
    throw error;
  });
  state.active.set(name, promise);
  return promise;
}

export async function createGzipUrl(path, type, onProgress) {
  const cacheKey = new URL(`/_/${path}`, location.origin).href;
  const cache = await caches.open('runtime-v1').catch(() => null);
  const hit = await cache?.match(cacheKey).catch(() => null);
  if (hit) return URL.createObjectURL(await hit.blob());

  const response = await fetch(absoluteUrl(path), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  let body = response.body;
  if (onProgress) {
    const total = Number(response.headers.get('content-length') || 0);
    let loaded = 0;
    body = body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        if (total) onProgress(loaded / total);
        controller.enqueue(chunk);
      },
    }));
  }
  const blob = await new Response(body.pipeThrough(new DecompressionStream('gzip'))).blob();
  cache?.put(cacheKey, new Response(blob, { headers: { 'Content-Type': type } })).catch(() => {});
  return URL.createObjectURL(new Blob([blob], { type }));
}

export async function runBackground(workerFn, data, transfer = [], onProgress = null) {
  return new Promise((resolve, reject) => {
    const code = `self.onmessage = ${workerFn.toString()};`;
    const blob = new Blob([code], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    const worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      if (e.data && e.data.type === 'progress') {
        if (onProgress) onProgress(e.data.progress);
        return;
      }
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      if (e.data && e.data.error) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      reject(new Error(e.message || 'Background task failed'));
    };
    worker.postMessage(data, transfer);
  });
}