// @ts-nocheck
// Compiles the large Office WASM module away from the UI thread. The
// decompressed response is compiled as a stream to avoid a large buffer copy.
async function compileWasm(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Office runtime download failed (${response.status})`);
  }
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support gzip decompression streams');
  }
  if (!response.body) {
    throw new Error('Office runtime response did not include a readable stream');
  }

  const total = Number(response.headers.get('content-length') || 0);
  let loaded = 0;
  const counted = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        if (total) {
          postMessage({ type: 'progress', progress: loaded / total });
        }
        controller.enqueue(chunk);
      },
    }),
  );
  const decompressed = counted.pipeThrough(new DecompressionStream('gzip'));
  const wasmResponse = new Response(decompressed, {
    headers: { 'Content-Type': 'application/wasm' },
  });

  postMessage({ type: 'compiling' });
  if (typeof WebAssembly.compileStreaming !== 'function') {
    throw new Error('Streaming WebAssembly compilation is unavailable');
  }
  return WebAssembly.compileStreaming(wasmResponse);
}

self.onmessage = async (event) => {
  try {
    const module = await compileWasm(event.data.url);
    postMessage({ type: 'compiled', module });
    self.close();
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
    self.close();
  }
};
