/**
 * Public file conversion API.
 */
import { normalize, normalizeBatch, snapshot } from './lib/contract.js';
import { kinds, process } from './lib/flow.js';
import {
  FORMAT_GROUPS,
  baseName,
  extensionOf,
  identify,
  outputs,
} from './lib/formats.js';
import { Queue } from './lib/queue.js';
import { state } from './lib/state.js';
import { use } from './lib/runtime.js';
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
const DEVICE_MEMORY = Number(globalThis.navigator?.deviceMemory) || 4;
const PROCESSORS = Number(globalThis.navigator?.hardwareConcurrency) || 4;
const MEMORY_CAP =
  DEVICE_MEMORY <= 2 ? 2 : DEVICE_MEMORY <= 4 ? 4 : DEVICE_MEMORY <= 8 ? 6 : 8;
const PARALLEL_SLOTS = Math.max(1, Math.min(PROCESSORS, MEMORY_CAP));
let activeCount = 0;
const DIRECTORY = 'cached';
let directoryPromise;
async function cacheDirectory() {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new Error('Persistent storage is unavailable');
  }
  if (!directoryPromise) {
    directoryPromise = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(DIRECTORY, { create: true }));
  }
  return directoryPromise;
}

function storageName(key, index) {
  return `${key}-${index}`;
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
export async function storeFile(output, key) {
  const directory = await cacheDirectory();
  const files = [];
  for (let index = 0; index < output.files.length; index++) {
    const file = output.files[index];
    const storedName = storageName(key, index);
    const handle = await directory.getFileHandle(storedName, { create: true });
    const writable = await handle.createWritable();
    await file.blob.stream().pipeTo(writable);
    files.push({
      name: file.name,
      type: file.blob.type,
      size: file.blob.size,
      storedName,
    });
  }
  return { files };
}
export async function readFile(file) {
  if (file.blob instanceof Blob) {
    return file.blob;
  }
  const directory = await cacheDirectory();
  const handle = await directory.getFileHandle(file.storedName);
  return handle.getFile();
}
export async function deleteFile(output) {
  if (!output?.files?.length || !globalThis.navigator?.storage?.getDirectory) {
    return;
  }
  const directory = await cacheDirectory();
  await Promise.all(
    output.files
      .filter((file) => file.storedName)
      .map((file) => directory.removeEntry(file.storedName).catch(() => {}))
  );
}
export async function clearStorage() {
  if (!globalThis.navigator?.storage?.getDirectory) {
    return;
  }
  const directory = await cacheDirectory().catch(() => null);
  if (!directory) {
    return;
  }
  for await (const [name] of directory.entries()) {
    await directory.removeEntry(name).catch(() => {});
  }
}
export async function zipFiles(files, archiveName) {
  await use('jszip');
  const zip = new JSZip();
  const used = new Set();
  for (const file of files) {
    const name = uniqueName(file.name, used);
    zip.file(name, await readFile(file));
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { name: archiveName, blob };
}

function assertSize(requests) {
  let total = 0;
  for (const item of requests) {
    const size = item.file?.size || 0;
    if (size > MAX_FILE_BYTES) {
      throw new Error('File exceeds the maximum file size limit');
    }
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error('Total input size exceeds the maximum limit');
  }
}

function taskId() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

async function runTask(task, onProgress) {
  activeCount++;
  try {
    if (task.options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    Object.assign(state.settings, task.options || {});
    const output = await process(
      task.item,
      task.item.target,
      onProgress,
      task.options.signal
    );
    if (task.options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return task.save ? storeFile(output, task.item.id) : output;
  } finally {
    activeCount--;
  }
}

async function runAdapter(task, onProgress) {
  return runTask(task, onProgress);
}
const flow = new Queue({
  concurrency: PARALLEL_LIMIT,
});
flow.registerAdapter('default', runAdapter).configureInterface({
  async inspect(file) {
    const { rawExt, ext, kind } = await identify(file);
    return {
      rawExt,
      ext,
      kind,
      outputs: kind ? outputs(kind, ext) : [],
    };
  },
  async createTask(file, target, options = {}) {
    assertSize([{ file }]);
    const { rawExt, ext, kind } = await identify(file);
    if (!kind) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
    if (!outputs(kind, ext).includes(target)) {
      throw new Error(`.${ext} cannot be processed as .${target}`);
    }
    const item = {
      id: `item-${Date.now()}-${taskId()}`,
      file,
      rawExt,
      ext,
      kind,
      target,
    };
    return {
      adapter: 'default',
      item,
      save: Boolean(options.save),
      options,
    };
  },
});
export const maxFileBytes = MAX_FILE_BYTES;
export const maxTotalBytes = MAX_TOTAL_BYTES;
export const parallel = PARALLEL_SLOTS;
export const canUseDocuments = () =>
  globalThis.crossOriginIsolated &&
  typeof globalThis.SharedArrayBuffer !== 'undefined';
export async function transform(request, options = {}) {
  const list = Array.isArray(request)
    ? normalizeBatch(request)
    : [normalize(request)];
  assertSize(list);
  if (Array.isArray(request)) {
    const tasks = await Promise.all(
      list.map((item) =>
        flow.createTask(item.file, item.target, {
          save: item.save,
          signal: item.signal,
          ...options,
        })
      )
    );
    return flow.run(tasks, options);
  }
  const task = await flow.createTask(list[0].file, list[0].target, {
    ...options,
    save: list[0].save || Boolean(options.save),
    signal: list[0].signal,
  });
  return flow.execute(task, options.onProgress);
}
export async function inspect(file) {
  return flow.inspect(file);
}

export function formats() {
  return snapshot(FORMAT_GROUPS);
}