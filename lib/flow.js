import { convertArchive } from './archive.js';
import { convertData } from './data.js';
import { convertDatabase } from './database.js';
import { convertDocument } from './document.js';
import { convertEbook } from './ebook.js';
import { convertImage } from './image.js';
import { convertMedia } from './media.js';
import { convertPdf } from './pdf.js';
import { convertSubtitle } from './subtitle.js';

const handlers = new Map();

export function registerHandler(kind, handler) {
  if (!kind || typeof handler !== 'function') {
    throw new TypeError('A format kind and handler are required.');
  }
  handlers.set(kind, handler);
}

registerHandler('image', convertImage);
registerHandler('video', convertMedia);
registerHandler('audio', convertMedia);
registerHandler('pdf', convertPdf);
registerHandler('document', convertDocument);
registerHandler('ebook', convertEbook);
registerHandler('subtitle', convertSubtitle);
registerHandler('data', convertData);
registerHandler('database', convertDatabase);
registerHandler('archive', convertArchive);

export async function process(item, target, onProgress, signal) {
  const handler = handlers.get(item.kind);
  if (!handler) throw new Error('No processing route is registered for this file type');
  return handler(item, target, onProgress, signal);
}