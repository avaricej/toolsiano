import { t } from './i18n.ts';
import { MAX_FILE, MAX_SIDE, limits } from './resources.ts';

export type EditorImageKind = 'jpeg' | 'png' | 'webp' | 'avif' | 'svg';
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export async function editorImageKind(file: Blob): Promise<EditorImageKind> {
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (header[0] === 255 && header[1] === 216) return 'jpeg';
  if (ascii(header, 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WEBP') return 'webp';
  if (ascii(header, 4, 8) === 'ftyp') return 'avif'; // Full brands are validated before decoding.
  if (
    /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(
      new TextDecoder().decode(header),
    )
  )
    return 'svg';
  // Parse declared SVG even when an XML preamble is longer than the sniffing window.
  if (file.type === 'image/svg+xml' || ('name' in file && /\.svg$/i.test(String(file.name))))
    return 'svg';
  throw new Error(t('Редактор принимает JPG, PNG, WebP, AVIF и статические SVG.'));
}

export function checkImageSize(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    Math.max(width, height) > MAX_SIDE ||
    width * height > limits().pixels
  )
    throw new Error(t('Изображение слишком большое для безопасной обработки на этом устройстве'));
}

function avifError(): never {
  throw new Error(t('Не удалось прочитать структуру AVIF. Нужен обычный статический файл AVIF.'));
}

// Follow BMFF boxes, including metadata placed after mdat. Never scan arbitrary bytes for ispe.
export async function avifDimensions(file: Blob): Promise<[number, number]> {
  const sizes: [number, number][] = [];
  let branded = false,
    boxes = 0;
  async function visit(start: number, end: number, depth: number) {
    if (depth > 6) avifError();
    let offset = start;
    while (offset < end) {
      if (++boxes > 2048 || offset + 8 > end) avifError();
      const header = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
      const view = new DataView(header.buffer);
      const type = ascii(header, 4, 8);
      let size = view.getUint32(0),
        headerSize = 8;
      if (size === 1) {
        if (header.length < 16) avifError();
        const wideSize = view.getBigUint64(8);
        if (wideSize > BigInt(Number.MAX_SAFE_INTEGER)) avifError();
        size = Number(wideSize);
        headerSize = 16;
      } else if (size === 0) size = end - offset;
      if (size < headerSize || offset + size > end) avifError();
      const payload = offset + headerSize;
      if (type === 'ftyp' && depth === 0) {
        if (size > 4096 || size < headerSize + 8 || (size - headerSize) % 4) avifError();
        const brands = new Uint8Array(await file.slice(payload, offset + size).arrayBuffer());
        const names = [ascii(brands, 0, 4)];
        for (let i = 8; i < brands.length; i += 4) names.push(ascii(brands, i, i + 4));
        if (!names.includes('avif') || names.includes('avis')) avifError();
        branded = true;
      } else if (type === 'moov' && depth === 0) avifError();
      else if (['meta', 'iprp', 'ipco'].includes(type)) {
        if (size > 2 * 1024 * 1024) avifError();
        const skip = type === 'meta' ? 4 : 0;
        if (payload + skip > offset + size) avifError();
        await visit(payload + skip, offset + size, depth + 1);
      } else if (type === 'ispe' && depth === 3) {
        if (size < headerSize + 12) avifError();
        const data = new DataView(await file.slice(payload, payload + 12).arrayBuffer());
        const width = data.getUint32(4),
          height = data.getUint32(8);
        checkImageSize(width, height);
        sizes.push([width, height]);
      }
      offset += size;
    }
  }
  await visit(0, file.size, 0);
  if (!branded || !sizes.length) avifError();
  return sizes.reduce((largest, size) =>
    size[0] * size[1] > largest[0] * largest[1] ? size : largest,
  );
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const elements = new Set([
  'svg',
  'g',
  'defs',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'style',
  'image',
]);
const presentation = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'color',
  'clip-path',
  'clip-rule',
  'mask',
  'display',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'word-spacing',
  'paint-order',
  'vector-effect',
  'stop-color',
  'stop-opacity',
]);
const attributes = new Set([
  ...presentation,
  'id',
  'class',
  'transform',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'pathLength',
  'dx',
  'dy',
  'rotate',
  'textLength',
  'lengthAdjust',
  'viewBox',
  'preserveAspectRatio',
  'offset',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'fx',
  'fy',
  'fr',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
]);

