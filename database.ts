// database.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as glob from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BookDetail, Annotation } from './types';

const execAsync = promisify(exec);

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

	private static async executeSqlQuery(dbPath: string, query: string): Promise<any[]> {
		try {
			// Use the sqlite3 command-line tool which is available on macOS
			const command = `sqlite3 "${dbPath}" "${query.replace(/"/g, '""')}"`;
			console.log('Executing SQLite command:', command);
			
			const { stdout, stderr } = await execAsync(command);
			
			if (stderr) {
				console.warn('SQLite stderr:', stderr);
			}
			
			if (!stdout.trim()) {
				return [];
			}

			// Parse the output - sqlite3 outputs pipe-separated values by default
			const lines = stdout.trim().split('\n');
			return lines.map(line => {
				const values = line.split('|');
				return values;
			});
		} catch (error: any) {
			console.error('SQLite execution error:', error);
			throw new Error(`SQLite query failed: ${error.message}`);
		}
	}

	private static async executeSqlQueryWithHeaders(dbPath: string, query: string): Promise<any[]> {
		try {
			// Use -header mode to get column names
			const command = `sqlite3 -header "${dbPath}" "${query.replace(/"/g, '""')}"`;
			console.log('Executing SQLite command with headers:', command);
			
			const { stdout, stderr } = await execAsync(command);
			
			if (stderr) {
				console.warn('SQLite stderr:', stderr);
			}
			
			if (!stdout.trim()) {
				return [];
			}

			const lines = stdout.trim().split('\n');
			if (lines.length < 2) {
				return [];
			}

			const headers = lines[0].split('|');
			const rows = lines.slice(1);

			return rows.map(line => {
				const values = line.split('|');
				const row: any = {};
				headers.forEach((header, index) => {
					row[header] = values[index] || null;
				});
				return row;
			});
		} catch (error: any) {
			console.error('SQLite execution error:', error);
			throw new Error(`SQLite query failed: ${error.message}`);
		}
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
		try {
			const dbPath = this.getDbPath(LIBRARY_DB_PATTERN);
			console.log('Opening library database:', dbPath);

			const query = `SELECT ZASSETID, ZSORTTITLE, ZSORTAUTHOR, ZBOOKDESCRIPTION, ZEPUBID, ZPATH FROM ZBKLIBRARYASSET;`;
			const results = await this.executeSqlQueryWithHeaders(dbPath, query);

			console.log('Library rows found:', results.length);
			
			return results.map((row: any) => ({
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
		} catch (error: any) {
			console.error('Error in getBookDetails:', error);
			throw new Error(`Failed to get book details: ${error?.message || 'Unknown error'}`);
		}
	}

	static async getBooksWithHighlights(): Promise<string[]> {
		try {
			const annotationDbPath = this.getDbPath(ANNOTATION_DB_PATTERN);
			const libraryDbPath = this.getDbPath(LIBRARY_DB_PATTERN);
			console.log('Getting books with highlights from:', { annotationDbPath, libraryDbPath });

			// Get all book IDs from library first
			const libraryQuery = `SELECT ZASSETID FROM ZBKLIBRARYASSET;`;
			const libraryRows = await this.executeSqlQueryWithHeaders(libraryDbPath, libraryQuery);

			console.log('Library rows:', libraryRows.length);

			// Filter out any null/undefined asset IDs and ensure they're strings
			const bookIds = libraryRows
				.map((row: any) => row?.ZASSETID)
				.filter((id: any) => id !== null && id !== undefined && id !== '')
				.map((id: any) => String(id));

			console.log('Valid book IDs:', bookIds.length);

			if (bookIds.length === 0) {
				console.log('No book IDs found');
				return [];
			}

			// Now get annotations
			const annotationQuery = `
				SELECT DISTINCT ZANNOTATIONASSETID
				FROM ZAEANNOTATION
				WHERE ZANNOTATIONASSETID IS NOT NULL
				AND ZANNOTATIONSELECTEDTEXT IS NOT NULL
				AND ZANNOTATIONSELECTEDTEXT != "";
			`;

			const annotationRows = await this.executeSqlQueryWithHeaders(annotationDbPath, annotationQuery);

			console.log('Annotation rows found:', annotationRows.length);

			// Filter annotations to only include books that exist in our library
			const booksWithHighlights = annotationRows
				.map((row: any) => row?.ZANNOTATIONASSETID)
				.filter((id: any) => id !== null && id !== undefined && id !== '')
				.map((id: any) => String(id))
				.filter((id: string) => bookIds.includes(id));

			console.log('Books with highlights:', booksWithHighlights.length);
			return [...new Set(booksWithHighlights)]; // Remove duplicates
		} catch (error: any) {
			console.error('Error in getBooksWithHighlights:', error);
			throw new Error(`Failed to get books with highlights: ${error?.message || 'Unknown error'}`);
		}
	}

	static async getAnnotationsForBook(assetId: string): Promise<Annotation[]> {
		try {
			const dbPath = this.getDbPath(ANNOTATION_DB_PATTERN);

			const query = `
				SELECT ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE, ZANNOTATIONLOCATION, ZPLABSOLUTEPHYSICALLOCATION
				FROM ZAEANNOTATION
				WHERE ZANNOTATIONASSETID = '${assetId}' AND ZANNOTATIONSELECTEDTEXT != ''
				ORDER BY ZPLABSOLUTEPHYSICALLOCATION;
			`;

			const results = await this.executeSqlQueryWithHeaders(dbPath, query);

			return results.map((row: any) => ({
				selectedText: row.ZANNOTATIONSELECTEDTEXT || '',
				note: row.ZANNOTATIONNOTE || null,
				location: row.ZANNOTATIONLOCATION || null,
				physicalLocation: row.ZPLABSOLUTEPHYSICALLOCATION ? parseInt(row.ZPLABSOLUTEPHYSICALLOCATION) : null,
			}));
		} catch (error: any) {
			throw new Error(`Failed to get annotations for book ${assetId}: ${error?.message || 'Unknown error'}`);
		}
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