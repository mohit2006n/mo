import { MIME } from './formats.js';
import { use } from './runtime.js';

const OFFICE_DOCUMENT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const IMAGE_RELATIONSHIP =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const STYLES_RELATIONSHIP =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles';
const SETTINGS_RELATIONSHIP =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(value) {
  return escapeXml(String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''));
}

function points(inches) {
  return Math.max(0, inches * 72).toFixed(3);
}

function twips(inches) {
  return Math.max(1, Math.round(inches * 1440));
}

function textBox(text, pageNumber, index) {
  const family = escapeXml(text.fontFamily || 'Arial');
  const fontSize = Math.max(2, Math.min(192, Number(text.fontSize) || 10));
  const halfPoints = Math.max(4, Math.round(fontSize * 2));
  const lineHeight = Math.max(40, Math.round(fontSize * 23));
  const bold = text.bold ? '<w:b/><w:bCs/>' : '';
  const italic = text.italic ? '<w:i/><w:iCs/>' : '';
  const color = /^[0-9A-F]{6}$/i.test(text.color || '') ? text.color.toUpperCase() : '000000';
  const style = [
    'position:absolute',
    `margin-left:${points(text.x)}pt`,
    `margin-top:${points(text.y)}pt`,
    `width:${points(text.width)}pt`,
    `height:${points(text.height)}pt`,
    `z-index:${1000 + index}`,
    'mso-position-horizontal-relative:page',
    'mso-position-vertical-relative:page',
    'mso-wrap-style:none',
  ].join(';');
  return `<w:r><w:pict><v:rect id="Editable_Text_${pageNumber}_${index + 1}" style="${style}" filled="f" stroked="f" o:allowincell="f"><w10:wrap type="none"/><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${lineHeight}" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/><w:color w:val="${color}"/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>${bold}${italic}</w:rPr><w:t xml:space="preserve">${cleanText(text.value)}</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict></w:r>`;
}

function background(page, relationshipId) {
  const placement = page.placement;
  const style = [
    'position:absolute',
    `margin-left:${points(placement.x)}pt`,
    `margin-top:${points(placement.y)}pt`,
    `width:${points(placement.width)}pt`,
    `height:${points(placement.height)}pt`,
    'z-index:-251658240',
    'mso-position-horizontal-relative:page',
    'mso-position-vertical-relative:page',
    'mso-wrap-style:none',
  ].join(';');
  return `<w:r><w:pict><v:rect id="PDF_Page_${page.pageNumber}" style="${style}" filled="t" stroked="f" o:allowincell="f"><v:imagedata r:id="${relationshipId}" o:title="PDF page ${page.pageNumber}"/><w10:wrap type="none"/></v:rect></w:pict></w:r>`;
}

function pageXml(page, relationshipId, isLast) {
  const shapes = (page.texts || [])
    .map((text, index) => textBox(text, page.pageNumber, index))
    .join('');
  const anchor = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${background(page, relationshipId)}${shapes}</w:p>`;
  return isLast ? anchor : `${anchor}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
}

function documentXml(pages, layout) {
  const content = pages
    .map((page, index) => pageXml(page, `rId${index + 3}`, index === pages.length - 1))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:body>${content}<w:sectPr><w:pgSz w:w="${twips(layout.width)}" w:h="${twips(layout.height)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:space="0"/></w:sectPr></w:body></w:document>`;
}

function documentRelationships(pages) {
  const images = pages
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 3}" Type="${IMAGE_RELATIONSHIP}" Target="media/page-${index + 1}.png"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${STYLES_RELATIONSHIP}" Target="styles.xml"/><Relationship Id="rId2" Type="${SETTINGS_RELATIONSHIP}" Target="settings.xml"/>${images}</Relationships>`;
}

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
}

function settingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:doNotTrackMoves/><w:doNotTrackFormatting/></w:settings>`;
}

function coreXml(title) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appXml(pageCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application></Application><Pages>${pageCount}</Pages><Company></Company></Properties>`;
}

export async function packagePdfDocument(pages, layout, title) {
  await use('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes());
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT}" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  zip.file('word/document.xml', documentXml(pages, layout));
  zip.file('word/_rels/document.xml.rels', documentRelationships(pages));
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/settings.xml', settingsXml());
  zip.file('docProps/core.xml', coreXml(title));
  zip.file('docProps/app.xml', appXml(pages.length));
  for (let index = 0; index < pages.length; index++) {
    zip.file(`word/media/page-${index + 1}.png`, pages[index].image);
  }
  return zip.generateAsync({
    type: 'blob',
    mimeType: MIME.docx,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}