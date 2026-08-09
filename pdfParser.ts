// pdfParser.ts
// Apple Books stores PDF highlights differently from EPUB highlights: they are NOT
// in the SQLite annotation database (that only holds a text-less reading-position
// bookmark per PDF). Instead they are written into the PDF file itself as standard
// PDF highlight annotations (/Subtype /Highlight + /QuadPoints). We read them with
// pdf.js and map the highlighted text out from under the quad regions.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BookDetail, Annotation, PdfScanCacheEntry } from './types';

// pdf.js must not leak into the global scope. Its UMD wrapper assigns itself to
// `globalThis.pdfjsLib` / `globalThis.pdfjsWorker` merely on being loaded, and Obsidian's
// built-in PDF viewer ships its own (much newer) pdf.js that checks `globalThis.pdfjsWorker`
// first: if it finds one it skips starting its own worker and runs against ours, which dies
// with "The API version ... does not match the Worker version ..." and breaks PDF viewing
// vault-wide. So we load pdf.js lazily, restore the globals to exactly what they were, and
// drive our own copy through a private MessageChannel rather than the global.
type PdfjsModules = { lib: any; worker: any };
let pdfjsModules: PdfjsModules | null = null;

function loadPdfjs(): PdfjsModules {
	if (pdfjsModules) return pdfjsModules;
	const g = globalThis as any;
	const hadLib = 'pdfjsLib' in g, prevLib = g.pdfjsLib;
	const hadWorker = 'pdfjsWorker' in g, prevWorker = g.pdfjsWorker;
	try {
		pdfjsModules = {
			lib: require('pdfjs-dist/legacy/build/pdf.js'),
			worker: require('pdfjs-dist/legacy/build/pdf.worker.js'),
		};
	} finally {
		if (hadLib) g.pdfjsLib = prevLib; else delete g.pdfjsLib;
		if (hadWorker) g.pdfjsWorker = prevWorker; else delete g.pdfjsWorker;
	}
	return pdfjsModules;
}

// Run pdf.js on the main thread without a separate worker file (the single-file plugin
// bundle has none). Wiring the worker's message handler to one end of a MessageChannel and
// a PDFWorker to the other gets the same in-process behaviour as pdf.js's own fake-worker
// path, but scoped to this document instead of a global handoff.
function createPdfWorker(mods: PdfjsModules): any {
	const channel = new MessageChannel();
	mods.worker.WorkerMessageHandler.initializeFromPort(channel.port2);
	const worker = new mods.lib.PDFWorker({ port: channel.port1, verbosity: 0 });
	// Both ports must be started explicitly. pdf.js only ever calls addEventListener()
	// on the port it is handed, and per the HTML spec that does NOT enable a
	// MessagePort's message queue (only start() or assigning onmessage does). Without
	// this, every message between the API and the worker sits queued forever and
	// getDocument() never settles -- the import hangs silently on the first PDF.
	channel.port1.start();
	channel.port2.start();
	return worker;
}

export interface PdfHighlight {
	page: number;
	text: string;
	note: string | null;
	// Maps to the numeric annotation style understood by markdown.ts (1 green, 2 blue,
	// 3 yellow, 4 red/pink, 5 purple) so PDF highlights reuse the existing emoji logic.
	annotationStyle: number;
	creationDate: Date | null;
}

// Reference RGB values (0-255) for the Apple Books highlighter palette. Only yellow is
// confirmed from real data; the rest are approximate. We pick the nearest reference so
// exact matches are not required.
const HIGHLIGHT_COLORS: { style: number; rgb: [number, number, number] }[] = [
	{ style: 3, rgb: [250, 205, 90] },   // yellow (confirmed from Apple Books output)
	{ style: 1, rgb: [150, 214, 130] },  // green
	{ style: 2, rgb: [130, 190, 240] },  // blue
	{ style: 4, rgb: [240, 150, 170] },  // pink / red
	{ style: 5, rgb: [200, 160, 235] },  // purple
];

function colorToStyle(color: ArrayLike<number> | null | undefined): number {
	if (!color || color.length < 3) return 3;
	const r = color[0], g = color[1], b = color[2];
	let bestStyle = 3;
	let bestDist = Infinity;
	for (const c of HIGHLIGHT_COLORS) {
		const d = (r - c.rgb[0]) ** 2 + (g - c.rgb[1]) ** 2 + (b - c.rgb[2]) ** 2;
		if (d < bestDist) {
			bestDist = d;
			bestStyle = c.style;
		}
	}
	return bestStyle;
}

// PDF date strings look like "D:20250718033412Z" or "D:20250718033412-05'00'".
function parsePdfDate(value: unknown): Date | null {
	if (typeof value !== 'string') return null;
	const m = value.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
	if (!m) return null;
	const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
	const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
	return isNaN(date.getTime()) ? null : date;
}

