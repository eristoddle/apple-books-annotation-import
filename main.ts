// main.ts
import { Notice, Plugin, TFile } from 'obsidian';
import { AppleBooksImporterSettings, BookDetail, Annotation } from './types';
import { AppleBooksImporterSettingTab, DEFAULT_SETTINGS } from './settings';
import { AppleBooksDatabase } from './database';
import { MarkdownGenerator } from './markdown';

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
			const booksWithHighlights = AppleBooksDatabase.getBooksWithHighlights();
			console.log('Books with highlights:', booksWithHighlights);
			
			if (booksWithHighlights.length === 0) {
				new Notice('No books with highlights found in Apple Books', 4000);
				return;
			}

			new Notice(`Found ${booksWithHighlights.length} books with highlights`, 3000);

			// Get book details
			const allBooks = AppleBooksDatabase.getBookDetails();
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
					let annotations = AppleBooksDatabase.getAnnotationsForBook(assetId);
					
					if (annotations.length === 0) {
						skippedCount++;
						continue;
					}

					// Sort annotations if enabled
					if (this.settings.sortAnnotations) {
						annotations = AppleBooksDatabase.sortAnnotationsByCFI(annotations);
					}

					// Generate markdown content
					const markdownContent = MarkdownGenerator.generateMarkdown(
						book, 
						annotations, 
						this.settings
					);

					// Generate filename
					const fileName = MarkdownGenerator.generateFileName(book);

					// Create the file
					await this.createBookNote(fileName, markdownContent);
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

	async createBookNote(fileName: string, content: string): Promise<void> {
		try {
			// Determine the full path
			const outputFolder = this.settings.outputFolder.trim();
			const fullPath = outputFolder ? `${outputFolder}/${fileName}` : fileName;

			// Check if folder exists and create if needed
			if (outputFolder) {
				const folderExists = await this.app.vault.adapter.exists(outputFolder);
				if (!folderExists) {
					await this.app.vault.createFolder(outputFolder);
				}
			}

			// Check if file already exists
			const fileExists = await this.app.vault.adapter.exists(fullPath);
			
			if (fileExists && !this.settings.overwriteExisting) {
				console.log(`Skipping existing file: ${fullPath}`);
				return;
			}

			// Create or update the file
			if (fileExists) {
				const file = this.app.vault.getAbstractFileByPath(fullPath) as TFile;
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(fullPath, content);
			}

		} catch (error: any) {
			throw new Error(`Failed to create note ${fileName}: ${error?.message || 'Unknown error'}`);
		}
	}

	async showBookSelector() {
		// This is a placeholder for future enhancement
		// Could show a modal with checkboxes to select specific books
		new Notice('📖 Book selector coming in a future update!', 3000);
		
		try {
			const dbCheck = AppleBooksDatabase.checkDatabaseAccess();
			if (!dbCheck.canAccess) {
				new Notice(`❌ ${dbCheck.error}`, 5000);
				return;
			}

			const booksWithHighlights = AppleBooksDatabase.getBooksWithHighlights();
			const allBooks = AppleBooksDatabase.getBookDetails();
			
			const availableBooks = booksWithHighlights
				.map(assetId => allBooks.find(b => b.assetId === assetId))
				.filter((book): book is BookDetail => book !== undefined)
				.map(book => `• ${book.title} by ${book.author || 'Unknown Author'}`)
				.join('\n');

			if (availableBooks) {
				new Notice(`Available books:\n${availableBooks}`, 10000);
			} else {
				new Notice('No books with highlights found', 3000);
			}

		} catch (error: any) {
			new Notice(`❌ Error listing books: ${error?.message || 'Unknown error'}`, 5000);
		}
	}
}