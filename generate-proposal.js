const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, PageBreak, UnderlineType, LevelFormat,
  NumberingLevel, convertInchesToTwip, PageOrientation,
  Header, Footer, PageNumber, Tab,
} = require('./node_modules/docx');
const fs = require('fs');
const path = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function heading1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E74B5' } },
  });
}

function heading2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  });
}

function heading3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
  });
}

function para(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, font: 'Times New Roman', ...options })],
    spacing: { after: 160, line: 360 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24, font: 'Times New Roman' })],
    bullet: { level: 0 },
    spacing: { after: 100 },
  });
}

function numberedItem(text, num) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${num}. `, bold: true, size: 24, font: 'Times New Roman' }),
      new TextRun({ text, size: 24, font: 'Times New Roman' }),
    ],
    spacing: { after: 120 },
    indent: { left: convertInchesToTwip(0.3) },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function emptyLine() {
  return new Paragraph({ text: '', spacing: { after: 100 } });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function centeredBold(text, size = 28) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size, font: 'Times New Roman' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  });
}

function centered(text, size = 24) {
  return new Paragraph({
    children: [new TextRun({ text, size, font: 'Times New Roman' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  });
}

function makeTable(headers, rows, widths) {
  const defaultBorder = { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' };
  const borders = { top: defaultBorder, bottom: defaultBorder, left: defaultBorder, right: defaultBorder, insideHorizontal: defaultBorder, insideVertical: defaultBorder };

  const headerRow = new TableRow({
    children: headers.map((h, i) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, size: 22, font: 'Times New Roman' })],
          spacing: { after: 60 },
          alignment: AlignmentType.CENTER,
        })],
        width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
        shading: { fill: 'D6E4F7' },
        borders,
      })
    ),
    tableHeader: true,
  });

  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, i) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: cell, size: 22, font: 'Times New Roman' })],
            spacing: { after: 60 },
          })],
          width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
          borders,
        })
      ),
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function labeledPara(label, text) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 24, font: 'Times New Roman' }),
      new TextRun({ text, size: 24, font: 'Times New Roman' }),
    ],
    spacing: { after: 160 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

// ─── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Times New Roman', size: 24 },
        paragraph: { spacing: { line: 360 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 28, color: '1F3864', font: 'Times New Roman' },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 26, color: '2E74B5', font: 'Times New Roman' },
        paragraph: { spacing: { before: 300, after: 150 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 24, color: '2E74B5', font: 'Times New Roman' },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.25),
            right: convertInchesToTwip(1),
          },
        },
      },
      children: [

        // ── COVER PAGE ────────────────────────────────────────────────────────
        emptyLine(),
        emptyLine(),
        centeredBold('UNIVERSITY OF GHANA', 28),
        centeredBold('COLLEGE OF BASIC AND APPLIED SCIENCE', 24),
        centeredBold('DEPARTMENT OF COMPUTER SCIENCE', 24),
        emptyLine(),
        emptyLine(),
        emptyLine(),
        centeredBold('HUSTLECLICKGH: A WEB-BASED AI TRAINING DATA\nCOLLECTION PLATFORM WITH MICRO-EARNING\nINCENTIVES FOR THE GHANAIAN MARKET', 28),
        emptyLine(),
        emptyLine(),
        emptyLine(),
        centered('BY', 24),
        emptyLine(),
        centeredBold('*(YOUR FULL NAME IN CAPS)*', 26),
        emptyLine(),
        emptyLine(),
        centered('A Project Proposal Submitted to the Department of Computer Science,', 24),
        centered('University of Ghana, in Partial Fulfilment of the Requirements', 24),
        centered('for the Award of the Degree of', 24),
        centered('Bachelor of Science in Computer Science', 24),
        emptyLine(),
        emptyLine(),
        centeredBold('2025/2026', 26),
        emptyLine(),
        emptyLine(),
        new Paragraph({
          children: [
            new TextRun({ text: 'Supervisor: ', bold: true, size: 24, font: 'Times New Roman' }),
            new TextRun({ text: 'Michael Kolugu', size: 24, font: 'Times New Roman' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        }),

        pageBreak(),

        // ── TABLE OF CONTENTS ─────────────────────────────────────────────────
        centeredBold('TABLE OF CONTENTS', 26),
        emptyLine(),
        ...[
          ['CHAPTER 1: INTRODUCTION', '4'],
          ['    1.1  Background of Project', '4'],
          ['    1.2  Problem Statement', '4'],
          ['    1.3  General Objective', '5'],
          ['    1.4  Specific Objectives', '5'],
          ['    1.5  Research Questions', '5'],
          ['    1.6  Justification of the Study', '5'],
          ['    1.7  Project Stakeholders', '6'],
          ['    1.8  Scope of the Study', '6'],
          ['    1.9  Assumptions and Constraints', '6'],
          ['CHAPTER 2: LITERATURE REVIEW', '7'],
          ['    2.1  Conceptual Review', '7'],
          ['    2.2  Related Works', '8'],
          ['    2.3  Identified Gap', '9'],
          ['CHAPTER 3: METHODOLOGY', '10'],
          ['    3.1  Project Development Approach', '10'],
          ['    3.2  Requirement Gathering', '10'],
          ['    3.3  Proposed System Design', '10'],
          ['    3.4  Tools and Technologies', '12'],
          ['    3.5  Implementation Plan', '12'],
          ['    3.6  Testing and Evaluation Plan', '13'],
          ['    3.7  Ethical Considerations', '13'],
          ['EXPECTED RESULTS/DELIVERABLES', '14'],
          ['TIMELINE/WORK PLAN', '15'],
          ['BUDGET', '16'],
          ['REFERENCES', '17'],
          ['APPENDICES', '18'],
        ].map(([title, page]) =>
          new Paragraph({
            children: [
              new TextRun({ text: title, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: `\t${page}`, size: 22, font: 'Times New Roman' }),
            ],
            tabStops: [{ type: 'right', position: convertInchesToTwip(5.5) }],
            spacing: { after: 80 },
          })
        ),

        pageBreak(),

        // ── CHAPTER 1: INTRODUCTION ───────────────────────────────────────────
        heading1('CHAPTER 1: INTRODUCTION'),

        heading2('1.1   Background of Project'),
        para('Artificial Intelligence (AI) has emerged as a transformative technology across sectors including healthcare, education, agriculture, and finance. Central to developing effective AI systems is the availability of large, high-quality, and demographically representative training datasets. Systems in speech recognition, natural language processing (NLP), computer vision, and conversational AI all require annotated data that reflects the linguistic and physical characteristics of the populations they serve.'),
        para('Ghana, like much of Sub-Saharan Africa, has a rich linguistic landscape with over 80 spoken languages including Twi (Akan), Ga, Ewe, Hausa, and Dagbani. Yet virtually no large-scale, structured dataset exists that captures Ghanaian speech, facial imagery, or conversational data in these languages. Global initiatives such as Mozilla Common Voice have made progress for widely spoken languages, but Ghanaian and broader West African languages remain critically underrepresented (Ardila et al., 2020).'),
        para('Simultaneously, the proliferation of mobile internet and smartphone usage in Ghana has created a digitally connected population willing to participate in online tasks for compensation. Ghana\'s established Mobile Money ecosystem — dominated by MTN Mobile Money (MoMo), Vodafone Cash, and AirtelTigo Money — provides an accessible and trusted digital payment infrastructure that bypasses the need for traditional banking (Bank of Ghana, 2023).'),
        para('HustleClickGH is a web-based platform designed specifically for the Ghanaian market to address this gap. It crowdsources AI training media — voice recordings, video clips, and facial images — from Ghanaian users by compensating them in Ghana Cedis (GH₵) through Mobile Money. The platform is intentionally scoped to Ghana at this initial phase, with its language targeting, payment infrastructure, and demographic focus all tailored to the Ghanaian context.'),

        heading2('1.2   Problem Statement'),
        para('Despite the growing deployment of AI-powered products and services in Ghana, the development of AI models tailored to the Ghanaian demographic is severely limited by the absence of locally representative training data. Existing global datasets do not capture the acoustic characteristics of Ghanaian speech, the diversity of Ghanaian facial features, or dialogue in Ghanaian languages. Three interconnected challenges motivate this project:'),
        numberedItem('Absence of Ghanaian AI Training Datasets: Locally representative speech corpora, facial image datasets, and conversational audio in Ghanaian languages are largely nonexistent. AI models trained on global datasets perform poorly on Ghanaian speech patterns, accents, and faces.', 1),
        numberedItem('No Incentivised, Ghana-Compatible Collection Pipeline: Existing platforms that compensate contributors for data operate in USD via gateways (PayPal, Wise) that are inaccessible to most Ghanaians, making local participation impractical.', 2),
        numberedItem('Lack of a Managed, Quality-Controlled Workflow: Raw user submissions require review before use in AI training. No localised platform currently provides an end-to-end pipeline from user contribution through admin quality review to an approved, usable dataset.', 3),

        heading2('1.3   General Objective'),
        para('To design, develop, and deploy a Ghana-specific web platform that enables the crowdsourced collection of high-quality, consent-verified AI training data — including voice, video, and facial image datasets — from Ghanaian contributors, compensated through Ghana Mobile Money.'),

        heading2('1.4   Specific Objectives'),
        numberedItem('Design an AI dataset collection module supporting voice, video, and facial image project types, configurable with Ghanaian language options, prompt sets, file constraints, and GH₵ reward amounts per approved submission.', 1),
        numberedItem('Develop a WebRTC-based peer-to-peer call recording system that enables the collection of paired conversational audio data in real time, supporting the creation of dialogue and conversational AI training datasets in Ghanaian languages.', 2),
        numberedItem('Implement an admin-managed quality review workflow in which all submitted media files are individually assessed before any reward is issued, ensuring dataset integrity.', 3),
        numberedItem('Integrate Ghana Mobile Money payment channels (MTN MoMo, Vodafone Cash, AirtelTigo Money) as the primary contributor compensation mechanism with a secure admin-reviewed withdrawal approval process.', 4),
        numberedItem('Enforce data protection and informed consent requirements for all media submissions in compliance with the Ghana Data Protection Act 2012, including timestamped consent records.', 5),
        numberedItem('Evaluate the usability and effectiveness of the platform through user acceptance testing with a cohort of Ghanaian participants.', 6),

        heading2('1.5   Research Questions'),
        numberedItem('How can a web-based platform be designed to effectively crowdsource AI training data (voice, video, and facial images) from Ghanaian users across multiple local languages?', 1),
        numberedItem('Can a WebRTC-based peer-to-peer call recording system reliably capture paired conversational audio suitable for AI training within Ghana\'s mobile network environment?', 2),
        numberedItem('What admin-managed quality review workflow is most effective in ensuring the usability and accuracy of crowdsourced AI training media prior to contributor payment?', 3),
        numberedItem('How can Ghana\'s Mobile Money infrastructure be integrated into a digital contribution platform to provide accessible, trustworthy compensation for Ghanaian users?', 4),
        numberedItem('What level of usability and satisfaction do Ghanaian users report when interacting with an incentivised AI data collection platform?', 5),

        heading2('1.6   Justification of the Study'),
        para('For the Ghanaian AI research community, the platform directly addresses the scarcity of locally sourced AI training datasets, providing speech corpora in Twi, Ga, Hausa, and other Ghanaian languages, as well as demographically representative facial and video datasets. These resources will lower the barrier for researchers and developers seeking to build AI systems for the Ghanaian context.'),
        para('For individual users, the platform provides a legitimate, accessible, and Mobile Money-compatible source of digital income for students, young professionals, and the general public — individuals who currently have no viable entry point into global crowdsourcing markets.'),
        para('For organisations and researchers, academic institutions, NGOs, tech companies, and government agencies conducting research or developing AI products gain a managed, consent-compliant channel for data acquisition with built-in quality control.'),
        para('For national AI development, by building infrastructure for African language data collection, the project contributes to Ghana\'s digital economy and positions the country to participate more meaningfully in global AI development.'),

        heading2('1.7   Project Stakeholders'),
        emptyLine(),
        makeTable(
          ['Stakeholder', 'Role'],
          [
            ['Registered Users (Contributors)', 'Submit voice, video, and facial images; complete surveys; earn and withdraw GH₵ rewards via Mobile Money'],
            ['Administrators', 'Create and manage data collection projects; review and approve or reject submissions; process withdrawal requests'],
            ['Academic Researchers', 'Use the platform to collect survey responses and AI training data for research purposes'],
            ['AI Developers / Organisations', 'Commission data collection projects to build training datasets for Ghanaian-language AI models'],
            ['Mobile Money Providers (MTN, Vodafone, AirtelTigo)', 'Payment infrastructure enabling GH₵ disbursements to contributors'],
            ['Supervisor (Michael Kolugu)', 'Academic oversight and evaluation of the project'],
          ],
          [30, 70]
        ),
        emptyLine(),

        heading2('1.8   Scope of the Study'),
        para('In Scope:'),
        bullet('Web application accessible via desktop and mobile browsers, targeted at Ghanaian users.'),
        bullet('AI dataset collection for three media types: voice recordings, video clips, and facial/image submissions.'),
        bullet('Support for Ghanaian languages: English (Ghanaian accent), Twi, Ga, Hausa, and Dagbani.'),
        bullet('WebRTC-based conversational call recording system for paired audio data collection.'),
        bullet('Admin panel for project management, submission review, and payment processing.'),
        bullet('Ghana Mobile Money withdrawal system (MTN MoMo, Vodafone Cash, AirtelTigo Money).'),
        bullet('Supplementary survey module for paid admin-managed surveys and free user-created surveys with public sharing links.'),
        bullet('Informed consent collection and Ghana Data Protection Act 2012 compliance.'),
        emptyLine(),
        para('Out of Scope:'),
        bullet('Native mobile applications (iOS/Android) — web-only at this phase.'),
        bullet('Automatic AI-based quality assessment of submissions — all review is manual.'),
        bullet('Expansion to languages or payment systems outside Ghana — reserved for future phases.'),
        bullet('Direct real-time API integration with Mobile Money providers — withdrawals are processed manually.'),
        bullet('On-platform model training pipelines — the platform collects and stores data only.'),

        heading2('1.9   Assumptions and Constraints'),
        para('Assumptions:'),
        bullet('Users have access to a smartphone or computer with a microphone, camera, and internet connection.'),
        bullet('Ghana\'s Mobile Money infrastructure remains stable and accessible for payment disbursements.'),
        bullet('Contributors are willing to grant informed consent for their data to be used in AI training.'),
        bullet('Admin reviewers have sufficient context and instructions to evaluate submission quality.'),
        emptyLine(),
        para('Constraints:'),
        bullet('The project is time-bound by the 2025/2026 academic year.'),
        bullet('Development is carried out by a single developer, limiting parallel workstream capacity.'),
        bullet('Real-time automated Mobile Money API integration is deferred due to API access cost and complexity.'),
        bullet('WebRTC call quality is dependent on user internet connection stability, particularly on mobile networks.'),

        pageBreak(),

        // ── CHAPTER 2: LITERATURE REVIEW ─────────────────────────────────────
        heading1('CHAPTER 2: LITERATURE REVIEW'),

        heading2('2.1   Conceptual Review'),
        para('Crowdsourcing refers to the practice of outsourcing tasks traditionally performed by specialists to a large, undefined group of people via an open call, typically using the internet (Howe, 2006). In the context of AI dataset creation, crowdsourcing enables rapid collection of diverse, human-generated labelled data at scale.'),
        para('AI Training Data encompasses the annotated examples used to train machine learning models. For speech-based AI, this includes audio recordings paired with transcriptions. For computer vision, it includes images annotated with labels such as face identity, emotion, or demographic attributes. The quality, diversity, and representativeness of training data directly determine the performance and fairness of the resulting model (Sambasivan et al., 2021).'),
        para('Micro-earning platforms are digital systems that compensate users for completing small, structured tasks (micro-tasks) online. Compensation is typically modest per task but cumulative in volume, relying on a large and motivated contributor base.'),
        para('Mobile Money refers to financial services operating via mobile networks without requiring a traditional bank account. In Ghana, it is the dominant digital payment channel, with over 19 million active Mobile Money accounts as of 2023 (Bank of Ghana, 2023).'),
        para('WebRTC (Web Real-Time Communication) is an open-source protocol standard supported natively in modern browsers that enables peer-to-peer audio, video, and data communication without plugins. Its relevance to this project lies in enabling conversational audio to be recorded directly in the browser without external software.'),
        para('The Ghana Data Protection Act 2012 (Act 843) governs the collection, storage, and processing of personal data in Ghana. It requires that data subjects give freely informed consent before their personal data is collected or processed, and mandates that data is used only for the purpose stated at the point of collection.'),

        heading2('2.2   Related Works'),

        heading3('Mozilla Common Voice (Ardila et al., 2020)'),
        para('Mozilla Common Voice is an open-source, community-driven project for collecting multilingual speech data. Contributors record and validate short sentences through a web interface, supporting over 100 languages and accumulating thousands of hours of audio. Strengths include massive scale, open datasets, and browser-native recording. Weaknesses include the absence of financial compensation for contributors, limited African language support, no project-level organisation for targeted collection, and no admin review workflow.'),

        heading3('AfriSpeech-200 (Olatunji et al., 2023)'),
        para('AfriSpeech-200 is a 200-hour pan-African clinical and non-clinical speech dataset covering 120 African accents across 13 countries, including some Ghanaian accents. It was collected via a structured crowdsourcing approach with professional contributors and benchmarked with OpenAI\'s Whisper model. While its focus on African accents is a notable strength, it is a research-grade initiative with no public self-service contributor platform, no compensation mechanism for individual contributors, and no conversational or video data components.'),

        heading3('Amazon Mechanical Turk (Ipeirotis, 2010)'),
        para('MTurk is the most widely used crowdsourcing marketplace, enabling requesters to post Human Intelligence Tasks (HITs) for a global workforce for pay. Strengths include a large global worker base, flexible task types, and API integration. Weaknesses relevant to this project include USD-only payments inaccessible to most Ghanaians, no Ghanaian language targeting, no built-in media recording capability, and documented worker exploitation concerns.'),

        heading3('Prolific Academic'),
        para('Prolific is an online research participant recruitment platform used primarily by academic researchers. Participants are paid to complete studies and surveys. While it maintains high ethical standards and provides pre-screened respondents, it is not accessible to Ghanaian participants (payment via PayPal/bank transfer only), supports no media recording tasks, and offers no local language support.'),

        heading3('Appen (Wang et al., 2021)'),
        para('Appen is a commercial AI training data company that crowdsources linguistic, audio, and image annotation tasks globally. It supports a wide range of task types and achieves high data quality through proprietary quality control systems. However, it is a closed commercial platform unavailable to small researchers or open contributors, uses international payment methods only, and offers no Ghana-specific targeting or publicly accessible contribution interface.'),

        heading2('2.3   Identified Gap'),
        para('A review of existing platforms reveals a consistent pattern: while tools exist for crowdsourced data collection and contributor compensation, none combine Ghanaian-language targeting, Mobile Money payment integration, conversational audio recording via WebRTC, and a quality-controlled admin review workflow within a single accessible platform. Mozilla Common Voice and AfriSpeech-200 address African data scarcity but lack incentive structures. MTurk and Prolific compensate contributors but are financially inaccessible to Ghanaians. Appen achieves data quality but is a closed commercial system. HustleClickGH is proposed to fill this intersection — a locally accessible, Ghana Mobile Money-compensated, quality-controlled AI dataset collection platform built specifically for the Ghanaian market.'),

        pageBreak(),

        // ── CHAPTER 3: METHODOLOGY ────────────────────────────────────────────
        heading1('CHAPTER 3: METHODOLOGY'),

        heading2('3.1   Project Development Approach'),
        para('This project adopts the Agile development methodology, specifically an iterative, feature-driven approach. Agile is chosen because the project involves multiple independent feature modules (dataset collection, WebRTC recording, surveys, payments), each of which can be developed and tested incrementally. Requirements in emerging AI data markets may evolve as user feedback is gathered, and continuous testing after each module reduces integration risk. Each iteration delivers a working module, beginning with core authentication and data management, progressing to the primary dataset collection features, and culminating in full integration and user testing.'),

        heading2('3.2   Requirement Gathering'),
        para('Requirements were gathered and will continue to be gathered through the following methods:'),
        bullet('Document Review: Analysis of existing similar platforms (Mozilla Common Voice, MTurk, Prolific, Appen) to identify feature benchmarks, limitations, and gaps.'),
        bullet('Review of Legislation: Study of the Ghana Data Protection Act 2012 (Act 843) to identify consent and data handling requirements.'),
        bullet('Technical Research: Review of WebRTC specifications, Next.js documentation, Prisma ORM documentation, and Vercel Blob storage API to confirm technical feasibility.'),
        bullet('Questionnaire (Planned): A structured questionnaire will be administered to a sample of potential Ghanaian users to assess willingness to contribute, preferred devices, language preferences, and expectations around compensation. (See Appendix A.)'),

        heading2('3.3   Proposed System Design'),

        heading3('Architecture Overview'),
        para('The system follows a three-tier client-server architecture deployed on Vercel:'),
        bullet('Presentation Layer: React 19 components with Next.js 16 App Router (server-side rendering), styled using Tailwind CSS v4. Three UI surfaces: public marketing site, authenticated user dashboard, and admin panel.'),
        bullet('Application Layer: Next.js API Route Handlers (serverless functions) handle all business logic including authentication, reward processing, file coordination, and WebRTC signalling across 40+ API endpoints.'),
        bullet('Data Layer: Prisma 5 ORM with PostgreSQL (Supabase) in production. Media files are stored on Vercel Blob CDN via browser-direct upload, bypassing serverless payload limits.'),

        heading3('Database Design — Key Models'),
        emptyLine(),
        makeTable(
          ['Model', 'Purpose'],
          [
            ['User', 'Stores contributor and admin accounts, GH₵ balance, referral code, and personal call code'],
            ['DataProject', 'AI dataset collection projects (voice, video, face) with reward, language, and file constraints'],
            ['DataSubmission', 'Individual media submission records: file URL, status (pending/approved/rejected), consent timestamp'],
            ['CallSession', 'WebRTC signalling: SDP offer/answer, ICE candidates, call status'],
            ['Survey', 'Admin and user-created surveys with questions and reward settings'],
            ['SurveyQuestion', 'Individual question records linked to a survey (text, multiple-choice, rating, yes/no)'],
            ['SurveyResponse', 'User responses to surveys with reward tracking'],
            ['Withdrawal', 'GH₵ withdrawal requests with Mobile Money details and approval status'],
            ['Referral', 'Records of referral relationships and earned bonuses'],
          ],
          [25, 75]
        ),
        emptyLine(),

        heading3('AI Dataset Submission Flow'),
        numberedItem('Admin creates a Data Project specifying type (voice/video/face), language options, prompts, reward, and file constraints.', 1),
        numberedItem('User browses active projects, selects one, and reads the step-by-step instructions.', 2),
        numberedItem('User grants explicit informed consent (checkbox); consent timestamp is saved to the database.', 3),
        numberedItem('User uploads media file directly from the browser to Vercel Blob CDN; only metadata is sent to the backend.', 4),
        numberedItem('Submission record is created in the database with status = pending. No reward is issued yet.', 5),
        numberedItem('Admin reviews the file in the admin panel, then approves or rejects with written notes.', 6),
        numberedItem('On approval, a database transaction atomically credits the user\'s GH₵ balance and increments the project submission counter.', 7),
        numberedItem('User withdraws earnings via Mobile Money; admin processes and confirms payment.', 8),
        emptyLine(),

        heading3('WebRTC Conversational Recording Flow'),
        numberedItem('User A enters User B\'s 5-character Personal Call Code; SDP offer is stored in the database.', 1),
        numberedItem('User B\'s browser polls for incoming calls every 2 seconds; a full-screen notification with ringtone is displayed.', 2),
        numberedItem('User B accepts; SDP answer and ICE candidates are exchanged via database polling. STUN/TURN relays (Google + OpenRelay) handle NAT traversal for mobile carrier networks.', 3),
        numberedItem('Once the WebRTC peer connection is established, both audio streams are merged using the Web Audio API\'s AudioContext and recorded with the MediaRecorder API.', 4),
        numberedItem('On hang-up, the mixed recording is assembled, uploaded to Vercel Blob, and auto-submitted to the linked Data Project as a standard voice submission.', 5),

        heading2('3.4   Tools and Technologies'),
        emptyLine(),
        makeTable(
          ['Layer / Category', 'Technology'],
          [
            ['Frontend Framework', 'Next.js 16 (App Router), React 19, TypeScript 5 (strict mode)'],
            ['Styling', 'Tailwind CSS v4, Lucide React (icon library)'],
            ['Backend / API', 'Next.js API Route Handlers (serverless functions)'],
            ['ORM / Database', 'Prisma 5, PostgreSQL via Supabase (production), SQLite (development)'],
            ['Authentication', 'NextAuth.js v4 (Credentials + Google + Apple OAuth), bcryptjs (12-round hashing)'],
            ['File Storage', 'Vercel Blob CDN (browser-direct upload)'],
            ['Real-Time Communication', 'WebRTC, Web Audio API, MediaRecorder API'],
            ['AI Assistant', 'OpenAI SDK v6 — GPT-3.5-turbo with Server-Sent Events streaming'],
            ['Form Validation', 'react-hook-form v7, Zod v4 schema validation'],
            ['Data Export', 'jsPDF, jspdf-autotable, docx v9, file-saver'],
            ['Charts / Analytics', 'Recharts v3'],
            ['Deployment Platform', 'Vercel (serverless hosting + blob storage)'],
            ['Browser Compatibility', 'Chrome, Firefox, Edge (all WebRTC-compatible)'],
          ],
          [35, 65]
        ),
        emptyLine(),

        heading2('3.5   Implementation Plan'),
        emptyLine(),
        makeTable(
          ['Phase', 'Module', 'Description'],
          [
            ['1', 'Authentication & User Management', 'Registration, login (credentials + OAuth), JWT sessions, role-based access control, profile management'],
            ['2', 'AI Dataset Collection Core', 'Data Project creation (admin), file upload with consent enforcement, Vercel Blob integration, submission tracking'],
            ['3', 'Admin Review Workflow', 'Submission review interface, approve/reject with notes, atomic GH₵ reward crediting via DB transactions'],
            ['4', 'WebRTC Call Recording', 'Personal call codes, SDP/ICE signalling, AudioContext stream merging, MediaRecorder recording, auto-submission'],
            ['5', 'Payments & Withdrawals', 'Mobile Money withdrawal form, admin approval/rejection workflow, balance management'],
            ['6', 'Survey Module', 'Admin-created paid surveys, user-created free surveys, shareable public links, response submission'],
            ['7', 'AI Assistant (HustleBot)', 'OpenAI GPT-3.5-turbo integration, user-context injection, streaming SSE responses, in-app navigation commands'],
            ['8', 'Admin Analytics & Exports', 'Platform statistics dashboard, user export (CSV), response export (PDF/Excel)'],
          ],
          [8, 28, 64]
        ),
        emptyLine(),

        heading2('3.6   Testing and Evaluation Plan'),
        para('The following test types will be carried out:'),
        bullet('Unit Testing: Individual API route handlers tested for correct responses, error handling, and input validation (Zod schema enforcement).'),
        bullet('Integration Testing: End-to-end user flow testing: registration → project submission → admin review → withdrawal request → approval.'),
        bullet('System Testing: Full platform testing across user roles (contributor and admin) in the production environment on Vercel.'),
        bullet('WebRTC Connectivity Testing: Call recording tested across Wi-Fi and mobile data networks (MTN, Vodafone, AirtelTigo) to validate STUN/TURN relay configuration.'),
        bullet('Usability Testing (UAT): Structured testing with 10–20 Ghanaian participants; task completion and satisfaction measured using the System Usability Scale (SUS).'),
        emptyLine(),
        makeTable(
          ['Evaluation Metric', 'Measurement Method'],
          [
            ['Task completion rate', 'Percentage of users successfully completing the full submission flow end-to-end'],
            ['System Usability Scale (SUS) score', 'Post-test SUS questionnaire administered to UAT participants'],
            ['File upload success rate', 'Server logs and Vercel Blob upload confirmation records'],
            ['WebRTC connection success rate', 'Call session status logs (connected vs. failed)'],
            ['Admin review throughput', 'Average time to approve or reject a submission'],
            ['API response time', 'Performance benchmarking via Vercel Analytics and browser developer tools'],
          ],
          [40, 60]
        ),
        emptyLine(),

        heading2('3.7   Ethical Considerations'),
        bullet('Informed Consent: All media submissions require the contributor to actively tick a consent checkbox before upload. Consent is timestamped and stored in the database and cannot be bypassed.'),
        bullet('Ghana Data Protection Act 2012 (Act 843) Compliance: Personal data, voice recordings, video, and facial images are processed only for the stated purpose (AI training). Contributors are informed of this purpose prior to submission.'),
        bullet('Data Security: Passwords are hashed using bcryptjs (12 salt rounds). Sessions use JWT tokens in HTTP-only cookies. All communications are encrypted in transit via HTTPS. Media files are stored in a private Vercel Blob bucket with access control.'),
        bullet('Right to Withdrawal: Users may request deletion of their submissions before approval. A data retention and deletion policy is communicated during onboarding.'),
        bullet('Fairness in Compensation: Reward amounts are pre-disclosed per project. Admin approval is required before any payment is issued, preventing erroneous payments.'),
        bullet('Bias Reduction: The platform actively supports multi-language and multi-dialect contributions to reduce the acoustic and demographic bias typical of datasets collected from homogeneous populations.'),

        pageBreak(),

        // ── EXPECTED RESULTS ──────────────────────────────────────────────────
        heading1('EXPECTED RESULTS / DELIVERABLES'),
        para('Upon completion of this project, the following deliverables will be produced:'),
        numberedItem('A fully functional, deployed web application accessible at a public URL on Vercel, supporting all defined features for contributors, administrators, and public users.', 1),
        numberedItem('An AI dataset collection pipeline capable of receiving, storing, reviewing, and approving voice, video, and facial image submissions from Ghanaian contributors across multiple local languages.', 2),
        numberedItem('A WebRTC conversational recording module enabling paired call recording and automatic submission to AI data projects.', 3),
        numberedItem('An admin management panel with full project, submission, payment, and user management capabilities, including data export functionality (CSV, PDF, Excel).', 4),
        numberedItem('A Ghana Mobile Money withdrawal system integrated into the contributor earnings wallet.', 5),
        numberedItem('A relational database schema (PostgreSQL with 9 models and full migrations) with accompanying database documentation and ERD.', 6),
        numberedItem('Source code repository with full TypeScript codebase, documented API routes (40+), and deployment configuration.', 7),
        numberedItem('A user manual covering contributor onboarding and admin workflows.', 8),
        numberedItem('Technical documentation including system architecture, API reference, database schema, and deployment guide.', 9),
        numberedItem('Evaluation report including usability test results (SUS scores, task completion data, participant feedback) and performance benchmarking results.', 10),
        numberedItem('Final academic report submitted in accordance with University of Ghana department requirements.', 11),

        pageBreak(),

        // ── TIMELINE ─────────────────────────────────────────────────────────
        heading1('TIMELINE / WORK PLAN'),
        emptyLine(),
        makeTable(
          ['Activity', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'],
          [
            ['Topic Approval (by 12th March 2026)', '✓', '', '', '', '', '', '', ''],
            ['Literature Review', '✓', '✓', '', '', '', '', '', ''],
            ['Requirements Gathering', '✓', '✓', '', '', '', '', '', ''],
            ['System Design (ERD, Architecture, Wireframes)', '', '✓', '✓', '', '', '', '', ''],
            ['Phase 1: Auth & User Management', '', '', '✓', '', '', '', '', ''],
            ['Phase 2–3: Dataset Collection & Review', '', '', '✓', '✓', '', '', '', ''],
            ['Phase 4: WebRTC Call Recording', '', '', '', '✓', '✓', '', '', ''],
            ['Phase 5–6: Payments & Survey Module', '', '', '', '', '✓', '', '', ''],
            ['Phase 7–8: AI Assistant & Admin Panel', '', '', '', '', '✓', '✓', '', ''],
            ['System Integration & Deployment', '', '', '', '', '', '✓', '', ''],
            ['Testing & Evaluation (UAT)', '', '', '', '', '', '✓', '✓', ''],
            ['Report Writing', '', '', '', '', '', '', '✓', '✓'],
            ['Final Submission & Presentation', '', '', '', '', '', '', '', '✓'],
          ],
          [24, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5]
        ),
        emptyLine(),

        pageBreak(),

        // ── BUDGET ────────────────────────────────────────────────────────────
        heading1('BUDGET'),
        emptyLine(),
        makeTable(
          ['Item', 'Estimated Cost (GH₵)', 'Notes'],
          [
            ['Internet / Mobile Data', '300.00', 'Monthly data for development, testing, and deployment throughout the project'],
            ['Vercel Pro Hosting', '720.00', 'Approx. GH₵720/year (~$60 USD) for serverless functions and Blob storage'],
            ['Supabase PostgreSQL', '0.00', 'Free tier sufficient for development and MVP phase'],
            ['OpenAI API Credits (HustleBot)', '120.00', 'GPT-3.5-turbo usage for development and UAT testing'],
            ['Printing (Proposal, Interim, Final Report)', '200.00', 'Estimated printing and binding cost for academic submissions'],
            ['User Testing Incentives', '200.00', 'Token compensation for User Acceptance Testing (UAT) participants'],
            ['Domain Name (optional)', '100.00', '.com domain annual registration'],
            ['Miscellaneous / Transport', '150.00', 'Meetings, unforeseen expenses, field activities'],
            ['TOTAL', '1,790.00 GH₵', ''],
          ],
          [40, 25, 35]
        ),
        emptyLine(),

        pageBreak(),

        // ── REFERENCES ───────────────────────────────────────────────────────
        heading1('REFERENCES'),
        emptyLine(),
        para('Ardila, R., Branson, M., Davis, K., Kohler, M., Meyer, J., Henretty, M., & Ziegler, G. (2020). Common Voice: A massively-multilingual speech corpus. Proceedings of the 12th Language Resources and Evaluation Conference (LREC 2020), 4218–4222.'),
        para('Bank of Ghana. (2023). Payment systems report: Annual statistics 2023. Bank of Ghana.'),
        para('Ghana Data Protection Commission. (2012). Data Protection Act, 2012 (Act 843). Government of Ghana.'),
        para('Howe, J. (2006). The rise of crowdsourcing. Wired Magazine, 14(6), 1–4.'),
        para('Ipeirotis, P. G. (2010). Analyzing the Amazon Mechanical Turk marketplace. XRDS: Crossroads, The ACM Magazine for Students, 17(2), 16–21. https://doi.org/10.1145/1869086.1869094'),
        para('Olatunji, T., Wairagala, J., Ogayo, P., Orife, I., Gitau, K., Kahira, A., & Feldman, S. (2023). AfriSpeech-200: Pan-African accented speech dataset for clinical and general domain ASR. Transactions of the Association for Computational Linguistics, 11, 298–316. https://doi.org/10.1162/tacl_a_00541'),
        para('Sambasivan, N., Kapania, S., Highfill, H., Akrong, D., Paritosh, P., & Aroyo, L. M. (2021). "Everyone wants to do the model work, not the data work": Data cascades in high-stakes AI. Proceedings of the 2021 CHI Conference on Human Factors in Computing Systems, 1–15. https://doi.org/10.1145/3411764.3445518'),
        para('Wang, A., Prabhu, V., & Liang, P. (2021). Annotation artifacts in natural language inference data. Retrieved from https://arxiv.org/abs/1803.02893'),

        pageBreak(),

        // ── APPENDICES ───────────────────────────────────────────────────────
        heading1('APPENDICES'),

        heading2('Appendix A — Planned User Questionnaire (Sample Items)'),
        para('The following questionnaire will be administered to potential Ghanaian contributors during the requirements gathering phase:'),
        numberedItem('What is your age range? (18–25 / 26–35 / 36–45 / 46+)', 1),
        numberedItem('What device do you primarily use to access the internet? (Smartphone / Laptop / Tablet / Desktop)', 2),
        numberedItem('Do you have access to Mobile Money? If yes, which provider? (MTN / Vodafone / AirtelTigo / None)', 3),
        numberedItem('Which Ghanaian languages do you speak? (Select all that apply: English / Twi / Ga / Ewe / Hausa / Dagbani / Other)', 4),
        numberedItem('Would you be willing to record your voice for AI training purposes in exchange for Mobile Money payment? (Yes / No / Maybe)', 5),
        numberedItem('What minimum payment per voice recording would motivate you to participate?', 6),
        numberedItem('What concerns, if any, would you have about contributing your voice, face, or video recordings online?', 7),
        numberedItem('Have you used any online earning or survey platform before? If yes, which?', 8),
        numberedItem('What features would make an online data contribution platform most trustworthy to you?', 9),

        heading2('Appendix B — System Architecture Diagram'),
        para('Full high-level architecture diagram to be included in the interim report following the design phase.'),

        heading2('Appendix C — Entity-Relationship Diagram (ERD)'),
        para('Full ERD covering all 9 database models to be included in the interim report following the design phase.'),

        heading2('Appendix D — Sample UI Wireframes'),
        para('Wireframes for the login page, contributor dashboard, data project submission page, and admin review panel to be included in the interim report following the design phase.'),

        heading2('Appendix E — Consent Form Template'),
        para('A copy of the data collection consent form shown to contributors at the point of media submission, to be included as a formal appendix in the final project report.'),

      ],
    },
  ],
});

// ─── Write File ───────────────────────────────────────────────────────────────

Packer.toBuffer(doc).then((buffer) => {
  const outputPath = path.join(__dirname, 'HustleClickGH_Project_Proposal.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✓ Document saved to: ${outputPath}`);
});
