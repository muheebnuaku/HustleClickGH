# UNIVERSITY OF GHANA
## COLLEGE OF BASIC AND APPLIED SCIENCE
## DEPARTMENT OF COMPUTER SCIENCE

---

&nbsp;

&nbsp;

# HUSTLECLICKGH: A WEB-BASED AI TRAINING DATA COLLECTION PLATFORM WITH MICRO-EARNING INCENTIVES FOR THE GHANAIAN MARKET

&nbsp;

&nbsp;

## *(YOUR FULL NAME IN CAPS)*

&nbsp;

## *(PROGRAMME OF STUDY, e.g., BSc. COMPUTER SCIENCE)*

&nbsp;

&nbsp;

## 2025/2026

---

&nbsp;

&nbsp;

**Supervisor:** FA Katsriku

---

\newpage

## TABLE OF CONTENTS

- [INTRODUCTION](#introduction)
  - 1.1 Background of Project
  - 1.2 Problem Statement
  - 1.3 General Objective
  - 1.4 Specific Objectives
  - 1.5 Research Questions
  - 1.6 Justification of the Study
  - 1.7 Project Stakeholders
  - 1.8 Scope of the Study
  - 1.9 Assumptions and Constraints
- [LITERATURE REVIEW](#literature-review)
  - 2.1 Conceptual Review
  - 2.2 Related Works
  - 2.3 Identified Gap
- [METHODOLOGY](#methodology)
  - 3.1 Project Development Approach
  - 3.2 Requirement Gathering
  - 3.3 Proposed System Design
  - 3.4 Tools and Technologies
  - 3.5 Implementation Plan
  - 3.6 Testing and Evaluation Plan
  - 3.7 Ethical Considerations
- [EXPECTED RESULTS/DELIVERABLES](#expected-resultsdeliverables)
- [TIMELINE/WORK PLAN](#timelinework-plan)
- [BUDGET](#budget)
- [REFERENCES](#references)
- [APPENDICES](#appendices)

---

\newpage

## INTRODUCTION

### 1.1 Background of Project

Artificial Intelligence (AI) has emerged as a transformative force across sectors including healthcare, education, agriculture, and finance. Central to the development of effective AI systems is the availability of large, high-quality, and demographically representative training datasets. Systems in speech recognition, natural language processing (NLP), computer vision, and conversational AI all require annotated data that reflects the linguistic patterns, accents, and physical characteristics of the populations they serve.

Ghana, like much of Sub-Saharan Africa, has a rich linguistic landscape with over 80 spoken languages, including Twi (Akan), Ga, Ewe, Hausa, and Dagbani. Yet virtually no large-scale, structured dataset exists that captures Ghanaian speech, facial imagery, or conversational data in these languages. Global initiatives such as Mozilla Common Voice have made progress for widely spoken languages, but Ghanaian and broader West African languages remain critically underrepresented (Ardila et al., 2020).

Simultaneously, the proliferation of mobile internet access and smartphone usage in Ghana has created a population of digitally connected users who are willing to participate in online tasks for compensation. Ghana's established Mobile Money ecosystem — dominated by MTN Mobile Money (MoMo), Vodafone Cash, and AirtelTigo Money — provides an accessible and trusted digital payment infrastructure that bypasses the need for traditional banking.

**HustleClickGH** is a web-based platform designed specifically for the Ghanaian market that bridges these two realities. It crowdsources AI training media — voice recordings, video clips, and facial images — from Ghanaian users by compensating them in Ghana Cedis (GH₵) through Mobile Money. Administrators and researchers manage data collection projects, define contribution requirements, review submissions for quality, and approve payments. The platform also includes a supplementary survey system to support academic and organisational research. HustleClickGH is intentionally scoped to Ghana at this initial phase, with its language targeting, payment infrastructure, and demographic focus all tailored to the Ghanaian context.

---

### 1.2 Problem Statement

Despite the growing deployment of AI-powered products and services in Ghana, the development of AI models tailored to the Ghanaian demographic is severely limited by the absence of locally representative training data. Existing global datasets do not capture the acoustic characteristics of Ghanaian speech, the diversity of Ghanaian facial features, or dialogue in Ghanaian languages. Attempts to collect such data are hampered by the lack of an incentivised, quality-controlled, and locally accessible contribution platform. Existing crowdsourcing platforms (e.g., Amazon Mechanical Turk, Prolific) are financially inaccessible to most Ghanaians as they rely on USD-denominated international payment gateways. This creates a gap in the pipeline between data need and data availability, ultimately slowing the development of AI systems that can effectively serve Ghanaian users.

---

### 1.3 General Objective

To design, develop, and deploy a Ghana-specific web platform that enables the crowdsourced collection of high-quality, consent-verified AI training data — including voice, video, and facial image datasets — from Ghanaian contributors, compensated through Ghana Mobile Money.

---

### 1.4 Specific Objectives

1. **Design** an AI dataset collection module supporting voice, video, and facial image project types, configurable with Ghanaian language options, prompt sets, file constraints, and GH₵ reward amounts per approved submission.
2. **Develop** a WebRTC-based peer-to-peer call recording system that enables the collection of paired conversational audio data in real time, supporting the creation of dialogue and conversational AI training datasets in Ghanaian languages.
3. **Implement** an admin-managed quality review workflow in which all submitted media files are individually assessed before any reward is issued, ensuring the integrity and usability of collected datasets.
4. **Integrate** Ghana Mobile Money payment channels (MTN MoMo, Vodafone Cash, AirtelTigo Money) as the primary contributor compensation mechanism, with a secure admin-reviewed withdrawal approval process.
5. **Enforce** data protection and informed consent requirements for all media submissions in compliance with the Ghana Data Protection Act 2012, including timestamped consent records.
6. **Evaluate** the usability and effectiveness of the platform through user acceptance testing with a cohort of Ghanaian participants.

---

### 1.5 Research Questions

1. How can a web-based platform be designed to effectively crowdsource AI training data (voice, video, and facial images) from Ghanaian users in multiple local languages?
2. Can a WebRTC-based peer-to-peer call recording system reliably capture paired conversational audio suitable for AI training purposes within Ghana's mobile network environment?
3. What admin-managed quality review workflow is most effective in ensuring the usability and accuracy of crowdsourced AI training media prior to contributor payment?
4. How can Ghana's Mobile Money infrastructure be integrated into a digital contribution platform to provide accessible, trustworthy compensation for Ghanaian users?
5. What level of usability and satisfaction do Ghanaian users report when interacting with an incentivised AI data collection platform?

---

### 1.6 Justification of the Study

**For the Ghanaian AI research community:** The platform directly addresses the scarcity of locally sourced AI training datasets, providing speech corpora in Twi, Ga, Hausa, and other Ghanaian languages, as well as demographically representative facial and video datasets. These resources will lower the barrier for researchers and developers seeking to build AI systems for the Ghanaian context.

**For individual users:** The platform provides a legitimate, accessible, and Mobile Money-compatible source of digital income for students, young professionals, and the general public — individuals who currently have no viable entry point into global crowdsourcing markets.

**For organisations and researchers:** Academic institutions, NGOs, tech companies, and government agencies conducting research or developing AI products for Ghana gain a managed, consent-compliant channel for data acquisition with built-in quality control.

**For national AI development:** By building infrastructure for African language data collection, the project contributes to Ghana's digital economy and positions the country to participate more meaningfully in global AI development.

---

### 1.7 Project Stakeholders

| Stakeholder | Role |
|---|---|
| **Registered Users (Contributors)** | Submit voice, video, and facial image recordings; complete surveys; earn and withdraw GH₵ rewards |
| **Administrators** | Create and manage data collection projects; review and approve/reject submissions; process withdrawal requests |
| **Academic Researchers** | Utilise the platform to collect survey responses and AI training data for research purposes |
| **AI Developers and Organisations** | Commission data collection projects to build training datasets for Ghanaian-language AI models |
| **Mobile Money Providers (MTN, Vodafone, AirtelTigo)** | Payment infrastructure partners enabling GH₵ disbursements |
| **Supervisor (FA Katsriku)** | Academic oversight and evaluation of the project |

---

### 1.8 Scope of the Study

**In scope:**
- Web application accessible via desktop and mobile browsers, targeted at Ghanaian users.
- AI dataset collection for three media types: voice recordings, video clips, and facial/image submissions.
- Support for Ghanaian languages: English (Ghanaian accent), Twi, Ga, Hausa, and Dagbani.
- WebRTC-based conversational call recording system for paired audio data.
- Admin panel for project management, submission review, and payment processing.
- Ghana Mobile Money withdrawal system (MTN MoMo, Vodafone Cash, AirtelTigo Money).
- Supplementary survey module (admin-created paid surveys and user-created free surveys).
- Informed consent collection and Ghana Data Protection Act 2012 compliance.

**Out of scope:**
- Native mobile applications (iOS/Android) — the platform is web-only at this phase.
- Automatic AI-based quality assessment of submissions — all review is manual by an admin.
- Expansion to languages and payment systems outside Ghana — future phases only.
- Direct API integration with Mobile Money providers for real-time automated payments — withdrawals are processed manually by the admin using the network provider's app or portal.
- Storage or hosting of model training pipelines — the platform collects and stores data only.

---

### 1.9 Assumptions and Constraints

**Assumptions:**
- Users have access to a smartphone or computer with a microphone, camera, and internet connection.
- Ghana's Mobile Money infrastructure remains stable and accessible for payment disbursements.
- Contributors are willing to grant informed consent for their data to be used in AI training.
- Admin reviewers have sufficient context and instructions to evaluate submission quality.

**Constraints:**
- The project is time-bound by the 2025/2026 academic year.
- Development is carried out by a single developer, limiting parallel workstream capacity.
- Real-time automated Mobile Money API integration is deferred due to API access cost and complexity.
- WebRTC call quality is dependent on user internet connection stability, particularly on mobile networks.

---

\newpage

## LITERATURE REVIEW

### 2.1 Conceptual Review

**Crowdsourcing** refers to the practice of outsourcing tasks traditionally performed by specialists to a large, undefined group of people via an open call, typically using the internet (Howe, 2006). In the context of AI dataset creation, crowdsourcing enables the rapid collection of diverse, human-generated labelled data at scale.

**AI Training Data** encompasses the annotated examples used to train machine learning models. For speech-based AI, this includes audio recordings paired with transcriptions. For computer vision, it includes images annotated with labels such as face identity, emotion, or demographic attributes. The quality, diversity, and representativeness of training data directly determine the performance and fairness of the resulting model (Sambasivan et al., 2021).

**Micro-earning platforms** are digital systems that compensate users for completing small, structured tasks (micro-tasks) online. Compensation is typically modest per task but cumulative in volume. These platforms rely on a large, motivated contributor base.

**Mobile Money** refers to financial services operating via mobile networks without requiring a traditional bank account. In Ghana, it is the dominant digital payment channel, with over 19 million active Mobile Money accounts as of 2023 (Bank of Ghana, 2023).

**WebRTC (Web Real-Time Communication)** is an open-source protocol standard supported natively in modern browsers that enables peer-to-peer audio, video, and data communication without plugins. Its relevance to this project lies in enabling conversational audio to be recorded directly in the browser without external software.

**Data Protection and Informed Consent** refer to the legal and ethical obligations governing the collection, storage, and use of personal data. In Ghana, these are governed by the **Data Protection Act 2012 (Act 843)**, which requires that data subjects give freely informed consent before their personal data is collected or processed.

---

### 2.2 Related Works

**Mozilla Common Voice (Ardila et al., 2020)**
Mozilla Common Voice is an open-source, community-driven project for collecting multilingual speech data. Contributors record and validate short sentences through a web interface. It supports over 100 languages and has collected thousands of hours of audio.
- *Tools/Methods:* Web-based recording interface; community validation.
- *Strengths:* Massive scale; open dataset; browser-native recording; multilingual.
- *Weaknesses:* No financial compensation for contributors; limited African language support; no personalised prompts or project-level organisation; no admin review workflow.

**AfriSpeech-200 (Olatunji et al., 2023)**
AfriSpeech-200 is a 200-hour pan-African clinical and non-clinical speech dataset covering 120 African accents across 13 countries, collected via a structured crowdsourcing platform.
- *Tools/Methods:* Structured web collection; professional contributors; Whisper-based benchmarking.
- *Strengths:* Focused on African accents; large and well-annotated.
- *Weaknesses:* Research-grade initiative, not publicly accessible as a self-service contributor platform; no contributor compensation mechanism; no conversational or video components.

**Amazon Mechanical Turk — MTurk (Ipeirotis, 2010)**
MTurk is the most widely used crowdsourcing marketplace, enabling requesters to post Human Intelligence Tasks (HITs) for a global workforce of"Turkers" to complete for pay.
- *Tools/Methods:* Task marketplace; USD-denominated micropayments via Amazon Payments.
- *Strengths:* Massive global worker base; flexible task types; API integration; proven at scale.
- *Weaknesses:* USD payments inaccessible to most Ghanaians; no local language targeting; no built-in media recording; low cultural relevance to African users; documented worker exploitation concerns.

**Prolific Academic**
Prolific is an online research participant recruitment platform used primarily by academic researchers. Participants are paid to complete studies and surveys.
- *Tools/Methods:* Participant matching; GBP/USD payouts; survey and study integration.
- *Strengths:* High-quality, pre-screened respondents; ethical payment standards; researcher-friendly.
- *Weaknesses:* Not accessible to Ghanaian participants (payment via PayPal/bank transfer); no support for media recording tasks; no local language support; focused only on surveys and studies.

**Appen (Wang et al., 2021)**
Appen is a commercial AI training data company that crowdsources linguistic, audio, and image annotation tasks globally.
- *Tools/Methods:* Proprietary platform; global crowd; multi-task support.
- *Strengths:* High data quality; wide task variety; supports audio, image, and NLP annotation.
- *Weaknesses:* Closed, commercial platform not accessible to small researchers or open contributors; international payment only; no Ghana-specific targeting; not publicly available.

---

### 2.3 Identified Gap

A review of existing platforms reveals a consistent pattern: while tools exist for crowdsourced data collection and contributor compensation, none combine Ghanaian-language targeting, Mobile Money payment integration, conversational audio recording via WebRTC, and a quality-controlled admin review workflow within a single accessible platform. Mozilla Common Voice and AfriSpeech-200 address African data scarcity but lack incentive structures. MTurk and Prolific compensate contributors but are financially inaccessible to Ghanaians. Appen achieves data quality but is a closed commercial system. **HustleClickGH is proposed to fill this intersection** — a locally accessible, Ghana Mobile Money-compensated, quality-controlled AI dataset collection platform built specifically for the Ghanaian market.

---

\newpage

## METHODOLOGY

### 3.1 Project Development Approach

This project adopts the **Agile development methodology**, specifically an iterative, feature-driven approach. Agile is chosen because:
- The project involves multiple independent feature modules (dataset collection, WebRTC, surveys, payments), each of which can be developed and tested incrementally.
- Requirements in emerging AI data markets may evolve as user feedback is gathered.
- Continuous testing after each module reduces integration risk.

Each iteration delivers a working module, beginning with core authentication and data management, progressing to the primary dataset collection features, and culminating in full integration and user testing.

---

### 3.2 Requirement Gathering

Requirements were gathered through the following methods:

- **Document Review:** Analysis of existing similar platforms (Mozilla Common Voice, MTurk, Prolific, Appen) to identify feature benchmarks, limitations, and gaps.
- **Review of Legislation:** Study of the Ghana Data Protection Act 2012 (Act 843) to identify consent and data handling requirements.
- **Technical Research:** Review of WebRTC specifications, Next.js documentation, Prisma ORM documentation, and Vercel Blob storage API to confirm technical feasibility.
- **Questionnaire (Planned):** A structured questionnaire will be administered to a sample of potential Ghanaian users to assess willingness to contribute, preferred devices, language preferences, and expectations around compensation. *(See Appendix A.)*

---

### 3.3 Proposed System Design

**Architecture Overview**

The system follows a three-tier client-server architecture:

```
┌─────────────────────────────────────────────────┐
│                  CLIENT (Browser)                │
│   React 19 + Next.js 16 (Server-Side Rendering) │
│   Public Site | User Dashboard | Admin Panel     │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│            APPLICATION LAYER (Vercel)            │
│    Next.js API Route Handlers (Serverless)       │
│    Auth | Dataset Logic | WebRTC Signalling      │
│    Survey Logic | Payments | AI Assistant        │
└──────────────┬──────────────────┬───────────────┘
               │                  │
┌──────────────▼──────┐  ┌───────▼───────────────┐
│  DATA LAYER         │  │  FILE STORAGE          │
│  PostgreSQL         │  │  Vercel Blob CDN       │
│  (Supabase)         │  │  (Voice/Video/Images)  │
│  Prisma 5 ORM       │  └───────────────────────┘
└─────────────────────┘
```

**Database Design (Key Entities)**

The database schema comprises 9 core models:

| Model | Purpose |
|---|---|
| User | Stores contributor and admin accounts, balance, referral code, personal call code |
| DataProject | AI dataset collection projects (voice, video, face) with reward, language, and file constraints |
| DataSubmission | Individual media submission records with status (pending/approved/rejected), consent timestamps |
| CallSession | WebRTC signalling data (SDP offer/answer, ICE candidates, call status) |
| Survey | Admin and user-created surveys with questions and reward settings |
| SurveyQuestion | Individual question records linked to a survey |
| SurveyResponse | User responses to surveys |
| Withdrawal | GH₵ withdrawal requests with Mobile Money details and approval status |
| Referral | Records of referral relationships and earned bonuses |

**Process Design — AI Data Submission Flow (Use Case Summary)**

1. Admin creates a Data Project (type, language, reward, instructions).
2. User browses active projects, selects one, reads instructions.
3. User grants informed consent (checkbox + timestamp saved to DB).
4. User records or uploads media; file uploads directly to Vercel Blob CDN from browser.
5. Submission record created in DB with status = *pending*.
6. Admin reviews file in the admin panel, approves or rejects with notes.
7. On approval: DB transaction credits user balance and increments project counter.
8. User requests GH₵ withdrawal via Mobile Money form; admin processes payment.

**WebRTC Conversational Recording Flow**

1. User A enters User B's 5-character Personal Call Code; SDP offer stored in DB.
2. User B's browser polls for incoming calls and displays notification.
3. User B accepts; SDP answer and ICE candidates exchanged via DB polling.
4. WebRTC peer connection established; `AudioContext` merges both audio streams.
5. `MediaRecorder` records the merged stream; on hang-up, recording is uploaded and auto-submitted to the linked Data Project.

---

### 3.4 Tools and Technologies

| Category | Technology |
|---|---|
| **Programming Language** | TypeScript 5 (strict mode) |
| **Frontend Framework** | Next.js 16 (App Router), React 19 |
| **Styling** | Tailwind CSS v4, Lucide React |
| **Backend / API** | Next.js API Route Handlers (serverless functions) |
| **ORM / Database** | Prisma 5, PostgreSQL (Supabase — production), SQLite (development) |
| **Authentication** | NextAuth.js v4 (Credentials + Google OAuth + Apple OAuth), bcryptjs |
| **File Storage** | Vercel Blob CDN (browser-direct upload) |
| **Real-Time Communication** | WebRTC, Web Audio API, MediaRecorder API |
| **AI Assistant** | OpenAI SDK v6 (GPT-3.5-turbo, Server-Sent Events streaming) |
| **Form Validation** | react-hook-form v7, Zod v4 |
| **Data Export** | jsPDF, docx, file-saver |
| **Deployment Platform** | Vercel (serverless hosting + blob storage) |
| **Development OS** | Windows 10 / any platform |
| **Browser Support** | Chrome, Firefox, Edge (WebRTC-compatible) |

---

### 3.5 Implementation Plan

Development proceeds in the following ordered phases:

| Phase | Module | Description |
|---|---|---|
| 1 | Authentication & User Management | Registration, login (credentials + OAuth), JWT sessions, role-based access control, profile management |
| 2 | AI Dataset Collection Core | Data Project creation (admin), file upload with consent, submission tracking, Vercel Blob integration |
| 3 | Admin Review Workflow | Submission review interface, approve/reject with notes, atomic reward crediting via DB transactions |
| 4 | WebRTC Call Recording | Personal call codes, SDP/ICE signalling via DB polling, AudioContext stream merging, MediaRecorder recording, auto-submission |
| 5 | Payments & Withdrawals | Mobile Money withdrawal form, admin payment approval/rejection workflow, balance management |
| 6 | Survey Module | Admin-created paid surveys, user-created free surveys, shareable public links, response submission |
| 7 | AI Assistant (HustleBot) | OpenAI GPT-3.5-turbo integration, user-context injection, streaming SSE responses, navigation commands |
| 8 | Admin Analytics & Exports | Platform statistics dashboard, user export (CSV), response export (PDF/Excel) |

---

### 3.6 Testing and Evaluation Plan

**Test Types:**

- **Unit Testing:** Individual API route handlers tested for correct responses, error handling, and input validation (Zod schema enforcement).
- **Integration Testing:** End-to-end user flow testing: registration → project submission → admin review → withdrawal request → approval.
- **System Testing:** Full platform testing across user roles (contributor and admin) in the production environment.
- **WebRTC Connectivity Testing:** Call recording tested across Wi-Fi and mobile data networks (MTN, Vodafone, AirtelTigo) to validate STUN/TURN relay configuration.
- **Usability Testing:** Structured user acceptance testing (UAT) with a sample cohort of 10–20 Ghanaian participants; task completion and satisfaction measured using the System Usability Scale (SUS).

**Evaluation Metrics:**

| Metric | Measurement Method |
|---|---|
| Task completion rate | % of users successfully completing submission end-to-end |
| System Usability Scale (SUS) score | Post-test SUS questionnaire |
| File upload success rate | Server logs / Vercel Blob upload confirmations |
| WebRTC call connection success rate | Call session status logs (connected vs. failed) |
| Admin review throughput | Average time to approve/reject a submission |
| API response time | Performance benchmarking via browser dev tools / Vercel analytics |

---

### 3.7 Ethical Considerations

- **Informed Consent:** All media submissions require the contributor to actively tick a consent checkbox before upload. Consent is timestamped and stored in the database and cannot be bypassed by the system.
- **Ghana Data Protection Act 2012 (Act 843) Compliance:** Personal data, voice recordings, video, and facial images are processed only for the stated purpose (AI training data). Contributors are informed of this purpose prior to submission.
- **Data Security:** Passwords are hashed using bcryptjs (12 salt rounds). Sessions use JWT tokens in HTTP-only cookies. All communications are encrypted in transit via HTTPS. Media files are stored in a private Vercel Blob bucket with access control.
- **Right to Withdrawal:** Users may request deletion of their submissions. Approved datasets will carry a retention and deletion policy communicated at onboarding.
- **Fairness in Compensation:** The reward-per-submission model ensures transparent, pre-disclosed compensation. Admin approval is required before any deduction, preventing erroneous payments.
- **Bias Considerations:** The platform actively supports multi-language and multi-dialect contributions to reduce the acoustic and demographic bias typical of datasets collected from homogeneous populations.

---

\newpage

## EXPECTED RESULTS/DELIVERABLES

Upon completion of this project, the following deliverables will be produced:

1. **A fully functional, deployed web application** accessible at a public URL on Vercel, supporting all defined features for contributors, administrators, and public users.
2. **AI dataset collection pipeline** capable of receiving, storing, reviewing, and approving voice, video, and facial image submissions from Ghanaian contributors across multiple local languages.
3. **WebRTC conversational recording module** enabling paired call recording and automatic submission to AI data projects.
4. **Admin management panel** with full project, submission, payment, and user management capabilities, including data export functionality (CSV, PDF, Excel).
5. **Ghana Mobile Money withdrawal system** integrated into the contributor earnings wallet.
6. **Relational database schema** (PostgreSQL with 9 models and full migrations) and database documentation (ERD).
7. **Source code repository** with full TypeScript codebase, documented API routes, and deployment configuration.
8. **User manual** covering contributor and admin workflows.
9. **Technical documentation** including system architecture, API reference, database schema, and deployment guide.
10. **Evaluation report** including usability test results (SUS scores, task completion data, participant feedback) and performance benchmarking results.
11. **Final academic report** submitted in accordance with department requirements.

---

\newpage

## TIMELINE/WORK PLAN

| # | Activity | March 2026 | April 2026 | May 2026 | June 2026 | July 2026 | Aug 2026 | Sept 2026 | Oct 2026 |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Topic Approval (by 12th March 2026) | ✓ | | | | | | | |
| 2 | Literature Review | ✓ | ✓ | | | | | | |
| 3 | Requirements Gathering (Questionnaire) | ✓ | ✓ | | | | | | |
| 4 | System Design (ERD, Architecture, Wireframes) | | ✓ | ✓ | | | | | |
| 5 | Phase 1: Auth & User Management | | | ✓ | | | | | |
| 6 | Phase 2–3: Dataset Collection & Review Workflow | | | ✓ | ✓ | | | | |
| 7 | Phase 4: WebRTC Call Recording | | | | ✓ | ✓ | | | |
| 8 | Phase 5–6: Payments & Survey Module | | | | | ✓ | | | |
| 9 | Phase 7–8: AI Assistant & Admin Analytics | | | | | ✓ | ✓ | | |
| 10 | System Integration & Deployment | | | | | | ✓ | | |
| 11 | Testing & Evaluation (UAT) | | | | | | ✓ | ✓ | |
| 12 | Report Writing | | | | | | | ✓ | ✓ |
| 13 | Final Submission & Presentation | | | | | | | | ✓ |

---

\newpage

## BUDGET

| Item | Estimated Cost (GH₵) | Notes |
|---|---|---|
| Internet / Data | 300.00 | Monthly data for development, testing, and deployment |
| Vercel Pro Hosting | 720.00 | ~GH₵720/year (approx. $60 USD) for serverless + blob storage |
| Supabase PostgreSQL | 0.00 | Free tier sufficient for development and MVP |
| OpenAI API Credits (HustleBot) | 120.00 | GPT-3.5-turbo usage for development and testing |
| Printing (Proposal, Interim, Final Report) | 200.00 | Estimated printing cost for academic submissions |
| User Testing Incentives | 200.00 | Token compensation for UAT participants |
| Domain Name (optional) | 100.00 | .com domain annual registration |
| Miscellaneous / Transport | 150.00 | Field visits, meetings, unforeseen expenses |
| **Total Estimated Budget** | **1,790.00** | |

---

\newpage

## REFERENCES

Ardila, R., Branson, M., Davis, K., Kohler, M., Meyer, J., Henretty, M., ... & Ziegler, G. (2020). Common Voice: A massively-multilingual speech corpus. *Proceedings of the 12th Language Resources and Evaluation Conference (LREC 2020)*, 4218–4222.

Bank of Ghana. (2023). *Payment systems report: Annual statistics 2023*. Bank of Ghana. https://www.bog.gov.gh

Ghana Data Protection Commission. (2012). *Data Protection Act, 2012 (Act 843)*. Government of Ghana.

Howe, J. (2006). The rise of crowdsourcing. *Wired Magazine*, 14(6), 1–4.

Ipeirotis, P. G. (2010). Analyzing the Amazon Mechanical Turk marketplace. *XRDS: Crossroads, The ACM Magazine for Students*, 17(2), 16–21. https://doi.org/10.1145/1869086.1869094

Olatunji, T., Wairagala, J., Ogayo, P., Orife, I., Gitau, K., Kahira, A., ... & Feldman, S. (2023). AfriSpeech-200: Pan-African accented speech dataset for clinical and general domain ASR. *Transactions of the Association for Computational Linguistics*, 11, 298–316. https://doi.org/10.1162/tacl_a_00541

Sambasivan, N., Kapania, S., Highfill, H., Akrong, D., Paritosh, P., & Aroyo, L. M. (2021). "Everyone wants to do the model work, not the data work": Data cascades in high-stakes AI. *Proceedings of the 2021 CHI Conference on Human Factors in Computing Systems*, 1–15. https://doi.org/10.1145/3411764.3445518

Wang, A., Prabhu, V., & Liang, P. (2021). *Annotation artifacts in natural language inference data*. Retrieved from https://arxiv.org/abs/1803.02893

---

\newpage

## APPENDICES

### Appendix A — Planned User Questionnaire (Sample Items)

*The following questionnaire will be administered to potential Ghanaian contributors during the requirements gathering phase.*

1. What is your age range? (18–25 / 26–35 / 36–45 / 46+)
2. What device do you primarily use to access the internet? (Smartphone / Laptop / Tablet / Desktop)
3. Do you have access to Mobile Money? If yes, which provider? (MTN / Vodafone / AirtelTigo / None)
4. Which Ghanaian languages do you speak? (Select all that apply: English / Twi / Ga / Ewe / Hausa / Dagbani / Other)
5. Would you be willing to record your voice for AI training purposes in exchange for Mobile Money payment?
6. What minimum payment per voice recording would motivate you to participate?
7. What concerns, if any, would you have about contributing your voice, face, or video recordings online?
8. Have you used any online earning or survey platform before? If yes, which?
9. What features would make an online data contribution platform most trustworthy to you?

---

### Appendix B — Preliminary System Architecture Diagram

*(Full high-level architecture diagram to be included in interim report after design phase.)*

---

### Appendix C — Preliminary Database Entity-Relationship Diagram

*(Full ERD to be included in interim report after design phase.)*

---

### Appendix D — Sample UI Wireframes

*(Login page, contributor dashboard, data project submission page, admin review panel wireframes to be included in interim report after design phase.)*

---

*Submitted in partial fulfilment of the requirements for the award of the degree of Bachelor of Science in Computer Science.*
