# pdf-booklet-mcp

An MCP server that turns **any content** into a **printable saddle-stitch
booklet PDF**. An LLM sends the content; the MCP builds the PDF and returns
it to the user to print out.

This is a **separate project** from Live Panels. It has no Cloudflare /
Worker component and nothing to do with the Alexa skill.

## The format

- **Book page:** 5.5 × 8.5 in, portrait. Comfortable book margins, serif
  (Times) body text at 11 pt, page numbers centred at the foot of every
  content page (no number on the cover or back cover).
- **Physical sheet:** US Letter, **landscape** — 11 × 8.5 in. Printed
  **double-sided** and folded in half vertically. Each folded half is one
  book page, so one sheet holds 4 book pages.
- **Any length:** the MCP pads with blank pages (inserted just before the
  back cover, so the back cover stays the last page) until the book page
  count is a multiple of 4.
- **Front cover = book page 1. Back cover = the last book page.**

## Imposition map (standard saddle-stitch)

For `N` book pages (a multiple of 4), sheet `s` (1-based):

| Sheet | Front side — outside of the sheet | Back side — inside of the sheet |
|-------|-----------------------------------|---------------------------------|
| `s`   | left `N − 2(s−1)`, right `2(s−1) + 1` | left `2(s−1) + 2`, right `N − 2(s−1) − 1` |

The imposed PDF has **2 pages per sheet** — front, then back — so a
double-sided printer puts PDF pages 1–2 on the first physical sheet,
3–4 on the second, and so on.

### 8-page booklet (the sample)

| Sheet | Front (outside) | Back (inside) |
|-------|-----------------|---------------|
| 1     | left: **8** (back cover), right: **1** (front cover) | left: **2**, right: **7** |
| 2     | left: **6**, right: **3** | left: **4**, right: **5** |

### 12-page booklet

| Sheet | Front (outside) | Back (inside) |
|-------|-----------------|---------------|
| 1     | left: **12** (back cover), right: **1** (front cover) | left: **2**, right: **11** |
| 2     | left: **10**, right: **3** | left: **4**, right: **9** |
| 3     | left: **8**, right: **5** | left: **6**, right: **7** |

> ⚠️ **Open question — please confirm, Drew.** In the call you described
> the first sheet as holding "the cover" and "page 1" on one side, and "the
> last page" and "the back cover" on the other. This build implements the
> **standard** saddle-stitch reading of that: the cover *is* page 1 and
> the back cover *is* the last page, so sheet 1's outside is
> `[back cover | front cover]` and its inside is `[page 2 | second-to-last
> page]`. If you instead meant the cover to be an *extra, unnumbered*
> page before page 1 (so page 1 sits inside the cover, facing the last
> page), say so — that is a one-line change to the pagination, but it
> changes every sheet's map, so it should be decided before printing a
> long book.

## Install & run

Requires Node 20+ and npm.

```bash
npm install
npm run build        # tsc, strict mode — must be clean
npm start            # runs the MCP server on stdio: node dist/index.js
```

The server speaks MCP over stdio only. It writes nothing to stdout
except the protocol; logs go to stderr.

## Configure an LLM client

Point any MCP client at the built server with a stdio command, e.g.
(Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pdf-booklet-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/pdf-booklet-mcp/dist/index.js"]
    }
  }
}
```

## Tool: `create_booklet_pdf`

Input:

| Field | Type | Notes |
|---|---|---|
| `title` | string, required | Booklet title; also the front cover. |
| `author` | string | Shown on the front cover. |
| `subtitle` | string | Shown on the front cover under the title. |
| `markdown` | string | `#` / `##` / `###` headings, paragraphs. A line containing only `---` (or `<!-- pagebreak -->`) forces a page break. |
| `pages` | array of `{title?, body?}` | Structured pages/sections; each entry starts on a new book page. Body paragraphs are separated by blank lines. |
| `backCoverText` | string | Back-cover text. Defaults to a short closing line. |
| `filename` | string | e.g. `my-booklet.pdf`. Defaults to a slug of the title. |

