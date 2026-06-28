'use strict';

const express   = require('express');
const fs        = require('fs');
const path      = require('path');
const ejs       = require('ejs');
const puppeteer = require('puppeteer');
const os        = require('os');
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname)); // serves report.ejs, preview.html, assets

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const PLACEHOLDER_PHOTO = 'https://placehold.co/800x600/1C2B3A/5A6A7A?text=No+Photo';

const SEV = {
  none:        { severityLabel: 'No Defect',            severitySub: 'Informational',               severityIcon: '🟢', severityCss: 'none'  },
  minor:       { severityLabel: 'Minor Defect',          severitySub: 'Monitor',                     severityIcon: '🟡', severityCss: 'minor' },
  moderate:    { severityLabel: 'Moderate Defect',       severitySub: 'Recommended Action',          severityIcon: '🟠', severityCss: 'mod'   },
  major:       { severityLabel: 'Major Defect',          severitySub: 'Critical / Immediate Action', severityIcon: '🔴', severityCss: 'major' },
  maintenance: { severityLabel: 'Suggested Maintenance', severitySub: 'Preventative Care',           severityIcon: '🔵', severityCss: 'maint' },
};

// Pipe material life expectancy — static reference table
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

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

function initials(name) {
  return (name || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function resolvePhotos(photos) {
  // Guarantee every slot has a real URL — blanks become placeholder
  if (!photos || photos.length === 0) return [PLACEHOLDER_PHOTO];
  return photos.map(url => (url && url.trim()) ? url.trim() : PLACEHOLDER_PHOTO);
}

function photoGridClass(photos) {
  const count = photos.length;
  if (count === 1) return 'cols-1';
  if (count === 2) return 'cols-2';
  return 'cols-3';
}

// ─────────────────────────────────────────────
// CORE DATA PROCESSOR
// Called identically from both the API endpoint
// and exported for preview.html to replicate via
// the shared processData() function below.
// ─────────────────────────────────────────────

function processData(raw) {
  const useSeverityScale = raw.useSeverityScale !== false;

  // ── Defects ──────────────────────────────────
  const defects = (raw.defects || []).map((d, i) => {
    const sev     = SEV[d.severity] || SEV.minor;
    const photos  = resolvePhotos(d.photos);
    return {
      ...d,
      ...sev,
      num:       pad(i + 1),
      photos,
      gridClass: photoGridClass(photos),
      hasPhotos: true, // always true now — placeholders fill gaps
    };
  });

  // ── Page map — single source of truth ─────────
  // Pages: 1=Cover, 2=TOC, 3=Disclosure, 4=Client+Sewer,
  //        5=Severity Scale, 6+=Defect pages, then Rec, SoS, Materials, Graphic, Bio
  // Note: No separate camera log page — "no defect" findings use severity=none
  let nextPage = 6;

  const defectStartPage = nextPage;
  nextPage += defects.length;

  const recPage         = nextPage++;
  const sosPage         = nextPage++;
  const materialsPage   = (raw.showMaterialsPage !== false) ? nextPage++ : null;
  const graphicPage     = (raw.showDefectsGraphic !== false && raw.defectsGraphicUrl) ? nextPage++ : null;
  const bioPage         = (raw.showInspectorBio !== false) ? nextPage++ : null;
  const totalPages      = nextPage - 1;

  // Attach page numbers back to defect objects
  defects.forEach((d, i) => { d.pageNum = pad(defectStartPage + i); });

  // ── Video links ───────────────────────────────
  const videoLinks = (raw.videoLinks || []).filter(v => v && v.url);
  const inspectorCredentials = Array.isArray(raw.inspectorCredentials)
    ? raw.inspectorCredentials
    : (raw.inspectorCredentials || '').split('\n').filter(Boolean);

  const inspectorExperience = Array.isArray(raw.inspectorExperience)
    ? raw.inspectorExperience
    : (raw.inspectorExperience || '').split('\n').filter(Boolean);

  return {
    // ── pass-through raw fields ──
    ...raw,
    useSeverityScale,

    // ── derived display fields ──
    companyInitials:   initials(raw.companyName),
    fullAddress:       [raw.propertyAddress, raw.propertyCity].filter(Boolean).join(', '),
    pipeTypesDisplay:  (raw.pipeTypes || []).join(', '),
    defectCount:       pad(defects.length),
    lastPage:          pad(totalPages),

    // ── processed arrays ──
    defects,
    videoLinks,
    inspectorCredentials,
    inspectorExperience,

    // ── new fields ──
    sewerSystemPhotos: (raw.sewerSystemPhotos || []).filter(p => p && p.url && p.url.trim()),
    statementOfServiceExtraSections: raw.statementOfServiceExtraSections || [],
    inspectorPhotoUrl: raw.inspectorPhotoUrl || '',

    // ── flags ──
    hasDefects:         defects.length > 0,
    hasVideoLinks:      videoLinks.length > 0,
    hasRecommendations: (raw.recommendations || []).length > 0,
    hasAdditionalNotes: !!(raw.additionalNotes && raw.additionalNotes.trim()),
    showMaterialsPage:  raw.showMaterialsPage !== false,
    showDefectsGraphic: !!(raw.showDefectsGraphic !== false && raw.defectsGraphicUrl),
    showInspectorBio:   raw.showInspectorBio !== false,

    // ── page numbers ──
    pages: {
      cover:        1,
      toc:          2,
      disclosure:   3,
      clientInfo:   4,
      severity:     5,
      defectStart:  defectStartPage,
      recommendations: recPage,
      statementOfService: sosPage,
      materials:    materialsPage,
      defectsGraphic: graphicPage,
      inspectorBio: bioPage,
      total:        totalPages,
    },

    // ── static reference table ──
    pipeMaterials: PIPE_MATERIALS,
  };
}

// Export so preview.html can fetch it via /api/process-data
app.post('/api/process-data', (req, res) => {
  try {
    res.json(processData(req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// Cross-platform Chromium executable path detection
function getChromiumPath() {
    const platform = os.platform();
    
    switch (platform) {
        case 'win32':
            // Windows - try common installation paths
            const possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files\\Chromium\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe'
            ];
            for (const p of possiblePaths) {
                if (require('fs').existsSync(p)) return p;
            }
            return null; // Fallback to bundled Chromium
        case 'darwin':
            // macOS
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'linux':
            // Linux - try common paths
            const linuxPaths = [
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/snap/bin/chromium'
            ];
            for (const p of linuxPaths) {
                if (require('fs').existsSync(p)) return p;
            }
            return null;
        default:
            return null;
    }
}








// ─────────────────────────────────────────────
// PDF GENERATION
// ─────────────────────────────────────────────

app.post('/api/generate-report', async (req, res) => {
  try {
    const data = processData(req.body);

    // Inject theme CSS overrides at render time
    data.__themeCSS = `
      --color-header-bg:   ${data.colorHeaderBg   || '#0D2137'};
      --color-header-text: ${data.colorHeaderText || '#FFFFFF'};
      --color-accent:      ${data.colorAccent      || '#1AAFB4'};
      --color-accent-dark: ${data.colorAccentDark  || '#0D8A8F'};
      --color-logo-bg:     ${data.colorLogoBg      || '#1AAFB4'};
    `;

    const templatePath = path.join(__dirname, 'report.ejs');
    const html = await ejs.renderFile(templatePath, data, { rmWhitespace: false });

 // When launching Puppeteer:
const CHROMIUM_PATH = getChromiumPath();

// Launch browser with fallback
const launchOptions = {
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ],
    headless: 'new'
};

// Only set executablePath if we found a system browser
if (CHROMIUM_PATH) {
    launchOptions.executablePath = CHROMIUM_PATH;
    console.log(`Using system Chromium: ${CHROMIUM_PATH}`);
} else {
    console.log('Using bundled Chromium from Puppeteer');
}

const browser = await puppeteer.launch(launchOptions);
    const page    = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${data.reportNumber || 'draft'}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`✅  Server running at http://localhost:${PORT}`));
