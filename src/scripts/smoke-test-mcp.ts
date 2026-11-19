/**
 * Smoke test: spawn the real MCP server over stdio (the same command an
 * LLM client uses) and call `create_booklet_pdf` through the MCP wire
 * protocol. Verifies the tool is listed, callable, and returns a real
 * PDF path. Run: `npm run build && node dist/scripts/smoke-test-mcp.js`
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface TextContent {
  type: "text";
  text: string;
}

function isTextContent(value: unknown): value is TextContent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { type?: unknown; text?: unknown };
  return record.type === "text" && typeof record.text === "string";
}

async function main(): Promise<void> {
  const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(projectRoot, "dist", "index.js")],
    stderr: "pipe",
  });
  const client = new Client({ name: "pdf-booklet-mcp-smoke-test", version: "0.1.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    console.log(`Tools listed: ${names.join(", ")}`);
    if (!names.includes("create_booklet_pdf")) {
      throw new Error("create_booklet_pdf not listed by the server");
    }
    const result = await client.callTool({
      name: "create_booklet_pdf",
      arguments: {
        title: "Smoke Test Booklet",
        author: "Owl",
        markdown: "# Hello\n\nThis is a smoke test of the MCP tool over stdio.\n\n---\n\n# Goodbye\n\nThe tool worked end to end.",
        filename: "smoke-test-booklet.pdf",
      },
    });
    if (!Array.isArray(result.content)) {
      throw new Error("Tool result had no content array");
    }
    const text = result.content
      .filter(isTextContent)
      .map((c) => c.text)
      .join("\n");
    console.log(text);
    const parsed = JSON.parse(text) as { pdfPath: string; bookPages: number; sheets: number };
    if (!existsSync(parsed.pdfPath)) {
      throw new Error(`Tool returned a PDF path that does not exist: ${parsed.pdfPath}`);
    }
    console.log(`SMOKE TEST PASSED: ${parsed.bookPages} book pages, ${parsed.sheets} sheets, file exists at ${parsed.pdfPath}`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
