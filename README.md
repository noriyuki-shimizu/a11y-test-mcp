# a11y test MCP
An MCP (Model Context Protocol) server for performing a11y test on webpages using playwright axe-core. The results are then used in an agent loop with your favorite AI assistant (Cline/Cursor/GH Copilot) to find problems with a11y and suggest improvements.

## Features

* Perform detailed accessibility testing on any web pages
* Get an overview of accessibility issues
  * Violations
    * Provides information on which DOM was at fault
  * Passes
  * Incomplete
  * Inapplicable
* Can specify specific WCAG criteria

## Installation

```
# Global install
npm install -g a11y-test-mcp

# With npx command
npx a11y-test-mcp
```

## Configuration

Add the following to the mcpServers object:

```json
{
  "servers": {
    "a11y-test": {
      "type": "stdio",
      "command": "npx",
      "args": ["a11y-test-mcp"]
    }
  }
}
```

## Example prompt

```
Please perform accessibility testing on the following sites.
Tests should be performed at WCAG Level A.
If there are problems, please indicate which HTML elements are at fault.

* https://example.com
* https://example.com/home
```
