# AI Dataset Collection Feature

## Overview

The Dataset Collection feature extends HustleClickGH into an AI data marketplace. Admins post
data collection projects (voice, video, or face recognition). Users record on their phone,
upload the file, and earn Ghana Cedis per approved submission. Admins manually review each
submission before payment is released.

---

## Feature Map

```
Admin creates project
  └── Sets: title, type, instructions, reward per submission, max submissions,
            accepted languages, file format rules, expiry date

User browses /data-projects
  └── Sees open projects with reward, slots remaining, type badge
  └── Taps project → reads instructions
  └── Gives consent (checkbox, required)
  └── Records on phone using native camera/voice app
  └── Uploads file from phone storage
  └── File uploads to Vercel Blob (or local /public/uploads in dev)
  └── Submission saved as "pending"

Admin reviews /admin/data-projects/[id]
  └── Views all submissions in a table
  └── Clicks file link to listen/watch
  └── Approves → user balance credited (Prisma transaction)
  └── Rejects → user notified, no payment, can resubmit if project allows
```

---

## Database Models

### DataProject
Represents a single dataset collection campaign created by an admin.

| Field | Type | Description |
|---|---|---|
| id | String (cuid) | Primary key |
| title | String | Project title |
| description | String | What data is being collected and why |
| projectType | String | `voice` \| `video` \| `face` |
| instructions | String | Step-by-step recording guide for users |
| samplePrompts | String? | JSON array of phrases/actions to record |
| reward | Float | GH₵ paid per approved submission |
| maxSubmissions | Int | Total slots available |
| currentSubmissions | Int | Approved submission count (auto-incremented) |
| status | String | `active` \| `paused` \| `completed` |
| languages | String? | JSON array e.g. `["English","Twi","Ga","Hausa"]` |
| minDurationSecs | Int | Minimum recording length (default: 3s) |
| maxDurationSecs | Int | Maximum recording length (default: 60s) |
| maxFileSizeMB | Int | Max upload size in MB (default: 25) |
| acceptedFormats | String | JSON array e.g. `["mp3","wav","m4a","mp4","mov"]` |
| expiresAt | DateTime? | Optional project deadline |
| createdBy | String | Admin userId |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### DataSubmission
Represents a single user's file submission for a project.

| Field | Type | Description |
|---|---|---|
| id | String (cuid) | Primary key |
| projectId | String | FK → DataProject |
| userId | String | FK → User |
| fileUrl | String | Vercel Blob URL (or local path in dev) |
| fileName | String | Original filename |
| fileType | String | MIME type e.g. `audio/mpeg` |
| fileSizeMB | Float | File size in MB |
| durationSecs | Float? | Duration if detectable |
| language | String? | Language used in recording |
| promptUsed | String? | The specific prompt/phrase the user recorded |
| consentGiven | Boolean | Must be true before submission is accepted |
| consentGivenAt | DateTime? | Timestamp of consent |
| status | String | `pending` \| `approved` \| `rejected` |
| rewarded | Boolean | Whether balance has been credited |
| notes | String? | Admin review notes (visible to user on rejection) |
| submittedAt | DateTime | Auto |
| reviewedAt | DateTime? | When admin reviewed |
| reviewedBy | String? | Admin userId who reviewed |

---

## Routes

### API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/upload` | User | Upload file → Vercel Blob, return URL |
| GET | `/api/data-projects` | User | List active projects + user submission status |
| GET | `/api/data-projects/[id]` | User | Project detail + user's submission if any |
| POST | `/api/data-projects/[id]/submit` | User | Submit recording |
| GET | `/api/admin/data-projects` | Admin | List all projects with stats |
| POST | `/api/admin/data-projects` | Admin | Create new project |
| PATCH | `/api/admin/data-projects/[id]` | Admin | Update project status/details |
| DELETE | `/api/admin/data-projects/[id]` | Admin | Delete project + all submissions |
| GET | `/api/admin/data-projects/[id]/submissions` | Admin | List all submissions for a project |
| POST | `/api/admin/data-projects/[id]/submissions/[subId]/approve` | Admin | Approve + credit balance |
| POST | `/api/admin/data-projects/[id]/submissions/[subId]/reject` | Admin | Reject with notes |

### Page Routes

| Path | Layout | Description |
|---|---|---|
| `/data-projects` | DashboardLayout | Browse open projects |
| `/data-projects/[id]` | DashboardLayout | Project detail + upload form |
| `/admin/data-projects` | AdminLayout | Manage all projects |
| `/admin/data-projects/[id]` | AdminLayout | Review submissions |

---

## File Storage

**Production (Vercel):** Vercel Blob Storage
- Requires `BLOB_READ_WRITE_TOKEN` environment variable
- Set up via: Vercel Dashboard → Storage → Create Blob Store → attach to project
- Files stored at: `https://<store>.public.blob.vercel-storage.com/...`

**Local Development:** Falls back to `public/uploads/`
- Files saved to: `<project_root>/public/uploads/<projectId>/<filename>`
- Served at: `http://localhost:3000/uploads/<projectId>/<filename>`
- The `public/uploads/` directory is git-ignored

---

## Payment Flow

```
User submits file → status: "pending"
Admin reviews file
  → Approve:
      prisma.$transaction([
        update submission status = "approved", rewarded = true
        increment DataProject.currentSubmissions
        increment User.balance + User.totalEarned
      ])
  → Reject:
      update submission status = "rejected"
      save rejection notes
      (no balance change)
```

Payment is NOT automatic (unlike surveys). Admins must manually approve to ensure
data quality before releasing funds.

---

## Accepted File Formats by Project Type

| Type | Accepted Formats | Max Size | Max Duration |
|---|---|---|---|
| Voice | mp3, wav, m4a, ogg | 15 MB | 60 seconds |
| Video | mp4, mov, webm | 50 MB | 30 seconds |
| Face | mp4, mov, jpg, png | 25 MB | 15 seconds |

---

## Consent Requirements

Every submission must include explicit consent. The upload form requires:
1. Checkbox: "I confirm I am the person in this recording and consent to my data being used for AI training purposes."
2. Consent timestamp is recorded in `DataSubmission.consentGivenAt`

This is required to comply with Ghana's Data Protection Act 2012 and general AI data ethics standards.

---

## Setup Instructions

### 1. Add Vercel Blob

```bash
npm install @vercel/blob
```

Add to `.env`:
```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

Get the token from: Vercel Dashboard → Your Project → Storage → Blob → .env.local

### 2. Run Migration

```bash
npx prisma migrate dev --name add_dataset_collection
```

### 3. Add to .gitignore

```
public/uploads/
```

---

## Future Improvements (v2)

- Multi-submission per project (e.g. record 10 different prompts)
- Automatic audio duration detection on upload
- Face detection preview using face-api.js (client-side validation)
- CSV/zip export of approved submissions for dataset packaging
- Per-language quotas (e.g. need 100 Twi speakers, 100 Ga speakers)
- Quality score by admin (1-5) stored on submission
