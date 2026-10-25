import { degrees, type PDFPage, type PDFImage } from 'pdf-lib';
import { placements, type MarkOptions } from './watermark.ts';

export function watermarkPage(page: PDFPage, mark: PDFImage, options: MarkOptions) {
  const crop = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const width = rotation % 180 ? crop.height : crop.width;
  const height = rotation % 180 ? crop.width : crop.height;
  const angle = ((rotation - options.angle) * Math.PI) / 180;
  for (const p of placements(width, height, mark.width / mark.height, options)) {
    let x: number, y: number;
    if (rotation === 90) {
      x = p.y;
      y = p.x;
    } else if (rotation === 180) {
      x = crop.width - p.x;
      y = p.y;
    } else if (rotation === 270) {
      x = crop.width - p.y;
      y = crop.height - p.x;
    } else {
      x = p.x;
      y = crop.height - p.y;
    }
    page.drawImage(mark, {
      x: crop.x + x - (Math.cos(angle) * p.w) / 2 + (Math.sin(angle) * p.h) / 2,
      y: crop.y + y - (Math.sin(angle) * p.w) / 2 - (Math.cos(angle) * p.h) / 2,
      width: p.w,
      height: p.h,
      rotate: degrees(rotation - options.angle),
      opacity: options.opacity / 100,
    });
  }
}
