# React Report Generator — Handoff Brief

## Project Context

This is the report-generation layer of a MERN-stack SaaS app where sewer inspectors fill a form, preview the report live, and download a PDF. This session's job is ONLY the report renderer and PDF export — not auth, not subscriptions, not the backend API.

Reference files in this folder:
- `report.ejs` — canonical design source. All CSS, layout, page structure comes from here. Do not modify it. Replicate it exactly in React.
- `test-report.json` — complete sample payload. Use it as dev/test data.

---

## Final Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| PDF engine | html2canvas + pdf-lib | Rasterized output = non-editable (client requirement) |
| Puppeteer | Removed entirely | Frontend-only; Puppeteer had issues on test VMs |
| Preview | React renders report live | User sees output before downloading |
| PDF format | US Letter, rasterized images | Baked pixels, nothing selectable or editable |
| Pagination | Two-pass DOM split | See section below |

---

## processData() — Canonical Data Transformer

Implement this exactly in `src/utils/processData.js`. It is the single source of truth — identical on client and server.

```js
const PLACEHOLDER_PHOTO = 'https://placehold.co/800x600/1C2B3A/5A6A7A?text=No+Photo';

const SEV = {
  none:        { severityLabel: 'No Defect',            severitySub: 'Informational',               severityIcon: '🟢', severityCss: 'none'  },
  minor:       { severityLabel: 'Minor Defect',          severitySub: 'Monitor',                     severityIcon: '🟡', severityCss: 'minor' },
  moderate:    { severityLabel: 'Moderate Defect',       severitySub: 'Recommended Action',          severityIcon: '🟠', severityCss: 'mod'   },
  major:       { severityLabel: 'Major Defect',          severitySub: 'Critical / Immediate Action', severityIcon: '🔴', severityCss: 'major' },
  maintenance: { severityLabel: 'Suggested Maintenance', severitySub: 'Preventative Care',           severityIcon: '🔵', severityCss: 'maint' },
};

const PIPE_MATERIALS = [
  { type: 'Standard Dimensional Ratio (SDR)',        life: '50–500 years' },
  { type: 'Polyvinyl Chloride (PVC)',                life: '50–500 years' },
  { type: 'Acrylonitrile Butadiene Styrene (ABS)',   life: '50–500 years' },
  { type: 'Vitrified Clay Pipe / "Terracotta"',      life: '75–100 years' },
  { type: 'Cast Iron',                               life: '75–100 years' },
  { type: 'Concrete',                                life: '50–75 years'  },
  { type: 'Transite / Asbestos Cement',              life: '40–60 years'  },
  { type: 'Bituminous Fiber / "Orangeburg"',         life: '30–50 years'  },
  { type: 'Cured in Place Pipe (CIPP)',              life: '40+ years'    },
  { type: 'High Density Polyethylene (HDR)',         life: '50–500 years' },
  { type: 'Thin Walled PVC / "Genova"',             life: '40–70 years'  },
  { type: 'Galvanized Steel',                        life: '40–70 years'  },
  { type: 'Lead',                                    life: '100+ years'   },
  { type: 'Copper',                                  life: '50+ years'    },
  { type: 'Stainless Steel',                         life: '50+ years'    },
];

function pad(n) { return String(n).padStart(2, '0'); }

function initials(name) {
  return (name || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function resolvePhotos(photos) {
  if (!photos || photos.length === 0) return [PLACEHOLDER_PHOTO];
  return photos.map(url => (url && url.trim()) ? url.trim() : PLACEHOLDER_PHOTO);
}

function photoGridClass(photos) {
  if (photos.length === 1) return 'cols-1';
  if (photos.length === 2) return 'cols-2';
  return 'cols-3';
}

export function processData(raw) {
  const useSeverityScale = raw.useSeverityScale !== false;

  const defects = (raw.defects || []).map((d, i) => {
    const sev    = SEV[d.severity] || SEV.minor;
    const photos = resolvePhotos(d.photos);
    return { ...d, ...sev, num: pad(i + 1), photos, gridClass: photoGridClass(photos) };
  });

  // Page map — pages 1–5 are fixed, defects start at 6
  let nextPage = 6;
  const defectStartPage = nextPage;
  nextPage += defects.length;

  const recPage       = nextPage++;
  const sosPage       = nextPage++;
  const materialsPage = (raw.showMaterialsPage !== false) ? nextPage++ : null;
  const graphicPage   = (raw.showDefectsGraphic !== false && raw.defectsGraphicUrl) ? nextPage++ : null;
  const bioPage       = (raw.showInspectorBio !== false) ? nextPage++ : null;
  const totalPages    = nextPage - 1;

  defects.forEach((d, i) => { d.pageNum = pad(defectStartPage + i); });

  const videoLinks = (raw.videoLinks || []).filter(v => v && v.url);

  const inspectorCredentials = Array.isArray(raw.inspectorCredentials)
    ? raw.inspectorCredentials
    : (raw.inspectorCredentials || '').split('\n').filter(Boolean);

  const inspectorExperience = Array.isArray(raw.inspectorExperience)
    ? raw.inspectorExperience
    : (raw.inspectorExperience || '').split('\n').filter(Boolean);

  return {
    ...raw,
    useSeverityScale,
    companyInitials:   initials(raw.companyName),
    fullAddress:       [raw.propertyAddress, raw.propertyCity].filter(Boolean).join(', '),
    pipeTypesDisplay:  (raw.pipeTypes || []).join(', '),
    defectCount:       pad(defects.length),
    lastPage:          pad(totalPages),
    defects,
    videoLinks,
    inspectorCredentials,
    inspectorExperience,
    sewerSystemPhotos: (raw.sewerSystemPhotos || []).filter(p => p && p.url && p.url.trim()),
    statementOfServiceExtraSections: raw.statementOfServiceExtraSections || [],
    inspectorPhotoUrl: raw.inspectorPhotoUrl || '',
    hasDefects:         defects.length > 0,
    hasVideoLinks:      videoLinks.length > 0,
    hasRecommendations: (raw.recommendations || []).length > 0,
    hasAdditionalNotes: !!(raw.additionalNotes && raw.additionalNotes.trim()),
    showMaterialsPage:  raw.showMaterialsPage !== false,
    showDefectsGraphic: !!(raw.showDefectsGraphic !== false && raw.defectsGraphicUrl),
    showInspectorBio:   raw.showInspectorBio !== false,
    pages: {
      cover: 1, toc: 2, disclosure: 3, clientInfo: 4, severity: 5,
      defectStart: defectStartPage,
      recommendations: recPage,
      statementOfService: sosPage,
      materials: materialsPage,
      defectsGraphic: graphicPage,
      inspectorBio: bioPage,
      total: totalPages,
    },
    pipeMaterials: PIPE_MATERIALS,
  };
}
```

