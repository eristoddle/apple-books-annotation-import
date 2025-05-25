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

	static async getEpubMetadata(epubPath: string): Promise<any> {
		console.log('EPUB metadata extraction attempt for path:', epubPath);
		
		if (!epubPath) {
			console.log('No EPUB path provided');
			return null;
		}

		try {
			// Check if this is an extracted EPUB directory (which it should be based on our logs)
			if (fs.existsSync(epubPath)) {
				const stats = fs.statSync(epubPath);
				console.log('Path exists - isFile:', stats.isFile(), 'isDirectory:', stats.isDirectory());
				
				if (stats.isDirectory()) {
					console.log('Found extracted EPUB directory, reading metadata...');
					
					// This is an extracted EPUB directory - read metadata from standard EPUB structure
					const metadata = await this.readEpubDirectoryMetadata(epubPath);
					if (metadata) {
						console.log('Successfully extracted EPUB metadata:', metadata);
						return metadata;
					}
				} else if (stats.isFile()) {
					console.log('Found EPUB file, attempting to read...');
					// Could handle .epub files here if needed
				}
			}

		} catch (error: any) {
			console.log('EPUB metadata extraction failed:', error.message);
		}

		console.log('EPUB metadata not accessible, continuing without enhanced metadata');
		return null;
	}

	private static async readEpubDirectoryMetadata(epubDir: string): Promise<any> {
		try {
			// Look for the standard EPUB metadata file: META-INF/container.xml
			const metaInfPath = path.join(epubDir, 'META-INF');
			const containerXmlPath = path.join(metaInfPath, 'container.xml');
			
			if (!fs.existsSync(containerXmlPath)) {
				console.log('container.xml not found, trying alternative metadata sources...');
				
				// Try to read iTunes metadata as fallback
				const iTunesMetadataPath = path.join(epubDir, 'iTunesMetadata.plist');
				if (fs.existsSync(iTunesMetadataPath)) {
					console.log('Reading iTunes metadata...');
					const iTunesContent = fs.readFileSync(iTunesMetadataPath, 'utf8');
					console.log('iTunes metadata found, size:', iTunesContent.length);
					
					// Extract basic info from iTunes metadata
					const metadata = this.parseITunesMetadata(iTunesContent);
					return metadata;
				}
				
				return null;
			}

			console.log('Reading container.xml...');
			const containerContent = fs.readFileSync(containerXmlPath, 'utf8');
			
			// Parse container.xml to find the OPF file
			const rootfileMatch = containerContent.match(/full-path="([^"]+)"/);
			if (!rootfileMatch) {
				console.log('Could not find rootfile in container.xml');
				return null;
			}

			const opfPath = path.join(epubDir, rootfileMatch[1]);
			if (!fs.existsSync(opfPath)) {
				console.log('OPF file not found:', opfPath);
				return null;
			}

			console.log('Reading OPF file:', opfPath);
			const opfContent = fs.readFileSync(opfPath, 'utf8');
			
			// Parse the OPF file for metadata
			const metadata = this.parseOPFMetadata(opfContent);
			console.log('Parsed OPF metadata:', metadata);
			
			// Try to find cover image
			const coverPath = await this.findCoverImage(epubDir, opfContent);
			if (coverPath) {
				const coverBuffer = fs.readFileSync(coverPath);
				metadata.cover = coverBuffer.toString('base64');
				console.log('Found cover image, size:', coverBuffer.length, 'bytes');
			}

			return metadata;

		} catch (error: any) {
			console.log('Error reading EPUB directory metadata:', error.message);
			return null;
		}
	}

	private static parseOPFMetadata(opfContent: string): any {
		const metadata: any = {
			isbn: null,
			language: null,
			publisher: null,
			publicationDate: null,
			rights: null,
			subjects: null,
			cover: null
		};

		try {
			// Extract title
			const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
			if (titleMatch) metadata.title = titleMatch[1];

			// Extract author
			const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/);
			if (authorMatch) metadata.author = authorMatch[1];

			// Extract ISBN from identifier
			const isbnMatch = opfContent.match(/<dc:identifier[^>]*(?:scheme="ISBN"|opf:scheme="ISBN")[^>]*>([^<]+)<\/dc:identifier>/i);
			if (isbnMatch) metadata.isbn = isbnMatch[1];

			// Extract language
			const languageMatch = opfContent.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/);
			if (languageMatch) metadata.language = languageMatch[1];

			// Extract publisher
			const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/);
			if (publisherMatch) metadata.publisher = publisherMatch[1];

			// Extract publication date
			const dateMatch = opfContent.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/);
			if (dateMatch) metadata.publicationDate = dateMatch[1];

			// Extract rights
			const rightsMatch = opfContent.match(/<dc:rights[^>]*>([^<]+)<\/dc:rights>/);
			if (rightsMatch) metadata.rights = rightsMatch[1];

			// Extract subjects (can be multiple)
			const subjectMatches = opfContent.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/g);
			if (subjectMatches) {
				metadata.subjects = subjectMatches.map(match => {
					const subjectMatch = match.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/);
					return subjectMatch ? subjectMatch[1] : null;
				}).filter(subject => subject !== null);
			}

		} catch (error: any) {
			console.log('Error parsing OPF metadata:', error.message);
		}

		return metadata;
	}

	private static parseITunesMetadata(iTunesContent: string): any {
		const metadata: any = {
			isbn: null,
			language: null,
			publisher: null,
			publicationDate: null,
			cover: null
		};

		try {
			// iTunes metadata is in plist format - extract basic info
			// This is a simple parser for common fields
			
			const artistNameMatch = iTunesContent.match(/<key>artistName<\/key>\s*<string>([^<]+)<\/string>/);
			if (artistNameMatch) metadata.author = artistNameMatch[1];

			const itemNameMatch = iTunesContent.match(/<key>itemName<\/key>\s*<string>([^<]+)<\/string>/);
			if (itemNameMatch) metadata.title = itemNameMatch[1];

			const publisherMatch = iTunesContent.match(/<key>publisher<\/key>\s*<string>([^<]+)<\/string>/);
			if (publisherMatch) metadata.publisher = publisherMatch[1];

			console.log('Parsed iTunes metadata:', metadata);

		} catch (error: any) {
			console.log('Error parsing iTunes metadata:', error.message);
		}

		return metadata;
	}

	private static async findCoverImage(epubDir: string, opfContent: string): Promise<string | null> {
		try {
			// Look for cover image reference in OPF
			const coverMatch = opfContent.match(/<item[^>]*id="cover"[^>]*href="([^"]+)"/i) ||
				opfContent.match(/<item[^>]*href="([^"]*cover[^"]*\.(jpg|jpeg|png|gif))"/i);

			if (coverMatch) {
				const coverHref = coverMatch[1];
				const oebpsPath = path.join(epubDir, 'OEBPS');
				const coverPath = path.join(oebpsPath, coverHref);
				
				if (fs.existsSync(coverPath)) {
					console.log('Found cover image:', coverPath);
					return coverPath;
				}
			}

			// Fallback: look for common cover image names in OEBPS directory
			const oebpsPath = path.join(epubDir, 'OEBPS');
			if (fs.existsSync(oebpsPath)) {
				const oebpsContents = fs.readdirSync(oebpsPath);
				const coverFiles = oebpsContents.filter(file => 
					/cover\.(jpg|jpeg|png|gif)$/i.test(file) ||
					/images\/cover\.(jpg|jpeg|png|gif)$/i.test(file)
				);

				if (coverFiles.length > 0) {
					const coverPath = path.join(oebpsPath, coverFiles[0]);
					console.log('Found cover image by name:', coverPath);
					return coverPath;
				}
			}

		} catch (error: any) {
			console.log('Error finding cover image:', error.message);
		}

		return null;
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
			// Clean up the query - remove extra whitespace and newlines
			const cleanQuery = query.replace(/\s+/g, ' ').trim();
			
			// Use -header mode to get column names
			const command = `sqlite3 -header "${dbPath}" "${cleanQuery.replace(/"/g, '""')}"`;
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

			const query = `SELECT 
				ZASSETID, ZSORTTITLE, ZSORTAUTHOR, ZBOOKDESCRIPTION, ZEPUBID, ZPATH,
				ZGENRE, ZGENRES, ZYEAR, ZPAGECOUNT, ZRATING, ZCOMMENTS, ZLANGUAGE,
				ZREADINGPROGRESS, ZCREATIONDATE, ZLASTOPENDATE, ZMODIFICATIONDATE
				FROM ZBKLIBRARYASSET;`;
			const results = await this.executeSqlQueryWithHeaders(dbPath, query);

			console.log('Library rows found:', results.length);
			
			return results.map((row: any) => ({
				assetId: row.ZASSETID,
				title: row.ZSORTTITLE || 'Unknown Title',
				author: row.ZSORTAUTHOR || null,
				description: row.ZBOOKDESCRIPTION || null,
				epubId: row.ZEPUBID || null,
				path: row.ZPATH || null,
				isbn: null, // Will be populated from EPUB metadata if available
				language: row.ZLANGUAGE || null,
				publisher: null, // Will be populated from EPUB metadata if available
				publicationDate: null, // Will be populated from EPUB metadata if available
				cover: null,
				// Additional database fields
				genre: row.ZGENRE || null,
				genres: row.ZGENRES || null,
				year: row.ZYEAR || null,
				pageCount: (row.ZPAGECOUNT && parseInt(row.ZPAGECOUNT) > 1) ? parseInt(row.ZPAGECOUNT) : null,
				rating: row.ZRATING ? parseInt(row.ZRATING) : null,
				comments: row.ZCOMMENTS || null,
				readingProgress: row.ZREADINGPROGRESS ? parseFloat(row.ZREADINGPROGRESS) : null,
				creationDate: row.ZCREATIONDATE ? new Date(row.ZCREATIONDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
				lastOpenDate: row.ZLASTOPENDATE ? new Date(row.ZLASTOPENDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
				modificationDate: row.ZMODIFICATIONDATE ? new Date(row.ZMODIFICATIONDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
				// These will be populated from EPUB metadata
				rights: null,
				subjects: null,
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
			const annotationQuery = `SELECT DISTINCT ZANNOTATIONASSETID FROM ZAEANNOTATION WHERE ZANNOTATIONASSETID IS NOT NULL AND ZANNOTATIONSELECTEDTEXT IS NOT NULL AND ZANNOTATIONSELECTEDTEXT != '';`;

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

			// Use the EXACT same query as the working Python script
			const query = `SELECT ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE, ZANNOTATIONLOCATION, ZPLABSOLUTEPHYSICALLOCATION FROM ZAEANNOTATION WHERE ZANNOTATIONASSETID = '${assetId}' AND ZANNOTATIONSELECTEDTEXT != '';`;

			const results = await this.executeSqlQueryWithHeaders(dbPath, query);
			
			console.log(`Found ${results.length} annotation rows for asset ${assetId}`);

			return results
				.map((row: any) => ({
					selectedText: row.ZANNOTATIONSELECTEDTEXT || '',
					note: row.ZANNOTATIONNOTE || null,
					location: row.ZANNOTATIONLOCATION || null,
					physicalLocation: row.ZPLABSOLUTEPHYSICALLOCATION ? parseInt(row.ZPLABSOLUTEPHYSICALLOCATION) : null,
					// Set default values for fields we're not querying (to match the interface)
					annotationType: null,
					annotationStyle: null,
					isUnderline: false,
					creationDate: null,
					modificationDate: null,
					uuid: null,
					representativeText: null,
				}))
				.filter(annotation => {
					// Filter out annotations with empty or whitespace-only text
					const trimmedText = annotation.selectedText.trim();
					return trimmedText.length > 0 && trimmedText !== '';
				});
		} catch (error: any) {
			throw new Error(`Failed to get annotations for book ${assetId}: ${error?.message || 'Unknown error'}`);
		}
	}

	static sortAnnotationsByCFI(annotations: Annotation[]): Annotation[] {
		// Use the EXACT same approach as the working Python script
		return annotations.sort((a, b) => {
			const aCfi = this.parseCFIForSorting(a.location || '');
			const bCfi = this.parseCFIForSorting(b.location || '');

			// Compare each number in sequence
			for (let i = 0; i < Math.min(aCfi.length, bCfi.length); i++) {
				if (aCfi[i] !== bCfi[i]) {
					return aCfi[i] - bCfi[i];
				}
			}

			return aCfi.length - bCfi.length;
		});
	}

	private static parseCFIForSorting(cfi: string): number[] {
		// Copy the EXACT logic from the working Python script
		if (!cfi || !cfi.startsWith('epubcfi(')) {
			return [0];
		}

		try {
			// Remove 'epubcfi(' and ')' and split by common delimiters
			const content = cfi.substring(8, cfi.length - 1); // Remove 'epubcfi(' and ')'

			// Extract all numbers from the CFI
			const numbers: number[] = [];

			// Split by major sections (! separates different parts)
			const parts = content.split('!');

			for (const part of parts) {
				// Find all numbers in each part, ignoring text in brackets
				// Remove bracketed content first
				const cleanPart = part.replace(/\[[^\]]*\]/g, '');
				// Extract numbers
				const nums = cleanPart.match(/\d+/g) || [];
				numbers.push(...nums.map(n => parseInt(n, 10)));
			}

			return numbers.length > 0 ? numbers : [0];
		} catch (error) {
			return [0];
		}
	}
}
