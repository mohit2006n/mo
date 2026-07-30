import { MIME } from './formats.js';
import { absoluteUrl, runBackground, use } from './runtime.js';

async function buildImagePresentation(e) {
  const { data } = e;
  importScripts(data.pptxgenUrl);
  const { imageBase64, width, height, title, layout = 'LAYOUT_WIDE', lang = 'en-US', fontFace = 'Arial' } = data;

  const presentation = new PptxGenJS();
  presentation.layout = layout;
  presentation.title = title;
  presentation.lang = lang;
  presentation.theme = { headFontFace: fontFace, bodyFontFace: fontFace, lang };

  const slide = presentation.addSlide();
  slide.background = { color: 'FFFFFF' };

  const maxWidth = 13.333;
  const maxHeight = 7.5;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  slide.addImage({
    data: imageBase64,
    x: (13.333 - scaledWidth) / 2,
    y: (7.5 - scaledHeight) / 2,
    w: scaledWidth,
    h: scaledHeight,
  });

  const bytes = await presentation.write({ outputType: 'arraybuffer' });
  self.postMessage({ bytes }, [bytes]);
}

async function buildTextPresentation(e) {
  const { data } = e;
  importScripts(data.pptxgenUrl);
  const { slides, title, layout = 'LAYOUT_WIDE', lang = 'en-US', fontFace = 'Arial' } = data;

  const presentation = new PptxGenJS();
  presentation.layout = layout;
  presentation.title = title;
  presentation.lang = lang;
  presentation.theme = { headFontFace: fontFace, bodyFontFace: fontFace, lang };

  slides.forEach((content, index) => {
    const slide = presentation.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(content.title || `${title} ${index + 1}`, {
      x: 0.7,
      y: 0.65,
      w: 11.9,
      h: 0.8,
      fontFace,
      fontSize: 28,
      bold: true,
      color: '000000',
      margin: 0,
      fit: 'shrink',
    });
    if (content.body) {
      slide.addText(content.body, {
        x: 0.7,
        y: 1.75,
        w: 11.9,
        h: 4.9,
        fontFace,
        fontSize: 18,
        color: '000000',
        margin: 0,
        valign: 'top',
        fit: 'shrink',
        paraSpaceAfterPt: 8,
      });
    }
  });

  const bytes = await presentation.write({ outputType: 'arraybuffer' });
  self.postMessage({ bytes }, [bytes]);
}

export async function writePresentation(presentation) {
  const output = await presentation.write({ outputType: 'blob' });
  return output instanceof Blob ? output : new Blob([output], { type: MIME.pptx });
}

export function configurePresentation(presentation, title, options = {}) {
  presentation.layout = options.layout || 'LAYOUT_WIDE';
  presentation.title = title;
  presentation.lang = options.lang || 'en-US';
  const fontFace = options.fontFace || 'Arial';
  presentation.theme = { headFontFace: fontFace, bodyFontFace: fontFace, lang: presentation.lang };
}

export async function imageCanvasToPptx(canvas, title, options = {}) {
  const { bytes } = await runBackground(buildImagePresentation, {
    action: 'imagePresentation',
    pptxgenUrl: absoluteUrl('pptxgen.bundle.js'),
    imageBase64: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    title,
    ...options,
  });
  return new Blob([bytes], { type: MIME.pptx });
}

function chunkTextForSlides(text, deckTitle) {
  const sourceLines = String(text).replace(/\r/g, '').split('\n');
  const slides = [];
  let current = { title: '', bodyLines: [] };
  const flush = () => {
    if (current.title || current.bodyLines.some(Boolean))
      slides.push({ title: current.title, body: current.bodyLines.join('\n').trim() });
  };
  for (const rawLine of sourceLines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^#{1,3}\s+(.+)/);
    const currentLength = current.bodyLines.join('\n').length;
    if (heading && (current.title || current.bodyLines.some(Boolean))) {
      flush();
      current = { title: heading[1].trim(), bodyLines: [] };
      continue;
    }
    if ((currentLength > 650 || current.bodyLines.length >= 12) && line.trim()) {
      flush();
      current = { title: line.replace(/^[-*]\s+/, '').trim(), bodyLines: [] };
      continue;
    }
    if (!current.title && line.trim()) current.title = (heading ? heading[1] : line).trim();
    else current.bodyLines.push(line.replace(/^[-*]\s+/, '• '));
  }
  flush();
  return slides.length ? slides : [{ title: deckTitle, body: '' }];
}

export async function createPresentation(text, title, suppliedSlides = null, options = {}) {
  const slides = suppliedSlides || chunkTextForSlides(text, title);
  const { bytes } = await runBackground(buildTextPresentation, {
    action: 'textPresentation',
    pptxgenUrl: absoluteUrl('pptxgen.bundle.js'),
    slides,
    title,
    ...options,
  });
  return new Blob([bytes], { type: MIME.pptx });
}

const EMU_PER_INCH = 914400;
const SLIDE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const IMAGE_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const LAYOUT_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function emu(value) {
  return Math.max(1, Math.round(value * EMU_PER_INCH));
}

