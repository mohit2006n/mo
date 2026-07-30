import { MIME, outputName, safeName } from './formats.js';
import { imageCanvasToPptx } from './presentation.js';
import { absoluteUrl, use, runBackground } from './runtime.js';
import { state } from './state.js';

async function parseTiff(e) {
  const { data } = e;
  importScripts(data.utifUrl);
    const { buffer } = data;

    const pages = UTIF.decode(buffer);
    if (!pages.length) throw new Error('No readable TIFF pages were found');

    UTIF.decodeImage(buffer, pages[0]);

    const rgba = UTIF.toRGBA8(pages[0]);

  self.postMessage(
    { width: pages[0].width, height: pages[0].height, rgba },
    [rgba.buffer]
  );
}

async function parseTga(e) {
  const { data } = e;
    const { buffer } = data;
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 18) throw new Error('Invalid TGA image');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const idLength = bytes[0];
    const colorMapType = bytes[1];
    const imageType = bytes[2];
    const width = view.getUint16(12, true);
    const height = view.getUint16(14, true);
    const depth = bytes[16];
    const descriptor = bytes[17];
    if (!width || !height) throw new Error('TGA image has no readable dimensions');
    if (colorMapType) throw new Error('Color-mapped TGA images are not supported');
    const grayscale = imageType === 3 || imageType === 11;
    const compressed = imageType === 10 || imageType === 11;
    if (![2, 3, 10, 11].includes(imageType) || ![8, 16, 24, 32].includes(depth)) {
      throw new Error('Unsupported TGA encoding');
    }
    let offset = 18 + idLength;
    const bytesPerPixel = depth / 8;
    const pixel = () => {
      if (offset + bytesPerPixel > bytes.length) throw new Error('Truncated TGA image');
      if (grayscale || depth === 8) {
        const value = bytes[offset++];
        return [value, value, value, 255];
      }
      if (depth === 16) {
        const value = view.getUint16(offset, true);
        offset += 2;
        return [
          Math.round(((value >> 10) & 31) * (255 / 31)),
          Math.round(((value >> 5) & 31) * (255 / 31)),
          Math.round((value & 31) * (255 / 31)),
          descriptor & 0x0f ? (value & 0x8000 ? 255 : 0) : 255,
        ];
      }
      const blue = bytes[offset++];
      const green = bytes[offset++];
      const red = bytes[offset++];
      const alpha = depth === 32 ? bytes[offset++] : 255;
      return [red, green, blue, alpha];
    };
    const pixels = [];
    const total = width * height;
    while (pixels.length < total) {
      if (!compressed) {
        pixels.push(pixel());
        continue;
      }
      if (offset >= bytes.length) throw new Error('Truncated TGA image');
      const packet = bytes[offset++];
      const count = (packet & 0x7f) + 1;
      if (packet & 0x80) {
        const value = pixel();
        for (let index = 0; index < count; index++) pixels.push(value);
      } else {
        for (let index = 0; index < count; index++) pixels.push(pixel());
      }
    }
    const rgba = new Uint8ClampedArray(total * 4);
    const topOrigin = Boolean(descriptor & 0x20);
    const rightOrigin = Boolean(descriptor & 0x10);
    for (let index = 0; index < total; index++) {
      const sourceX = index % width;
      const sourceY = Math.floor(index / width);
      const x = rightOrigin ? width - 1 - sourceX : sourceX;
      const y = topOrigin ? sourceY : height - 1 - sourceY;
      rgba.set(pixels[index], (y * width + x) * 4);
    }
  self.postMessage({ width, height, rgba }, [rgba.buffer]);
}

async function parseRaw(e) {
  const { data } = e;
    const { librawUrl, buffer } = data;
    const module = await import(librawUrl);
    const LibRaw = module.default;
    const decoder = new LibRaw();
    try {
      await decoder.open(new Uint8Array(buffer), {
        useCameraWb: true,
        outputColor: 1,
        outputBps: 8,
        userQual: 3,
      });
      const image = await decoder.imageData();
      if (!image?.width || !image?.height || !image.data) {
        throw new Error('The RAW image could not be decoded');
      }
      const rgba = new Uint8ClampedArray(image.width * image.height * 4);
      const channels = Math.max(1, Number(image.colors) || 3);
      const sixteenBit = image.bits > 8 || image.data instanceof Uint16Array;
      for (let index = 0; index < image.width * image.height; index++) {
        const source = index * channels;
        const target = index * 4;
        const sample = (channel) => {
          const value = image.data[source + Math.min(channel, channels - 1)] || 0;
          return sixteenBit ? Math.round(value / 257) : value;
        };
        rgba[target] = sample(0);
        rgba[target + 1] = sample(channels > 1 ? 1 : 0);
        rgba[target + 2] = sample(channels > 2 ? 2 : 0);
        rgba[target + 3] = 255;
      }
      self.postMessage({ width: image.width, height: image.height, rgba }, [rgba.buffer]);
  } finally {
    decoder.dispose();
  }
}