Give `markdown`, `pages`, or both (markdown first, then the structured
pages). At least one is required.

Example call (what the LLM sends):

```json
{
  "title": "The Little Book of Owls",
  "subtitle": "A short field guide for curious readers",
  "author": "Drew",
  "markdown": "# The Tawny Owl\n\nThe tawny owl is a bird of quiet woods...\n\n---\n\n# At Dusk\n\nDusk is the tawny owl's morning...",
  "filename": "little-book-of-owls.pdf"
}
```

What it returns (also as `structuredContent`):

```json
{
  "pdfPath": "/absolute/path/to/pdf-booklet-mcp/output/little-book-of-owls.pdf",
  "title": "The Little Book of Owls",
  "bookPages": 8,
  "paddedBlankPages": 0,
  "sheets": 2,
  "totalPdfPages": 4,
  "imposition": [
    { "sheet": 1, "front": { "leftPage": 8, "rightPage": 1 }, "back": { "leftPage": 2, "rightPage": 7 } },
    { "sheet": 2, "front": { "leftPage": 6, "rightPage": 3 }, "back": { "leftPage": 4, "rightPage": 5 } }
  ]
}
```

PDFs are saved under `output/` in this project.

## Print instructions

1. Open the PDF and print **double-sided**.
2. Set the duplex / flip option to **flip on short edge**. (The sheet is
   landscape and the fold is vertical; flipping on the short edge keeps
   the inside pages the right way up and in the right halves.)
3. Print at **100% / Actual size** on US Letter (11 × 8.5 in) — do not
   use "Fit to page", or the book pages will no longer be 5.5 × 8.5 in.
4. Stack the sheets in order, fold the whole stack in half vertically
   (fold line down the middle of each sheet, cover on the outside),
   and staple twice along the spine (saddle-stitch). For a thick booklet,
   crease with a bone folder or spoon handle so it sits flat.
5. If a test print comes out with inside pages upside down or swapped
   left/right, the printer's flip setting is wrong — switch it to the
   other flip option and reprint one sheet before doing the whole run.

## Sample & verification

```bash
npm run sample   # builds output/sample-booklet.pdf via the real tool code path
npm run verify   # re-parses the sample and checks it independently
npm run smoke    # spawns the real MCP server over stdio and calls the tool
npm run check    # typecheck + build + sample + verify, end to end
```

The sample is **"The Little Book of Owls" — 8 book pages, 2 sheets,
4 imposed PDF pages, 0 blank padding pages** (6 content pages between
the covers). `npm run verify` re-parses that PDF and checks, by
positional text extraction (`pdftotext -bbox`, so it knows which half
of each sheet a word sits on):

- every imposed page is exactly Letter landscape, 792 × 612 pt;
- page count is even, sheets = pages ÷ 2, book pages = sheets × 4;
- every sheet side holds the book pages the imposition map predicts,
  in the predicted left/right positions (proved by each content page's
  footer page number sitting in the right half);
- the cover title is on the right half of sheet 1's front, and the
  back-cover closing line is on the left half of sheet 1's front.

All 16 checks pass on the sample as built (see the `npm run verify`
output). Generated PDFs are **not committed** — they are reproducible
with `npm run sample`, so `output/*.pdf` is gitignored.

## Project layout

```
src/
  booklet.ts            Core: markdown/structured parsing, book-page
                        rendering (pdf-lib), saddle-stitch imposition.
  index.ts              MCP server (stdio) — the create_booklet_pdf tool.
  scripts/
    generate-sample.ts  Builds output/sample-booklet.pdf.
    verify-sample.ts    Independent re-parse verification (see above).
    smoke-test-mcp.ts   End-to-end MCP call over stdio.
output/                 Generated PDFs land here (gitignored).
```

Stack: TypeScript (`"strict": true`, Node 20+), the official TypeScript
MCP SDK (`@modelcontextprotocol/sdk`, stdio transport), `pdf-lib` for
PDF generation and imposition, `zod` for the tool schema. No `any`, no
`ts-ignore` — `npm run typecheck` (`tsc --noEmit`) is clean.