function textShapeXml(text, index, lang = 'en-US') {
  const rotation = Number.isFinite(text.rotation) ? Math.round(text.rotation * 60000) : 0;
  const rotationAttribute = rotation ? ` rot="${rotation}"` : '';
  const fontSize = Math.max(100, Math.min(9600, Math.round(text.fontSize * 100)));
  const family = escapeXml(text.fontFamily || 'Arial');
  const value = escapeXml(text.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''));
  const weightAttribute = text.bold ? ' b="1"' : '';
  const italicAttribute = text.italic ? ' i="1"' : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${index + 3}" name="Editable Text ${index + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotationAttribute}><a:off x="${emu(text.x)}" y="${emu(text.y)}"/><a:ext cx="${emu(text.width)}" cy="${emu(text.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" vertOverflow="overflow" horzOverflow="overflow" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="${lang}" sz="${fontSize}" dirty="0"${weightAttribute}${italicAttribute}><a:solidFill><a:srgbClr val="${text.color || '000000'}"/></a:solidFill><a:latin typeface="${family}"/></a:rPr><a:t xml:space="preserve">${value}</a:t></a:r><a:endParaRPr lang="${lang}" sz="${fontSize}"/></a:p></p:txBody></p:sp>`;
}

function slideXml(page, placement) {
  const number = String(page.pageNumber).padStart(String(page.totalPages).length, '0');
  const name = escapeXml(`PDF Page ${number}`);
  const description = escapeXml(`PDF page ${page.pageNumber} of ${page.totalPages}`);
  const textShapes = (page.texts || []).map(textShapeXml).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="${name}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="${name}" descr="${description}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(placement.x)}" y="${emu(placement.y)}"/><a:ext cx="${emu(placement.width)}" cy="${emu(placement.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>${textShapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRelationships(imageName, layoutTarget) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${IMAGE_TYPE}" Target="../media/${imageName}"/><Relationship Id="rId2" Type="${LAYOUT_TYPE}" Target="${layoutTarget}"/></Relationships>`;
}

function replaceSlideList(xml, relationships, pageCount) {
  const preserved = relationships.replace(
    new RegExp(`<Relationship\\b[^>]*Type="${SLIDE_TYPE}"[^>]*/>`, 'g'),
    '',
  );
  const ids = [...preserved.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  let nextRelationship = Math.max(0, ...ids) + 1;
  const slideIds = [];
  const slideRelationships = [];
  for (let index = 0; index < pageCount; index++) {
    const relationshipId = `rId${nextRelationship++}`;
    slideIds.push(`<p:sldId id="${256 + index}" r:id="${relationshipId}"/>`);
    slideRelationships.push(
      `<Relationship Id="${relationshipId}" Type="${SLIDE_TYPE}" Target="slides/slide${index + 1}.xml"/>`,
    );
  }
  const updatedXml = xml.replace(
    /<p:sldIdLst>.*?<\/p:sldIdLst>/s,
    `<p:sldIdLst>${slideIds.join('')}</p:sldIdLst>`,
  );
  const updatedRelationships = preserved.replace(
    '</Relationships>',
    `${slideRelationships.join('')}</Relationships>`,
  );
  return { xml: updatedXml, relationships: updatedRelationships };
}

function updateContentTypes(xml, pageCount) {
  let updated = xml.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '');
  if (!/Extension="png"/.test(updated)) {
    updated = updated.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/></Types>',
    );
  }
  const overrides = Array.from(
    { length: pageCount },
    (_, index) =>
      `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('');
  return updated.replace('</Types>', `${overrides}</Types>`);
}

export async function packagePdfPages(pages, layout, title) {
  await Promise.all([use('pptxgen'), use('jszip')]);
  const template = new PptxGenJS();
  template.defineLayout({ name: 'PDF_PAGE', width: layout.width, height: layout.height });
  template.layout = 'PDF_PAGE';
  template.title = title;
  template.lang = 'en-US';
  template.addSlide();
  const templateFile = await writePresentation(template);
  const zip = await JSZip.loadAsync(await templateFile.arrayBuffer());

  const templateSlideRelationships = await zip
    .file('ppt/slides/_rels/slide1.xml.rels')
    .async('string');
  const layoutTarget =
    templateSlideRelationships.match(
      new RegExp(`<Relationship\\b[^>]*Type="${LAYOUT_TYPE}"[^>]*Target="([^"]+)"`),
    )?.[1] || '../slideLayouts/slideLayout1.xml';

  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/slides\/(?:_rels\/)?slide\d+\.xml(?:\.rels)?$/.test(name)) zip.remove(name);
    if (/^ppt\/media\//.test(name)) zip.remove(name);
  }

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const imageName = `page-${String(index + 1).padStart(String(pages.length).length, '0')}.png`;
    zip.file(`ppt/media/${imageName}`, page.image);
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(page, page.placement));
    zip.file(
      `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      slideRelationships(imageName, layoutTarget),
    );
  }

  const presentationPath = 'ppt/presentation.xml';
  const relationshipsPath = 'ppt/_rels/presentation.xml.rels';
  const presentationXml = await zip.file(presentationPath).async('string');
  const presentationRelationships = await zip.file(relationshipsPath).async('string');
  const updated = replaceSlideList(presentationXml, presentationRelationships, pages.length);
  zip.file(presentationPath, updated.xml);
  zip.file(relationshipsPath, updated.relationships);

  const contentTypesPath = '[Content_Types].xml';
  zip.file(
    contentTypesPath,
    updateContentTypes(await zip.file(contentTypesPath).async('string'), pages.length),
  );
  const appPath = 'docProps/app.xml';
  const appXml = await zip.file(appPath).async('string');
  zip.file(appPath, appXml.replace(/<Slides>\d+<\/Slides>/, `<Slides>${pages.length}</Slides>`));

  const output = await zip.generateAsync({
    type: 'blob',
    mimeType: MIME.pptx,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return output;
}