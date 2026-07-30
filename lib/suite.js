import { MIME } from './formats.js';
import { absoluteUrl } from './runtime.js';
import { state } from './state.js';

export const PDF_FILTERS = {
  doc: 'writer_pdf_Export',
  docx: 'writer_pdf_Export',
  docm: 'writer_pdf_Export',
  dotx: 'writer_pdf_Export',
  dotm: 'writer_pdf_Export',
  odt: 'writer_pdf_Export',
  ott: 'writer_pdf_Export',
  fodt: 'writer_pdf_Export',
  rtf: 'writer_pdf_Export',
  epub: 'writer_pdf_Export',
  ppt: 'impress_pdf_Export',
  pptx: 'impress_pdf_Export',
  pptm: 'impress_pdf_Export',
  pps: 'impress_pdf_Export',
  ppsx: 'impress_pdf_Export',
  potx: 'impress_pdf_Export',
  potm: 'impress_pdf_Export',
  odp: 'impress_pdf_Export',
  otp: 'impress_pdf_Export',
  fodp: 'impress_pdf_Export',
  xls: 'calc_pdf_Export',
  xlsx: 'calc_pdf_Export',
  xlsm: 'calc_pdf_Export',
  xlsb: 'calc_pdf_Export',
  xltx: 'calc_pdf_Export',
  xltm: 'calc_pdf_Export',
  ods: 'calc_pdf_Export',
  ots: 'calc_pdf_Export',
  fods: 'calc_pdf_Export',
};

function safeUnlink(fs, path) {
  try {
    if (fs?.analyzePath ? fs.analyzePath(path).exists : true) {
      fs.unlink(path);
    }
  } catch (_) {}
}

function compileWasmInWorker(onProgress) {
  const worker = new Worker(absoluteUrl('zetajs/office-wasm-compiler.js'));
  return new Promise((resolve, reject) => {

    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') onProgress(10 + message.progress * 18);
      if (message.type === 'compiling') {
        onProgress(30);
      }
      if (message.type === 'compiled') {
        worker.terminate();
        onProgress(38);
        resolve(message.module);
      }
      if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.message || 'Document conversion runtime setup failed'));
      }
    };
    worker.onerror = (error) => {
      worker.terminate();
      const location = error.filename
        ? ` at ${error.filename}:${error.lineno || 0}:${error.colno || 0}`
        : '';
      reject(
        new Error(`${error.message || 'Document conversion runtime worker failed'}${location}`),
      );
    };
    worker.onmessageerror = () => {
      worker.terminate();
      reject(new Error('Document conversion runtime returned an unreadable output'));
    };
    worker.postMessage({ url: absoluteUrl('zetaoffice/soffice-wasm.gzip.bin') });
  });
}

async function useData(onProgress) {
  const response = await fetch(absoluteUrl('zetaoffice/soffice-data.gzip.bin'), {
    cache: 'force-cache',
  });
  if (!response.ok) throw new Error(`Suite data download failed (${response.status})`);
  const total = Number(response.headers.get('content-length') || 0);
  let loaded = 0;
  const counted = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        if (total) onProgress(38 + (loaded / total) * 12);
        controller.enqueue(chunk);
      },
    }),
  );
  const buffer = await new Response(
    counted.pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer();
  onProgress(52);
  return new Uint8Array(buffer);
}

