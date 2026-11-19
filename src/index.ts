#!/usr/bin/env node
/**
 * pdf-booklet-mcp — MCP server (stdio transport).
 *
 * Exposes one tool, `create_booklet_pdf`: send any content (markdown
 * and/or structured pages) and get back a printable saddle-stitch
 * booklet PDF — US Letter landscape sheets, folded in half.
 * See README.md for the format spec and print instructions.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBooklet } from "./booklet.js";

const structuredPageSchema = z.object({
  title: z.string().optional().describe("Heading shown at the top of this page/section."),
  body: z.string().optional().describe("Body text; blank lines separate paragraphs."),
});

const inputSchema = {
  title: z.string().min(1).describe("Booklet title; also used for the front cover."),
  author: z.string().optional().describe("Author name, shown on the front cover."),
  subtitle: z.string().optional().describe("Subtitle, shown on the front cover under the title."),
  markdown: z
    .string()
    .optional()
    .describe(
      "Markdown content. Supports # / ## / ### headings and paragraphs. A line containing only --- (or <!-- pagebreak -->) forces a page break.",
    ),
  pages: z
    .array(structuredPageSchema)
    .optional()
    .describe("Structured pages/sections. Each entry starts on a new book page."),
  backCoverText: z.string().optional().describe("Text for the back cover. Defaults to a short closing line."),
  filename: z.string().optional().describe("Output file name, e.g. my-booklet.pdf. Defaults to a slug of the title."),
};

const sheetSideSchema = z.object({
  leftPage: z.number().int().describe("Book page number on the left half of this sheet side."),
  rightPage: z.number().int().describe("Book page number on the right half of this sheet side."),
});

const outputSchema = {
  pdfPath: z.string().describe("Absolute path of the saved imposed PDF."),
  title: z.string(),
  bookPages: z.number().int().describe("Total book pages, including cover, back cover and blank padding."),
  paddedBlankPages: z.number().int().describe("Blank pages added to reach a multiple of 4."),
  sheets: z.number().int().describe("Physical sheets of Letter paper."),
  totalPdfPages: z.number().int().describe("Pages in the imposed PDF file: 2 per sheet (front + back)."),
  imposition: z.array(
    z.object({
      sheet: z.number().int().describe("1-based sheet number."),
      front: sheetSideSchema.describe("Outside of the sheet."),
      back: sheetSideSchema.describe("Inside of the sheet."),
    }),
  ),
};

async function main(): Promise<void> {
  const server = new McpServer({
    name: "pdf-booklet-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "create_booklet_pdf",
    {
      title: "Create booklet PDF",
      description:
        "Create a printable saddle-stitch booklet PDF from any content. " +
        "Book pages are 5.5 x 8.5 in portrait; they are imposed onto US Letter " +
        "landscape sheets (11 x 8.5 in) for double-sided printing, folding in half. " +
        "Accepts markdown and/or structured pages. Returns the saved PDF path, " +
        "book page count, sheet count, and the sheet-by-sheet imposition map.",
      inputSchema,
      outputSchema,
    },
    async (args) => {
      try {
        const result = await createBooklet({
          title: args.title,
          author: args.author,
          subtitle: args.subtitle,
          markdown: args.markdown,
          pages: args.pages,
          backCoverText: args.backCoverText,
          filename: args.filename,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          // The SDK types structuredContent as a plain record; the result
          // conforms to outputSchema above, so this is a shape conversion.
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to create booklet PDF: ${message}` }],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("pdf-booklet-mcp running on stdio");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