async function encodeBmp(e) {
  const { data } = e;
    const { width, height, rgba, background } = data;
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelSize = rowSize * height;
    const buffer = new ArrayBuffer(54 + pixelSize);
    const view = new DataView(buffer);
    view.setUint8(0, 0x42);
    view.setUint8(1, 0x4d);
    view.setUint32(2, 54 + pixelSize, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, pixelSize, true);
    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const alpha = rgba[index + 3] / 255;
        const red = Math.round(rgba[index] * alpha + background[0] * (1 - alpha));
        const green = Math.round(rgba[index + 1] * alpha + background[1] * (1 - alpha));
        const blue = Math.round(rgba[index + 2] * alpha + background[2] * (1 - alpha));
        view.setUint8(offset++, blue);
        view.setUint8(offset++, green);
        view.setUint8(offset++, red);
      }
      while ((offset - 54) % rowSize) view.setUint8(offset++, 0);
    }
  self.postMessage({ bytes: buffer }, [buffer]);
}

async function buildPdf(e) {
  const { data } = e;
    importScripts(data.pdfLibUrl);
    const { buffer, pageSize } = data;

    const pdf = await PDFLib.PDFDocument.create();
    const embedded = await pdf.embedPng(buffer);

    const pageDimensions = pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
    const page = pdf.addPage(pageDimensions);
    const margin = 36;

    const scale = Math.min(
      (page.getWidth() - margin * 2) / embedded.width,
      (page.getHeight() - margin * 2) / embedded.height,
      1,
    );

    const width = embedded.width * scale;
    const height = embedded.height * scale;

    page.drawImage(embedded, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    });

    const bytes = await pdf.save();
    const outBuffer = bytes.buffer || bytes;
    self.postMessage({ bytes }, [outBuffer]);
}

async function encodeTiff(e) {
  const { data } = e;
  importScripts(data.utifUrl);
  const { rgba, w, h } = data;

  const bytes = UTIF.encodeImage(rgba, w, h);
  const buffer = bytes.buffer || bytes;
  self.postMessage({ bytes }, [buffer]);
}

export async function canvasToFile(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Cannot encode ${type}`))),
      type,
      quality,
    );
  });
}

function sanitizeSvg(source) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG document');
  for (const node of doc.querySelectorAll('script, foreignObject, iframe, object, embed')) {
    node.remove();
  }
  for (const node of doc.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name.endsWith(':href')) &&
          /^(https?:|\/\/|data:text\/html)/i.test(value))
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function scaleCanvasSize(source) {
  const max = Number(state.settings.maxDimension) || 0;
  if (!max || Math.max(source.width, source.height) <= max) return source;
  const scale = max / Math.max(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function tiffToCanvas(file) {
  const buffer = await file.arrayBuffer();
  const result = await runBackground(
    parseTiff,
    { utifUrl: absoluteUrl('utif.min.js'), buffer },
    [buffer]
  );

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(result.rgba), canvas.width, canvas.height),
    0, 0
  );
  return scaleCanvasSize(canvas);
}

async function tgaToCanvas(file) {
  const buffer = await file.arrayBuffer();
  const result = await runBackground(
    parseTga,
    { buffer },
    [buffer]
  );

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(result.rgba), canvas.width, canvas.height),
    0, 0
  );
  return scaleCanvasSize(canvas);
}

async function rawToCanvas(file) {
  const buffer = await file.arrayBuffer();
  const result = await runBackground(
    parseRaw,
    { librawUrl: absoluteUrl('libraw.js'), buffer },
    [buffer]
  );

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(result.rgba), canvas.width, canvas.height),
    0, 0
  );
  return scaleCanvasSize(canvas);
}

async function imageToCanvas(file, ext) {
  if (ext === 'tif' || ext === 'tiff') return tiffToCanvas(file);
  if (ext === 'tga') return tgaToCanvas(file);
  if (
    [
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
    ].includes(ext)
  )
    return rawToCanvas(file);
  let source = file;
  if (ext === 'heic' || ext === 'heif') {
    await use('heic2any');
    const converted = await heic2any({ blob: file, toType: 'image/png', quality: 1 });
    source = Array.isArray(converted) ? converted[0] : converted;
    if (!source) throw new Error('HEIC conversion produced no image');
  }
  if (ext === 'svg') source = new Blob([sanitizeSvg(await file.text())], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(source);
  const process = async () => {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Cannot decode ${ext.toUpperCase()}`));
    });
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    if (!width || !height) throw new Error('Image has no readable dimensions');
    const max = Number(state.settings.maxDimension) || 0;
    if (max && Math.max(width, height) > max) {
      const scale = max / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  };
  return process().finally(() => URL.revokeObjectURL(url));
}