// The Apple Books iCloud folder where PDFs (and extracted EPUBs) are stored.
export function getAppleBooksPdfDir(): string {
	return path.join(
		os.homedir(),
		'Library/Mobile Documents/iCloud~com~apple~iBooks/Documents'
	);
}

// Apple Books writes highlight annotations uncompressed, so the "/Highlight" name is
// present as plain bytes in files that actually contain highlights. A false positive just
// triggers a parse that finds nothing (harmless); this only needs to avoid false negatives.
const HIGHLIGHT_MARKER = Buffer.from('/Highlight', 'latin1');
const SCAN_CHUNK_BYTES = 1024 * 1024;

// Search the file for the marker without ever holding more than one chunk in memory --
// a library can contain individual PDFs of several hundred MB, and reading those whole
// just to run a substring search is a large allocation inside Obsidian's renderer.
//
// Scanning runs backwards from the end of the file because Apple Books appends its
// annotations as PDF incremental updates: in a real library every highlighted PDF matches
// inside the first chunk read. Successive chunks overlap by marker.length - 1 bytes so a
// match straddling a chunk boundary cannot be missed. A file with no highlights is still
// read in full, which is why callers should pair this with the scan cache below.
function fileContainsHighlightMarker(pdfPath: string): boolean {
	const overlap = HIGHLIGHT_MARKER.length - 1;
	let fd: number | null = null;
	try {
		fd = fs.openSync(pdfPath, 'r');
		const size = fs.fstatSync(fd).size;
		if (size === 0) return false;
		const buf = Buffer.allocUnsafe(Math.min(SCAN_CHUNK_BYTES, size));
		let end = size;
		while (end > 0) {
			const start = Math.max(0, end - SCAN_CHUNK_BYTES);
			const bytesRead = fs.readSync(fd, buf, 0, end - start, start);
			if (bytesRead <= 0) break;
			if (buf.subarray(0, bytesRead).includes(HIGHLIGHT_MARKER)) return true;
			if (start === 0) break;
			end = start + overlap;
		}
		return false;
	} catch {
		return false;
	} finally {
		if (fd !== null) {
			try { fs.closeSync(fd); } catch { /* already gone */ }
		}
	}
}

// Cheap pre-filter so we don't hand hundreds of un-annotated PDFs to pdf.js.
//
// Pass the persisted cache to skip files that have not changed since the last import.
// Apple Books cannot add a highlight without rewriting the file, so a matching mtime and
// size mean the previous answer is still correct. Without this every import re-reads the
// entire PDF library from disk; with it, a steady-state run does one stat() per file.
export function pdfLikelyHasHighlights(
	pdfPath: string,
	cache?: Record<string, PdfScanCacheEntry>
): boolean {
	let stats: fs.Stats;
	try {
		stats = fs.statSync(pdfPath);
	} catch {
		return false;
	}

	const key = path.basename(pdfPath);
	const cached = cache?.[key];
	if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
		return cached.hasHighlights;
	}

	const hasHighlights = fileContainsHighlightMarker(pdfPath);
	if (cache) {
		cache[key] = { mtimeMs: stats.mtimeMs, size: stats.size, hasHighlights };
	}
	return hasHighlights;
}

// Drop cache entries for PDFs that are no longer in the library, so the plugin's data file
// does not accumulate a row per book the user has ever owned. Returns the number removed.
export function prunePdfScanCache(
	cache: Record<string, PdfScanCacheEntry>,
	presentPaths: string[]
): number {
	const present = new Set(presentPaths.map(p => path.basename(p)));
	let removed = 0;
	for (const key of Object.keys(cache)) {
		if (!present.has(key)) {
			delete cache[key];
			removed++;
		}
	}
	return removed;
}

interface QuadBox { xMin: number; xMax: number; yMin: number; yMax: number; }

function quadToBox(quad: { x: number; y: number }[]): QuadBox {
	const xs = quad.map(p => p.x);
	const ys = quad.map(p => p.y);
	return {
		xMin: Math.min(...xs),
		xMax: Math.max(...xs),
		yMin: Math.min(...ys),
		yMax: Math.max(...ys),
	};
}

// Snap an estimated character cut index to the nearest whitespace within a window so we
// never clip a partial-boundary line in the middle of a word.
function snapToSpace(str: string, idx: number, window = 12): number {
	if (idx <= 0) return 0;
	if (idx >= str.length) return str.length;
	for (let d = 0; d <= window; d++) {
		if (str[idx - d] === ' ') return idx - d;
		if (str[idx + d] === ' ') return idx + d;
	}
	return idx;
}

