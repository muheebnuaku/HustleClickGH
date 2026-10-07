// Browser-only: download a project's submissions as one ZIP, arranged as
//   <Project>/<Team>/<USERCODE - Name>/<n>-<file>
//   …/details.json   (submission details, metadata answers, location, capture data)
//   <Project>/manifest.csv
// Files are streamed into the ZIP one at a time (client-zip), so the browser
// doesn't hold every file in memory at once while building it.

import { downloadZip } from "client-zip";

export interface ZipSubmission {
  id: string;
  status: string;
  submittedAt: string;
  language: string | null;
  gender?: string | null;
  metadata?: string | null;
  location?: string | null;
  captureData?: string | null;
  clientVerdict?: string | null;
  files: { url: string; name: string; type: string }[];
  user: { userId: string; fullName: string };
  team?: { name: string } | null;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "untitled";
const parse = (raw?: string | null) => { if (!raw) return null; try { return JSON.parse(raw); } catch { return raw; } };

export async function downloadSubmissionsZip(projectTitle: string, subs: ZipSubmission[], onProgress?: (done: number, total: number) => void) {
  const root = safe(projectTitle);
  const total = subs.reduce((n, s) => n + s.files.length, 0);
  let done = 0;
  const rows: string[][] = [["submission_id", "status", "client_verdict", "contributor", "contributor_name", "team", "submitted_at", "folder", "files"]];

  async function* entries() {
    for (const s of subs) {
      const folder = `${root}/${safe(s.team ? `Team - ${s.team.name}` : "No team")}/${safe(`${s.user.userId} - ${s.user.fullName}`)}${subs.filter((x) => x.user.userId === s.user.userId).length > 1 ? `/${safe(s.id.slice(-6))}` : ""}`;
      const names: string[] = [];
      for (let i = 0; i < s.files.length; i++) {
        const f = s.files[i];
        const name = `${i + 1}-${safe(f.name)}`;
        names.push(name);
        // One unreachable file shouldn't sink the whole ZIP — leave a note in its place.
        let res: Response | null = null;
        try { res = await fetch(f.url); } catch { res = null; }
        if (res?.ok) yield { name: `${folder}/${name}`, input: res };
        else yield { name: `${folder}/${name}.MISSING.txt`, input: `Could not download ${f.url}${res ? ` (HTTP ${res.status})` : " (network error)"}` };
        onProgress?.(++done, total);
      }
      yield {
        name: `${folder}/details.json`,
        input: JSON.stringify({
          submissionId: s.id, status: s.status, clientVerdict: s.clientVerdict ?? null, submittedAt: s.submittedAt,
          contributor: s.user.userId, team: s.team?.name ?? null, language: s.language, gender: s.gender ?? null,
          details: parse(s.metadata), location: parse(s.location), capture: parse(s.captureData), files: names,
        }, null, 2),
      };
      rows.push([s.id, s.status, s.clientVerdict ?? "", s.user.userId, s.user.fullName, s.team?.name ?? "", s.submittedAt, folder, names.join(" ")]);
    }
    yield { name: `${root}/manifest.csv`, input: "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") };
  }

  const blob = await downloadZip(entries()).blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${root}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
