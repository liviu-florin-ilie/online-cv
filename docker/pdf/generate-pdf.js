const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const language = process.env.LANGUAGE || "en";
// THEME=dark keeps the E-hälsomyndigheten look; THEME=light is the print/upload variant.
const theme = process.env.THEME || "dark";
const baseUrl = (process.env.BASE_URL || "http://jekyll:4000/online-cv").replace(/\/$/, "");
const output =
  process.env.OUTPUT ||
  `/output/liviu-florin-ilie-cv-${language}${theme === "light" ? "-light" : ""}.pdf`;

if (!/^[a-z]{2}$/.test(language)) {
  throw new Error(`Invalid LANGUAGE value: ${language}`);
}

if (!["dark", "light"].includes(theme)) {
  throw new Error(`Invalid THEME value: ${theme} (use dark or light)`);
}

// A4 at 96 dpi is 794 px wide. Print at scale 1 so body text ends up around 10 pt
// (the previous 0.48 scale produced 5 pt text); 13.5 px is about 10 pt.
// BEGIN pdf-css
// Skins with a white main column (e.g. sigma) take page + header colours from the skin itself,
// so the dark E-hälsomyndigheten background never shows below the content.
const pdfCss = (skin) => `
  html { background: ${skin.lightMain ? "#fff" : theme === "light" ? "#fff" : "#16171b"} !important; }
  body { padding: 0 !important; margin: 0 !important; }
  .wrapper { display: block !important; width: 794px !important; max-width: 794px !important; margin: 0 !important; box-shadow: none !important; }
  /* Screen styles include an empty website footer with 30px top padding.
     Keep it out of PDF pagination so it cannot create a blank final page. */
  footer { display: none !important; }
  .main-wrapper { padding: 20px 32px 8px !important; }
  .main-wrapper .section { margin-bottom: 22px !important; }
  .main-wrapper, .main-wrapper .details li, .skillset .skill-group { font-size: 13.5px !important; }
  .main-wrapper .details li { line-height: 1.5 !important; margin-bottom: 4px !important; }
  .main-wrapper .item, .skillset .item { break-inside: avoid; }
  .main-wrapper .section-title { break-after: avoid; }

  /* 1) Sidebar becomes a compact header band across the top of page 1 */
  .sidebar-wrapper {
    display: grid !important;
    grid-template-columns: 175px 1.15fr 1fr 0.8fr;
    grid-template-areas: "profile contact edu lang" "profile contact edu int";
    align-items: start;
    background: ${skin.lightMain ? skin.bandBg : theme === "light" ? "#f1f2f6" : "#1e222e"} !important;
    border-bottom: 3px solid ${skin.lightMain ? skin.accent : theme === "light" ? "#171c26" : "#f0f45b"};
    padding: 14px 20px 10px;
  }
  .sidebar-wrapper .profile-container { grid-area: profile; background: transparent !important; border: 0 !important; padding: 0 !important; text-align: left !important; }
  .sidebar-wrapper .contact-container { grid-area: contact; }
  .sidebar-wrapper .education-container { grid-area: edu; }
  .sidebar-wrapper .languages-container { grid-area: lang; }
  .sidebar-wrapper .interests-container { grid-area: int; }
  .sidebar-wrapper .container-block { padding: 0 10px 6px !important; font-size: 12px !important; }
  .sidebar-wrapper .container-block-title { font-size: 12px !important; margin-bottom: 5px !important; }
  .sidebar-wrapper .avatar { max-width: 62px !important; margin-bottom: 6px !important; }
  .sidebar-wrapper .name { font-size: 20px !important; margin-bottom: 3px !important; }
  .sidebar-wrapper .tagline { font-size: 12.5px !important; }
  .sidebar-wrapper .contact-list li { margin-bottom: 3px !important; }
  .sidebar-wrapper .contact-list .fas, .sidebar-wrapper .contact-list .fab { font-size: 13px !important; width: 16px; text-align: center; }
  .sidebar-wrapper .degree { font-size: 12px !important; margin-bottom: 2px !important; }
  .sidebar-wrapper .education-container .item { margin-bottom: 0 !important; }
  .sidebar-wrapper .interests-list li, .sidebar-wrapper .languages-list li { margin-bottom: 3px !important; }

  /* 2) Skills as two compact columns; per-role tech-stack lines are removed in compactCv() */
  .skillset { column-count: 2; column-gap: 28px; }
  .skillset .item { margin: 0 0 6px !important; overflow: visible !important; break-inside: avoid; }
  .skillset .skill-group-title, .skillset .skill-group { display: inline !important; font-size: 12.5px !important; margin: 0 !important; line-height: 1.45; }
  .skillset .skill-group-title::after { content: ": "; }

  /* 3) Roles before 2015 shrink to a title line, company and one-line summary */
  .older-heading { font-size: 14px; font-weight: 600; margin: 4px 0 8px; opacity: 0.85; }
  .main-wrapper .item.older { margin-bottom: 8px !important; }
  .item.older .upper-row { margin-bottom: 0 !important; }
  .item.older .job-title { font-size: 13px !important; }
  .item.older .company { margin-bottom: 1px !important; font-size: 12px !important; }
  .item.older .details { display: none !important; }
  .item.older .summary-line { display: block !important; font-size: 12px !important; line-height: 1.4; }
  .item.older .summary-line p { margin: 0 !important; line-height: 1.4; }
`;

