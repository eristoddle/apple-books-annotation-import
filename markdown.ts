// markdown.ts
import { BookDetail, Annotation, AppleBooksImporterSettings } from './types';

export class MarkdownGenerator {
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
				const chapter = this.extractChapterFromCFI(annotation.location);
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
						case 0: styleIndicator = '🟡 '; break; // Yellow highlight
						case 1: styleIndicator = '🟢 '; break; // Green highlight
						case 2: styleIndicator = '🔵 '; break; // Blue highlight
						case 3: styleIndicator = '🟣 '; break; // Purple highlight
						case 4: styleIndicator = '🔴 '; break; // Red highlight
						default: styleIndicator = ''; break;
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

			// Add citation with creation date if available (only if enabled)
			if (settings.includeCitations) {
				const citation = this.formatCitation(book, annotation.physicalLocation);
				let citationLine = `*${citation}*`;
				if (annotation.creationDate && settings.includeAnnotationDates) {
					citationLine += ` *(Created: ${annotation.creationDate.toDateString()})*`;
				}
				content += `${citationLine}\n\n`;
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
