// markdown.ts
import { BookDetail, Annotation, AppleBooksImporterSettings, TocEntry, ManifestItem, SpineItem } from './types';

export class MarkdownGenerator {

	private static normalizePath(filePath: string): string {
		if (!filePath) return '';
		let normalized = filePath;
		try {
			normalized = decodeURIComponent(normalized);
		} catch (e) {
			// URI might not be encoded, or malformed
			console.warn(`Could not decode URI component: ${filePath}`, e);
		}
		// Remove leading './'
		if (normalized.startsWith('./')) {
			normalized = normalized.substring(2);
		}
		// Remove URL anchors
		const anchorIndex = normalized.indexOf('#');
		if (anchorIndex !== -1) {
			normalized = normalized.substring(0, anchorIndex);
		}
		// Further path normalization could be added here if needed,
		// e.g. resolving '..' but epub-parser hrefs are usually root-relative or full.
		return normalized;
	}

	// New function to get chapter title from ToC
	private static getChapterTitleFromToc(cfi: string, toc: TocEntry[], manifest: ManifestItem[], spine: SpineItem[]): string | null {
		if (!cfi || !toc || toc.length === 0 || !manifest || manifest.length === 0 || !spine || spine.length === 0) {
			// console.log('[getChapterTitleFromToc] Missing required data:', {cfiExists: !!cfi, tocExists: !!toc, manifestExists: !!manifest, spineExists: !!spine});
			return null;
		}

		try {
			// Parse CFI's base path to get the step
			const cfiMatch = cfi.match(/^epubcfi\(([^!]+)!/);
			if (!cfiMatch || !cfiMatch[1]) {
				// console.log('[getChapterTitleFromToc] Could not parse CFI base path:', cfi);
				return null;
			}
			const cfiBasePathString = cfiMatch[1]; // e.g., /6/2[someid] or /6/2

			// Extract the first numerical step component
			const stepMatch = cfiBasePathString.match(/^\/(\d+)/);
			if (!stepMatch || !stepMatch[1]) {
				// console.log('[getChapterTitleFromToc] Could not parse CFI step from base path:', cfiBasePathString);
				return null;
			}

			const cfiStep = parseInt(stepMatch[1], 10);
			if (isNaN(cfiStep) || cfiStep < 2) { // CFI steps are usually /2, /4, /6 etc. /2 seems to be the first possible main content item.
				// console.log('[getChapterTitleFromToc] Invalid CFI step:', cfiStep);
				return null;
			}

			// Determine document href from CFI using manifest and spine
			// CFI steps are 1-based for the EPUB reading order.
			// Spine items are 0-indexed.
			// Each content document takes two steps in the CFI path (e.g., /6/ refers to the 3rd document, /4/ to the 2nd).
			const spineIndex = (cfiStep / 2) - 1;

			if (spineIndex < 0 || spineIndex >= spine.length) {
				// console.log('[getChapterTitleFromToc] CFI spine index out of bounds:', spineIndex, 'spine length:', spine.length);
				return null;
			}

			const spineItem = spine[spineIndex];
			if (!spineItem || !spineItem.idref) {
				// console.log('[getChapterTitleFromToc] Invalid spine item or idref at index:', spineIndex, spineItem);
				return null;
			}

			const manifestItem = manifest.find(item => item.id === spineItem.idref);
			if (!manifestItem || !manifestItem.href) {
				// console.log('[getChapterTitleFromToc] Manifest item not found or href missing for idref:', spineItem.idref);
				return null;
			}

			const cfiDocHref = this.normalizePath(manifestItem.href);
			// console.log(`[getChapterTitleFromToc] CFI Doc Href: ${cfiDocHref} (from CFI step ${cfiStep}, spine index ${spineIndex})`);

			// Flatten ToC for easier searching
			const flattenToc = (tocEntries: TocEntry[]): TocEntry[] => {
				const flat: TocEntry[] = [];
				function recurse(items: TocEntry[]) {
					for (const item of items) {
						flat.push(item);
						if (item.subitems && item.subitems.length > 0) {
							recurse(item.subitems);
						}
					}
				}
				recurse(tocEntries);
				return flat;
			};
			const flatToc = flattenToc(toc);

			// Find matching chapter in ToC by comparing normalized hrefs
			// Iterate backwards to find the last ToC entry that matches the document,
			// as it's more likely to be the correct chapter if multiple ToC entries point to the same file.
			for (let i = flatToc.length - 1; i >= 0; i--) {
				const tocItem = flatToc[i];
				if (!tocItem.href) continue;

				const tocItemDocHref = this.normalizePath(tocItem.href);
				// console.log(`[getChapterTitleFromToc] Comparing CFI Doc: '${cfiDocHref}' with ToC Item: '${tocItemDocHref}' (Title: ${tocItem.title})`);
				if (tocItemDocHref === cfiDocHref) {
					// console.log(`[getChapterTitleFromToc] Matched: ${tocItem.title} for href ${cfiDocHref}`);
					return tocItem.title;
				}
			}
			// console.log('[getChapterTitleFromToc] No matching ToC item found for CFI href:', cfiDocHref);

		} catch (error: any) {
			console.error('[getChapterTitleFromToc] Error processing CFI for chapter title:', error.message, error.stack);
		}
		return null;
	}

	static sanitizeFrontmatter(text: string): string {
		if (!text) return '';

		const replacements: { [key: string]: string } = {
			':': ' -',
			'[': '(',
			']': ')',
			'{': '(',
			'}': ')',
			'#': '',
			'|': '-',
			'>': '-',
			'\\': '/',
			'\n': ' ',
			'\r': ' ',
		};

		let result = text;
		for (const [char, replacement] of Object.entries(replacements)) {
			result = result.replace(new RegExp(`\\${char}`, 'g'), replacement);
		}

		// Normalize whitespace
		result = result.replace(/\s+/g, ' ').trim();
		return result;
	}

	static extractChapterFromCFI(cfi: string): string | null {
		if (!cfi) return null;

		try {
			// Extract content in brackets from CFI
			// Examples: 'epubcfi(/6/12[chapter_4]!/4/10/1,:0,:4)' -> 'Chapter 4'
			// 'epubcfi(/6/24[c3.xhtml]!/4/188/2/1,:0,:1)' -> 'Chapter 3'
			const bracketMatch = cfi.match(/\[([^\]]+)\]/);
			if (!bracketMatch) return null;

			const chapterId = bracketMatch[1];

			// Handle different chapter naming patterns (based on Python script logic)
			if (chapterId.toLowerCase().includes('chapter_')) {
				// Extract number from 'chapter_4' -> 'Chapter 4'
				const chapterMatch = chapterId.match(/chapter_(\d+)/i);
				if (chapterMatch) {
					return `Chapter ${chapterMatch[1]}`;
				}
			}

			if (chapterId.toLowerCase().startsWith('c') && 
				/^c\d+/.test(chapterId.toLowerCase())) {
				// Handle 'c3.xhtml' -> 'Chapter 3'
				const chapterMatch = chapterId.match(/^c(\d+)/i);
				if (chapterMatch) {
					return `Chapter ${chapterMatch[1]}`;
				}
			}

			if (chapterId.toLowerCase().includes('preface') || 
				chapterId.toLowerCase().includes('foreword')) {
				return 'Preface';
			}

			if (chapterId.toLowerCase().includes('introduction') || 
				chapterId.toLowerCase().includes('intro')) {
				return 'Introduction';
			}

			if (chapterId.toLowerCase().includes('appendix')) {
				return 'Appendix';
			}

			if (chapterId.toLowerCase().includes('title')) {
				return 'Title Page';
			}

			if (chapterId.toLowerCase().includes('text')) {
				// Handle generic text sections - try to make them readable
				if (chapterId.toLowerCase().includes('text-2')) {
					return 'Preface';
				} else if (chapterId.toLowerCase().includes('text-3')) {
					return 'Preface (continued)';
				} else if (chapterId.toLowerCase().includes('text-5')) {
					return 'How to Begin';
				} else {
					return 'Text Section';
				}
			}

			// Fallback: clean up the raw chapter ID
			const cleaned = chapterId.replace(/[_-]/g, ' ');
			return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
		} catch (error) {
			return null;
		}
	}

