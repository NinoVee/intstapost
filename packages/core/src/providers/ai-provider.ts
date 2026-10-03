/**
 * AI provider abstraction: vision analysis and text generation can be swapped
 * between vendors. Every call reports its cost for the spend ledger.
 */
export interface VisionLabels {
  people: Array<{ approxAge?: "child" | "teen" | "adult"; isLikelyOwner?: boolean }>;
  environment: string[];
  activities: string[];
  clothing: string[];
  objects: string[];
  events: string[];
  mood: string[];
  sensitive: string[]; // e.g. visible address, school logo, licence plate, screen with personal data
  summary: string;
}

export interface VisionAnalyzer {
  readonly id: string;
  isConfigured(): boolean;
  estimateCostCents(imageCount: number): number;
  analyze(images: Array<{ bytes: Buffer; mimeType: string }>): Promise<{ labels: VisionLabels; costCents: number }>;
}

export interface TextGenerator {
  readonly id: string;
  isConfigured(): boolean;
  generate(input: { system: string; prompt: string; maxTokens: number }): Promise<{ text: string; costCents: number }>;
}