function compactCv(lang) {
  // Drop per-role "Teknikstack:" lines; the skills section already lists them.
  document.querySelectorAll(".experiences-section .details p").forEach((p) => {
    const first = p.firstElementChild;
    if (first && first.tagName === "STRONG" && /^(Teknikstack|Tech(nology)? stack)/i.test(first.textContent.trim())) {
      const br = p.querySelector("br");
      if (br) {
        while (p.firstChild && p.firstChild !== br) p.removeChild(p.firstChild);
        br.remove();
      } else {
        p.remove();
      }
    }
  });

  // Roles that started before 2015 become one compact "earlier experience" list.
  const older = [...document.querySelectorAll(".experiences-section .item")].filter((item) => {
    const time = (item.querySelector(".time") || {}).textContent || "";
    const year = parseInt((time.match(/(\d{4})/) || [])[1] || "9999", 10);
    return year < 2015;
  });
  older.forEach((item) => item.classList.add("older"));
  if (older.length) {
    const heading = document.createElement("h3");
    heading.className = "older-heading";
    heading.textContent = lang === "sv" ? "Tidigare erfarenhet" : "Earlier experience";
    older[0].parentNode.insertBefore(heading, older[0]);
  }
}
// END pdf-css

const pageUrl = `${baseUrl}/${language}/`;

async function openWithRetry(page, attempts = 30) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 15000 });
      return;
    } catch (error) {
      lastError = error;
      console.log(`Waiting for Jekyll (${attempt}/${attempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError;
}

(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 },
    });

    await openWithRetry(page);
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "screen" });
    const skin = await page.evaluate(() => {
      const css = (sel, prop) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el)[prop] : "";
      };
      return {
        lightMain: css(".main-wrapper", "backgroundColor") === "rgb(255, 255, 255)",
        bandBg: css(".sidebar-wrapper", "backgroundColor"),
        accent: css(".sidebar-wrapper .profile-container", "borderBottomColor"),
      };
    });
    if (theme === "light") {
      await page.evaluate(() => document.body.classList.add("theme-light"));
    }
    await page.evaluate(compactCv, language);
    await page.addStyleTag({ content: pdfCss(skin) });

    await page.pdf({
      path: output,
      format: "A4",
      scale: 1,
      printBackground: true,
      preferCSSPageSize: false,
      tagged: true,
      margin: {
        top: "12mm",
        right: "0",
        bottom: "12mm",
        left: "0",
      },
    });

    console.log(`PDF generated from ${pageUrl}: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