async function ensureSuite(onProgress = () => {}) {
  if (state.suite) return state.suite;
  if (state.suiteRequest) return state.suiteRequest;
  if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'DOCX, PPTX, and spreadsheet conversion requires Cross-Origin Isolation (COOP/COEP). Please ensure Service Workers are enabled and refresh the page.',
    );
  }
  state.suiteError = null;

  state.suiteRequest = (async () => {
    const compiledWasm = await compileWasmInWorker(onProgress);
    let dataPackage = await useData(onProgress);
    const { ZetaHelperMain } = await import(absoluteUrl('zetajs/zetaHelper.js'));
    const suiteBaseUrl = absoluteUrl('zetaoffice/');
    const helper = new ZetaHelperMain(absoluteUrl('zetajs/office-converter-thread.js'), {
      threadJsType: 'module',
      wasmPkg: `url:${suiteBaseUrl}`,
      blockPageScroll: false,
    });
    helper.Module.instantiateWasm = (imports, receiveInstance) => {
      WebAssembly.instantiate(compiledWasm, imports)
        .then((instance) => receiveInstance(instance, compiledWasm))
        .catch((error) => helper.Module.onAbort?.(error?.message || String(error)));
      return {};
    };
    helper.Module.getPreloadedPackage = () => {
      const buffer = dataPackage.buffer;
      dataPackage = null;
      return buffer;
    };
    const ignoredDiagnostics =
      /QRect\(0,0 0x0\)|QObject::connect\(QWindow, QtFrame\)|unsupported syscall: __syscall_mprotect/;
    helper.Module.printErr = () => {};
    const pending = new Map();
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    helper.Module.onAbort = (reason) => {
      readyReject(new Error(`The bundled document conversion runtime could not start: ${reason}`));
    };

    helper.start(() => {
      helper.thrPort.onmessage = (event) => {
        const message = event.data;
        if (message.cmd === 'suite-ready') {
          readyResolve();
          return;
        }
        const request = pending.get(message.requestId);
        if (!request) return;
        if (message.cmd === 'suite-error') {
          pending.delete(message.requestId);
          safeUnlink(helper.FS, request.from);
          safeUnlink(helper.FS, request.to);
          request.reject(new Error(message.message || 'The document could not be converted'));
          return;
        }
        if (message.cmd === 'suite-converted') {
          const run = () => {
            const output = helper.FS.readFile(message.to);
            const copy = new Uint8Array(output.length);
            copy.set(output);
            pending.delete(message.requestId);
            window.clearTimeout(request.timeout);
            safeUnlink(helper.FS, request.from);
            safeUnlink(helper.FS, request.to);
            request.resolve(new Blob([copy], { type: request.type }));
          };
          try {
            run();
          } catch (error) {
            pending.delete(message.requestId);
            window.clearTimeout(request.timeout);
            request.reject(error);
          }
        }
      };
    });

    await ready;
    onProgress(55);
    state.suite = { helper, pending };
    return state.suite;
  })().catch((error) => {
    state.suiteRequest = null;
    state.suiteError = error;
    throw error;
  });
  return state.suiteRequest;
}

async function writeSuiteFile(item, target, filter, onProgress = () => {}, signal = null) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const suite = await ensureSuite(onProgress);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  onProgress(65);
  const from = `/tmp/${item.id}.${item.ext}`;
  const to = `/tmp/${item.id}.${target}`;
  const requestId = item.id;
  safeUnlink(suite.helper.FS, from);
  safeUnlink(suite.helper.FS, to);
  suite.helper.FS.writeFile(from, new Uint8Array(await item.file.arrayBuffer()));

  const blob = await new Promise((resolve, reject) => {

    suite.pending.set(requestId, {
      resolve,
      reject,
      from,
      to,
      type: MIME[target] || 'application/octet-stream',
    });
    const abortHandler = () => {
      suite.pending.delete(requestId);
      safeUnlink(suite.helper.FS, from);
      safeUnlink(suite.helper.FS, to);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', abortHandler);
    suite.helper.thrPort.postMessage({
      cmd: 'suite-file',
      requestId,
      from,
      to,
      filter,
    });
  }).finally(() => {
    if (signal) signal.removeEventListener('abort', abortHandler);
  });

  onProgress(96);
  return blob;
}

export async function convertToPdf(item, onProgress = () => {}, signal = null) {
  const filter = PDF_FILTERS[item.ext];
  if (!filter) throw new Error(`PDF export is not registered for .${item.ext}`);
  return writeSuiteFile(item, 'pdf', filter, onProgress, signal);
}

export async function convertSpreadsheetFile(item, target, onProgress = () => {}, signal = null) {
  const filters = {
    xlsx: 'Calc Office Open XML',
    ods: 'calc8',
  };
  const filter = filters[target];
  if (!filter) throw new Error(`Spreadsheet export is not registered for .${target}`);
  return writeSuiteFile(item, target, filter, onProgress, signal);
}