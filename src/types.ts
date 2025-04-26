import type { NodeResult } from 'axe-core';

export interface ViolationSummary {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical';
  description: string;
  helpUrl: string;
  nodes: NodeResult[];
}

/** Update the main output structure */
export interface AccessibilityTestOutput {
  url: string;
  violations?: ViolationSummary[];
  passesCount?: number;
  incompleteCount?: number;
  inapplicableCount?: number;
  error?: string;
}
