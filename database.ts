// database.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as glob from 'glob';
import * as sqlite3 from 'sqlite3';
import { BookDetail, Annotation } from './types';

const ANNOTATION_DB_PATTERN = path.join(
	os.homedir(),
	'Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation*.sqlite'
);

const LIBRARY_DB_PATTERN = path.join(
	os.homedir(),
	'Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary*.sqlite'
);

export class AppleBooksDatabase {
	private static getDbPath(pattern: string): string {
		const paths = glob.sync(pattern);
		if (paths.length === 0) {
			throw new Error(`No database found matching pattern: ${pattern}`);
		}
		return paths[0];
	}

	static checkDatabaseAccess(): { canAccess: boolean; error?: string } {
		try {
			// Check if we're on macOS
			if (os.platform() !== 'darwin') {
				return {
					canAccess: false,
					error: 'Apple Books Importer only works on macOS'
				};
			}

			// Check if annotation database exists
			const annotationPath = this.getDbPath(ANNOTATION_DB_PATTERN);
			if (!fs.existsSync(annotationPath)) {
				return {
					canAccess: false,
					error: 'Apple Books annotation database not found'
				};
			}

			// Check if library database exists
			const libraryPath = this.getDbPath(LIBRARY_DB_PATTERN);
			if (!fs.existsSync(libraryPath)) {
				return {
					canAccess: false,
					error: 'Apple Books library database not found'
				};
			}

			return { canAccess: true };
		} catch (error: any) {
			return {
				canAccess: false,
				error: `Database access error: ${error?.message || 'Unknown error'}`
			};
		}
	}

