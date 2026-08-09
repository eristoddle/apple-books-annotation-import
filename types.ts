// types.ts
export interface BookDetail {
	assetId: string;
	title: string;
	author: string | null;
	description: string | null;
	epubId: string | null;
	path: string | null;
	isbn: string | null;
	language: string | null;
	publisher: string | null;
	publicationDate: string | null;
	cover: string | null;
	coverPath: string | null;
	// Additional fields from database (may be null if not available in this database version)
	genre: string | null;
	genres: string | null; // BLOB field for multiple genres
	year: string | null;
	pageCount: number | null;
	rating: number | null;
	comments: string | null;
	readingProgress: number | null;
	creationDate: Date | null;
	lastOpenDate: Date | null;
	modificationDate: Date | null;
	// Enhanced metadata from EPUB
	rights: string | null;
	subjects: string[] | null;
}

export interface Annotation {
	selectedText: string;
	note: string | null;
	location: string | null;
	physicalLocation: number | null;
	// Additional fields from database (may be null if not available)
	annotationType: number | null;
	annotationStyle: number | null;
	isUnderline: boolean;
	creationDate: Date | null;
	modificationDate: Date | null;
	uuid: string | null;
	representativeText: string | null;
}

export interface BookWithAnnotations {
	book: BookDetail;
	annotations: Annotation[];
}

export interface AppleBooksImporterSettings {
	outputFolder: string;
	includeCovers: boolean;
	includeExtendedFrontmatter: boolean;
	includeExtendedInNote: boolean;
	overwriteExisting: 'smart' | 'always' | 'never';
	addTags: boolean;
	customTags: string;
	includeChapterInfo: boolean;
	sortAnnotations: boolean;
	includeAnnotationDates: boolean;
	includeAnnotationStyles: boolean;
	includeReadingProgress: boolean;
	createAuthorPages: boolean;
	includeCitations: boolean;
	saveCoverToAttachmentFolder: boolean;
	includePdfHighlights: boolean;
	// Remembers, per PDF, whether it contained highlights the last time we looked. Not a
	// user setting; it rides along in the plugin's data file. See PdfScanCacheEntry.
	pdfScanCache: Record<string, PdfScanCacheEntry>;
}

// One cached answer to "does this PDF contain highlights?", keyed by file name. A PDF
// cannot gain a highlight without being rewritten, so an unchanged mtime and size mean
// the previous answer still holds and the file does not need to be read again.
export interface PdfScanCacheEntry {
	mtimeMs: number;
	size: number;
	hasHighlights: boolean;
}