function svgError(): never {
  throw new Error(
    t(
      'Этот SVG не поддерживается. Используйте статическую графику без скриптов, внешних ресурсов, внешних изображений, анимации, фильтров и элементов use.',
    ),
  );
}
function safeValue(value: string) {
  if (/[\\@]/.test(value) || /(?:javascript|data|https?|file|blob):|expression\s*\(/i.test(value))
    svgError();
  if (/url\s*\(/i.test(value) && !/^url\(\s*["']?#[\w.:-]+["']?\s*\)$/i.test(value.trim()))
    svgError();
  return value;
}
function cleanStyle(source: string) {
  if (/[\\@]/.test(source) || /\/\*/.test(source)) svgError();
  const style = document.createElement('span').style;
  style.cssText = source;
  const result: string[] = [];
  for (const name of style) {
    if (!presentation.has(name)) svgError();
    result.push(name + ':' + safeValue(style.getPropertyValue(name)));
  }
  return result.join(';');
}
function cleanStylesheet(source: string) {
  if (/[\\@]/.test(source) || /\/\*/.test(source)) svgError();
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  return [...sheet.cssRules]
    .map((rule) => {
      if (!(rule instanceof CSSStyleRule) || !/^[\p{L}\p{N}_#.\s,>*-]+$/u.test(rule.selectorText))
        svgError();
      return rule.selectorText + '{' + cleanStyle(rule.style.cssText) + '}';
    })
    .join('\n');
}
function svgLength(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?$/i);
  if (!match) return null;
  const factors: Record<string, number> = {
    px: 1,
    pt: 96 / 72,
    pc: 16,
    mm: 96 / 25.4,
    cm: 96 / 2.54,
    in: 96,
  };
  const size = Number(match[1]) * factors[(match[2] || 'px').toLowerCase()];
  return Number.isFinite(size) && size > 0 ? size : null;
}

// Construct a fresh SVG document with a strict static subset. Never insert source into page HTML.
export async function prepareSvg(
  file: Blob,
): Promise<{ blob: Blob; dimensions: [number, number] }> {
  if (file.size > MAX_FILE) throw new Error(t('Один из файлов больше 25 МБ'));
  const source = await file.text();
  const markup = source.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/gi, '');
  if (new Blob([markup]).size > 2 * 1024 * 1024)
    throw new Error(t('Разметка SVG без встроенных PNG должна быть не больше 2 МБ.'));
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) svgError();
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (
    root.localName !== 'svg' ||
    root.namespaceURI !== SVG_NS ||
    parsed.querySelector('parsererror')
  )
    svgError();
  const all = [...root.querySelectorAll('*')];
  if (all.length > 5000) svgError();
  const box = (root.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  const widthValue = svgLength(root.getAttribute('width')),
    heightValue = svgLength(root.getAttribute('height'));
  let width = widthValue,
    height = heightValue;
  if (hasBox) {
    width ||= height ? (height * box[2]) / box[3] : box[2];
    height ||= widthValue ? (widthValue * box[3]) / box[2] : box[3];
  }
  if (!width || !height)
    throw new Error(t('В SVG должны быть указаны ширина и высота или корректный viewBox.'));
  const dimensions: [number, number] = [Math.ceil(width), Math.ceil(height)];
  checkImageSize(...dimensions);
  const output = document.implementation.createDocument(SVG_NS, 'svg');
  let embeddedPixels = 0;
  function copy(node: Element, target: Element, depth: number) {
    if (depth > 64) svgError();
    for (const attr of [...node.attributes]) {
      if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue;
      if (attr.localName === 'href' && node.localName === 'image') {
        if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/i.test(attr.value)) svgError();
        const bytes = Uint8Array.from(atob(attr.value.slice(attr.value.indexOf(',') + 1)), (char) =>
          char.charCodeAt(0),
        );
        if (
          bytes.length < 33 ||
          ascii(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n' ||
          ascii(bytes, 12, 16) !== 'IHDR'
        )
          svgError();
        const data = new DataView(bytes.buffer);
        checkImageSize(data.getUint32(16), data.getUint32(20));
        embeddedPixels += data.getUint32(16) * data.getUint32(20);
        if (embeddedPixels > limits().pixels)
          throw new Error(t('Суммарное разрешение встроенных PNG превышает лимит устройства.'));
        let offset = 8,
          count = 0;
        while (offset + 12 <= bytes.length) {
          if (++count > 4096 || ascii(bytes, offset + 4, offset + 8) === 'acTL') svgError();
          const size = data.getUint32(offset);
          if (size + offset + 12 > bytes.length) svgError();
          offset += size + 12;
        }
        target.setAttribute('href', attr.value);
        continue;
      }
      if (/^on/i.test(attr.localName) || ['href', 'base', 'filter'].includes(attr.localName))
        svgError();
      if (attr.name === 'style') target.setAttribute('style', cleanStyle(attr.value));
      else if (attributes.has(attr.name)) target.setAttribute(attr.name, safeValue(attr.value));
    }
    if (node.localName === 'image' && !target.hasAttribute('href')) svgError();
    if (node.localName === 'style') {
      target.textContent = cleanStylesheet(node.textContent || '');
      return;
    }
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) target.append(output.createTextNode(child.textContent || ''));
      else if (child.nodeType === 1) {
        const element = child as Element;
        if (element.localName === 'metadata' || element.namespaceURI !== SVG_NS) continue;
        if (!elements.has(element.localName)) svgError();
        const next = output.createElementNS(SVG_NS, element.localName);
        copy(element, next, depth + 1);
        target.append(next);
      }
    }
  }
  copy(root, output.documentElement, 0);
  output.documentElement.setAttribute('width', String(dimensions[0]));
  output.documentElement.setAttribute('height', String(dimensions[1]));
  return {
    blob: new Blob([new XMLSerializer().serializeToString(output)], { type: 'image/svg+xml' }),
    dimensions,
  };
}

export async function prepareEditorImage(file: Blob) {
  const kind = await editorImageKind(file);
  if (kind === 'svg') return { ...(await prepareSvg(file)), kind };
  if (kind === 'avif')
    return {
      blob: file.slice(0, file.size, 'image/avif'),
      dimensions: await avifDimensions(file),
      kind,
    };
  return { blob: file, dimensions: null, kind };
}
