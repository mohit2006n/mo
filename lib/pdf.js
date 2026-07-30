import { packagePdfDocument } from './word.js';
import { MIME, outputName, safeName } from './formats.js';
import { canvasToFile } from './image.js';
import { packagePdfPages } from './presentation.js';
import { absoluteUrl } from './runtime.js';
import { state } from './state.js';

let pdfLibrary;

async function ensurePdfJs() {
  if (!pdfLibrary) pdfLibrary = await import(absoluteUrl('pdf.min.mjs'));
  pdfLibrary.GlobalWorkerOptions.workerSrc = absoluteUrl('pdf.worker.min.mjs');
  return pdfLibrary;
}

async function openPdf(file) {
  const lib = await ensurePdfJs();
  return lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    verbosity: 0,
    fontExtraProperties: true,
  }).promise;
}

async function extractPdfText(pdf, onProgress = () => {}) {
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    const lines = [];
    for (const item of content.items) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 4 && line.trim()) {
        lines.push(line.trim());
        line = '';
      }
      line += `${item.str}${item.hasEOL ? '\n' : ' '}`;
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join('\n'));
    onProgress((pageNumber / pdf.numPages) * 85);
    page.cleanup();
  }
  return pages.join('\n\n--- Page break ---\n\n');
}

function fitPageToSlide(pageWidth, pageHeight, slideWidth, slideHeight) {
  const scale = Math.min(slideWidth / pageWidth, slideHeight / pageHeight);
  const width = pageWidth * scale;
  const height = pageHeight * scale;
  return {
    x: (slideWidth - width) / 2,
    y: (slideHeight - height) / 2,
    width,
    height,
  };
}

function normalizedFontFamily(value) {
  const family = String(value || '')
    .replace(/["']/g, '')
    .replace(/^[A-Z]{6}\+/, '')
    .trim();
  if (/mono|courier/i.test(family)) return 'Courier New';
  if (/sans|arial|helvetica/i.test(family)) return 'Arial';
  if (/serif|times/i.test(family)) return 'Times New Roman';
  return family || 'Arial';
}

function normalizedRotation(angle) {
  let degrees = (angle * 180) / Math.PI;
  while (degrees > 180) degrees -= 360;
  while (degrees <= -180) degrees += 360;
  return degrees;
}

function canJoinText(line, item, pageWidth) {
  const previous = line.items[line.items.length - 1];
  if (previous.hasEOL || Math.abs(item.rotation) > 2 || Math.abs(line.rotation) > 2) return false;
  if (Math.abs(item.rotation - line.rotation) > 1) return false;
  if (previous.sourceColor !== item.sourceColor && (previous.sourceColor || item.sourceColor))
    return false;
  if (previous.bold !== item.bold || previous.italic !== item.italic) return false;
  if (previous.fontFamily !== item.fontFamily) return false;
  const smallerHeight = Math.min(line.fontHeight, item.fontHeight);
  if (Math.abs(item.baseline - line.baseline) > Math.max(1.5, smallerHeight * 0.35)) return false;
  const fontRatio = item.fontHeight / line.fontHeight;
  if (fontRatio < 0.72 || fontRatio > 1.38) return false;
  if (item.sourceX < previous.sourceX - smallerHeight * 0.2) return false;
  const gap = item.sourceX - (previous.sourceX + previous.sourceWidth);
  if (gap < -smallerHeight * 0.2) return false;
  return gap <= Math.max(smallerHeight * 1.6, pageWidth * 0.008);
}

function spacesForGap(previous, item) {
  if (/\s$/.test(previous.value) || /^\s/.test(item.value)) return '';
  const gap = item.sourceX - (previous.sourceX + previous.sourceWidth);
  const height = Math.max(previous.fontHeight, item.fontHeight);
  if (gap <= height * 0.08) return '';
  return ' '.repeat(Math.max(1, Math.min(6, Math.round(gap / (height * 0.42)))));
}

function colorArguments(args) {
  const values = [];
  const append = (value) => {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      for (const child of value) append(child);
    } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
      values.push(
        Number.parseInt(value.slice(1, 3), 16),
        Number.parseInt(value.slice(3, 5), 16),
        Number.parseInt(value.slice(5, 7), 16),
      );
    } else if (Number.isFinite(Number(value))) values.push(Number(value));
  };
  append(args);
  return values;
}