	static async getBookDetails(): Promise<BookDetail[]> {
		return new Promise((resolve, reject) => {
			try {
				const dbPath = this.getDbPath(LIBRARY_DB_PATTERN);
				console.log('Opening library database:', dbPath);
				const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
					if (err) {
						console.error('Error opening library database:', err);
						reject(new Error(`Failed to open library database: ${err.message}`));
						return;
					}

					const query = `
						SELECT ZASSETID, ZSORTTITLE, ZSORTAUTHOR, ZBOOKDESCRIPTION, ZEPUBID, ZPATH
						FROM ZBKLIBRARYASSET
					`;

					db.all(query, [], (err, rows: any[]) => {
						db.close();
						
						if (err) {
							console.error('Error querying library database:', err);
							reject(new Error(`Failed to query library database: ${err.message}`));
							return;
						}

						console.log('Library rows found:', rows.length);
						
						const bookDetails = rows.map((row: any) => ({
							assetId: row.ZASSETID,
							title: row.ZSORTTITLE || 'Unknown Title',
							author: row.ZSORTAUTHOR || null,
							description: row.ZBOOKDESCRIPTION || null,
							epubId: row.ZEPUBID || null,
							path: row.ZPATH || null,
							isbn: null,
							language: null,
							publisher: null,
							publicationDate: null,
							cover: null,
						}));

						resolve(bookDetails);
					});
				});
			} catch (error: any) {
				console.error('Error in getBookDetails:', error);
				reject(new Error(`Failed to get book details: ${error?.message || 'Unknown error'}`));
			}
		});
	}

	static async getBooksWithHighlights(): Promise<string[]> {
		return new Promise((resolve, reject) => {
			try {
				const annotationDbPath = this.getDbPath(ANNOTATION_DB_PATTERN);
				const libraryDbPath = this.getDbPath(LIBRARY_DB_PATTERN);
				console.log('Getting books with highlights from:', { annotationDbPath, libraryDbPath });

				// Get all book IDs from library first
				const libraryDb = new sqlite3.Database(libraryDbPath, sqlite3.OPEN_READONLY, (err) => {
					if (err) {
						reject(new Error(`Failed to open library database: ${err.message}`));
						return;
					}

					libraryDb.all('SELECT ZASSETID FROM ZBKLIBRARYASSET', [], (err, libraryRows: any[]) => {
						if (err) {
							libraryDb.close();
							reject(new Error(`Failed to query library: ${err.message}`));
							return;
						}

						console.log('Library rows:', libraryRows.length);

						// Filter out any null/undefined asset IDs and ensure they're strings
						const bookIds = libraryRows
							.map((row: any) => row?.ZASSETID)
							.filter((id: any) => id !== null && id !== undefined)
							.map((id: any) => String(id));

						console.log('Valid book IDs:', bookIds.length);
						libraryDb.close();

						if (bookIds.length === 0) {
							console.log('No book IDs found');
							resolve([]);
							return;
						}

						// Now get annotations
						const annotationDb = new sqlite3.Database(annotationDbPath, sqlite3.OPEN_READONLY, (err) => {
							if (err) {
								reject(new Error(`Failed to open annotation database: ${err.message}`));
								return;
							}

							const query = `
								SELECT DISTINCT ZANNOTATIONASSETID
								FROM ZAEANNOTATION
								WHERE ZANNOTATIONASSETID IS NOT NULL
								AND ZANNOTATIONSELECTEDTEXT IS NOT NULL
								AND ZANNOTATIONSELECTEDTEXT != ""
							`;

							annotationDb.all(query, [], (err, annotationRows: any[]) => {
								annotationDb.close();

								if (err) {
									reject(new Error(`Failed to query annotations: ${err.message}`));
									return;
								}

								console.log('Annotation rows found:', annotationRows.length);

								// Filter annotations to only include books that exist in our library
								const booksWithHighlights = annotationRows
									.map((row: any) => row?.ZANNOTATIONASSETID)
									.filter((id: any) => id !== null && id !== undefined)
									.map((id: any) => String(id))
									.filter((id: string) => bookIds.includes(id));

								console.log('Books with highlights:', booksWithHighlights.length);
								resolve([...new Set(booksWithHighlights)]); // Remove duplicates
							});
						});
					});
				});
			} catch (error: any) {
				console.error('Error in getBooksWithHighlights:', error);
				reject(new Error(`Failed to get books with highlights: ${error?.message || 'Unknown error'}`));
			}
		});
	}

	static async getAnnotationsForBook(assetId: string): Promise<Annotation[]> {
		return new Promise((resolve, reject) => {
			try {
				const dbPath = this.getDbPath(ANNOTATION_DB_PATTERN);
				const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
					if (err) {
						reject(new Error(`Failed to open annotation database: ${err.message}`));
						return;
					}

					const query = `
						SELECT ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE, ZANNOTATIONLOCATION, ZPLABSOLUTEPHYSICALLOCATION
						FROM ZAEANNOTATION
						WHERE ZANNOTATIONASSETID = ? AND ZANNOTATIONSELECTEDTEXT != ""
						ORDER BY ZPLABSOLUTEPHYSICALLOCATION
					`;

					db.all(query, [assetId], (err, rows: any[]) => {
						db.close();

						if (err) {
							reject(new Error(`Failed to query annotations for book ${assetId}: ${err.message}`));
							return;
						}

						const annotations = rows.map((row: any) => ({
							selectedText: row.ZANNOTATIONSELECTEDTEXT || '',
							note: row.ZANNOTATIONNOTE || null,
							location: row.ZANNOTATIONLOCATION || null,
							physicalLocation: row.ZPLABSOLUTEPHYSICALLOCATION || null,
						}));

						resolve(annotations);
					});
				});
			} catch (error: any) {
				reject(new Error(`Failed to get annotations for book ${assetId}: ${error?.message || 'Unknown error'}`));
			}
		});
	}

	static sortAnnotationsByCFI(annotations: Annotation[]): Annotation[] {
		return annotations.sort((a, b) => {
			// If we have physical locations, use those
			if (a.physicalLocation !== null && b.physicalLocation !== null) {
				return a.physicalLocation - b.physicalLocation;
			}

			// Fallback to CFI parsing
			const aCfi = this.parseCFIForSorting(a.location || '');
			const bCfi = this.parseCFIForSorting(b.location || '');

			for (let i = 0; i < Math.min(aCfi.length, bCfi.length); i++) {
				if (aCfi[i] !== bCfi[i]) {
					return aCfi[i] - bCfi[i];
				}
			}

			return aCfi.length - bCfi.length;
		});
	}

	private static parseCFIForSorting(cfi: string): number[] {
		if (!cfi || !cfi.startsWith('epubcfi(')) {
			return [0];
		}

		try {
			// Remove 'epubcfi(' and ')' and extract numbers
			const content = cfi.substring(8, cfi.length - 1);
			const parts = content.split('!');
			const numbers: number[] = [];

			for (const part of parts) {
				// Remove bracketed content and extract numbers
				const cleanPart = part.replace(/\[[^\]]*\]/g, '');
				const nums = cleanPart.match(/\d+/g) || [];
				numbers.push(...nums.map(n => parseInt(n, 10)));
			}

			return numbers.length > 0 ? numbers : [0];
		} catch (error) {
			return [0];
		}
	}
}