import {
  escapeHtml,
  fullHtmlDocument,
  htmlToPlainText,
  sanitizeHtml,
  createDocx,
  createStyledDocx,
  createPdf,
} from './content.js';
import { MIME, outputName, safeName } from './formats.js';
import { convertToPdf, PDF_FILTERS } from './suite.js';
import { createPresentation } from './presentation.js';
import { convertPdf } from './pdf.js';
import { use, runBackground, absoluteUrl } from './runtime.js';

async function parseDocx(e) {
  const { data } = e;
  importScripts(data.mammothUrl);
  const { buffer } = data;

  const converted = await mammoth.convertToHtml({ arrayBuffer: buffer });
  self.postMessage({ html: converted.value });
}

async function extractPptxSlides(file) {
  await use('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(
      (a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0),
    );
  if (!slideEntries.length || !zip.file('[Content_Types].xml'))
    throw new Error('Invalid or unsupported PPTX package');
  if (slideEntries.length > 500)
    throw new Error('Presentation exceeds the 500-slide limit');
  const drawingNamespace = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const slides = [];
  for (let index = 0; index < slideEntries.length; index++) {
    const xml = await zip.file(slideEntries[index]).async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror'))
      throw new Error(`Slide ${index + 1} contains invalid XML`);
    const paragraphs = [...doc.getElementsByTagNameNS(drawingNamespace, 'p')]
      .map((paragraph) =>
        [...paragraph.getElementsByTagNameNS(drawingNamespace, 't')]
          .map((node) => node.textContent || '')
          .join('')
          .trim(),
      )
      .filter(Boolean);
    const allText = [...doc.getElementsByTagNameNS(drawingNamespace, 't')]
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const lines = paragraphs.length ? paragraphs : allText ? [allText] : [];
    slides.push({
      number: index + 1,
      title: lines[0] || `Slide ${index + 1}`,
      body: lines.slice(1).join('\n'),
      lines,
    });
  }
  return slides;
}

function pptxSlidesToText(slides) {
  return slides
    .map((slide) => `Slide ${slide.number}: ${slide.title}${slide.body ? `\n${slide.body}` : ''}`)
    .join('\n\n--- Slide break ---\n\n');
}

function pptxSlidesToMarkdown(slides) {
  return slides
    .map((slide) => `# ${slide.title}\n\n${slide.body || ''}`.trim())
    .join('\n\n---\n\n');
}

function pptxSlidesToHtml(slides) {
  return `<main>${slides.map((slide) => `<section><h1>${escapeHtml(slide.title)}</h1>${slide.body ? `<p>${escapeHtml(slide.body).replace(/\n/g, '<br>')}</p>` : ''}</section>`).join('')}</main>`;
}

async function documentSourceToHtml(item) {
  if (item.ext === 'docx') {
    const buffer = await item.file.arrayBuffer();
    const { html } = await runBackground(
      parseDocx,
      { mammothUrl: absoluteUrl('mammoth.browser.min.js'), buffer },
      [buffer]
    );
    return sanitizeHtml(html);
  }
  const source = await item.file.text();
  if (item.ext === 'html') return sanitizeHtml(source);
  if (item.ext === 'md') {
    await use('marked');
    return sanitizeHtml(marked.parse(source, { gfm: true, breaks: false }));
  }
  return `<pre>${escapeHtml(source)}</pre>`;
}

async function htmlToMarkdown(html) {
  await use('turndown');
  const service = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  return service.turndown(html).trim();
}

async function documentThroughPdf(item, target, onProgress) {
  const pdfBlob = await convertToPdf(item, (value) => onProgress(4 + value * 0.46));
  const pdfItem = {
    ...item,
    id: `${item.id}-pdf`,
    file: new File([pdfBlob], `${safeName(item.file.name)}.pdf`, { type: MIME.pdf }),
    rawExt: 'pdf',
    ext: 'pdf',
    kind: 'pdf',
  };
  return convertPdf(pdfItem, target, (value) => onProgress(50 + value * 0.5));
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not encode slide image'));
    reader.readAsDataURL(blob);
  });
}

async function presentationToHtml(item, title, onProgress) {
  const pdfBlob = await convertToPdf(item, (value) => onProgress(4 + value * 0.46));
  const pdfItem = {
    ...item,
    id: `${item.id}-pdf-html`,
    file: new File([pdfBlob], `${title}.pdf`, { type: MIME.pdf }),
    rawExt: 'pdf',
    ext: 'pdf',
    kind: 'pdf',
  };
  const rendered = await convertPdf(pdfItem, 'png', (value) => onProgress(50 + value * 0.42));
  const sections = [];
  const pageLabel = item.ext === 'pptx' ? 'Slide' : 'Page';
  for (let index = 0; index < rendered.files.length; index++) {
    sections.push(
      `<figure><img src="${await dataUrl(rendered.files[index].blob)}" alt="${pageLabel} ${index + 1}" style="display:block;width:100%;height:auto"></figure>`,
    );
  }
  return new Blob([fullHtmlDocument(`<main>${sections.join('')}</main>`, title)], {
    type: MIME.html,
  });
}

