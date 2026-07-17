/**
 * Single source of truth for legal document versioning.
 *
 * Bump CONSENT_VERSION whenever the Data Processing Agreement or Privacy Policy
 * changes materially. Users whose stored consentVersion is older can then be
 * required to re-consent (compare against User.consentVersion).
 */
export const CONSENT_VERSION = "1.0";

export const LEGAL_LAST_UPDATED = "17 July 2026";

/** Short summary shown next to the consent checkbox. */
export const CONSENT_SUMMARY =
  "I confirm the information I have provided is accurate, and I consent to HustleClickGH " +
  "collecting and processing my personal data (including my identity details, location, " +
  "and the voice, image, video, and survey data I contribute) for the purpose of building " +
  "consented AI training datasets, which may be shared with vetted partner organizations. " +
  "I have read and agree to the Data Processing Agreement and Privacy Policy.";
