import {
  createStyledDocx,
  createPdf,
  escapeHtml,
  fullHtmlDocument,
  htmlToPlainText,
  sanitizeHtml,
} from './content.js';
import { MIME, outputName, safeName } from './formats.js';
import { createPresentation } from './presentation.js';
import { absoluteUrl } from './runtime.js';

async function unzlib(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function metadataText(value) {
  if (Array.isArray(value)) return value.map(metadataText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return metadataText(value.en || Object.values(value)[0]);
  return String(value || '').trim();
}

async function ebookContent(file, onProgress) {
  const { MOBI, isMOBI } = await import(absoluteUrl('foliate/mobi.js'));
  if (!(await isMOBI(file))) throw new Error('Invalid, encrypted, or unsupported MOBI/AZW file');
  const reader = new MOBI({ unzlib });
  const book = await reader.open(file);
  try {
    const sections = [];
    const readable = book.sections.filter(
      (section) => typeof section?.createDocument === 'function',
    );
    for (let index = 0; index < readable.length; index++) {
      const document = await readable[index].createDocument();
      const source = document.body?.innerHTML || document.documentElement?.innerHTML || '';
      const html = sanitizeHtml(source);
      if (html.trim()) sections.push(`<section>${html}</section>`);
      onProgress(15 + ((index + 1) / Math.max(1, readable.length)) * 55);
    }
    if (!sections.length) throw new Error('No readable ebook sections were found');
    const title = metadataText(book.metadata?.title) || safeName(file.name);
    const author = metadataText(book.metadata?.author);
    return {
      title,
      html: `<header><h1>${escapeHtml(title)}</h1>${author ? `<p>${escapeHtml(author)}</p>` : ''}</header>${sections.join('')}`,
    };
  } finally {
    book.destroy?.();
  }
}

export async function convertEbook(item, target, onProgress) {
  onProgress(6);
  const content = await ebookContent(item.file, onProgress);
  const htmlDocument = fullHtmlDocument(content.html, content.title);
  const text = htmlToPlainText(htmlDocument);
  let blob;
  if (target === 'html') blob = new Blob([htmlDocument], { type: MIME.html });
  else if (target === 'txt') blob = new Blob([text], { type: MIME.txt });
  else if (target === 'pdf') blob = await createPdf(text, content.title);
  else if (target === 'docx') blob = await createStyledDocx(content.html, content.title);
  else if (target === 'pptx') blob = await createPresentation(text, content.title);
  else throw new Error('Unsupported ebook target');
  onProgress(96);
  return { files: [{ name: outputName(item.file, target), blob }] };
}