async function htmlThroughWord(item, html, target, title, onProgress) {
  const wordBlob = await createStyledDocx(html, title);
  if (target === 'docx') {
    return { files: [{ name: outputName(item.file, 'docx'), blob: wordBlob }] };
  }
  const wordItem = {
    ...item,
    id: `${item.id}-docx`,
    file: new File([wordBlob], `${title}.docx`, { type: MIME.docx }),
    rawExt: 'docx',
    ext: 'docx',
    kind: 'document',
  };
  if (target === 'pdf') {
    const blob = await convertToPdf(wordItem, (value) => onProgress(40 + value * 0.58));
    return { files: [{ name: outputName(item.file, 'pdf'), blob }] };
  }
  return documentThroughPdf(wordItem, target, (value) => onProgress(35 + value * 0.63));
}

export async function convertDocument(item, target, onProgress) {
  onProgress(8);
  const title = safeName(item.file.name);
  if (target === 'pdf' && PDF_FILTERS[item.ext]) {
    const blob = await convertToPdf(item, onProgress);
    return { files: [{ name: outputName(item.file, 'pdf'), blob }] };
  }
  const richOfficeRoute =
    (item.ext === 'docx' && target === 'pptx') || (item.ext === 'pptx' && target === 'docx');
  if (richOfficeRoute && globalThis.crossOriginIsolated) {
    return documentThroughPdf(item, target, onProgress);
  }
  if ((item.ext === 'docx' || item.ext === 'pptx') && target === 'html' && globalThis.crossOriginIsolated) {
    const blob = await presentationToHtml(item, title, onProgress);
    return { files: [{ name: outputName(item.file, 'html'), blob }] };
  }
  if (item.ext === 'pptx') {
    const slides = await extractPptxSlides(item.file);
    onProgress(58);
    const text = pptxSlidesToText(slides);
    if (target === 'txt')
      return {
        files: [{ name: outputName(item.file, 'txt'), blob: new Blob([text], { type: MIME.txt }) }],
      };
    if (target === 'md')
      return {
        files: [
          {
            name: outputName(item.file, 'md'),
            blob: new Blob([pptxSlidesToMarkdown(slides)], { type: MIME.md }),
          },
        ],
      };
    if (target === 'html')
      return {
        files: [
          {
            name: outputName(item.file, 'html'),
            blob: new Blob([fullHtmlDocument(pptxSlidesToHtml(slides), title)], {
              type: MIME.html,
            }),
          },
        ],
      };
    if (target === 'docx')
      return {
        files: [{ name: outputName(item.file, 'docx'), blob: await createDocx(text, title) }],
      };
    throw new Error('Unsupported PowerPoint target');
  }

  const html = await documentSourceToHtml(item);
  onProgress(40);
  if (target === 'html')
    return {
      files: [
        {
          name: outputName(item.file, 'html'),
          blob: new Blob([fullHtmlDocument(html, title)], { type: MIME.html }),
        },
      ],
    };
  if (target === 'md') {
    const markdown = item.ext === 'md' ? await item.file.text() : await htmlToMarkdown(html);
    return {
      files: [{ name: outputName(item.file, 'md'), blob: new Blob([markdown], { type: MIME.md }) }],
    };
  }
  const richSource = ['html', 'md'].includes(item.ext);
  if (richSource && ['docx', 'pdf', 'pptx'].includes(target)) {
    if (target === 'docx' || globalThis.crossOriginIsolated) {
      return htmlThroughWord(item, html, target, title, onProgress);
    }
  }
  const text = htmlToPlainText(html);
  onProgress(67);
  if (target === 'txt')
    return {
      files: [{ name: outputName(item.file, 'txt'), blob: new Blob([text], { type: MIME.txt }) }],
    };
  if (target === 'pdf')
    return {
      files: [{ name: outputName(item.file, 'pdf'), blob: await createPdf(text, title) }],
    };
  if (target === 'docx')
    return {
      files: [
        {
          name: outputName(item.file, 'docx'),
          blob: await createDocx(item.ext === 'md' ? await item.file.text() : text, title),
        },
      ],
    };
  if (target === 'pptx')
    return {
      files: [
        {
          name: outputName(item.file, 'pptx'),
          blob: await createPresentation(item.ext === 'md' ? await item.file.text() : text, title),
        },
      ],
    };
  throw new Error('Unsupported document target');
}