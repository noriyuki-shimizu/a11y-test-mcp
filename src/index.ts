#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { convertTestResultToText, convertWcagTag, execTest } from './functions';
import { convertScenarioResultToText, execScenario, ScenarioInputSchema } from './scenario';

/** Create an MCP server instance */
const server = new McpServer({
  name: 'accessibility-tester',
  version: '0.1.1',
});

server.registerTool(
  'exec-a11y-test',
  {
    title: 'Execute Accessibility Test',
    description: 'Obtains a list of specified list of URL and a list of WCAG indicators and returns the results',
    inputSchema: { urls: z.array(z.url()), wcagStandards: z.array(z.string()).optional() },
  },
  async ({ urls, wcagStandards }) => {
    const structuredResults = await execTest(urls, wcagStandards);

    return {
      content: [{
        type: 'text',
        text: convertTestResultToText(structuredResults),
      }],
    };
  },
);

server.registerTool(
  'exec-a11y-test-scenario',
  {
    title: 'Execute Accessibility Test Scenario',
    description:
      'Run a multi-step browser scenario (navigation, click, fill, etc.) and execute one or more accessibility audits at chosen points.'
      + 'Useful for authenticated pages, modal/menu open states, SPA route transitions, and any UI state not reachable from a single URL.'
      + 'Framework-agnostic: works with any rendered DOM (Vue/React/Svelte/Angular/Lit/plain HTML/Web Components).',
    inputSchema: ScenarioInputSchema.shape,
  },
  async (input) => {
    const result = await execScenario(input, convertWcagTag);
    return {
      content: [{
        type: 'text',
        text: convertScenarioResultToText(result),
      }],
    };
  },
);

/**
 * Main function to start the server
 */
const main = async (): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('A11y Accessibility MCP server running on stdio');
};

process.on('SIGINT', (): void => {
  void server.close();
  process.exit(0);
});

main().catch(console.error);