async function canvasToBmp(canvas) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;

  const backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width = 1;
  backgroundCanvas.height = 1;
  const backgroundContext = backgroundCanvas.getContext('2d');
  backgroundContext.fillStyle = state.settings.jpegBackground || '#ffffff';
  backgroundContext.fillRect(0, 0, 1, 1);
  const background = backgroundContext.getImageData(0, 0, 1, 1).data;

  const { bytes } = await runBackground(
    encodeBmp,
    { width, height, rgba: pixels, background },
    [pixels.buffer, background.buffer]
  );

  return new Blob([bytes], { type: MIME.bmp });
}

async function canvasToIco(canvas) {
  const size = Math.min(256, Math.max(canvas.width, canvas.height));
  const square = document.createElement('canvas');
  square.width = size;
  square.height = size;
  const context = square.getContext('2d');
  const scale = Math.min(size / canvas.width, size / canvas.height);
  const width = Math.round(canvas.width * scale);
  const height = Math.round(canvas.height * scale);
  context.clearRect(0, 0, size, size);
  context.drawImage(canvas, (size - width) / 2, (size - height) / 2, width, height);
  const png = new Uint8Array(await (await canvasToFile(square, 'image/png')).arrayBuffer());
  const header = new ArrayBuffer(22);
  const view = new DataView(header);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, size === 256 ? 0 : size);
  view.setUint8(7, size === 256 ? 0 : size);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.byteLength, true);
  view.setUint32(18, 22, true);
  return new Blob([header, png], { type: MIME.ico });
}

export async function convertImage(item, target, onProgress) {
  if (target === item.ext && !state.settings.maxDimension) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }
  onProgress(8);
  const canvas = await imageToCanvas(item.file, item.rawExt);
  onProgress(45);
  const execute = async () => {
    let blob;
    if (target === 'pptx') blob = await imageCanvasToPptx(canvas, safeName(item.file.name));
    else if (target === 'pdf') {
      const pngBlob = await canvasToFile(canvas, 'image/png');
      const pngBytes = await pngBlob.arrayBuffer();
      const pageSize = state.settings.pageSize;
      const { bytes } = await runBackground(
        buildPdf,
        { pdfLibUrl: absoluteUrl('pdf-lib.min.js'), buffer: pngBytes, pageSize },
        [pngBytes]
      );
      blob = new Blob([bytes], { type: MIME.pdf });
    } else if (target === 'tiff') {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const width = canvas.width;
      const height = canvas.height;
      const { bytes } = await runBackground(
        encodeTiff,
        { utifUrl: absoluteUrl('utif.min.js'), rgba: pixels, w: width, h: height },
        [pixels.buffer]
      );
      blob = new Blob([bytes], { type: MIME.tiff });
    } else if (target === 'bmp') blob = await canvasToBmp(canvas);
    else if (target === 'ico') blob = await canvasToIco(canvas);
    else {
      const mime = MIME[target];
      if (target === 'jpg') {
        const flattened = document.createElement('canvas');
        flattened.width = canvas.width;
        flattened.height = canvas.height;
        const context = flattened.getContext('2d');
        context.fillStyle = state.settings.jpegBackground;
        context.fillRect(0, 0, flattened.width, flattened.height);
        context.drawImage(canvas, 0, 0);
        blob = await canvasToFile(flattened, mime, state.settings.imageQuality / 100);
        flattened.width = 1;
        flattened.height = 1;
      } else blob = await canvasToFile(canvas, mime, state.settings.imageQuality / 100);
    }
    onProgress(96);
    return { files: [{ name: outputName(item.file, target), blob }] };
  };
  return execute().finally(() => {
    canvas.width = 1;
    canvas.height = 1;
  });
}