import { state } from './state.js';
import { absoluteUrl, runBackground, use } from './runtime.js';

async function buildPdf(e) {
  const { data } = e;
  importScripts(data.jspdfUrl);
  const { text, title, pageSize } = data;

  const { jsPDF } = jspdf || self.jspdf;

  const doc = new jsPDF({ unit: 'pt', format: pageSize || 'a4', compress: true });
  doc.setProperties({ title });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const lineHeight = 15;
  let y = margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);

  const lines = doc.splitTextToSize(text || ' ', pageWidth - margin * 2);
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  const bytes = doc.output('arraybuffer');
  self.postMessage({ bytes }, [bytes]);
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character],
  );
}

export function sanitizeHtml(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc
    .querySelectorAll('script, iframe, object, embed, form, meta[http-equiv], link[rel="import"]')
    .forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) =>
    [...node.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith('on') || /javascript:/i.test(attribute.value))
        node.removeAttribute(attribute.name);
    }),
  );
  return doc.body.innerHTML;
}

export function htmlToPlainText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  doc
    .querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre')
    .forEach((node) => node.append('\n'));
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function fullHtmlDocument(content, title) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body>${content}</body></html>`;
}

export async function createPdf(text, title) {
  const { bytes } = await runBackground(buildPdf, {
    action: 'createPdf',
    jspdfUrl: absoluteUrl('jspdf.umd.min.js'),
    text,
    title,
    pageSize: state.settings.pageSize || 'a4',
  });
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function createDocx(text, title) {
  await use('docx');
  const paragraphs = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) paragraphs.push(new docx.Paragraph(''));
    else if (/^#{1,6}\s/.test(line)) {
      const level = Math.min(6, line.match(/^#+/)[0].length);
      paragraphs.push(
        new docx.Paragraph({
          text: line.replace(/^#{1,6}\s*/, ''),
          heading: docx.HeadingLevel[`HEADING_${level}`],
        }),
      );
    } else if (/^[-*]\s+/.test(line))
      paragraphs.push(
        new docx.Paragraph({ text: line.replace(/^[-*]\s+/, ''), bullet: { level: 0 } }),
      );
    else paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun(line)] }));
  }
  const documentFile = new docx.Document({
    title,
    sections: [{ properties: {}, children: paragraphs }],
  });
  return docx.Packer.toBlob(documentFile);
}

function wordColor(value) {
  if (!value) return undefined;
  const context = document.createElement('canvas').getContext('2d');
  context.fillStyle = '#000000';
  context.fillStyle = value;
  const normalized = context.fillStyle;
  const hex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (hex) return hex[1].toUpperCase();
  const rgb = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return undefined;
  return rgb
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function wordSize(value, inherited) {
  if (!value) return inherited;
  const match = String(value)
    .trim()
    .match(/^([\d.]+)(px|pt|em|rem|%)?$/i);
  if (!match) return inherited;
  const amount = Number(match[1]);
  const unit = (match[2] || 'px').toLowerCase();
  const points =
    unit === 'pt'
      ? amount
      : unit === 'em' || unit === 'rem'
        ? amount * ((inherited || 22) / 2)
        : unit === '%'
          ? (amount / 100) * ((inherited || 22) / 2)
          : amount * 0.75;
  return Math.max(2, Math.min(192, Math.round(points * 2)));
}

function inlineStyle(element, inherited) {
  const tag = element.tagName.toLowerCase();
  const style = element.style;
  const fontWeight = style.fontWeight;
  const decoration = style.textDecorationLine || style.textDecoration || '';
  return {
    ...inherited,
    bold:
      inherited.bold ||
      tag === 'b' ||
      tag === 'strong' ||
      fontWeight === 'bold' ||
      Number.parseInt(fontWeight, 10) >= 600,
    italics: inherited.italics || tag === 'i' || tag === 'em' || style.fontStyle === 'italic',
    underline: inherited.underline || tag === 'u' || decoration.includes('underline'),
    strike:
      inherited.strike ||
      ['s', 'strike', 'del'].includes(tag) ||
      decoration.includes('line-through'),
    superScript: inherited.superScript || tag === 'sup',
    subScript: inherited.subScript || tag === 'sub',
    color: wordColor(style.color) || inherited.color,
    size: wordSize(style.fontSize, inherited.size),
    font:
      style.fontFamily?.split(',')[0]?.replace(/["']/g, '').trim() ||
      (tag === 'code' || tag === 'pre' ? 'Courier New' : inherited.font),
    preserve: inherited.preserve || tag === 'pre' || tag === 'code',
  };
}

function textRun(value, style) {
  const text = style.preserve ? value : value.replace(/\s+/g, ' ');
  if (!text) return null;
  return new docx.TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? { type: docx.UnderlineType.SINGLE } : undefined,
    strike: style.strike,
    superScript: style.superScript,
    subScript: style.subScript,
    color: style.color,
    size: style.size,
    font: style.font,
  });
}

function imageDimensions(data, type) {
  if (type === 'png' && data.length >= 24) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (type === 'gif' && data.length >= 10) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return [view.getUint16(6, true), view.getUint16(8, true)];
  }
  if (type === 'jpg' || type === 'jpeg') {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      const length = (data[offset + 2] << 8) | data[offset + 3];
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        return [
          (data[offset + 7] << 8) | data[offset + 8],
          (data[offset + 5] << 8) | data[offset + 6],
        ];
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  return [0, 0];
}

function dataImageRun(element) {
  const source = element.getAttribute('src') || '';
  const match = source.match(/^data:image\/(png|jpe?g|gif);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const binary = atob(match[2].replace(/\s/g, ''));
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const type = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const [naturalWidth, naturalHeight] = imageDimensions(data, type);
  let width = Number.parseFloat(element.getAttribute('width')) || naturalWidth || 300;
  let height = Number.parseFloat(element.getAttribute('height')) || naturalHeight || 200;
  const maxWidth = 720;
  if (width > maxWidth) {
    const scale = maxWidth / width;
    width *= scale;
    height *= scale;
  }
  return new docx.ImageRun({
    data,
    type,
    transformation: {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    },
    altText: {
      title: element.getAttribute('alt') || 'Image',
      description: element.getAttribute('alt') || 'Image',
      name: element.getAttribute('alt') || 'Image',
    },
  });
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

function inlineRuns(node, inherited = {}, skipBlocks = true) {
  if (node.nodeType === Node.TEXT_NODE) {
    const run = textRun(node.nodeValue || '', inherited);
    return run ? [run] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (tag === 'br') return [new docx.TextRun({ break: 1 })];
  if (tag === 'img') {
    const image = dataImageRun(element);
    if (image) return [image];
    const alternative = element.getAttribute('alt');
    return alternative ? [new docx.TextRun({ text: alternative, italics: true })] : [];
  }
  if (skipBlocks && BLOCK_TAGS.has(tag)) return [];
  const style = inlineStyle(element, inherited);
  const runs = [];
  for (const child of element.childNodes) runs.push(...inlineRuns(child, style, skipBlocks));
  return runs;
}

function alignmentFor(element) {
  const value = element.style.textAlign || element.getAttribute('align') || '';
  if (value === 'center') return docx.AlignmentType.CENTER;
  if (value === 'right' || value === 'end') return docx.AlignmentType.RIGHT;
  if (value === 'justify') return docx.AlignmentType.JUSTIFIED;
  return undefined;
}

function paragraphFor(element, options = {}) {
  const tag = element.tagName.toLowerCase();
  const style = inlineStyle(element, { size: undefined, font: undefined, preserve: tag === 'pre' });
  let runs = [];
  for (const child of element.childNodes) runs.push(...inlineRuns(child, style, true));
  if (options.prefix) runs.unshift(new docx.TextRun(options.prefix));
  if (!runs.length) runs = [new docx.TextRun('')];
  const heading = /^h[1-6]$/.test(tag) ? docx.HeadingLevel[`HEADING_${tag[1]}`] : undefined;
  return new docx.Paragraph({
    children: runs,
    heading,
    bullet: options.bullet ? { level: options.level || 0 } : undefined,
    alignment: alignmentFor(element),
    spacing: tag === 'pre' ? { before: 120, after: 120 } : undefined,
  });
}

function tableFor(element) {
  const rows = [
    ...element.querySelectorAll(
      ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr',
    ),
  ];
  return new docx.Table({
    rows: rows.map(
      (row) =>
        new docx.TableRow({
          children: [...row.children]
            .filter((cell) => ['td', 'th'].includes(cell.tagName.toLowerCase()))
            .map(
              (cell) =>
                new docx.TableCell({
                  children: [paragraphFor(cell)],
                  shading: cell.tagName.toLowerCase() === 'th' ? { fill: 'E9E5DA' } : undefined,
                }),
            ),
        }),
    ),
  });
}

function documentBlocks(root, level = 0) {
  const blocks = [];
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.nodeValue?.trim()) {
        blocks.push(new docx.Paragraph({ children: [new docx.TextRun(child.nodeValue.trim())] }));
      }
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'table') blocks.push(tableFor(child));
    else if (tag === 'ul' || tag === 'ol') {
      const items = [...child.children].filter((element) => element.tagName.toLowerCase() === 'li');
      items.forEach((item, index) => {
        blocks.push(
          paragraphFor(item, {
            bullet: tag === 'ul',
            level,
            prefix: tag === 'ol' ? `${index + 1}. ` : '',
          }),
        );
      });
    } else if (
      ['div', 'main', 'section', 'article', 'header', 'footer', 'aside', 'nav'].includes(tag)
    ) {
      blocks.push(...documentBlocks(child, level));
    } else if (tag === 'hr') {
      blocks.push(new docx.Paragraph({ thematicBreak: true }));
    } else blocks.push(paragraphFor(child));
  }
  return blocks;
}

export async function createStyledDocx(html, title) {
  await use('docx');
  const source = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  const children = documentBlocks(source.body);
  const documentFile = new docx.Document({
    title,
    sections: [{ properties: {}, children: children.length ? children : [new docx.Paragraph('')] }],
  });
  return docx.Packer.toBlob(documentFile);
}