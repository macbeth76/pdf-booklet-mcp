/**
 * pdf-booklet-mcp — core booklet logic.
 *
 * Format (see README.md for the full spec and the one open question for Drew):
 * - Book page: 5.5 x 8.5 in portrait (396 x 612 pt).
 * - Physical sheet: US Letter landscape, 11 x 8.5 in (792 x 612 pt),
 *   printed double-sided and folded in half vertically. Two book pages
 *   per sheet side, so one sheet holds 4 book pages.
 * - Any number of book pages is padded with blank pages (inserted just
 *   before the back cover, so the back cover stays the last page) to a
 *   multiple of 4.
 * - Standard saddle-stitch imposition, front cover = book page 1,
 *   back cover = last book page.
 * - Back sides are pre-rotated 180° in the PDF (see computeImposition):
 *   a double-sided printer flips the sheet to print the back, which
 *   rotates the whole back side 180° (upside down AND left/right
 *   swapped). Pre-rotating the back side in the file cancels that
 *   flip, so with long-edge duplex the folded booklet reads
 *   1, 2, 3, … in order, all upright. On screen the back PDF pages
 *   therefore look upside down — that is intentional, not a bug.
 *   Print double-sided, flip on LONG edge (the printer default).
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Points per inch. */
export const PT_PER_INCH = 72;
/** Book page size: 5.5 x 8.5 in portrait, in points. */
export const BOOK_PAGE_WIDTH = 5.5 * PT_PER_INCH; // 396
export const BOOK_PAGE_HEIGHT = 8.5 * PT_PER_INCH; // 612
/** Physical sheet size: US Letter landscape, 11 x 8.5 in, in points. */
export const SHEET_WIDTH = 11 * PT_PER_INCH; // 792
export const SHEET_HEIGHT = 8.5 * PT_PER_INCH; // 612

const MARGIN_SIDE = 48; // 2/3 in
const MARGIN_TOP = 54; // 3/4 in
const MARGIN_BOTTOM = 54;
const TEXT_WIDTH = BOOK_PAGE_WIDTH - 2 * MARGIN_SIDE;
const BODY_SIZE = 11;
const BODY_LEADING = 16;

export interface StructuredPage {
  /** Heading shown at the top of this page/section. */
  title?: string;
  /** Body text; blank lines separate paragraphs. */
  body?: string;
}

export interface CreateBookletInput {
  title: string;
  author?: string;
  subtitle?: string;
  /** Markdown content. Headings (# / ## / ###), paragraphs, and a line
   *  containing only `---` (or `<!-- pagebreak -->`) forces a page break. */
  markdown?: string;
  /** Structured pages/sections. Each entry starts on a new book page. */
  pages?: StructuredPage[];
  /** Text for the back cover. Defaults to a short closing line. */
  backCoverText?: string;
  /** Output file name, e.g. `my-booklet.pdf`. Defaults to a slug of the title. */
  filename?: string;
}

export interface SheetImposition {
  /** 1-based sheet number. */
  sheet: number;
  /** First-printed side of the sheet (the outside of the booklet). */
  front: { leftPage: number; rightPage: number };
  /**
   * Second side of the sheet (the inside of the booklet), as it appears
   * in the PDF file: left/right are the physical halves, and each half
   * is drawn rotated 180° (see computeImposition). The printer's
   * long-edge flip turns them upright and into reading order.
   */
  back: { leftPage: number; rightPage: number };
}

export interface CreateBookletResult {
  pdfPath: string;
  title: string;
  /** Total book pages, including cover, back cover and any blank padding. */
  bookPages: number;
  /** Blank pages added to reach a multiple of 4. */
  paddedBlankPages: number;
  /** Physical sheets of Letter paper. */
  sheets: number;
  /** Pages in the imposed PDF file: 2 per sheet (front + back). */
  totalPdfPages: number;
  imposition: SheetImposition[];
}

/**
 * Saddle-stitch imposition for `totalPages` book pages
 * (must be a multiple of 4), as the pages physically appear in the PDF.
 *
 * Sheet s (0-based):
 *   front (outside, upright): left = N - 2s,     right = 2s + 1
 *   back  (inside, pre-rotated 180° in the file):
 *                              left = N - 2s - 1, right = 2s + 2
 *
 * Why the back is swapped, not just rotated in place: a duplex flip
 * rotates the *whole* back side 180°, so a page drawn upright on the
 * left half prints on the right half upside down (and vice versa).
 * That is exactly what a test print showed: the folded booklet read
 * 1, 7, 3, 5, 4, 6, 2, 8 — every back-side page upside down and in the
 * other half's place, while every front-side page was correct.
 * Swapping the back halves AND rotating each 180° in place cancels
 * the printer's whole-side flip, so with long-edge duplex the folded
 * booklet reads 1, 2, 3, … in order, all upright.
 *
 * Check for N = 8, sheet 1: front [8 | 1], back [7 | 2] (rotated) —
 * the cover (1) sits on the outside right, the back cover (8) on the
 * outside left, and page 2 backs onto the cover once printed.
 */