---

## Page Order

| # | Page | Overflow Risk |
|---|---|---|
| 1 | Cover | None — photo fills page |
| 2 | Table of Contents | None — bounded list |
| 3 | Disclosure + Scope + Point of Reference | **HIGH** — 3 user-editable text blocks |
| 4 | Client & Site Info + Sewer System Info | Low |
| 5 | Defect Severity Classification | None — 5 fixed blocks |
| 6–N | One page per defect (title + badge + narrative + photo grid) | None — bounded by design |
| N+1 | Recommendations & Additional Notes | **MEDIUM** — variable item count |
| N+2 | Statement of Service | **HIGH** — 3 paragraphs + optional extra sections |
| N+3 | Pipe Materials Table (optional) | None — fixed rows |
| N+4 | Sewer Defects Graphic (optional) | None — single image |
| N+5 | Meet Your Inspector (optional) | None — bounded |

> **Note:** There is no separate "Camera Log" page. Observations with no defect use severity `none` and appear as regular defect pages (🟢 No Defect badge).

---

## CSS Architecture

All CSS is copied verbatim from `report.ejs` `<style>` block into a CSS module (`report.module.css`). Use CSS variables for theming — inject from data at render time via inline style on the root element.

### Theme variables (from data object)
```css
--color-header-bg:   data.colorHeaderBg   (default #0D2137)
--color-header-text: data.colorHeaderText (default #FFFFFF)
--color-accent:      data.colorAccent     (default #1AAFB4)
--color-accent-dark: data.colorAccentDark (default #0D8A8F)
--color-logo-bg:     data.colorLogoBg     (default #1AAFB4)
```

### Fixed palette variables
```css
--color-page-bg: #FFFFFF
--color-body-text: #1C2B3A
--color-muted: #5A6A7A
--color-border: #D8E3EC
--color-row-alt: #F4F8FB
```

### Severity color variables
```css
--sev-none-clr:  #2D7A4F   --sev-none-bg:  #EAF7EF
--sev-minor-clr: #B58A00   --sev-minor-bg: #FEFAE8
--sev-mod-clr:   #C0520A   --sev-mod-bg:   #FEF3EA
--sev-major-clr: #B91C1C   --sev-major-bg: #FEF0F0
--sev-maint-clr: #1D4ED8   --sev-maint-bg: #EEF3FF
```

### Page geometry
```css
--page-w: 8.5in
--page-h: 11in
--ph: 0.60in   /* horizontal padding */
--pv: 0.50in   /* vertical padding */
```

### Key CSS classes (copy from report.ejs exactly)
- `.page` — page shell: `width: 8.5in; min-height: 11in; display: flex; flex-direction: column; overflow: hidden`
- `.ph` — shared page header (dark bg, logo left, report meta right)
- `.accent-bar` — 3px gradient bar below header
- `.pc` — page content wrapper: `flex: 1; padding: var(--pv) var(--ph); overflow: hidden`
- `.pf` — shared footer (company name left, page number right, legal text below)
- `.sh` — section heading: accent bar + h2 + optional section number
- `.defect` — defect card wrapper
- `.defect-hd` — defect card header row (stripe + banner)
- `.defect-stripe.stripe-{css}` — 6px colored left stripe
- `.defect-banner.banner-{css}` — colored header band with title + badge
- `.defect-badge.badge-{css}` — severity badge (icon + label + sub-label)
- `.defect-body` — narrative + photo grid
- `.photo-grid.cols-1/2/3` — photo grid layout
- `.photo-cell img` — `height: 200px; object-fit: cover`
- `.sev-block.sev-{css}` — severity framework blocks (page 5)
- `.info-tbl` — two-column label/value table
- `.mat-table` — pipe materials reference table
- `.rec-list` / `.rec-item` — recommendations list
- `.bio-list` / `.bio-section` — inspector bio sections
- `.cover-ph` — oversized cover-only header (NOT `.ph`)