function rgbColor(args) {
  const values = colorArguments(args).slice(-3);
  if (values.length < 3) return null;
  const unitScale = values.every((value) => value >= 0 && value <= 1);
  return values.map((value) => Math.max(0, Math.min(255, unitScale ? value * 255 : value)));
}

function grayColor(args) {
  const values = colorArguments(args);
  if (!values.length) return null;
  const channel = Math.max(
    0,
    Math.min(255, values.at(-1) <= 1 ? values.at(-1) * 255 : values.at(-1)),
  );
  return [channel, channel, channel];
}

function cmykColor(args) {
  const values = colorArguments(args).slice(-4);
  if (values.length < 4) return null;
  const [cyan, magenta, yellow, black] = values.map((value) =>
    Math.max(0, Math.min(1, value > 1 ? value / 255 : value)),
  );
  return [
    255 * (1 - Math.min(1, cyan + black)),
    255 * (1 - Math.min(1, magenta + black)),
    255 * (1 - Math.min(1, yellow + black)),
  ];
}

function glyphText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(glyphText).join('');
  if (typeof value === 'object') return value.unicode || value.fontChar || '';
  return '';
}

function textColors(operatorList, items) {
  const operations = pdfLibrary.OPS;
  const stack = [];
  let state = { fill: [0, 0, 0], alpha: 1, direct: true };
  const glyphColors = [];
  const showText = (args, glyphIndex = 0) => {
    const value = glyphText(args?.[glyphIndex] ?? args);
    for (const character of value) {
      if (!/\s/u.test(character)) {
        glyphColors.push(state.direct && state.alpha >= 0.98 ? colorHex(state.fill) : '');
      }
    }
  };

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operation = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];
    if (operation === operations.save) stack.push({ ...state, fill: [...state.fill] });
    else if (operation === operations.restore) state = stack.pop() || state;
    else if (operation === operations.setFillRGBColor) {
      const fill = rgbColor(args);
      if (fill) state = { ...state, fill, direct: true };
    } else if (operation === operations.setFillGray) {
      const fill = grayColor(args);
      if (fill) state = { ...state, fill, direct: true };
    } else if (operation === operations.setFillCMYKColor) {
      const fill = cmykColor(args);
      if (fill) state = { ...state, fill, direct: true };
    } else if (operation === operations.setFillColor) {
      const values = colorArguments(args);
      const fill =
        values.length >= 4
          ? cmykColor(values)
          : values.length >= 3
            ? rgbColor(values)
            : grayColor(values);
      if (fill) state = { ...state, fill, direct: true };
    } else if (operation === operations.setFillColorN) state = { ...state, direct: false };
    else if (operation === operations.setGState) {
      for (const entry of args?.[0] || args || []) {
        if (Array.isArray(entry) && entry[0] === 'ca' && Number.isFinite(Number(entry[1]))) {
          state = { ...state, alpha: Number(entry[1]) };
        }
      }
    } else if (operation === operations.showText || operation === operations.showSpacedText) {
      showText(args, 0);
    } else if (operation === operations.nextLineShowText) showText(args, 0);
    else if (operation === operations.nextLineSetSpacingShowText) showText(args, 2);
  }

  const assignments = new WeakMap();
  let cursor = 0;
  for (const item of items) {
    const characterCount = [...String(item.str || '')].filter(
      (character) => !/\s/u.test(character),
    ).length;
    if (!characterCount) continue;
    const colors = glyphColors.slice(cursor, cursor + characterCount).filter(Boolean);
    cursor += characterCount;
    if (!colors.length) continue;
    const counts = new Map();
    for (const color of colors) counts.set(color, (counts.get(color) || 0) + 1);
    assignments.set(
      item,
      [...counts.entries()].sort((first, second) => second[1] - first[1])[0][0],
    );
  }
  return assignments;
}

