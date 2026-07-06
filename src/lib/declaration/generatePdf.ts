import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import { join } from "path";
import type { DeclarationData } from "./types";
import { getCreatorRoleLabel, getOnboardeeRoleLabel } from "./types";

const LINE_HEIGHT = 16;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

let cachedFontBytes: Buffer | null = null;

async function loadHindiFont(): Promise<Buffer> {
  if (cachedFontBytes) return cachedFontBytes;
  const fontPath = join(process.cwd(), "public", "fonts", "NotoSansDevanagari-Regular.ttf");
  cachedFontBytes = await readFile(fontPath);
  return cachedFontBytes;
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    let width: number;
    try {
      width = font.widthOfTextAtSize(testLine, fontSize);
    } catch {
      width = testLine.length * fontSize * 0.5;
    }
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function generateDeclarationPdf(data: DeclarationData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const hindiFontBytes = await loadHindiFont();
  const hindiFont = await pdfDoc.embedFont(hindiFontBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const creatorLabel = getCreatorRoleLabel(data.creatorRole);
  const onboardeeLabel = getOnboardeeRoleLabel(data.onboardeeRole);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 50;

  function drawText(text: string, opts: {
    x?: number; fontSize?: number; font?: any; color?: any; bold?: boolean;
  } = {}) {
    const font = opts.font ?? helvetica;
    const fontSize = opts.fontSize ?? 10;
    const x = opts.x ?? MARGIN_LEFT;
    const color = opts.color ?? rgb(0, 0, 0);

    if (y < 60) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 50;
    }
    page.drawText(text, { x, y, size: fontSize, font, color });
    y -= LINE_HEIGHT;
  }

  function drawWrapped(text: string, opts: {
    fontSize?: number; font?: any; indent?: number;
  } = {}) {
    const font = opts.font ?? hindiFont;
    const fontSize = opts.fontSize ?? 9;
    const indent = opts.indent ?? 0;
    const lines = wrapText(text, font, fontSize, CONTENT_WIDTH - indent);
    for (const line of lines) {
      if (y < 60) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - 50;
      }
      page.drawText(line, { x: MARGIN_LEFT + indent, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= LINE_HEIGHT;
    }
  }

  function drawLine() {
    if (y < 60) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 50;
    }
    page.drawLine({
      start: { x: MARGIN_LEFT, y: y + 8 },
      end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y + 8 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 8;
  }

  function drawField(label: string, value: string) {
    if (y < 60) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 50;
    }
    page.drawText(`${label}: `, { x: MARGIN_LEFT, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
    const labelWidth = helveticaBold.widthOfTextAtSize(`${label}: `, 10);
    page.drawText(value || "___________", { x: MARGIN_LEFT + labelWidth, y, size: 10, font: helvetica, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT + 2;
  }

  function spacer(h = 10) { y -= h; }

  // ── Header ──
  drawText("JMP NextGen Tech Private Limited", { fontSize: 16, font: helveticaBold, x: MARGIN_LEFT + 100 });
  spacer(5);
  drawText(`${creatorLabel.en} Responsibility & Indemnity Undertaking Form`, {
    fontSize: 12, font: helveticaBold, x: MARGIN_LEFT + 60,
  });
  spacer(5);
  drawLine();
  spacer(5);

  drawField("Date", data.date);
  spacer(5);

  // ── Creator (Successor) Details ──
  drawText(`${creatorLabel.en} Details`, { fontSize: 12, font: helveticaBold });
  spacer(3);
  drawField(`${creatorLabel.en} Name`, data.creatorName);
  drawField(`${creatorLabel.en} ID`, data.creatorId);
  drawField("Company/Firm Name", data.creatorCompany);
  drawField("Mobile No.", data.creatorMobile);
  drawField("Email ID", data.creatorEmail);
  drawField("Address", data.creatorAddress);
  spacer(3);
  drawLine();
  drawField("PAN No.", data.creatorPan);
  drawField("Aadhaar No.", data.creatorAadhaar);
  drawLine();
  spacer(5);

  // ── Onboardee Details ──
  drawText(`${onboardeeLabel.en} Details`, { fontSize: 12, font: helveticaBold });
  spacer(3);
  drawField(`${onboardeeLabel.en} Name`, data.onboardeeName);
  drawField(`${onboardeeLabel.en} ID`, data.onboardeeId);
  drawField("Business Name", data.onboardeeBusiness);
  drawField("Mobile No.", data.onboardeeMobile);
  drawField("Address", data.onboardeeAddress);
  drawLine();
  spacer(10);

  // ── Declaration & Undertaking (Hindi) ──
  drawText("Declaration & Undertaking", { fontSize: 12, font: helveticaBold });
  spacer(5);

  const declarationIntro = `\u092E\u0948\u0902, ${data.creatorName || "_______________"}, ${creatorLabel.en}, \u092F\u0939 \u0918\u094B\u0937\u093F\u0924 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0901 \u0915\u093F \u092E\u0948\u0902\u0928\u0947 \u090A\u092A\u0930 \u0926\u093F\u090F \u0917\u090F ${onboardeeLabel.en} \u0915\u0940 KYC, \u0935\u094D\u092F\u0935\u0938\u093E\u092F \u090F\u0935\u0902 \u092A\u0939\u091A\u093E\u0928 \u0915\u093E \u0938\u0924\u094D\u092F\u093E\u092A\u0928 \u0905\u092A\u0928\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0915\u0947 \u0905\u0928\u0941\u0938\u093E\u0930 \u0915\u093F\u092F\u093E \u0939\u0948 \u0924\u0925\u093E \u092E\u0948\u0902 \u0907\u0938 ${onboardeeLabel.en} \u0915\u0940 \u092A\u0942\u0930\u094D\u0923 \u091C\u093F\u092E\u094D\u092E\u0947\u0926\u093E\u0930\u0940 \u0938\u094D\u0935\u0940\u0915\u093E\u0930 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0901\u0964`;
  drawWrapped(declarationIntro);
  spacer(5);

  drawWrapped("\u092E\u0948\u0902 \u0928\u093F\u092E\u094D\u0928\u0932\u093F\u0916\u093F\u0924 \u0936\u0930\u094D\u0924\u094B\u0902 \u0938\u0947 \u092A\u0942\u0930\u094D\u0923\u0924\u0903 \u0938\u0939\u092E\u0924 \u0939\u0942\u0901\u2014");
  spacer(3);

  const clauses = [
    `1. \u092F\u0926\u093F \u0909\u0915\u094D\u0924 ${onboardeeLabel.en} \u0926\u094D\u0935\u093E\u0930\u093E \u0915\u093F\u0938\u0940 \u092D\u0940 \u092A\u094D\u0930\u0915\u093E\u0930 \u0915\u093E Chargeback, Fraud Transaction, Dispute, Unauthorized Transaction, Money Laundering, Gaming Transaction, Betting Transaction, Crypto Related Transaction, Unaccounted/Unsourced Fund, Foreign Remittance Misuse, Third Party Fund Misuse \u0905\u0925\u0935\u093E \u0915\u093F\u0938\u0940 \u092D\u0940 \u092A\u094D\u0930\u0915\u093E\u0930 \u0915\u0940 \u0905\u0935\u0948\u0927 \u092F\u093E \u0938\u0902\u0926\u093F\u0917\u094D\u0927 \u0935\u093F\u0924\u094D\u0924\u0940\u092F \u0917\u0924\u093F\u0935\u093F\u0927\u093F \u0915\u0940 \u091C\u093E\u0924\u0940 \u0939\u0948, \u0924\u094B \u0909\u0938\u0915\u0940 \u091C\u093F\u092E\u094D\u092E\u0947\u0926\u093E\u0930\u0940 ${onboardeeLabel.en} \u0915\u0947 \u0938\u093E\u0925-\u0938\u093E\u0925 \u092E\u0947\u0930\u0940 \u092D\u0940 \u0939\u094B\u0917\u0940\u0964`,
    `2. \u092F\u0926\u093F ${onboardeeLabel.en} \u0915\u093F\u0938\u0940 \u092D\u0940 \u0915\u093E\u0930\u0923 \u0938\u0947 \u0915\u0902\u092A\u0928\u0940 \u0915\u093E \u092C\u0915\u093E\u092F\u093E, \u091A\u093E\u0930\u094D\u091C\u092C\u0948\u0915, \u092A\u0947\u0928\u0932\u094D\u091F\u0940, \u0928\u0941\u0915\u0938\u093E\u0928 \u092F\u093E \u0926\u0947\u092F \u0930\u093E\u0936\u093F \u091C\u092E\u093E \u0915\u0930\u0928\u0947 \u092E\u0947\u0902 \u0905\u0938\u092E\u0930\u094D\u0925 \u0930\u0939\u0924\u093E \u0939\u0948, \u0924\u094B \u092E\u0948\u0902 (${creatorLabel.en}) \u0909\u0915\u094D\u0924 \u0930\u093E\u0936\u093F 15 (\u092A\u0902\u0926\u094D\u0930\u0939) \u0926\u093F\u0928\u094B\u0902 \u0915\u0947 \u092D\u0940\u0924\u0930 JMP NextGen Tech Private Limited \u0915\u094B \u092C\u093F\u0928\u093E \u0915\u093F\u0938\u0940 \u0906\u092A\u0924\u094D\u0924\u093F \u0915\u0947 \u091C\u092E\u093E \u0915\u0930\u093E\u090A\u0901\u0917\u093E/\u0915\u0930\u093E\u090A\u0901\u0917\u0940\u0964`,
    `3. \u0915\u0902\u092A\u0928\u0940 \u0926\u094D\u0935\u093E\u0930\u093E \u092E\u093E\u0902\u0917\u0947 \u091C\u093E\u0928\u0947 \u092A\u0930 \u092E\u0948\u0902 \u0906\u0935\u0936\u094D\u092F\u0915 \u0926\u0938\u094D\u0924\u093E\u0935\u0947\u091C, \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u090F\u0935\u0902 \u091C\u093E\u0902\u091A \u092E\u0947\u0902 \u092A\u0942\u0930\u094D\u0923 \u0938\u0939\u092F\u094B\u0917 \u0926\u0942\u0901\u0917\u093E/\u0926\u0942\u0901\u0917\u0940\u0964`,
    `4. \u092F\u0926\u093F \u092E\u0948\u0902 \u0928\u093F\u0930\u094D\u0927\u093E\u0930\u093F\u0924 \u0938\u092E\u092F \u092E\u0947\u0902 \u0930\u093E\u0936\u093F \u091C\u092E\u093E \u0928\u0939\u0940\u0902 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0901, \u0924\u094B \u0915\u0902\u092A\u0928\u0940 \u0915\u094B \u092E\u0947\u0930\u093E ${creatorLabel.en} ID, Wallet Balance, Security Deposit, Commission \u0905\u0925\u0935\u093E \u0905\u0928\u094D\u092F \u0926\u0947\u092F \u0930\u093E\u0936\u093F \u0938\u092E\u093E\u092F\u094B\u091C\u093F\u0924 (Adjust) \u0915\u0930\u0928\u0947 \u0924\u0925\u093E \u0906\u0935\u0936\u094D\u092F\u0915 \u0915\u093E\u0928\u0942\u0928\u0940 \u0915\u093E\u0930\u094D\u092F\u0935\u093E\u0939\u0940 \u0915\u0930\u0928\u0947 \u0915\u093E \u092A\u0942\u0930\u094D\u0923 \u0905\u0927\u093F\u0915\u093E\u0930 \u0939\u094B\u0917\u093E\u0964`,
    `5. \u092E\u0948\u0902 \u092F\u0939 \u092D\u0940 \u0938\u094D\u0935\u0940\u0915\u093E\u0930 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0901 \u0915\u093F \u0915\u0902\u092A\u0928\u0940 \u0915\u0947\u0935\u0932 \u0938\u0947\u0935\u093E \u092A\u094D\u0930\u0926\u093E\u0924\u093E (Service Provider) \u0939\u0948 \u0924\u0925\u093E ${onboardeeLabel.en} \u0915\u0940 \u0917\u0924\u093F\u0935\u093F\u0927\u093F\u092F\u094B\u0902 \u0915\u0947 \u0932\u093F\u090F \u0905\u0902\u0924\u093F\u092E \u091C\u093F\u092E\u094D\u092E\u0947\u0926\u093E\u0930\u0940 ${creatorLabel.en} \u090F\u0935\u0902 ${onboardeeLabel.en} \u0915\u0940 \u0939\u094B\u0917\u0940\u0964`,
    `6. \u092F\u0939 Undertaking \u092E\u0947\u0930\u0940 \u0938\u094D\u0935\u0947\u091A\u094D\u091B\u093E \u0938\u0947, \u092C\u093F\u0928\u093E \u0915\u093F\u0938\u0940 \u0926\u092C\u093E\u0935 \u0915\u0947 \u0926\u0940 \u091C\u093E \u0930\u0939\u0940 \u0939\u0948 \u0914\u0930 \u092F\u0939 \u0915\u0902\u092A\u0928\u0940 \u0915\u0947 \u0938\u093E\u0925 \u092E\u0947\u0930\u0947 \u0935\u094D\u092F\u093E\u0935\u0938\u093E\u092F\u093F\u0915 \u0938\u0902\u092C\u0902\u0927\u094B\u0902 \u0915\u093E \u0905\u092D\u093F\u0928\u094D\u0928 \u0939\u093F\u0938\u094D\u0938\u093E \u0939\u094B\u0917\u0940\u0964`,
  ];

  for (const clause of clauses) {
    drawWrapped(clause, { indent: 10 });
    spacer(5);
  }

  drawLine();
  spacer(5);

  // ── Indemnity ──
  drawText("Indemnity", { fontSize: 12, font: helveticaBold });
  spacer(3);

  const indemnityText = `\u092E\u0948\u0902, ${creatorLabel.en}, \u092F\u0939 \u0935\u091A\u0928 \u0926\u0947\u0924\u093E/\u0926\u0947\u0924\u0940 \u0939\u0942\u0901 \u0915\u093F ${onboardeeLabel.en} \u0915\u0940 \u0915\u093F\u0938\u0940 \u092D\u0940 \u0917\u0924\u093F\u0935\u093F\u0927\u093F \u0938\u0947 JMP NextGen Tech Private Limited \u0915\u094B \u0939\u094B\u0928\u0947 \u0935\u093E\u0932\u0947 \u0935\u093F\u0924\u094D\u0924\u0940\u092F \u0928\u0941\u0915\u0938\u093E\u0928, \u091A\u093E\u0930\u094D\u091C\u092C\u0948\u0915, \u092A\u0947\u0928\u0932\u094D\u091F\u0940, \u0915\u093E\u0928\u0942\u0928\u0940 \u0916\u0930\u094D\u091A \u0905\u0925\u0935\u093E \u0905\u0928\u094D\u092F \u0915\u093F\u0938\u0940 \u092D\u0940 \u092A\u094D\u0930\u0915\u093E\u0930 \u0915\u0940 \u0939\u093E\u0928\u093F \u0915\u0940 \u092D\u0930\u092A\u093E\u0908 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0909\u0924\u094D\u0924\u0930\u0926\u093E\u092F\u0940 \u0930\u0939\u0942\u0901\u0917\u093E/\u0930\u0939\u0942\u0901\u0917\u0940\u0964`;
  drawWrapped(indemnityText);

  drawLine();
  spacer(15);

  // ── Signatures ──
  drawText(`${creatorLabel.en} Signature`, { fontSize: 12, font: helveticaBold });
  spacer(3);
  drawField(`${creatorLabel.en} Name`, data.creatorName);
  drawText("Signature: ___________________________", { fontSize: 10, font: helvetica });
  spacer();
  drawField("Date", data.date);
  drawLine();
  spacer(10);

  drawText(`${onboardeeLabel.en} Acceptance`, { fontSize: 12, font: helveticaBold });
  spacer(3);

  const acceptanceText = `\u092E\u0948\u0902, \u0909\u092A\u0930\u094B\u0915\u094D\u0924 ${onboardeeLabel.en}, \u0907\u0938 Undertaking \u092E\u0947\u0902 \u0935\u0930\u094D\u0923\u093F\u0924 \u0938\u092D\u0940 \u0928\u093F\u092F\u092E \u090F\u0935\u0902 \u0936\u0930\u094D\u0924\u094B\u0902 \u0915\u094B \u092A\u0922\u093C\u0915\u0930 \u0938\u094D\u0935\u0940\u0915\u093E\u0930 \u0915\u0930\u0924\u093E/\u0915\u0930\u0924\u0940 \u0939\u0942\u0901\u0964`;
  drawWrapped(acceptanceText);
  spacer(3);
  drawField(`${onboardeeLabel.en} Name`, data.onboardeeName);
  drawText("Signature: ___________________________", { fontSize: 10, font: helvetica });
  spacer();
  drawField("Date", data.date);
  drawLine();
  spacer(10);

  // ── Company Use Only ──
  drawText("Company Use Only", { fontSize: 12, font: helveticaBold });
  spacer(3);
  drawField("Verified By", "");
  drawField("Employee ID", "");
  drawField("Approval Date", "__ / __ / __");
  spacer(3);
  drawText("Authorized Signatory", { fontSize: 10, font: helveticaBold });
  drawText("JMP NextGen Tech Private Limited", { fontSize: 10, font: helvetica });

  return pdfDoc.save();
}