---

## Pagination — Two-Pass DOM Split

This is the hardest part. Pages with long text must not clip or bleed.

### Constants
```js
const LETTER_H_PX = 1056;        // 11in × 96dpi
const HEADER_H_PX  = 73;         // .ph height
const ACCENT_H_PX  = 3;          // .accent-bar
const FOOTER_H_PX  = 62;         // .pf height
const PADDING_H_PX = 96;         // --pv top + bottom (0.5in × 2 × 96)
const MAX_CONTENT_H_PX = LETTER_H_PX - HEADER_H_PX - ACCENT_H_PX - FOOTER_H_PX - PADDING_H_PX;
// ≈ 822px of usable content per page
```

### Pass 1 — Natural render
Render all pages with no height constraint (`.page` uses `min-height`, so it grows). React components render normally.

### Pass 2 — Measure & split (universal — every page, no exceptions)
After render, loop over every `.report-page` div. No special-casing — bounded pages just pass through with zero splits and zero cost:
1. Measure `scrollHeight` via ref
2. If `scrollHeight <= LETTER_H_PX`: done, move on
3. If overflowing: walk `.pc` direct children one by one, accumulate `getBoundingClientRect().height`, find the split point where accumulated height exceeds `MAX_CONTENT_H_PX`
4. Clone the page into a new div with the same `.ph` header + `.accent-bar` + fresh `.pf` (auto-incremented page number)
5. Move overflow children into the new page's `.pc`
6. Re-measure and repeat until the page no longer overflows

Implement as a `usePaginationSplit` hook that runs after the first render.

---

## PDF Generation

After pagination resolves (all pages fixed at letter height):

```js
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';

async function exportPDF(pageElements) {
  const pdf = await PDFDocument.create();
  for (const el of pageElements) {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgBytes = await fetch(imgData).then(r => r.arrayBuffer());
    const img = await pdf.embedJpg(imgBytes);
    const page = pdf.addPage([612, 792]); // US Letter in points
    page.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  }
  const bytes = await pdf.save();
  // trigger download
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'report.pdf'; a.click();
}
```

Output is rasterized JPEG — intentionally non-editable per client requirement.

---

## React Component Tree

```
<ReportRenderer data={processedData}>
  <CoverPage />
  <TocPage />
  <DisclosurePage />
  <ClientInfoPage />
  <SeverityPage />
  {defects.map(d => <DefectPage key={d.num} defect={d} />)}
  <RecommendationsPage />
  <StatementOfServicePage />
  {showMaterialsPage && <MaterialsPage />}
  {showDefectsGraphic && <GraphicPage />}
  {showInspectorBio && <BioPage />}
</ReportRenderer>
```

All pages pass through `usePaginationSplit` universally after first render.

Shared sub-components:
- `<PageShell>` — wraps `.page`, renders `.ph` header + `.accent-bar` + `.pc` slot + `.pf` footer
- `<PageHeader>` — `.ph` with logo badge, company name, report/date meta
- `<PageFooter>` — `.pf` with company name, page number, legal text
- `<SectionHeading>` — `.sh` with accent bar, h2, optional section number

---

## Build Order

1. `src/utils/processData.js` — exact copy of function above
2. `src/styles/report.module.css` — copy CSS verbatim from `report.ejs <style>` block
3. `<PageShell>`, `<PageHeader>`, `<PageFooter>`, `<SectionHeading>` shared components
4. Static pages: Cover, TOC, Severity, Materials, Graphic, Bio
5. Text-heavy pages: Disclosure, Recommendations, StatementOfService
6. Defect page (loop)
7. `usePaginationSplit` hook
8. `exportPDF` utility + Download button
9. Wire everything with `test-report.json`

Do NOT build any form UI, sidebar, or input controls — just the renderer and PDF export.

---

## Severity CSS Suffix Map

| severity key | severityCss | stripe / banner / badge class suffix |
|---|---|---|
| none | `none` | `stripe-none`, `banner-none`, `badge-none`, `sev-none` |
| minor | `minor` | `stripe-minor`, `banner-minor`, `badge-minor`, `sev-minor` |
| moderate | `mod` | `stripe-mod`, `banner-mod`, `badge-mod`, `sev-mod` |
| major | `major` | `stripe-major`, `banner-major`, `badge-major`, `sev-major` |
| maintenance | `maint` | `stripe-maint`, `banner-maint`, `badge-maint`, `sev-maint` |