export function computeImposition(totalPages: number): SheetImposition[] {
  if (totalPages <= 0 || totalPages % 4 !== 0) {
    throw new Error(`computeImposition: totalPages must be a positive multiple of 4, got ${totalPages}`);
  }
  const sheets: SheetImposition[] = [];
  for (let s = 0; s < totalPages / 4; s += 1) {
    sheets.push({
      sheet: s + 1,
      front: { leftPage: totalPages - 2 * s, rightPage: 2 * s + 1 },
      back: { leftPage: totalPages - 2 * s - 1, rightPage: 2 * s + 2 },
    });
  }
  return sheets;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "pageBreak" };

function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flushParagraph = (): void => {
    const text = paragraph.join(" ").trim();
    if (text.length > 0) {
      blocks.push({ kind: "paragraph", text });
    }
    paragraph = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line === "---" || line === "***" || line === "<!-- pagebreak -->") {
      flushParagraph();
      if (line === "---" || line === "***" || line === "<!-- pagebreak -->") {
        blocks.push({ kind: "pageBreak" });
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      const level = heading[1] !== undefined ? heading[1].length : 1;
      const text = heading[2] !== undefined ? heading[2].trim() : "";
      blocks.push({ kind: "heading", level, text });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

function parseStructuredPages(pages: StructuredPage[]): Block[] {
  const blocks: Block[] = [];
  pages.forEach((entry, index) => {
    if (index > 0) {
      blocks.push({ kind: "pageBreak" });
    }
    if (entry.title !== undefined && entry.title.trim().length > 0) {
      blocks.push({ kind: "heading", level: 1, text: entry.title.trim() });
    }
    if (entry.body !== undefined && entry.body.trim().length > 0) {
      for (const para of entry.body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
        const text = para.replace(/\n/g, " ").trim();
        if (text.length > 0) {
          blocks.push({ kind: "paragraph", text });
        }
      }
    }
  });
  return blocks;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "booklet";
}

function safeFilename(filename: string | undefined, title: string): string {
  if (filename === undefined || filename.trim().length === 0) {
    return `${slugify(title)}-booklet.pdf`;
  }
  const base = path.basename(filename.trim());
  if (base.length === 0 || base === "." || base === "..") {
    throw new Error(`Invalid filename: ${JSON.stringify(filename)}`);
  }
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export function outputDir(): string {
  // booklet.ts lives in src/ (dev) or dist/ (built); output/ is one level up in both cases.
  return fileURLToPath(new URL("../output", import.meta.url));
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/** Renders the flowing content blocks onto 5.5 x 8.5 in book pages. */
class ContentRenderer {
  private readonly doc: PDFDocument;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;
  private page: PDFPage | null = null;
  private y = 0;
  private hasContent = false;
  private contentPageCount = 0;

  public constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
  }

  public get contentPages(): number {
    return this.contentPageCount;
  }

  private newContentPage(): PDFPage {
    this.contentPageCount += 1;
    // Book page number: cover is 1, so content page k is book page k + 1.
    const bookPageNumber = this.contentPageCount + 1;
    const page = this.doc.addPage([BOOK_PAGE_WIDTH, BOOK_PAGE_HEIGHT]);
    this.page = page;
    this.y = BOOK_PAGE_HEIGHT - MARGIN_TOP;
    this.hasContent = false;
    const label = String(bookPageNumber);
    const size = 10;
    const width = this.regular.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (BOOK_PAGE_WIDTH - width) / 2,
      y: 28,
      size,
      font: this.regular,
      color: rgb(0.35, 0.35, 0.35),
    });
    return page;
  }

  /** The page currently being drawn on, creating one if needed. */
  private currentPage(): PDFPage {
    return this.page ?? this.newContentPage();
  }

  private ensureSpace(needed: number): void {
    if (this.page === null || this.y - needed < MARGIN_BOTTOM) {
      this.newContentPage();
    }
  }

  public pageBreak(): void {
    if (this.hasContent) {
      this.newContentPage();
    }
  }

  public heading(level: number, text: string): void {
    const size = level === 1 ? 18 : level === 2 ? 15 : 13;
    const leading = size * 1.3;
    const lines = wrapText(text, this.bold, size, TEXT_WIDTH);
    this.ensureSpace(lines.length * leading + 14);
    this.y -= level === 1 ? 6 : 14;
    for (const line of lines) {
      this.currentPage().drawText(line, { x: MARGIN_SIDE, y: this.y, size, font: this.bold });
      this.y -= leading;
      this.hasContent = true;
    }
    this.y -= 8;
  }

  public paragraph(text: string): void {
    const lines = wrapText(text, this.regular, BODY_SIZE, TEXT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(BODY_LEADING);
      this.currentPage().drawText(line, { x: MARGIN_SIDE, y: this.y, size: BODY_SIZE, font: this.regular });
      this.y -= BODY_LEADING;
      this.hasContent = true;
    }
    this.y -= 8;
  }
}

function drawCenteredLines(
  page: PDFPage,
  lines: { text: string; font: PDFFont; size: number; gapAfter: number }[],
  startY: number,
): void {
  let y = startY;
  for (const line of lines) {
    const width = line.font.widthOfTextAtSize(line.text, line.size);
    page.drawText(line.text, {
      x: (BOOK_PAGE_WIDTH - width) / 2,
      y,
      size: line.size,
      font: line.font,
    });
    y -= line.size * 1.3 + line.gapAfter;
  }
}

export async function createBooklet(input: CreateBookletInput): Promise<CreateBookletResult> {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error("createBooklet: title is required");
  }
  const hasMarkdown = input.markdown !== undefined && input.markdown.trim().length > 0;
  const hasPages = input.pages !== undefined && input.pages.length > 0;
  if (!hasMarkdown && !hasPages) {
    throw new Error("createBooklet: provide markdown and/or pages content");
  }

  const blocks: Block[] = [];
  if (hasMarkdown && input.markdown !== undefined) {
    blocks.push(...parseMarkdown(input.markdown));
  }
  if (hasPages && input.pages !== undefined) {
    if (blocks.length > 0) {
      blocks.push({ kind: "pageBreak" });
    }
    blocks.push(...parseStructuredPages(input.pages));
  }

  const bookDoc = await PDFDocument.create();
  bookDoc.setTitle(title);
  if (input.author !== undefined) {
    bookDoc.setAuthor(input.author);
  }
  const regular = await bookDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await bookDoc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await bookDoc.embedFont(StandardFonts.TimesRomanItalic);

  // --- Book page 1: front cover ---
  const cover = bookDoc.addPage([BOOK_PAGE_WIDTH, BOOK_PAGE_HEIGHT]);
  const titleLines = wrapText(title, bold, 28, TEXT_WIDTH);
  const coverLines: { text: string; font: PDFFont; size: number; gapAfter: number }[] = titleLines.map(
    (text) => ({ text, font: bold, size: 28, gapAfter: 0 }),
  );
  drawCenteredLines(cover, coverLines, BOOK_PAGE_HEIGHT - 220);
  let ruleY = BOOK_PAGE_HEIGHT - 220 - titleLines.length * 28 * 1.3 - 24;
  cover.drawLine({
    start: { x: BOOK_PAGE_WIDTH / 2 - 60, y: ruleY },
    end: { x: BOOK_PAGE_WIDTH / 2 + 60, y: ruleY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  ruleY -= 36;
  if (input.subtitle !== undefined && input.subtitle.trim().length > 0) {
    const subLines = wrapText(input.subtitle.trim(), italic, 14, TEXT_WIDTH);
    drawCenteredLines(
      cover,
      subLines.map((text) => ({ text, font: italic, size: 14, gapAfter: 0 })),
      ruleY,
    );
    ruleY -= subLines.length * 14 * 1.3 + 24;
  }
  if (input.author !== undefined && input.author.trim().length > 0) {
    drawCenteredLines(cover, [{ text: input.author.trim(), font: regular, size: 12, gapAfter: 0 }], ruleY);
  }

  // --- Content pages (book pages 2..) ---
  const renderer = new ContentRenderer(bookDoc, regular, bold);
  for (const block of blocks) {
    if (block.kind === "heading") {
      renderer.heading(block.level, block.text);
    } else if (block.kind === "paragraph") {
      renderer.paragraph(block.text);
    } else {
      renderer.pageBreak();
    }
  }
  const contentPages = renderer.contentPages;

  // --- Blank padding pages, inserted before the back cover ---
  const totalBeforePad = 1 + contentPages + 1;
  const paddedBlankPages = (4 - (totalBeforePad % 4)) % 4;
  for (let i = 0; i < paddedBlankPages; i += 1) {
    const blank = bookDoc.addPage([BOOK_PAGE_WIDTH, BOOK_PAGE_HEIGHT]);
    // A completely empty page has no Contents stream and pdf-lib refuses
    // to embed it; a 1pt white rectangle is invisible when printed and
    // gives the page a Contents stream. It adds no text.
    blank.drawRectangle({ x: 0, y: 0, width: 1, height: 1, color: rgb(1, 1, 1) });
  }

  // --- Last book page: back cover ---
  const backCover = bookDoc.addPage([BOOK_PAGE_WIDTH, BOOK_PAGE_HEIGHT]);
  const backText =
    input.backCoverText !== undefined && input.backCoverText.trim().length > 0
      ? input.backCoverText.trim()
      : "Thank you for reading.\n\nPrinted as a saddle-stitch booklet — fold in half and staple at the spine.";
  const backLines: { text: string; font: PDFFont; size: number; gapAfter: number }[] = [
    { text: title, font: bold, size: 14, gapAfter: 18 },
  ];
  for (const para of backText.split(/\n\s*\n/)) {
    const text = para.replace(/\n/g, " ").trim();
    if (text.length === 0) {
      continue;
    }
    for (const line of wrapText(text, regular, BODY_SIZE, TEXT_WIDTH)) {
      backLines.push({ text: line, font: regular, size: BODY_SIZE, gapAfter: 0 });
    }
    backLines.push({ text: "", font: regular, size: BODY_SIZE, gapAfter: 10 });
  }
  drawCenteredLines(backCover, backLines, BOOK_PAGE_HEIGHT - 260);

  const bookPages = 1 + contentPages + paddedBlankPages + 1;
  if (bookPages % 4 !== 0) {
    throw new Error(`Internal error: bookPages ${bookPages} is not a multiple of 4`);
  }
  const imposition = computeImposition(bookPages);
  const sheets = imposition.length;

  // --- Impose onto Letter landscape sheets ---
  const bookBytes = await bookDoc.save();
  const imposedDoc = await PDFDocument.create();
  imposedDoc.setTitle(title);
  if (input.author !== undefined) {
    imposedDoc.setAuthor(input.author);
  }
  // NB: embedPdf without an explicit index list embeds only the first
  // page in pdf-lib 1.17, so pass every book-page index explicitly.
  const indices = Array.from({ length: bookPages }, (_, i) => i);
  const embedded = await imposedDoc.embedPdf(bookBytes, indices);
  for (const sheet of imposition) {
    for (const { side, isBack } of [
      { side: sheet.front, isBack: false },
      { side: sheet.back, isBack: true },
    ] as const) {
      const imposedPage = imposedDoc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
      const left = embedded[side.leftPage - 1];
      const right = embedded[side.rightPage - 1];
      if (left === undefined || right === undefined) {
        throw new Error(`Internal error: missing embedded book page for sheet ${sheet.sheet}`);
      }
      if (!isBack) {
        imposedPage.drawPage(left, { x: 0, y: 0, width: BOOK_PAGE_WIDTH, height: BOOK_PAGE_HEIGHT });
        imposedPage.drawPage(right, { x: BOOK_PAGE_WIDTH, y: 0, width: BOOK_PAGE_WIDTH, height: BOOK_PAGE_HEIGHT });
      } else {
        // Pre-rotated 180° in place: drawing with rotate 180° about the
        // half's bottom-left corner would land off-page, so anchor at
        // the half's top-right corner (x = half right edge, y = top).
        // Verified empirically: this puts the rotated page exactly
        // inside its own half, top and bottom swapped, left and right
        // swapped within the half.
        imposedPage.drawPage(left, {
          x: BOOK_PAGE_WIDTH,
          y: SHEET_HEIGHT,
          width: BOOK_PAGE_WIDTH,
          height: BOOK_PAGE_HEIGHT,
          rotate: degrees(180),
        });
        imposedPage.drawPage(right, {
          x: SHEET_WIDTH,
          y: SHEET_HEIGHT,
          width: BOOK_PAGE_WIDTH,
          height: BOOK_PAGE_HEIGHT,
          rotate: degrees(180),
        });
      }
    }
  }

  const pdfBytes = await imposedDoc.save();
  const dir = outputDir();
  await mkdir(dir, { recursive: true });
  const filename = safeFilename(input.filename, title);
  const pdfPath = path.join(dir, filename);
  await writeFile(pdfPath, pdfBytes);

  return {
    pdfPath,
    title,
    bookPages,
    paddedBlankPages,
    sheets,
    totalPdfPages: sheets * 2,
    imposition,
  };
}
