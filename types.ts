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
	overwriteExisting: 'true' | 'false' | 'smart';
	addTags: boolean;
	customTags: string;
	includeChapterInfo: boolean;
	sortAnnotations: boolean;
	includeAnnotationDates: boolean;
	includeAnnotationStyles: boolean;
	includeReadingProgress: boolean;
	createAuthorPages: boolean;
	includeCitations: boolean;
}