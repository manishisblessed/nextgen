/**
 * Client-side EXIF GPS extraction from image files.
 * Uses DataView to parse EXIF/TIFF headers without external dependencies.
 */

interface GpsCoords {
  latitude: number;
  longitude: number;
}

export async function extractGpsFromFile(file: File): Promise<GpsCoords | null> {
  if (!file.type.startsWith("image/")) return null;

  const buffer = await file.arrayBuffer();
  return parseExifGps(buffer);
}

function parseExifGps(buffer: ArrayBuffer): GpsCoords | null {
  const view = new DataView(buffer);

  if (view.getUint16(0) !== 0xffd8) return null; // not JPEG

  let offset = 2;
  while (offset < view.byteLength - 2) {
    const marker = view.getUint16(offset);
    offset += 2;

    if (marker === 0xffe1) {
      const length = view.getUint16(offset);
      const exifData = parseExifBlock(view, offset + 2, length - 2);
      if (exifData) return exifData;
      offset += length;
    } else if ((marker & 0xff00) === 0xff00) {
      const length = view.getUint16(offset);
      offset += length;
    } else {
      break;
    }
  }

  return null;
}

function parseExifBlock(
  view: DataView,
  start: number,
  _length: number
): GpsCoords | null {
  const exifHeader = String.fromCharCode(
    view.getUint8(start),
    view.getUint8(start + 1),
    view.getUint8(start + 2),
    view.getUint8(start + 3)
  );
  if (exifHeader !== "Exif") return null;

  const tiffStart = start + 6;
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949;

  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0Start = tiffStart + ifdOffset;

  const gpsIfdPointer = findTag(view, ifd0Start, tiffStart, littleEndian, 0x8825);
  if (gpsIfdPointer === null) return null;

  const gpsIfdStart = tiffStart + gpsIfdPointer;
  return parseGpsIfd(view, gpsIfdStart, tiffStart, littleEndian);
}

function findTag(
  view: DataView,
  ifdStart: number,
  tiffStart: number,
  littleEndian: boolean,
  targetTag: number
): number | null {
  const entries = view.getUint16(ifdStart, littleEndian);
  for (let i = 0; i < entries; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === targetTag) {
      return view.getUint32(entryOffset + 8, littleEndian);
    }
  }
  return null;
}

function parseGpsIfd(
  view: DataView,
  ifdStart: number,
  tiffStart: number,
  littleEndian: boolean
): GpsCoords | null {
  const entries = view.getUint16(ifdStart, littleEndian);
  let latRef = "N";
  let lonRef = "E";
  let lat: number[] | null = null;
  let lon: number[] | null = null;

  for (let i = 0; i < entries; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    const valueOffset = view.getUint32(entryOffset + 8, littleEndian);

    switch (tag) {
      case 0x0001: // GPSLatitudeRef
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 0x0002: // GPSLatitude
        lat = readRational3(view, tiffStart + valueOffset, littleEndian);
        break;
      case 0x0003: // GPSLongitudeRef
        lonRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        break;
      case 0x0004: // GPSLongitude
        lon = readRational3(view, tiffStart + valueOffset, littleEndian);
        break;
    }
  }

  if (!lat || !lon) return null;

  let latitude = lat[0] + lat[1] / 60 + lat[2] / 3600;
  let longitude = lon[0] + lon[1] / 60 + lon[2] / 3600;

  if (latRef === "S") latitude = -latitude;
  if (lonRef === "W") longitude = -longitude;

  if (latitude === 0 && longitude === 0) return null;

  return { latitude, longitude };
}

function readRational3(
  view: DataView,
  offset: number,
  littleEndian: boolean
): number[] {
  const values: number[] = [];
  for (let i = 0; i < 3; i++) {
    const num = view.getUint32(offset + i * 8, littleEndian);
    const den = view.getUint32(offset + i * 8 + 4, littleEndian);
    values.push(den === 0 ? 0 : num / den);
  }
  return values;
}
