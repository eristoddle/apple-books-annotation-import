// main.ts
import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import * as fm from 'front-matter';
import { AppleBooksImporterSettings, BookDetail, Annotation } from './types';
import { BookSelectionModal, BookSelectionItem } from './BookSelectionModal'; // Import the modal and item type
import { AppleBooksImporterSettingTab, DEFAULT_SETTINGS } from './settings';
import { AppleBooksDatabase } from './database';
import { NoteRenderer } from './markdown';
import { CryptoUtils } from './crypto';

export default class AppleBooksImporterPlugin extends Plugin {
	settings: AppleBooksImporterSettings;

	async onload() {
		await this.loadSettings();

		// Check if we can access the databases on startup
		const dbCheck = AppleBooksDatabase.checkDatabaseAccess();
		if (!dbCheck.canAccess) {
			console.warn(`Apple Books Importer: ${dbCheck.error}`);
		}

		// Add settings tab
		this.addSettingTab(new AppleBooksImporterSettingTab(this.app, this));

		// Add command to import all books
		this.addCommand({
			id: 'import-all-books',
			name: 'Import all books with highlights',
			callback: () => this.importAllBooks(),
		});

		// Add command to import specific book (future enhancement)
		this.addCommand({
			id: 'import-selected-books',
			name: 'Select books to import',
			callback: () => this.showBookSelector(),
		});

		// Add ribbon icon
		this.addRibbonIcon('book-open', 'Import Apple Books highlights', () => {
			this.importAllBooks();
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async importAllBooks() {
		// Check database access first
		const dbCheck = AppleBooksDatabase.checkDatabaseAccess();
		if (!dbCheck.canAccess) {
			new Notice(`❌ ${dbCheck.error}`, 5000);
			return;
		}

		new Notice('📚 Starting Apple Books import...', 3000);

		try {
			// Get all books with highlights
			console.log('Getting books with highlights...');
			const booksWithHighlights = await AppleBooksDatabase.getBooksWithHighlights();
			console.log('Books with highlights:', booksWithHighlights);
			
			if (booksWithHighlights.length === 0) {
				new Notice('No books with highlights found in Apple Books', 4000);
				return;
			}

			new Notice(`Found ${booksWithHighlights.length} books with highlights`, 3000);

			// Get book details
			const allBooks = await AppleBooksDatabase.getBookDetails();
			let importedCount = 0;
			let skippedCount = 0;

			for (const assetId of booksWithHighlights) {
				try {
					const book = allBooks.find(b => b.assetId === assetId);
					if (!book) {
						console.warn(`Book details not found for asset ID: ${assetId}`);
						skippedCount++;
						continue;
					}

					// Get annotations for this book
					let annotations = await AppleBooksDatabase.getAnnotationsForBook(assetId);
					
					// Debug logging for books with potential list splitting issues
					// Look for annotations that seem like list items or short fragments
					const hasListPattern = annotations.some(annotation => {
						const text = annotation.selectedText.trim();
						return text.length < 50 && (
							text.includes(':') ||  // "People: 75 entries"
							/^\w+:/.test(text) ||   // "Experiences:"
							/\d+\s+entries?/.test(text) // "76 entries"
						);
					});

					if (hasListPattern) {
						console.log('\n=== DEBUGGING LIST PATTERN BOOK ===');
						console.log(`Book: ${book.title}`);
						console.log(`Raw annotations count: ${annotations.length}`);
						annotations.forEach((annotation, i) => {
							console.log(`\nAnnotation ${i}:`);
							console.log(`  Text: "${annotation.selectedText}"`);
							console.log(`  Text length: ${annotation.selectedText.length}`);
							console.log(`  Location: ${annotation.location}`);
							console.log(`  Physical: ${annotation.physicalLocation}`);
						});
						console.log('=== END DEBUG ===\n');
					}
					
					// Filter out any annotations with empty text (additional safety check)
					annotations = annotations.filter(annotation => {
						const trimmedText = annotation.selectedText.trim();
						return trimmedText.length > 0;
					});
					
					if (annotations.length === 0) {
						console.log(`No valid annotations found for: ${book.title}`);
						skippedCount++;
						continue;
					}

					// Sort annotations if enabled
					if (this.settings.sortAnnotations) {
						annotations = AppleBooksDatabase.sortAnnotationsByCFI(annotations);
					}

					// Extract additional metadata from EPUB if available
					let enrichedBook = book;
					if (book.path && (this.settings.includeCovers || this.settings.includeExtendedFrontmatter || this.settings.includeExtendedInNote)) {
						try {
							const epubMetadata = await AppleBooksDatabase.getEpubMetadata(book.path);
							if (epubMetadata) {
								// Merge EPUB metadata with existing book data
								enrichedBook = {
									...book,
									isbn: epubMetadata.isbn || book.isbn,
									language: epubMetadata.language || book.language,
									publisher: epubMetadata.publisher || book.publisher,
									publicationDate: epubMetadata.publicationDate || book.publicationDate,
									rights: epubMetadata.rights || book.rights,
									subjects: epubMetadata.subjects || book.subjects,
									cover: epubMetadata.cover || book.cover
								};
								console.log(`Enhanced metadata for: ${book.title}`);
							}
						} catch (epubError) {
							console.log(`EPUB processing failed for ${book.title}, continuing with basic metadata`);
						}
					}

					await this.importBook(enrichedBook, annotations);
					importedCount++;

					// Show progress for long imports
					if (importedCount % 5 === 0) {
						new Notice(`Imported ${importedCount} books...`, 2000);
					}
				} catch (error) {
					console.error(`Error importing book ${assetId}:`, error);
					skippedCount++;
				}
			}

			// Show final result
			const message = `✅ Import complete! ${importedCount} books imported${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`;
			new Notice(message, 5000);

		} catch (error: any) {
			console.error('Error during import:', error);
			new Notice(`❌ Import failed: ${error?.message || 'Unknown error'}`, 5000);
		}
	}

	async importBook(book: BookDetail, annotations: Annotation[]): Promise<void> {
		try {
			// Generate the new note body and its hash
			const newNoteBody = NoteRenderer.render(book, annotations, this.settings);
			const newContentHash = await CryptoUtils.generateSha256(newNoteBody);

			// Determine the full path
			const outputFolder = this.settings.outputFolder.trim();
			const fileName = NoteRenderer.getFileName(book);
			const fullPath = outputFolder ? `${outputFolder}/${fileName}` : fileName;

			// Check if folder exists and create if needed
			if (outputFolder) {
				const folderExists = await this.app.vault.adapter.exists(outputFolder);
				if (!folderExists) {
					await this.app.vault.createFolder(outputFolder);
				}
			}

			const fileExists = await this.app.vault.adapter.exists(fullPath);

			if (fileExists) {
				if (this.settings.overwriteExisting === 'never') {
					console.log(`Skipping existing file (overwrite setting is 'never'): ${fullPath}`);
					return;
				}

				if (this.settings.overwriteExisting === 'smart') {
					const existingContent = await this.app.vault.adapter.read(fullPath);
					const frontmatter = fm(existingContent);
					const lastImportHash = frontmatter?.attributes?.['last-import-hash'];

					if (lastImportHash && lastImportHash === newContentHash) {
						console.log(`No changes detected for ${fullPath}. Skipping.`);
						return;
					}
				}
			}

			// Generate the full content with frontmatter
			const fullNewContent = NoteRenderer.renderFull(book, newNoteBody, newContentHash, this.settings);

			// Create or update the file
			if (fileExists) {
				const file = this.app.vault.getAbstractFileByPath(fullPath) as TFile;
				await this.app.vault.modify(file, fullNewContent);
			} else {
				await this.app.vault.create(fullPath, fullNewContent);
			}

			// Create author page if needed
			if (book.author && this.settings.createAuthorPages) {
				await this.createAuthorPageIfNeeded(book.author);
			}
		} catch (error: any) {
			throw new Error(`Failed to create note ${book.title}: ${error?.message || 'Unknown error'}`);
		}
	}

	async createAuthorPageIfNeeded(authorName: string): Promise<void> {
		if (!this.settings.createAuthorPages || !authorName) {
			return;
		}

		try {
			// Determine the authors folder path - nested inside the books output folder
			const outputFolder = this.settings.outputFolder.trim();
			const authorsFolder = outputFolder ? `${outputFolder}/Authors` : 'Authors';
			
			// Ensure Authors folder exists (create parent folders if needed)
			const authorsFolderExists = await this.app.vault.adapter.exists(authorsFolder);
			if (!authorsFolderExists) {
				await this.app.vault.createFolder(authorsFolder);
			}

			// Check if author page already exists
			const authorFileName = `${authorName}.md`;
			const authorFilePath = `${authorsFolder}/${authorFileName}`;
			const authorFileExists = await this.app.vault.adapter.exists(authorFilePath);

			if (!authorFileExists) {
				// Create author page with dataview query
				const booksFolderPath = outputFolder || '';
				const searchPath = booksFolderPath ? `"${booksFolderPath}"` : '';
				
				const authorPageContent = `# ${authorName}

## Books by this Author

\`\`\`dataview
TABLE title as "Title", publication_date as "Published", tags as "Tags"
FROM ${searchPath}
WHERE author = "${authorName}"
SORT publication_date DESC
\`\`\`

## Notes about ${authorName}

<!-- Add your notes about this author here -->
`;

				await this.app.vault.create(authorFilePath, authorPageContent);
				console.log(`Created author page: ${authorFilePath}`);
			}

		} catch (error: any) {
			console.error(`Failed to create author page for ${authorName}:`, error);
			// Don't throw error - author page creation failure shouldn't stop book import
		}
	}

	async showBookSelector() {
		const dbCheck = AppleBooksDatabase.checkDatabaseAccess();
		if (!dbCheck.canAccess) {
			new Notice(`❌ ${dbCheck.error}`, 5000);
			return;
		}

		try {
			new Notice('Loading books for selection...', 2000);
			const allBookDetails = await AppleBooksDatabase.getBookDetails();
			const booksWithHighlightsIds = await AppleBooksDatabase.getBooksWithHighlights();

			if (booksWithHighlightsIds.length === 0) {
				new Notice('No books with highlights found in Apple Books.', 4000);
				return;
			}

			// Filter book details to only those with highlights
			// and prepare them for the modal
			const booksForModalPromises = allBookDetails
				.filter(book => booksWithHighlightsIds.includes(book.assetId))
				.map(async (book) => {
					let annotationCount = 0;
					let coverImage: string | undefined = undefined;

					// Get annotation count
					try {
						const annotations = await AppleBooksDatabase.getAnnotationsForBook(book.assetId);
						annotationCount = annotations.filter(ann => ann.selectedText.trim().length > 0).length;
					} catch (e) {
						console.warn(`Could not fetch annotation count for ${book.title}`, e);
					}

					// Get cover image if setting is enabled (and path exists)
					// This might be slow if there are many books. Consider a placeholder or fetching on demand later.
					if (this.settings.includeCovers && book.path) {
						try {
							const epubMetadata = await AppleBooksDatabase.getEpubMetadata(book.path);
							if (epubMetadata && epubMetadata.cover) {
								coverImage = `data:image/jpeg;base64,${epubMetadata.cover}`;
							}
						} catch(e) {
							console.warn(`Could not fetch cover for ${book.title}`, e);
						}
					}

					return {
						...book,
						annotationCount: annotationCount,
						selected: true, // Default to selected
						coverImage: coverImage,
					} as BookSelectionItem;
				});

			const booksForModal = await Promise.all(booksForModalPromises);
			
			// Filter out books that ended up with 0 annotations after fetching
			const finalBooksForModal = booksForModal.filter(book => book.annotationCount > 0);

			if (finalBooksForModal.length === 0) {
				new Notice('No books with valid annotations found after processing.', 4000);
				return;
			}

			new BookSelectionModal(this.app, finalBooksForModal, async (selectedBooks) => {
				if (selectedBooks.length > 0) {
					new Notice(`Importing ${selectedBooks.length} selected books...`, 3000);
					await this.importSelectedBooks(selectedBooks as BookDetail[]); // Cast if necessary, BookSelectionItem extends BookDetail
				} else {
					new Notice('No books selected for import.');
				}
			}).open();

		} catch (error: any) {
			console.error('Error preparing book selector:', error);
			new Notice(`❌ Error opening book selector: ${error?.message || 'Unknown error'}`, 5000);
		}
	}

	async importSelectedBooks(selectedBooks: BookDetail[]) {
		let importedCount = 0;
		let skippedCount = 0;

		for (const book of selectedBooks) {
			try {
				// We already have basic book details. We need annotations.
				// The 'book' object from selection modal might already be enriched if we decide to pass more data.
				// For now, assume 'book' is a BookDetail and we re-fetch annotations.

				let annotations = await AppleBooksDatabase.getAnnotationsForBook(book.assetId);
				annotations = annotations.filter(annotation => annotation.selectedText.trim().length > 0);

				if (annotations.length === 0) {
					console.log(`No valid annotations found for selected book: ${book.title}`);
					skippedCount++;
					continue;
				}

				// Sort annotations if enabled
				if (this.settings.sortAnnotations) {
					annotations = AppleBooksDatabase.sortAnnotationsByCFI(annotations);
				}

				// Enrich book with EPUB metadata if not already done, or if settings require it for markdown
				let enrichedBook = book;
				if (book.path && (this.settings.includeCovers || this.settings.includeExtendedFrontmatter || this.settings.includeExtendedInNote)) {
					// Check if cover was already fetched for the modal
					const bookFromModal = book as BookSelectionItem; // Cast to access potential coverImage
					if (bookFromModal.coverImage && this.settings.includeCovers) {
						// If cover was fetched for modal, reuse it by ensuring it's in the right format for MarkdownGenerator
						// MarkdownGenerator expects 'cover' to be base64 string if includeCovers is true.
						// Our coverImage is already 'data:image/jpeg;base64,...'
						// The MarkdownGenerator might need adjustment or we strip the prefix here.
						// For now, let's assume MarkdownGenerator can handle it or it expects raw base64.
						// Let's strip the prefix for now for 'enrichedBook.cover'
						if (bookFromModal.coverImage.startsWith('data:image/jpeg;base64,')) {
							enrichedBook.cover = bookFromModal.coverImage.substring('data:image/jpeg;base64,'.length);
						} else {
							// If not the expected format, try to re-fetch or clear
							enrichedBook.cover = null; // Assign null instead of undefined
						}
					}

					// Re-fetch full EPUB metadata if other extended details are needed,
					// or if cover wasn't fetched/available from modal.
					if (!enrichedBook.cover || this.settings.includeExtendedFrontmatter || this.settings.includeExtendedInNote) {
						try {
							const epubMetadata = await AppleBooksDatabase.getEpubMetadata(book.path);
							if (epubMetadata) {
								enrichedBook = {
									...enrichedBook, // keep existing data from selection
									isbn: epubMetadata.isbn || enrichedBook.isbn,
									language: epubMetadata.language || enrichedBook.language,
									publisher: epubMetadata.publisher || enrichedBook.publisher,
									publicationDate: epubMetadata.publicationDate || enrichedBook.publicationDate,
									rights: epubMetadata.rights || enrichedBook.rights,
									subjects: epubMetadata.subjects || enrichedBook.subjects,
									cover: epubMetadata.cover || enrichedBook.cover // Prioritize fresh epub cover if available
								};
							}
						} catch (epubError) {
							console.log(`EPUB processing failed for ${book.title} during selected import, continuing with basic/modal metadata`);
						}
					}
				}

				if (this.settings.saveCoverToAttachmentFolder) {
					enrichedBook.coverPath = await this.saveCoverFile(enrichedBook);
				}

				await this.importBook(enrichedBook, annotations);

				importedCount++;
				if (importedCount % 5 === 0 && importedCount < selectedBooks.length) {
					new Notice(`Imported ${importedCount} of ${selectedBooks.length} books...`, 2000);
				}

			} catch (error) {
				console.error(`Error importing selected book ${book.title} (ID: ${book.assetId}):`, error);
				new Notice(`❌ Error importing ${book.title}. Check console for details.`, 4000);
				skippedCount++;
			}
		}

		const message = `✅ Selected import complete! ${importedCount} books imported${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}.`;
		new Notice(message, 5000);
	}

	async saveCoverFile(book: BookDetail): Promise<string | null> {
		if (!this.settings.includeCovers || !book.cover) {
			return null;
		}

		try {
			const attachmentFolder = await AppleBooksDatabase.getAttachmentFolderPath(this.app);
			const coverFileName = `Cover - ${book.title}.jpg`;
			const coverPath = normalizePath(`${attachmentFolder}/${coverFileName}`);
			const coverExists = await this.app.vault.adapter.exists(coverPath);

			if (coverExists && !this.settings.overwriteExisting) {
				return coverPath;
			}

			const coverData = Buffer.from(book.cover, 'base64');
			await this.app.vault.createBinary(coverPath, coverData);

			return coverPath;
		} catch (error) {
			console.error(`Failed to save cover for ${book.title}:`, error);
			return null;
		}
	}
}