// Given a page's text items and a highlight's quad regions (one quad per covered line),
// reconstruct the highlighted text. Middle lines are fully covered; the first and last
// lines may be partially covered, so we clip them by proportional character offset.
function extractTextFromQuads(items: any[], quadPoints: { x: number; y: number }[][]): string {
	const boxes = quadPoints.map(quadToBox);
	const lineParts: { str: string; x: number; w: number }[][] = boxes.map(() => []);

	for (const it of items) {
		if (!it.transform || !it.str) continue;
		const x = it.transform[4];
		const y = it.transform[5];
		const w = it.width || 0;
		for (let bi = 0; bi < boxes.length; bi++) {
			const b = boxes[bi];
			// The item's baseline y must fall within the quad's vertical band...
			if (y < b.yMin - 1 || y > b.yMax + 1) continue;
			// ...and it must overlap the quad horizontally at all.
			const overlap = Math.min(x + w, b.xMax) - Math.max(x, b.xMin);
			if (overlap > 0) {
				lineParts[bi].push({ str: it.str, x, w });
				break;
			}
		}
	}

	const lineTexts: string[] = [];
	for (let bi = 0; bi < boxes.length; bi++) {
		const b = boxes[bi];
		const parts = lineParts[bi].sort((a, z) => a.x - z.x);
		if (!parts.length) continue;

		const lineX0 = parts[0].x;
		const last = parts[parts.length - 1];
		const lineX1 = last.x + last.w;
		const lineW = lineX1 - lineX0;
		let str = parts.map(p => p.str).join('');

		if (lineW > 0) {
			const len = str.length;
			let start = 0;
			let end = len;
			if (b.xMin > lineX0 + 1) start = snapToSpace(str, Math.round((b.xMin - lineX0) / lineW * len));
			if (b.xMax < lineX1 - 1) end = snapToSpace(str, Math.round((b.xMax - lineX0) / lineW * len));
			str = str.slice(start, end);
		}
		lineTexts.push(str.trim());
	}

	return lineTexts.join(' ').replace(/\s+/g, ' ').trim();
}

// Parse all highlight annotations from a PDF, returning them ordered by page then by
// vertical position (top to bottom) within each page.
export async function extractPdfHighlights(pdfPath: string): Promise<PdfHighlight[]> {
	const data = new Uint8Array(fs.readFileSync(pdfPath));
	const mods = loadPdfjs();
	const worker = createPdfWorker(mods);
	const doc = await mods.lib.getDocument({ data, worker, isEvalSupported: false, verbosity: 0 }).promise;
	const highlights: PdfHighlight[] = [];

	try {
		for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
			const page = await doc.getPage(pageNum);
			const annots = (await page.getAnnotations()).filter((a: any) => a.subtype === 'Highlight');
			if (annots.length === 0) continue;

			const textContent = await page.getTextContent();

			// Order highlights within the page from top to bottom (PDF y grows upward).
			annots.sort((a: any, z: any) => (z.rect?.[3] || 0) - (a.rect?.[3] || 0));

			for (const annot of annots) {
				if (!annot.quadPoints) continue;
				const text = extractTextFromQuads(textContent.items, annot.quadPoints);
				if (!text) continue;

				const note = annot.contentsObj?.str || annot.contents || '';
				highlights.push({
					page: pageNum,
					text,
					note: note ? String(note).trim() : null,
					annotationStyle: colorToStyle(annot.color),
					creationDate: parsePdfDate(annot.modificationDate),
				});
			}
		}
	} finally {
		await doc.destroy();
		worker.destroy();
	}

	return highlights;
}

// Convert a PDF highlight into the plugin's shared Annotation shape so the existing
// markdown renderer, dedup, and file pipeline handle it unchanged.
export function pdfHighlightToAnnotation(h: PdfHighlight): Annotation {
	return {
		selectedText: h.text,
		note: h.note,
		location: null,
		physicalLocation: h.page,
		annotationType: null,
		annotationStyle: h.annotationStyle,
		isUnderline: false,
		creationDate: h.creationDate,
		modificationDate: null,
		uuid: null,
		representativeText: null,
	};
}

// Build a BookDetail for a PDF, preferring the Apple Books library-DB metadata (proper
// title/author) and falling back to the file name.
export function buildPdfBookDetail(filePath: string, dbBook?: BookDetail | null): BookDetail {
	const base = path.basename(filePath, path.extname(filePath));
	// The author is already normalized when the library row is built, so Apple's
	// "no author" sentinels arrive here as null and need no second pass.
	const author = dbBook?.author || null;

	if (dbBook) {
		return { ...dbBook, title: dbBook.title || base, author, path: filePath };
	}

	return {
		assetId: base,
		title: base,
		author,
		description: null,
		epubId: null,
		path: filePath,
		isbn: null,
		language: null,
		publisher: null,
		publicationDate: null,
		cover: null,
		coverPath: null,
		genre: null,
		genres: null,
		year: null,
		pageCount: null,
		rating: null,
		comments: null,
		readingProgress: null,
		creationDate: null,
		lastOpenDate: null,
		modificationDate: null,
		rights: null,
		subjects: null,
	};
}
