/**
 * Verifies output/sample-booklet.pdf by re-parsing it — it does not trust
 * the generator's own bookkeeping.
 *
 * Checks (each printed PASS/FAIL, non-zero exit on any failure):
 *  1. Every PDF page is exactly US Letter landscape (792 x 612 pt).
 *  2. Page count is even; sheets = PDF pages / 2; book pages = sheets * 4.
 *  3. For every sheet side, the left/right halves hold the book pages the
 *     standard saddle-stitch imposition predicts, in the right positions.
 *     Proof is positional text: `pdftotext -bbox` gives each word's x/y,
 *     so a word's half is decided by its x, and a content page is
 *     identified by its footer page number (drawn near the bottom,
 *     yMin > 560). Cover (1) and back cover (N) have text but no footer;
 *     blank padding pages have no text at all.
 *  4. The cover title is on the right half of sheet 1's front, and the
 *     back-cover closing line is on the left half of sheet 1's front.
 *
 * Run: `npm run verify` (requires the `pdftotext` command-line tool).
 */
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_PAGE_WIDTH, SHEET_HEIGHT, SHEET_WIDTH, computeImposition } from "../booklet.js";

const SAMPLE = path.join(fileURLToPath(new URL("../../output", import.meta.url)), "sample-booklet.pdf");

interface BBoxWord {
  xMin: number;
  yMin: number;
  text: string;
}

interface HalfCheck {
  expectedPage: number;
  words: BBoxWord[];
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) {
    failures.push(name);
  }
}

function parseBBoxPages(xml: string): BBoxWord[][] {
  const pages: BBoxWord[][] = [];
  const pageRe = /<page[^>]*>([\s\S]*?)<\/page>/g;
  const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageRe.exec(xml)) !== null) {
    const body = pageMatch[1] !== undefined ? pageMatch[1] : "";
    const words: BBoxWord[] = [];
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = wordRe.exec(body)) !== null) {
      words.push({
        xMin: Number(wordMatch[1]),
        yMin: Number(wordMatch[2]),
        text: wordMatch[3] !== undefined ? wordMatch[3] : "",
      });
    }
    pages.push(words);
  }
  return pages;
}

async function main(): Promise<void> {
  const bytes = await readFile(SAMPLE);
  const doc = await PDFDocument.load(bytes);
  const pdfPages = doc.getPages();
  const totalPdfPages = pdfPages.length;

  check("pdf page count is even", totalPdfPages % 2 === 0, `${totalPdfPages} imposed PDF pages`);
  const sheets = totalPdfPages / 2;
  const bookPages = sheets * 4;
  check("sheet count", sheets >= 1, `${sheets} sheets -> ${bookPages} book pages`);

  let sizesOk = true;
  pdfPages.forEach((page, i) => {
    if (page.getWidth() !== SHEET_WIDTH || page.getHeight() !== SHEET_HEIGHT) {
      sizesOk = false;
      console.log(`  page ${i + 1} is ${page.getWidth()} x ${page.getHeight()} pt`);
    }
  });
  check("every sheet is Letter landscape 792 x 612 pt", sizesOk, `${totalPdfPages} pages checked`);

  const xml = execFileSync("pdftotext", ["-bbox", SAMPLE, "-"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const bboxPages = parseBBoxPages(xml);
  check("pdftotext found the same page count", bboxPages.length === totalPdfPages, `${bboxPages.length} text pages`);

  const imposition = computeImposition(bookPages);
  const footerNumbers = new Set<number>();
  let blankHalves = 0;

  pdfPages.forEach((_, pdfIndex) => {
    const sheet = imposition[Math.floor(pdfIndex / 2)];
    if (sheet === undefined) {
      return;
    }
    const side = pdfIndex % 2 === 0 ? sheet.front : sheet.back;
    const sideName = pdfIndex % 2 === 0 ? "front" : "back";
    const words = bboxPages[pdfIndex] !== undefined ? bboxPages[pdfIndex] : [];
    const halves: HalfCheck[] = [
      { expectedPage: side.leftPage, words: words.filter((w) => w.xMin < BOOK_PAGE_WIDTH) },
      { expectedPage: side.rightPage, words: words.filter((w) => w.xMin >= BOOK_PAGE_WIDTH) },
    ];
    halves.forEach((half, halfIndex) => {
      const position = halfIndex === 0 ? "left" : "right";
      const label = `sheet ${sheet.sheet} ${sideName} ${position} = book page ${half.expectedPage}`;
      if (half.expectedPage === 1 || half.expectedPage === bookPages) {
        const footer = half.words.filter((w) => w.yMin > 560);
        check(`${label} (cover, no footer)`, footer.length === 0 && half.words.length > 0, `${half.words.length} words, ${footer.length} footer words`);
      } else if (half.words.length === 0) {
        blankHalves += 1;
        check(`${label} (blank padding page)`, true, "no text on this half");
      } else {
        const footer = half.words.filter((w) => w.yMin > 560);
        const found = footer.length === 1 ? Number(footer[0]?.text) : Number.NaN;
        if (!Number.isNaN(found)) {
          footerNumbers.add(found);
        }
        check(`${label} (footer page number)`, footer.length === 1 && found === half.expectedPage, `footer reads ${footer.map((w) => w.text).join(",") || "(none)"}`);
      }
    });
  });

  // Footer numbers must be exactly 2..(1 + content pages), contiguous from 2.
  const sortedFooters = [...footerNumbers].sort((a, b) => a - b);
  const contiguous =
    sortedFooters.length > 0 &&
    sortedFooters[0] === 2 &&
    sortedFooters.every((n, i) => n === 2 + i);
  check(
    "content page footers are contiguous from 2",
    contiguous,
    `footers found: ${sortedFooters.join(", ") || "(none)"}; blank halves: ${blankHalves}`,
  );
  check(
    "book page accounting adds up",
    1 + sortedFooters.length + blankHalves + 1 === bookPages,
    `1 cover + ${sortedFooters.length} content + ${blankHalves} blank + 1 back cover = ${bookPages}`,
  );

  // Cover title on sheet 1 front, right half; back-cover line on left half.
  const firstPageWords = bboxPages[0] !== undefined ? bboxPages[0] : [];
  const rightText = firstPageWords.filter((w) => w.xMin >= BOOK_PAGE_WIDTH).map((w) => w.text);
  const leftText = firstPageWords.filter((w) => w.xMin < BOOK_PAGE_WIDTH).map((w) => w.text);
  check(
    "cover title on sheet 1 front, right half",
    rightText.includes("Little") && rightText.includes("Owls"),
    rightText.slice(0, 8).join(" "),
  );
  check(
    "back-cover closing line on sheet 1 front, left half",
    leftText.includes("Thank") && leftText.includes("reading."),
    leftText.slice(0, 8).join(" "),
  );

  console.log(
    failures.length === 0
      ? `\nVERIFIED: ${bookPages} book pages, ${sheets} sheets, ${totalPdfPages} imposed PDF pages.`
      : `\nFAILED: ${failures.length} check(s) failed: ${failures.join("; ")}`,
  );
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
