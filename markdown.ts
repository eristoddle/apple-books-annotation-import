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
			const bracketMatch = cfi.match(/\[([^\]]+)\]/);
			if (!bracketMatch) return null;

			const chapterId = bracketMatch[1];
			console.log('Extracted chapter ID:', chapterId);

			// Handle different chapter naming patterns
			if (chapterId.toLowerCase().includes('chapter_')) {
				const chapterMatch = chapterId.match(/chapter_(\d+)/i);
				if (chapterMatch) {
					return `Chapter ${chapterMatch[1]}`;
				}
			}

			if (chapterId.toLowerCase().match(/^c\d+/)) {
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
				if (chapterId.toLowerCase().includes('text-2') || chapterId.toLowerCase().includes('text 2')) {
					return 'Preface';
				} else if (chapterId.toLowerCase().includes('text-3') || chapterId.toLowerCase().includes('text 3')) {
					return 'Preface (continued)';
				} else if (chapterId.toLowerCase().includes('text-5') || chapterId.toLowerCase().includes('text 5')) {
					return 'How to Begin';
				} else {
					return 'Text Section';
				}
			}

			// Clean up the raw chapter ID as fallback
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
		
		// Basic metadata
		content += `title: ${this.sanitizeFrontmatter(book.title)}\n`;
		if (book.author) {
			content += `author: ${this.sanitizeFrontmatter(book.author)}\n`;
		}

		// Extended metadata if enabled
		if (settings.includeMetadata) {
			if (book.description) {
				content += `description: ${this.sanitizeFrontmatter(book.description)}\n`;
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

		// Metadata section
		content += '## Metadata\n\n';
		
		if (book.author) {
			content += `- **Author:** [[Authors/${book.author}]]\n`;
		}
		
		if (book.path && settings.includeMetadata) {
			content += `- **Path:** [${book.path}](file://${book.path})\n`;
		}
		
		if (settings.includeMetadata) {
			if (book.isbn) content += `- **ISBN:** ${book.isbn}\n`;
			if (book.language) content += `- **Language:** ${book.language}\n`;
			if (book.publisher) content += `- **Publisher:** ${book.publisher}\n`;
			if (book.publicationDate) content += `- **Publication Date:** ${book.publicationDate}\n`;
		}

		if (settings.addTags && settings.customTags) {
			content += `- **Tags:** ${settings.customTags}\n`;
		}

		content += '\n## Annotations\n\n';

		// Process annotations
		let currentChapter: string | null = null;
		
		for (const annotation of annotations) {
			// Add chapter heading if enabled and we have a new chapter
			if (settings.includeChapterInfo && annotation.location) {
				const chapter = this.extractChapterFromCFI(annotation.location);
				if (chapter && chapter !== currentChapter) {
					currentChapter = chapter;
					content += `### ${chapter}\n\n`;
				}
			}

			// Add the highlight as a blockquote
			const highlightLines = annotation.selectedText.split('\n');
			for (const line of highlightLines) {
				content += `> ${line}\n`;
			}
			content += '\n';

			// Add citation
			const citation = this.formatCitation(book, annotation.physicalLocation);
			content += `*${citation}*\n\n`;

			// Add note if present
			if (annotation.note) {
				content += `**Note:** ${annotation.note}\n\n`;
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