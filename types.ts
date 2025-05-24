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
}

export interface Annotation {
	selectedText: string;
	note: string | null;
	location: string | null;
	physicalLocation: number | null;
}

export interface BookWithAnnotations {
	book: BookDetail;
	annotations: Annotation[];
}

export interface AppleBooksImporterSettings {
	outputFolder: string;
	includeCovers: boolean;
	includeMetadata: boolean;
	overwriteExisting: boolean;
	addTags: boolean;
	customTags: string;
	includeChapterInfo: boolean;
	sortAnnotations: boolean;
}