	static formatCitation(book: BookDetail, physicalLocation?: number | null): string {
		const parts: string[] = [];

		if (book.author) {
			parts.push(book.author);
		}

		if (book.title) {
			parts.push(`*${book.title}*`);
		}

		if (book.publisher) {
			parts.push(book.publisher);
		}

		if (book.publicationDate) {
			const year = book.publicationDate.length >= 4 
				? book.publicationDate.substring(0, 4) 
				: book.publicationDate;
			parts.push(year);
		}

		if (physicalLocation && physicalLocation > 0) {
			parts.push(`loc. ${physicalLocation}`);
		}

		return parts.join(', ') + '.';
	}

	static generateMarkdown(
		book: BookDetail, 
		annotations: Annotation[], 
		settings: AppleBooksImporterSettings
	): string {
		let content = '';

		// Generate frontmatter
		content += '---\n';
		
		// Basic metadata - include asset_id like Python version
		if (book.assetId) {
			content += `asset_id: ${book.assetId}\n`;
		}
		content += `title: ${this.sanitizeFrontmatter(book.title)}\n`;
		if (book.author) {
			content += `author: ${this.sanitizeFrontmatter(book.author)}\n`;
		}

		// Extended metadata in frontmatter if enabled
		if (settings.includeExtendedFrontmatter) {
			if (book.description) {
				content += `description: ${this.sanitizeFrontmatter(book.description)}\n`;
			}
			if (book.epubId) {
				content += `epub_id: ${book.epubId}\n`;
			}
			if (book.path) {
				content += `path: ${book.path}\n`;
			}
			if (book.isbn) {
				content += `isbn: ${book.isbn}\n`;
			}
			if (book.language) {
				content += `language: ${book.language}\n`;
			}
			if (book.publisher) {
				content += `publisher: ${this.sanitizeFrontmatter(book.publisher)}\n`;
			}
			if (book.publicationDate) {
				content += `publication_date: ${book.publicationDate}\n`;
			}
			if (book.year) {
				content += `year: ${book.year}\n`;
			}
			if (book.genre) {
				content += `genre: ${this.sanitizeFrontmatter(book.genre)}\n`;
			}
			if (book.pageCount) {
				content += `page_count: ${book.pageCount}\n`;
			}
			if (book.rating && book.rating > 0) {
				content += `rating: ${book.rating}\n`;
			}
			if (book.readingProgress !== null && book.readingProgress > 0 && settings.includeReadingProgress) {
				content += `reading_progress: ${Math.round(book.readingProgress * 100)}%\n`;
			}
			if (book.subjects && book.subjects.length > 0) {
				content += `subjects: [${book.subjects.map((s: string) => `"${this.sanitizeFrontmatter(s)}"`).join(', ')}]\n`;
			}
			if (book.rights) {
				content += `rights: ${this.sanitizeFrontmatter(book.rights)}\n`;
			}
			if (book.lastOpenDate) {
				content += `last_opened: ${book.lastOpenDate.toISOString().split('T')[0]}\n`;
			}
		}

		// Add tags if enabled
		if (settings.addTags && settings.customTags) {
			const tags = settings.customTags
				.split(',')
				.map(tag => tag.trim())
				.filter(tag => tag.length > 0)
				.map(tag => tag.startsWith('#') ? tag : `#${tag}`)
				.join(', ');
			content += `tags: ${tags}\n`;
		}

		content += '---\n\n';

		// Title
		content += `# ${book.title}`;
		if (book.author) {
			content += ` by ${book.author}`;
		}
		content += '\n\n';

		// Cover image if available and enabled
		if (settings.includeCovers && book.cover) {
			content += '<p align="center">';
			content += `<img src="data:image/jpeg;base64,${book.cover}" width="50%">`;
			content += '</p>\n\n';
		}

		// Check if we should include metadata section in note body
		const shouldIncludeMetadataSection = settings.includeExtendedInNote || 
			(book.author && settings.createAuthorPages) ||
			(settings.addTags && settings.customTags);

		if (shouldIncludeMetadataSection) {
			// Metadata section - only if we have content to show
			content += '## Metadata\n\n';
			
			// Always include core fields if we're showing metadata section
			if (book.assetId && settings.includeExtendedInNote) {
				content += `- **Asset ID:** ${book.assetId}\n`;
			}
			content += `- **Title:** ${book.title}\n`;
			if (book.author) {
				if (settings.createAuthorPages) {
					// Create author link nested inside the output folder
					const outputFolder = settings.outputFolder?.trim();
					const authorPath = outputFolder ? `${outputFolder}/Authors/${book.author}` : `Authors/${book.author}`;
					content += `- **Author:** [[${authorPath}]]\n`;
				} else {
					content += `- **Author:** ${book.author}\n`;
				}
			}
			
			// Extended metadata in note body only if enabled
			if (settings.includeExtendedInNote) {
				if (book.description) {
					content += `- **Description:** ${book.description}\n`;
				}
				if (book.epubId) {
					content += `- **EPUB ID:** ${book.epubId}\n`;
				}
				if (book.path) {
					content += `- **Path:** [${book.path}](file://${book.path})\n`;
				}
				if (book.isbn) {
					content += `- **ISBN:** ${book.isbn}\n`;
				}
				if (book.language) {
					content += `- **Language:** ${book.language}\n`;
				}
				if (book.publisher) {
					content += `- **Publisher:** ${book.publisher}\n`;
				}
				if (book.publicationDate) {
					content += `- **Publication Date:** ${book.publicationDate}\n`;
				}
				if (book.year && book.year !== book.publicationDate) {
					content += `- **Year:** ${book.year}\n`;
				}
				if (book.genre) {
					content += `- **Genre:** ${book.genre}\n`;
				}
				if (book.pageCount) {
					content += `- **Page Count:** ${book.pageCount}\n`;
				}
				if (book.rating && book.rating > 0) {
					content += `- **Rating:** ${book.rating}/5 ⭐\n`;
				}
				if (book.readingProgress !== null && book.readingProgress > 0) {
					content += `- **Reading Progress:** ${Math.round(book.readingProgress * 100)}%\n`;
				}
				if (book.subjects && book.subjects.length > 0) {
					content += `- **Subjects:** ${book.subjects.join(', ')}\n`;
				}
				if (book.rights) {
					content += `- **Rights:** ${book.rights}\n`;
				}
				if (book.lastOpenDate) {
					content += `- **Last Opened:** ${book.lastOpenDate.toDateString()}\n`;
				}
				if (book.comments) {
					content += `- **Comments:** ${book.comments}\n`;
				}
			}

			if (settings.addTags && settings.customTags) {
				content += `- **Tags:** ${settings.customTags}\n`;
			}

			content += '\n';
		}

		content += '## Annotations\n\n';

		// Process annotations
		let currentChapter: string | null = null;
		
		// Filter annotations one more time to ensure no empty ones slip through
		const validAnnotations = annotations.filter(annotation => {
			const trimmedText = annotation.selectedText.trim();
			return trimmedText.length > 0;
		});
		
		if (validAnnotations.length === 0) {
			content += 'No annotations found for this book.\n\n';
			return content;
		}
		
		for (const annotation of validAnnotations) {
			// Skip if somehow we still have empty text
			const trimmedText = annotation.selectedText.trim();
			if (trimmedText.length === 0) {
				continue;
			}
			
			// Add chapter heading if enabled and we have a new chapter
			if (settings.includeChapterInfo && annotation.location) {
				let chapter: string | null = null;
				// Try new method first
				if (book.toc && book.manifest && book.spine) {
					chapter = MarkdownGenerator.getChapterTitleFromToc(annotation.location, book.toc, book.manifest, book.spine);
				}
				// Fallback to old method if new one fails or data is missing
				if (!chapter) {
					chapter = MarkdownGenerator.extractChapterFromCFI(annotation.location);
				}

				if (chapter && chapter !== currentChapter) {
					currentChapter = chapter;
					content += `### ${chapter}\n\n`;
				}
			}

			// Add annotation style indicator if available and enabled
			let styleIndicator = '';
			if (settings.includeAnnotationStyles) {
				if (annotation.annotationStyle !== null) {
					switch (annotation.annotationStyle) {
						case 0: styleIndicator = ''; break;    // Style 0 is for underline, color is handled by isUnderline or default
						case 1: styleIndicator = '🟢 '; break; // Green
						case 2: styleIndicator = '🔵 '; break; // Blue
						case 3: styleIndicator = '🟡 '; break; // Yellow
						case 4: styleIndicator = '🔴 '; break; // Pink (using Red icon as proxy)
						case 5: styleIndicator = '🟣 '; break; // Purple
						default: styleIndicator = ''; break;   // No icon for unknown styles
					}
				}
				if (annotation.isUnderline) {
					styleIndicator += '📝 '; // Underline indicator
				}
			}

			// Add the highlight as a blockquote with style indicator
			// DON'T trim individual lines - preserve original formatting including indentation
			const highlightLines = trimmedText.split('\n');
			
			for (let i = 0; i < highlightLines.length; i++) {
				const line = highlightLines[i];
				if (i === 0) {
					content += `> ${styleIndicator}${line}\n`;
				} else {
					content += `> ${line}\n`;
				}
			}
			content += '\n';

			// Add citation if enabled
			if (settings.includeCitations) {
				const citation = this.formatCitation(book, annotation.physicalLocation);
				content += `*${citation}*\n\n`;
			}

			// Add annotation date if enabled
			if (settings.includeAnnotationDates && annotation.creationDate) {
				content += `*(Created: ${annotation.creationDate.toDateString()})*\n\n`;
			}

			// Add note if present
			if (annotation.note && annotation.note.trim().length > 0) {
				content += `**Note:** ${annotation.note.trim()}\n\n`;
			}

			content += '---\n\n';
		}

		return content;
	}

	static generateFileName(book: BookDetail): string {
		const title = book.title || 'Unknown Title';
		const author = book.author || 'Unknown Author';
		
		// Sanitize filename
		const sanitize = (str: string) => {
			return str.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
		};

		return `${sanitize(title)} - ${sanitize(author)}.md`;
	}
}
