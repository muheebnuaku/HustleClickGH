export const SITE_CONFIG = {
  name: "HustleClickGH",
  description: "Ghana's AI Dataset Collection Platform — earn GH₵ by recording your voice, completing surveys, and contributing language data.",
  contact: {
    email: "info@hustleclickgh.com",
    phone: "+233592405403",
    whatsapp: "https://wa.me/233592405403",
    linkedin: "https://www.linkedin.com/in/muheeb-nuaku-30923b25a/",
  },
  survey: {
    minWithdrawal: 10,
    referralBonus: 1.0,
    referralMilestone: 15,
  },
} as const;

// The 16 regions of Ghana — used for contributor location capture.
export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
] as const;

export const ID_TYPES = [
  { value: "ghana_card", label: "Ghana Card (National ID)" },
  { value: "passport", label: "Passport" },
  { value: "voter_id", label: "Voter ID" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "other", label: "Other" },
] as const;

export const PARTNER_PROJECT_TYPES = [
  { value: "image_dataset", label: "AI Image Dataset" },
  { value: "voice", label: "Voice / Speech Data" },
  { value: "video", label: "Video Data" },
  { value: "survey", label: "Surveys / Questionnaires" },
  { value: "language", label: "Language / Text Data" },
  { value: "other", label: "Other" },
] as const;
