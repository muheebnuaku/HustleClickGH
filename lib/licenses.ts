/**
 * Dataset usage licences. A project's licence sets what the buyer may do with the
 * collected data, and is what the contributor is consenting to when they submit.
 * It travels into the export manifest so buyer rights are documented.
 */
export interface LicenseDef {
  key: string;
  label: string;
  /** Buyer-facing rights summary. */
  description: string;
  /** Short line shown to contributors before they submit. */
  contributorNote: string;
}

export const LICENSES: Record<string, LicenseDef> = {
  commercial_ai: {
    key: "commercial_ai",
    label: "Commercial AI training",
    description: "May be used to train, evaluate and deploy commercial AI models and products.",
    contributorNote: "Your recording may be used to train commercial AI models.",
  },
  research: {
    key: "research",
    label: "Research only",
    description: "Non-commercial academic and research use only. No commercial products.",
    contributorNote: "Your recording will be used for non-commercial research only.",
  },
  internal: {
    key: "internal",
    label: "Internal evaluation",
    description: "Internal testing and evaluation only. Not for redistribution or resale.",
    contributorNote: "Your recording will be used for the organisation's internal evaluation only.",
  },
};

export const DEFAULT_LICENSE = "commercial_ai";

export function getLicense(key: string | null | undefined): LicenseDef {
  return LICENSES[key ?? ""] ?? LICENSES[DEFAULT_LICENSE];
}
