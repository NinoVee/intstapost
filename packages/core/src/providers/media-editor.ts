import type { EditOperation } from "../editing/operations";
import type { GuardedEditRequest } from "../policy/identity-guard";

/**
 * MediaEditor (§6): pluggable editing back-ends — HiggsfieldEditor,
 * SharpEditor/FFmpegEditor (deterministic), future providers.
 * `edit()` only accepts a GuardedEditRequest, so nothing reaches a model
 * without passing the Identity Preservation Guard.
 */
export interface MediaEditorCapabilities {
  mediaKinds: Array<"image" | "video">;
  operations: EditOperation[];
  generative: boolean;
  /** Does the provider retain/train on inputs? Must be false unless the user opted in. */
  retainsInputs: boolean;
}

export interface EditInput {
  request: GuardedEditRequest;
  source: { bytes: Buffer; mimeType: string; width?: number; height?: number };
}

export interface EditOutput {
  bytes: Buffer;
  mimeType: string;
  costCents: number;
  provider: string;
  providerRequestId?: string;
  /** Non-destructive record of what was done (stored in edit_versions.edl). */
  edl: unknown;
}

export interface MediaEditor {
  readonly id: string;
  readonly capabilities: MediaEditorCapabilities;
  isConfigured(): boolean;
  estimateCostCents(input: EditInput): number;
  edit(input: EditInput): Promise<EditOutput>;
}
