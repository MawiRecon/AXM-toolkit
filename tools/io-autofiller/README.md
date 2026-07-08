# AXM IO

Insertion Order autofiller for AxMedia campaign submissions. Drop a Monday WorkForms submission PDF, review the auto-parsed fields, and download a populated IO PDF styled to match the Grapeseed Media template.

**Live site:** https://<username>.github.io/axm-io/

## How it works

1. Drag and drop the submission PDF onto the upload zone (or click to pick a file).
2. PDF.js extracts text; if the PDF has no selectable text (Microsoft Print to PDF), Tesseract.js OCR kicks in automatically.
3. Known submission labels (Advertiser, Gross Budget, Flight Date, Media Channels, etc.) map to the IO template fields and auto-fill the form.
4. Review / edit any field. Blended CPM auto-computes from the selected channels.
5. Click **Generate & download IO.pdf** — renders a styled landscape letter PDF.

## Privacy

All parsing, OCR, rendering, and PDF generation run in the browser. No submission data ever leaves the user's machine.

## Stack

Single self-contained HTML file (~52 KB). External dependencies loaded from cdnjs at runtime:

- PDF.js (submission text extraction)
- Tesseract.js (OCR fallback, lazy-loaded)
- html2canvas (render → canvas)
- jsPDF (canvas → PDF)

No build step. Edit `index.html` directly; updates deploy on push to `main`.