function finishTextLine(line, viewport, placement, measureContext) {
  const scaleX = placement.width / viewport.width;
  const scaleY = placement.height / viewport.height;
  const left = Math.min(...line.items.map((item) => item.sourceX));
  const top = Math.min(...line.items.map((item) => item.sourceY));
  const right = Math.max(...line.items.map((item) => item.sourceX + item.sourceWidth));
  const bottom = Math.max(...line.items.map((item) => item.sourceY + item.sourceHeight));
  const sourceWidth = Math.max(1, right - left);
  const sourceHeight = Math.max(line.fontHeight, bottom - top);
  const rightAllowance = Math.max(line.fontHeight * 0.8, sourceWidth * 0.1);
  const weightedSize = line.items.reduce(
    (total, item) => total + item.fontHeight * Math.max(1, item.value.trim().length),
    0,
  );
  const characterCount = line.items.reduce(
    (total, item) => total + Math.max(1, item.value.trim().length),
    0,
  );
  const familyCounts = new Map();
  for (const item of line.items) {
    familyCounts.set(
      item.fontFamily,
      (familyCounts.get(item.fontFamily) || 0) + Math.max(1, item.value.trim().length),
    );
  }
  const fontFamily = [...familyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Arial';
  const colorCounts = new Map();
  for (const item of line.items) {
    if (!item.sourceColor) continue;
    colorCounts.set(
      item.sourceColor,
      (colorCounts.get(item.sourceColor) || 0) + Math.max(1, item.value.trim().length),
    );
  }
  const color = [...colorCounts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0];
  const value = line.items.reduce(
    (text, item, index) =>
      `${text}${index ? spacesForGap(line.items[index - 1], item) : ''}${item.value}`,
    '',
  );
  const fontHeight = weightedSize / characterCount;
  const bold = line.items.some((item) => item.bold);
  const italic = line.items.some((item) => item.italic);
  if (measureContext) {
    measureContext.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontHeight}px "${fontFamily}"`;
  }
  const measuredWidth = measureContext
    ? measureContext.measureText(value).width
    : value.length * fontHeight * 0.55;
  const textBoxWidth = Math.min(
    viewport.width * 2,
    Math.max(sourceWidth + rightAllowance, measuredWidth * 1.12),
  );
  return {
    value,
    x: placement.x + left * scaleX,
    y: placement.y + top * scaleY,
    width: textBoxWidth * scaleX,
    height: Math.max(sourceHeight * scaleY * 1.3, 0.03),
    sourceX: left,
    sourceY: top,
    sourceWidth,
    sourceHeight,
    eraseRegions: line.items.map((item) => ({
      sourceX: item.sourceX,
      sourceY: item.sourceY,
      sourceWidth: item.sourceWidth,
      sourceHeight: item.sourceHeight,
    })),
    fontSize: Math.max(fontHeight * scaleY * 72, 1),
    fontFamily,
    rotation: line.rotation,
    bold,
    italic,
    color,
  };
}

async function editablePageText(page, viewport, placement) {
  const [content, operatorList] = await Promise.all([
    page.getTextContent({ disableCombineTextItems: false }),
    page.getOperatorList(),
  ]);
  const itemColors = textColors(operatorList, content.items);
  const rawItems = content.items
    .filter((item) => item.str && item.str.trim())
    .map((item) => {
      const transform = pdfLibrary.Util.transform(viewport.transform, item.transform);
      const style = content.styles[item.fontName] || {};
      let angle = Math.atan2(transform[1], transform[0]);
      if (style.vertical) angle += Math.PI / 2;
      const fontHeight = Math.max(1, Math.hypot(transform[2], transform[3]));
      const ascent = Number.isFinite(style.ascent)
        ? style.ascent * fontHeight
        : Number.isFinite(style.descent)
          ? (1 + style.descent) * fontHeight
          : fontHeight;
      const left = transform[4] + ascent * Math.sin(angle);
      const top = transform[5] - ascent * Math.cos(angle);
      const measuredWidth = style.vertical ? item.height : item.width;
      const width = Math.max(measuredWidth || fontHeight * 0.5, fontHeight * 0.25);
      let font;
      try {
        font = page.commonObjs.get(item.fontName);
      } catch (_) {}
      const familySource = `${font?.name || ''} ${style.fontFamily || ''} ${item.fontName || ''}`;
      return {
        value: item.str,
        sourceX: left,
        sourceY: top,
        sourceWidth: width,
        sourceHeight: Math.max(item.height || fontHeight, fontHeight) * 1.15,
        baseline: transform[5],
        fontHeight,
        fontFamily: normalizedFontFamily(font?.name || style.fontFamily),
        rotation: normalizedRotation(angle),
        bold: Boolean(font?.bold || font?.black || /bold|black|demi|semibold/i.test(familySource)),
        italic: Boolean(font?.italic || /italic|oblique/i.test(familySource)),
        sourceColor: itemColors.get(item),
        hasEOL: Boolean(item.hasEOL),
      };
    })
    .filter((item) => Math.abs(item.rotation) <= 2);

  const lines = [];
  let current = null;
  for (const item of rawItems) {
    if (!current || !canJoinText(current, item, viewport.width)) {
      if (current) lines.push(current);
      current = {
        items: [item],
        baseline: item.baseline,
        fontHeight: item.fontHeight,
        rotation: item.rotation,
      };
    } else {
      current.items.push(item);
      const count = current.items.length;
      current.baseline = (current.baseline * (count - 1) + item.baseline) / count;
      current.fontHeight = (current.fontHeight * (count - 1) + item.fontHeight) / count;
    }
    if (item.hasEOL) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  const measureContext = document.createElement('canvas').getContext('2d');
  return lines.map((line) => finishTextLine(line, viewport, placement, measureContext));
}

async function renderPage(page, viewport, canvas) {
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: context,
    viewport,
    background: 'rgb(255,255,255)',
    intent: 'display',
  }).promise;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function colorDistance(first, second) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2;
}

function foregroundColor(context, left, top, right, bottom, background) {
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const width = Math.max(1, Math.ceil(right) - x);
  const height = Math.max(1, Math.ceil(bottom) - y);
  const image = context.getImageData(x, y, width, height);
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / 12_000)));
  const candidates = [];
  for (let row = 0; row < height; row += stride) {
    for (let column = 0; column < width; column += stride) {
      const offset = (row * width + column) * 4;
      const color = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
      const distance = colorDistance(color, background);
      if (distance >= 900) candidates.push({ color, distance });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((first, second) => second.distance - first.distance);
  const selectedCount = Math.min(256, Math.max(8, Math.ceil(candidates.length * 0.2)));
  const selected = candidates.slice(0, selectedCount).map((candidate) => candidate.color);
  return [
    median(selected.map((color) => color[0])),
    median(selected.map((color) => color[1])),
    median(selected.map((color) => color[2])),
  ];
}

function colorHex(color) {
  return color
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}

function eraseTextRegions(canvas, texts, sourceViewport) {
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const scaleX = canvas.width / sourceViewport.width;
  const scaleY = canvas.height / sourceViewport.height;
  const pixel = (x, y) => {
    const safeX = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const safeY = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    return [...context.getImageData(safeX, safeY, 1, 1).data.slice(0, 3)];
  };
  const fills = [];

  for (const text of texts) {
    const backgroundColors = [];
    const foregroundColors = [];
    for (const region of text.eraseRegions || [text]) {
      const x = region.sourceX * scaleX;
      const y = region.sourceY * scaleY;
      const width = Math.max(1, region.sourceWidth * scaleX);
      const height = Math.max(1, region.sourceHeight * scaleY);
      const horizontalPadding = Math.max(3, Math.round(height * 0.32));
      const verticalPadding = Math.max(2, Math.round(height * 0.18));
      const left = Math.max(0, x - horizontalPadding);
      const top = Math.max(0, y - verticalPadding);
      const right = Math.min(canvas.width, x + width + horizontalPadding);
      const bottom = Math.min(canvas.height, y + height + verticalPadding);
      const samples = [
        pixel(left, top),
        pixel((left + right) / 2, top),
        pixel(right, top),
        pixel(left, bottom),
        pixel((left + right) / 2, bottom),
        pixel(right, bottom),
      ];
      const background = [
        median(samples.map((sample) => sample[0])),
        median(samples.map((sample) => sample[1])),
        median(samples.map((sample) => sample[2])),
      ];
      backgroundColors.push(background);
      const foreground = text.color
        ? null
        : foregroundColor(
            context,
            Math.max(0, x),
            Math.max(0, y),
            Math.min(canvas.width, x + width),
            Math.min(canvas.height, y + height),
            background,
          );
      if (foreground) foregroundColors.push(foreground);
      fills.push({ left, top, right, bottom, background });
    }

    if (!text.color) {
      if (foregroundColors.length) {
        text.color = colorHex([
          median(foregroundColors.map((color) => color[0])),
          median(foregroundColors.map((color) => color[1])),
          median(foregroundColors.map((color) => color[2])),
        ]);
      } else {
        const background = [
          median(backgroundColors.map((color) => color[0])),
          median(backgroundColors.map((color) => color[1])),
          median(backgroundColors.map((color) => color[2])),
        ];
        const luminance = background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722;
        text.color = luminance < 128 ? 'FFFFFF' : '000000';
      }
    }
  }

  for (const fill of fills) {
    context.fillStyle = `rgb(${fill.background.join(',')})`;
    context.fillRect(
      fill.left,
      fill.top,
      Math.max(1, fill.right - fill.left),
      Math.max(1, fill.bottom - fill.top),
    );
  }
}

async function renderEditablePdfPages(pdf, onProgress) {
  const firstPage = await pdf.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const ratio = firstViewport.width / firstViewport.height;
  const pageWidth = ratio >= 1 ? 10 : 10 * ratio;
  const pageHeight = ratio >= 1 ? 10 / ratio : 10;
  const layout = { width: pageWidth, height: pageHeight };
  const preferredScale = Number(state.settings.pdfScale) || 2;
  const maxPagePixels = 20_000_000;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = pageNumber === 1 ? firstPage : await pdf.getPage(pageNumber);
    const sourceViewport = page.getViewport({ scale: 1 });
    const safeScale = Math.min(
      preferredScale,
      Math.sqrt(maxPagePixels / (sourceViewport.width * sourceViewport.height)),
    );
    const viewport = page.getViewport({ scale: safeScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const placement = fitPageToSlide(
      sourceViewport.width,
      sourceViewport.height,
      layout.width,
      layout.height,
    );
    const texts = await editablePageText(page, sourceViewport, placement);
    await renderPage(page, viewport, canvas);
    if (texts.length) eraseTextRegions(canvas, texts, sourceViewport);
    pages.push({
      pageNumber,
      totalPages: pdf.numPages,
      image: await canvasToFile(canvas, 'image/png'),
      placement,
      texts,
    });

    page.cleanup();
    canvas.width = 1;
    canvas.height = 1;
    onProgress(8 + (pageNumber / pdf.numPages) * 78);
  }
  return { pages, layout };
}

async function pdfToPresentation(pdf, title, onProgress) {
  const { pages, layout } = await renderEditablePdfPages(pdf, onProgress);
  const output = await packagePdfPages(pages, layout, title);
  onProgress(96);
  return output;
}

async function pdfToDocument(pdf, title, onProgress) {
  const { pages, layout } = await renderEditablePdfPages(pdf, onProgress);
  const output = await packagePdfDocument(pages, layout, title);
  onProgress(96);
  return output;
}

export async function convertPdf(item, target, onProgress) {
  onProgress(4);
  const pdf = await openPdf(item.file);
  try {
    if (target === 'pptx') {
      const blob = await pdfToPresentation(pdf, safeName(item.file.name), onProgress);
      return { files: [{ name: outputName(item.file, 'pptx'), blob }] };
    }
    if (target === 'docx') {
      const blob = await pdfToDocument(pdf, safeName(item.file.name), onProgress);
      return { files: [{ name: outputName(item.file, 'docx'), blob }] };
    }
    if (target === 'txt') {
      const text = await extractPdfText(pdf, (value) => onProgress(8 + value));
      return {
        files: [{ name: outputName(item.file, 'txt'), blob: new Blob([text], { type: MIME.txt }) }],
      };
    }
    const files = [];
    const scale = Number(state.settings.pdfScale) || 2;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (target === 'jpg') {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToFile(
        canvas,
        MIME[target],
        target === 'jpg' ? state.settings.imageQuality / 100 : undefined,
      );
      const suffix =
        pdf.numPages > 1
          ? `-page-${String(pageNumber).padStart(String(pdf.numPages).length, '0')}`
          : '';
      files.push({ name: outputName(item.file, target, suffix), blob });
      onProgress(8 + (pageNumber / pdf.numPages) * 88);
      page.cleanup();
      canvas.width = canvas.height = 1;
    }
    return { files };
  } finally {
    if (typeof pdf.destroy === 'function') await pdf.destroy();
    else await pdf.loadingTask?.destroy();
  }
}