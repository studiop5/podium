#!/usr/bin/env node
/**
 * Generate test PDFs for Podium edge-case testing.
 * Run: node generate.js
 * Requires: qpdf (for encrypted PDF generation)
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const PDFLib = require("../lib/pdf-lib.js");

const DIR = __dirname;

async function writeDoc(doc, name) {
  const bytes = await doc.save();
  const filePath = path.join(DIR, name);
  fs.writeFileSync(filePath, bytes);
  console.log(`  ${name} (${bytes.length} bytes)`);
  return filePath;
}

// 1. All metadata fields populated
async function metadataAll() {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([612, 792]); // letter
  doc.setTitle("Test Score - Sonata in C Major");
  doc.setAuthor("Johann Sebastian Bach");
  doc.setSubject("Piano Sonata");
  doc.setKeywords(["piano", "sonata", "classical", "baroque"]);
  doc.setProducer("Engraving Software 3.0");
  doc.setCreator("Music Publisher Inc.");
  doc.setCreationDate(new Date("2020-01-15T12:00:00Z"));
  doc.setModificationDate(new Date("2024-06-01T08:30:00Z"));
  // Add some visible content so it's not blank
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.getPage(0);
  page.drawText("Test PDF: All Metadata Fields", { x: 50, y: 700, size: 18, font });
  page.drawText("Title, Author, Subject, Keywords (array), Producer, Creator, Dates", { x: 50, y: 670, size: 11, font });
  await writeDoc(doc, "metadata-all.pdf");
}

// 2. Keywords with semicolons (string in PDF info dict)
async function metadataKeywordsSemicolons() {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([612, 792]);
  doc.setTitle("Semicolon Keywords Test");
  // pdf-lib setKeywords accepts array, but we want to test that Podium
  // handles the raw PDF string form. We set keywords normally, then
  // patch the info dict to use a raw string with semicolons.
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.getPage(0);
  page.drawText("Test PDF: Keywords with Semicolons", { x: 50, y: 700, size: 18, font });
  page.drawText("Keywords stored as: \"piano; sonata; classical; baroque\"", { x: 50, y: 670, size: 11, font });
  // Patch the info dict directly to set Keywords as a plain string
  const infoDict = doc.context.trailerInfo.Info;
  if (infoDict) {
    const dictObj = doc.context.lookup(infoDict);
    if (dictObj && dictObj.set) {
      dictObj.set(
        PDFLib.PDFName.of("Keywords"),
        PDFLib.PDFHexString.fromText("piano; sonata; classical; baroque")
      );
    }
  }
  await writeDoc(doc, "metadata-keywords-semicolons.pdf");
}

// 3. Keywords with commas (string form)
async function metadataKeywordsCommas() {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([612, 792]);
  doc.setTitle("Comma Keywords Test");
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.getPage(0);
  page.drawText("Test PDF: Keywords with Commas", { x: 50, y: 700, size: 18, font });
  page.drawText("Keywords stored as: \"piano, sonata, classical, baroque\"", { x: 50, y: 670, size: 11, font });
  // Patch info dict to set Keywords as comma-separated string
  const infoDict = doc.context.trailerInfo.Info;
  if (infoDict) {
    const dictObj = doc.context.lookup(infoDict);
    if (dictObj && dictObj.set) {
      dictObj.set(
        PDFLib.PDFName.of("Keywords"),
        PDFLib.PDFHexString.fromText("piano, sonata, classical, baroque")
      );
    }
  }
  await writeDoc(doc, "metadata-keywords-commas.pdf");
}

// 4. No metadata at all
async function metadataNone() {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([612, 792]);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.getPage(0);
  page.drawText("Test PDF: No Metadata", { x: 50, y: 700, size: 18, font });
  // Clear all metadata by removing info dict entries
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const infoDict = doc.context.lookup(infoRef);
    if (infoDict && infoDict.delete) {
      for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
        infoDict.delete(PDFLib.PDFName.of(key));
      }
    }
  }
  await writeDoc(doc, "metadata-none.pdf");
}

// 5. Multi-page with varying sizes
async function multiPageSizes() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const sizes = [
    { name: "US Letter", w: 612, h: 792, color: PDFLib.rgb(0.85, 0.92, 1.0) },       // light blue
    { name: "A4", w: 595.28, h: 841.89, color: PDFLib.rgb(1.0, 0.92, 0.85) },        // light orange
    { name: "Tabloid", w: 792, h: 1224, color: PDFLib.rgb(0.85, 1.0, 0.85) },        // light green
    { name: "Small (5x7in)", w: 360, h: 504, color: PDFLib.rgb(1.0, 0.92, 1.0) },    // light magenta
    { name: "Landscape Letter", w: 792, h: 612, color: PDFLib.rgb(1.0, 1.0, 0.85) },  // light yellow
  ];
  doc.setTitle("Multi-Page Size Test");
  for (const s of sizes) {
    const page = doc.addPage([s.w, s.h]);
    // Fill page with solid color
    page.drawRectangle({ x: 0, y: 0, width: s.w, height: s.h, color: s.color });
    page.drawText(`Page: ${s.name}`, { x: 50, y: s.h - 60, size: 18, font });
    page.drawText(`${s.w} x ${s.h} points`, { x: 50, y: s.h - 85, size: 12, font });
  }
  await writeDoc(doc, "multi-page-sizes.pdf");
}

// 6. Single blank page (minimal)
async function singlePageBlank() {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([612, 792]);
  await writeDoc(doc, "single-page-blank.pdf");
}

// 7. Page with text annotations
async function withAnnotations() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  doc.setTitle("Annotations Test");
  page.drawText("Test PDF: With Annotations", { x: 50, y: 700, size: 18, font });
  // Add a text annotation using low-level API
  const annotDict = doc.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [100, 600, 130, 630],
    Contents: PDFLib.PDFHexString.fromText("This is a test annotation"),
    C: [1, 1, 0], // yellow
    Open: true,
  });
  const annotRef = doc.context.register(annotDict);
  const annots = page.node.get(PDFLib.PDFName.of("Annots"));
  if (annots) {
    annots.push(annotRef);
  } else {
    page.node.set(PDFLib.PDFName.of("Annots"), doc.context.obj([annotRef]));
  }
  await writeDoc(doc, "with-annotations.pdf");
}

// 8. PDF with existing "podium" attachment
async function withAttachment() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  doc.setTitle("Attachment Test");
  page.drawText("Test PDF: With Podium Attachment", { x: 50, y: 700, size: 18, font });
  page.drawText("Has a pre-existing 'podium' JSON attachment", { x: 50, y: 670, size: 11, font });
  // Attach a fake podium JSON
  const attachment = {
    created: new Date("2024-01-01").toISOString(),
    modified: new Date("2024-06-01").toISOString(),
    maxWidth: 612,
    maxHeight: 792,
    quality: 2,
    pages: { 1: { objects: [] } },
    menu: {},
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(attachment));
  await doc.attach(jsonBytes, "podium", {
    mimeType: "application/json",
    description: "Podium score data",
  });
  await writeDoc(doc, "with-attachment.pdf");
}

// 9. Large page count (50 pages)
async function largePageCount() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.setTitle("Large Page Count Test (50 pages)");
  for (let i = 1; i <= 50; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${i} of 50`, { x: 250, y: 400, size: 14, font });
  }
  await writeDoc(doc, "large-page-count.pdf");
}

// 10. Encrypted PDF (owner password, no user password) via qpdf
async function encryptedOwner() {
  // First generate a base PDF
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  doc.setTitle("Encrypted Owner-Password Test");
  doc.setKeywords(["encrypted", "owner-password", "test"]);
  page.drawText("Test PDF: Owner-Password Encrypted", { x: 50, y: 700, size: 18, font });
  page.drawText("Viewable without password, but copy/edit restricted", { x: 50, y: 670, size: 11, font });

  const basePath = path.join(DIR, "_encrypted-base.pdf");
  const outPath = path.join(DIR, "encrypted-owner.pdf");
  const bytes = await doc.save();
  fs.writeFileSync(basePath, bytes);

  try {
    // 128-bit RC4: sets permission flags but content streams stay readable.
    // This matches how IMSLP and many publishers encrypt PDFs.
    // --modify=none restricts modification, --print=none restricts printing.
    execSync(`qpdf --allow-weak-crypto --encrypt "" ownerpass 128 --modify=none --print=none -- "${basePath}" "${outPath}"`);
    const stat = fs.statSync(outPath);
    console.log(`  encrypted-owner.pdf (${stat.size} bytes) [via qpdf, RC4-128]`);
  } catch (err) {
    console.log(`  encrypted-owner.pdf SKIPPED (qpdf failed: ${err.message})`);
  }

  // Also generate AES-256 encrypted version (truly encrypted streams — save should fail gracefully)
  const outPath256 = path.join(DIR, "encrypted-aes256.pdf");
  try {
    execSync(`qpdf --encrypt "" ownerpass 256 --modify=none -- "${basePath}" "${outPath256}"`);
    const stat = fs.statSync(outPath256);
    console.log(`  encrypted-aes256.pdf (${stat.size} bytes) [via qpdf, AES-256]`);
  } catch (err) {
    console.log(`  encrypted-aes256.pdf SKIPPED (qpdf failed: ${err.message})`);
  } finally {
    if (fs.existsSync(basePath)) fs.unlinkSync(basePath);
  }
}

// --- "Wild" edge-case PDFs ---

// 11. Truncated PDF — valid header but file cut short (simulates interrupted download)
async function truncated() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("This PDF will be truncated", { x: 50, y: 700, size: 18, font });
  const bytes = await doc.save();
  // Keep only the first 40% of the file — enough for the header but not the xref/pages
  const truncBytes = bytes.slice(0, Math.floor(bytes.length * 0.4));
  const filePath = path.join(DIR, "truncated.pdf");
  fs.writeFileSync(filePath, truncBytes);
  console.log(`  truncated.pdf (${truncBytes.length} bytes, cut from ${bytes.length})`);
}

// 12. Not a PDF — a JPEG file renamed to .pdf
function notAPdf() {
  // Minimal valid JPEG: 1x1 white pixel
  const jpegBytes = Buffer.from([
    0xFF,0xD8,0xFF,0xE0, 0x00,0x10, 0x4A,0x46,0x49,0x46,0x00, 0x01,0x01,0x00,
    0x00,0x01,0x00,0x01,0x00,0x00,
    0xFF,0xDB, 0x00,0x43,0x00, // quantization table
    0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,
    0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,0x13,
    0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,
    0x2E,0x27,0x20,0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,
    0x30,0x31,0x34,0x34,0x34,0x1F,0x27,0x39,0x3D,0x38,0x32,0x3C,
    0x2E,0x33,0x34,0x32,
    0xFF,0xC0, 0x00,0x0B, 0x08, 0x00,0x01,0x00,0x01, 0x01, 0x01,0x11,0x00,
    0xFF,0xC4, 0x00,0x1F, 0x00, 0x00,0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,
    0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x00,0x01,0x02,0x03,0x04,0x05,0x06,
    0x07,0x08,0x09,0x0A,0x0B,
    0xFF,0xDA, 0x00,0x08, 0x01, 0x01,0x00, 0x00, 0x3F,0x00, 0x7B,0x40,
    0xFF,0xD9
  ]);
  const filePath = path.join(DIR, "not-a-pdf.pdf");
  fs.writeFileSync(filePath, jpegBytes);
  console.log(`  not-a-pdf.pdf (${jpegBytes.length} bytes, actually a JPEG)`);
}

// 13. Rotated pages — 0°, 90°, 180°, 270° (common from scanners)
async function rotatedPages() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.setTitle("Rotated Pages Test");
  const rotations = [0, 90, 180, 270];
  for (const rot of rotations) {
    const page = doc.addPage([612, 792]);
    page.setRotation(PDFLib.degrees(rot));
    page.drawText(`Rotation: ${rot} degrees`, { x: 50, y: 700, size: 18, font });
    page.drawRectangle({
      x: 50, y: 600, width: 100, height: 50,
      color: PDFLib.rgb(0.8, 0.3, 0.3),
    });
    page.drawText("This red box should be above this text", { x: 50, y: 580, size: 10, font });
  }
  await writeDoc(doc, "rotated-pages.pdf");
}

// 14. Zero-byte file
function zeroByte() {
  const filePath = path.join(DIR, "zero-byte.pdf");
  fs.writeFileSync(filePath, Buffer.alloc(0));
  console.log(`  zero-byte.pdf (0 bytes)`);
}

// 15. Huge dimensions — A0 and A1 poster sizes (orchestral scores)
async function hugeDimensions() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.setTitle("Huge Dimensions Test");
  // A1: 1683.78 x 2383.94 points (594mm x 841mm)
  const pageA1 = doc.addPage([1683.78, 2383.94]);
  pageA1.drawRectangle({ x: 0, y: 0, width: 1683.78, height: 2383.94, color: PDFLib.rgb(0.95, 0.95, 0.85) });
  pageA1.drawText("A1 Page (594mm x 841mm)", { x: 100, y: 2200, size: 48, font });
  pageA1.drawText("1683.78 x 2383.94 points", { x: 100, y: 2130, size: 30, font });
  // A0: 2383.94 x 3370.39 points (841mm x 1189mm)
  const pageA0 = doc.addPage([2383.94, 3370.39]);
  pageA0.drawRectangle({ x: 0, y: 0, width: 2383.94, height: 3370.39, color: PDFLib.rgb(0.85, 0.95, 0.95) });
  pageA0.drawText("A0 Page (841mm x 1189mm)", { x: 100, y: 3200, size: 60, font });
  pageA0.drawText("2383.94 x 3370.39 points", { x: 100, y: 3100, size: 36, font });
  await writeDoc(doc, "huge-dimensions.pdf");
}

// 16. Mixed orientation — alternating portrait and landscape (score collections)
async function mixedOrientation() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.setTitle("Mixed Orientation Test");
  const pages = [
    { w: 612, h: 792, label: "Portrait 1", color: PDFLib.rgb(0.9, 0.85, 0.85) },
    { w: 792, h: 612, label: "Landscape 1", color: PDFLib.rgb(0.85, 0.9, 0.85) },
    { w: 612, h: 792, label: "Portrait 2", color: PDFLib.rgb(0.85, 0.85, 0.9) },
    { w: 1224, h: 792, label: "Wide Landscape", color: PDFLib.rgb(0.9, 0.9, 0.85) },
    { w: 612, h: 792, label: "Portrait 3", color: PDFLib.rgb(0.9, 0.85, 0.9) },
  ];
  for (const p of pages) {
    const page = doc.addPage([p.w, p.h]);
    page.drawRectangle({ x: 0, y: 0, width: p.w, height: p.h, color: p.color });
    page.drawText(p.label, { x: 50, y: p.h - 60, size: 18, font });
    page.drawText(`${p.w} x ${p.h}`, { x: 50, y: p.h - 85, size: 12, font });
  }
  await writeDoc(doc, "mixed-orientation.pdf");
}

// 17. Image-only PDF — embedded JPEG, no text (scanned score)
async function imageOnly() {
  const doc = await PDFLib.PDFDocument.create();
  doc.setTitle("Image-Only (Scanned) Test");
  // Create a simple grayscale "staff lines" image as raw JPEG
  // We'll draw it with pdf-lib instead — a page with only drawn lines, no text
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: PDFLib.rgb(0.97, 0.95, 0.9) }); // aged paper
  // Draw 5 staff lines
  for (let staff = 0; staff < 3; staff++) {
    const baseY = 600 - staff * 180;
    for (let line = 0; line < 5; line++) {
      const y = baseY - line * 12;
      page.drawLine({
        start: { x: 60, y }, end: { x: 552, y },
        thickness: 1, color: PDFLib.rgb(0.2, 0.2, 0.2),
      });
    }
    // Barlines
    page.drawLine({ start: { x: 60, y: baseY }, end: { x: 60, y: baseY - 48 }, thickness: 2, color: PDFLib.rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: 552, y: baseY }, end: { x: 552, y: baseY - 48 }, thickness: 2, color: PDFLib.rgb(0.2, 0.2, 0.2) });
    page.drawLine({ start: { x: 300, y: baseY }, end: { x: 300, y: baseY - 48 }, thickness: 1, color: PDFLib.rgb(0.2, 0.2, 0.2) });
  }
  // Simulate scan artifacts — light gray smudges
  for (let i = 0; i < 8; i++) {
    const x = 50 + (i * 67);
    const y = 50 + (i * 31) % 200;
    page.drawEllipse({ x, y, xScale: 15, yScale: 8, color: PDFLib.rgb(0.92, 0.90, 0.88) });
  }
  await writeDoc(doc, "image-only.pdf");
}

// 18. Empty PDF — valid structure, 0 pages
async function emptyNoPages() {
  const doc = await PDFLib.PDFDocument.create();
  doc.setTitle("Empty PDF - No Pages");
  // Don't add any pages
  const bytes = await doc.save();
  const filePath = path.join(DIR, "empty-no-pages.pdf");
  fs.writeFileSync(filePath, bytes);
  console.log(`  empty-no-pages.pdf (${bytes.length} bytes, 0 pages)`);
}

// 19. Damaged cross-reference table
async function damagedXref() {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("This PDF has a damaged xref table", { x: 50, y: 700, size: 18, font });
  const bytes = Buffer.from(await doc.save());
  // Find the xref table and corrupt it
  const xrefStr = "startxref";
  const xrefIdx = bytes.lastIndexOf(xrefStr);
  if (xrefIdx > 0) {
    // Corrupt the offset after "startxref\n" — replace digits with garbage
    const offsetStart = xrefIdx + xrefStr.length + 1;
    for (let i = offsetStart; i < Math.min(offsetStart + 8, bytes.length); i++) {
      if (bytes[i] >= 0x30 && bytes[i] <= 0x39) { // digit
        bytes[i] = 0x58; // 'X'
      }
    }
  }
  const filePath = path.join(DIR, "damaged-xref.pdf");
  fs.writeFileSync(filePath, bytes);
  console.log(`  damaged-xref.pdf (${bytes.length} bytes, corrupted xref offset)`);
}

async function main() {
  console.log("Generating test PDFs in", DIR);
  console.log();

  console.log("-- Metadata tests --");
  await metadataAll();
  await metadataKeywordsSemicolons();
  await metadataKeywordsCommas();
  await metadataNone();

  console.log("-- Layout tests --");
  await multiPageSizes();
  await singlePageBlank();
  await withAnnotations();
  await withAttachment();
  await largePageCount();

  console.log("-- Encryption tests --");
  await encryptedOwner();

  console.log("-- Wild / broken PDFs --");
  await truncated();
  notAPdf();
  await rotatedPages();
  zeroByte();
  await hugeDimensions();
  await mixedOrientation();
  await imageOnly();
  await emptyNoPages();
  await damagedXref();

  console.log("\nDone.");
}

main().catch(err => { console.error(err); process.exit(1); });
