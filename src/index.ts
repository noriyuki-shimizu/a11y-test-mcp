#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execTest, convertTestResultToText } from './functions'

/** Create an MCP server instance */
const server = new McpServer({
  name: 'accessibility-tester',
  version: '0.1.1',
});

server.tool(
  'exec-a11y-test',
  'Obtains a list of specified list of URL and a list of WCAG indicators and returns the results',
  { urls: z.array(z.string().url()), wcagStandards: z.array(z.string()).optional() },
  async ({ urls, wcagStandards }) => {
    const structuredResults = await execTest(urls, wcagStandards);

    return {
      content: [{
        type: 'text',
        text: convertTestResultToText(structuredResults)
      }]
    };
  }
)

/**
 * Main function to start the server
 */
const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('A11y Accessibility MCP server running on stdio');
}

process.on('SIGINT', (): void => {
  void server.close();
  process.exit(0);
});

main().catch(console.error);
