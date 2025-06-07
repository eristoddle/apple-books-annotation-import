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
			if (!fs.existsSync(epubPath)) {
				console.log(`[getEpubMetadata] EPUB path does not exist: ${epubPath}`);
				return null;
			}

			const stats = fs.statSync(epubPath);
			console.log(`[getEpubMetadata] Path exists - isFile: ${stats.isFile()}, isDirectory: ${stats.isDirectory()}`);

			if (stats.isDirectory()) {
				console.log('[getEpubMetadata] Found extracted EPUB directory, proceeding to read metadata...');
				const metadata = await this.readEpubDirectoryMetadata(epubPath);
				if (metadata) {
					console.log('[getEpubMetadata] Successfully extracted EPUB metadata:', metadata);
					return metadata;
				} else {
					console.log('[getEpubMetadata] Failed to extract metadata from EPUB directory.');
				}
			} else if (stats.isFile()) {
				console.log('[getEpubMetadata] Path is a file, not a directory. EPUB metadata extraction for packed files is not yet implemented.');
				// Could handle .epub files here if needed in the future
			}

		} catch (error: any) {
			console.error(`[getEpubMetadata] Error during EPUB metadata extraction for path ${epubPath}:`, error.message, error.stack);
		}

		console.log('[getEpubMetadata] EPUB metadata not accessible or extraction failed, continuing without enhanced metadata');
		return null;
	}

	private static async readEpubDirectoryMetadata(epubDir: string): Promise<any> {
		let containerContent, opfContent, metadata;

		try {
			// Look for META-INF/container.xml
			const metaInfPath = path.join(epubDir, 'META-INF');
			const containerXmlPath = path.join(metaInfPath, 'container.xml');

			if (!fs.existsSync(containerXmlPath)) {
				console.log(`[readEpubDirectoryMetadata] container.xml not found at ${containerXmlPath}. Checking for iTunesMetadata.plist.`);
				// Try to read iTunes metadata as fallback
				const iTunesMetadataPath = path.join(epubDir, 'iTunesMetadata.plist');
				if (fs.existsSync(iTunesMetadataPath)) {
					try {
						console.log('[readEpubDirectoryMetadata] Reading iTunes metadata...');
						const iTunesContent = fs.readFileSync(iTunesMetadataPath, 'utf8');
						console.log('[readEpubDirectoryMetadata] iTunes metadata found, size:', iTunesContent.length);
						return this.parseITunesMetadata(iTunesContent);
					} catch (itunesError: any) {
						console.error(`[readEpubDirectoryMetadata] Failed to read or parse iTunesMetadata.plist at ${iTunesMetadataPath}:`, itunesError.message, itunesError.stack);
						return null;
					}
				}
				console.log('[readEpubDirectoryMetadata] Neither container.xml nor iTunesMetadata.plist found.');
				return null;
			}

			try {
				console.log('[readEpubDirectoryMetadata] Reading container.xml...');
				containerContent = fs.readFileSync(containerXmlPath, 'utf8');
			} catch (fileReadError: any) {
				console.error(`[readEpubDirectoryMetadata] Failed to read container.xml at ${containerXmlPath}:`, fileReadError.message, fileReadError.stack);
				return null;
			}
			
			const rootfileMatch = containerContent.match(/full-path="([^"]+)"/);
			if (!rootfileMatch || !rootfileMatch[1]) {
				console.log('[readEpubDirectoryMetadata] Could not find rootfile full-path in container.xml.');
				return null;
			}

			const opfFilePath = rootfileMatch[1];
			// OPF path in container.xml is relative to the EPUB root directory
			const opfPath = path.resolve(epubDir, opfFilePath);

			if (!fs.existsSync(opfPath)) {
				console.log(`[readEpubDirectoryMetadata] OPF file not found at resolved path: ${opfPath} (original href: ${opfFilePath})`);
				return null;
			}

			try {
				console.log(`[readEpubDirectoryMetadata] Reading OPF file: ${opfPath}`);
				opfContent = fs.readFileSync(opfPath, 'utf8');
			} catch (fileReadError: any) {
				console.error(`[readEpubDirectoryMetadata] Failed to read OPF file at ${opfPath}:`, fileReadError.message, fileReadError.stack);
				return null;
			}
			
			metadata = this.parseOPFMetadata(opfContent, opfPath); // Pass opfPath for context if needed later
			if (!metadata) { // parseOPFMetadata now returns null on failure
				console.error(`[readEpubDirectoryMetadata] Failed to parse OPF content from ${opfPath}.`);
				return null;
			}
			console.log('[readEpubDirectoryMetadata] Parsed OPF metadata:', metadata);
			
			try {
				const coverPath = await this.findCoverImage(epubDir, opfContent); // opfContent for searching, epubDir for path resolution
				if (coverPath) {
					console.log(`[readEpubDirectoryMetadata] Attempting to read cover image from: ${coverPath}`);
					const coverBuffer = fs.readFileSync(coverPath);
					metadata.cover = coverBuffer.toString('base64');
					console.log('[readEpubDirectoryMetadata] Successfully processed cover image, size:', coverBuffer.length, 'bytes');
				} else {
					console.log('[readEpubDirectoryMetadata] No cover image path found by findCoverImage.');
				}
			} catch (coverImageError: any) {
				console.error('[readEpubDirectoryMetadata] Error processing cover image:', coverImageError.message, coverImageError.stack);
				// Continue without cover if it fails, metadata is still valuable
			}

			return metadata;

		} catch (error: any) {
			console.error('[readEpubDirectoryMetadata] Unexpected error during EPUB directory metadata processing:', error.message, error.stack);
			return null;
		}
	}

	private static parseOPFMetadata(opfContent: string, opfPath?: string): any { // opfPath is optional, for logging
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
			const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
			if (titleMatch) metadata.title = titleMatch[1];

			// Extract author
			const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
			if (authorMatch) metadata.author = authorMatch[1];

			// Extract ISBN from identifier
			const isbnMatch = opfContent.match(/<dc:identifier[^>]*(?:scheme="ISBN"|opf:scheme="ISBN")[^>]*>([^<]+)<\/dc:identifier>/i);
			if (isbnMatch) metadata.isbn = isbnMatch[1];

			// Extract language
			const languageMatch = opfContent.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
			if (languageMatch) metadata.language = languageMatch[1];

			// Extract publisher
			const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
			if (publisherMatch) metadata.publisher = publisherMatch[1];

			// Extract publication date
			const dateMatch = opfContent.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
			if (dateMatch) metadata.publicationDate = dateMatch[1];

			// Extract rights
			const rightsMatch = opfContent.match(/<dc:rights[^>]*>([^<]+)<\/dc:rights>/i);
			if (rightsMatch) metadata.rights = rightsMatch[1];

			// Extract subjects (can be multiple)
			const subjectMatches = opfContent.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/ig);
			if (subjectMatches) {
				metadata.subjects = subjectMatches.map(match => {
					const subjectMatch = match.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/i);
					return subjectMatch ? subjectMatch[1] : null;
				}).filter(subject => subject !== null);
			}

		} catch (error: any) {
			console.error(`[parseOPFMetadata] Error parsing OPF metadata (source path: ${opfPath || 'Unknown'}):`, error.message, error.stack);
			return null; // Return null on error to indicate failure
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

			console.log('[parseITunesMetadata] Parsed iTunes metadata:', metadata);

		} catch (error: any) {
			console.error('[parseITunesMetadata] Error parsing iTunes metadata:', error.message, error.stack);
			return null; // Return null on error
		}

		return metadata;
	}

	private static async findCoverImage(epubDir: string, opfContent: string): Promise<string | null> {
		console.log(`[findCoverImage] Starting cover image search in epubDir: ${epubDir}`);
		try {
			// Standard EPUB directory names
			const epubContentRoots = ['OEBPS', 'OPS'];
			const commonImageFolders = ['images', 'Images', 'Pictures'];
			const commonImageNames = /^(cover|thumbnail|frontcover)\.(jpg|jpeg|png|gif)$/i;

			// 1. Check for <meta name="cover" content="<image_id>" />
			const metaCoverMatch = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"\s*\/>/i);
			if (metaCoverMatch) {
				const coverId = metaCoverMatch[1];
				console.log(`[findCoverImage] Found cover meta tag with id: ${coverId}`);
				const itemMatch = opfContent.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, "i"));
				if (itemMatch) {
					const coverHref = itemMatch[1];
					console.log(`[findCoverImage] Found item with id '${coverId}' and href: ${coverHref}`);
					for (const rootDir of epubContentRoots) {
						const coverPath = path.join(epubDir, rootDir, coverHref);
						console.log(`[findCoverImage] Checking path: ${coverPath}`);
						if (fs.existsSync(coverPath)) {
							console.log('[findCoverImage] Found cover image via meta tag:', coverPath);
							return coverPath;
						}
					}
					// Check if href is relative from OPF file location
					// OPF path can be nested, e.g. EPUB/package.opf or EPUB/OEBPS/package.opf
					// We need to resolve coverHref relative to the OPF file's directory
					const opfFilePathMatch = opfContent.match(/<package[^>]*unique-identifier="[^"]*"[^>]*>/); // A bit of a hack to get approximate location
					if (opfFilePathMatch) {
						// This isn't perfect, as it doesn't give the actual OPF file path, but the opfContent itself.
						// To properly resolve, we'd need the actual path to the OPF file.
						// For now, we'll assume coverHref is relative to a root or one level down.
						const opfDir = path.dirname(path.join(epubDir, "some.opf")); // Placeholder for OPF directory calculation
						const coverPathRelToOpf = path.resolve(opfDir, coverHref); // this is still not quite right without actual opf path
						console.log(`[findCoverImage] Checking path relative to OPF (approximate): ${coverPathRelToOpf}`);
						// This check is problematic without knowing the OPF file's actual location.
						// For now, we rely on the epubContentRoots check above which is more common.
					}

				} else {
					console.log(`[findCoverImage] Could not find item in manifest with id: ${coverId}`);
				}
			} else {
				console.log('[findCoverImage] No meta tag for cover found.');
			}

			// 2. Look for common cover image reference in OPF <item id="cover" ...> or <item href="*cover*.jp(e)g/png/gif" ...>
			const itemCoverMatch = opfContent.match(/<item[^>]*id="cover"[^>]*href="([^"]+)"/i) ||
				opfContent.match(/<item[^>]*href="([^"]*cover[^"]*\.(jpg|jpeg|png|gif))"/i);

			if (itemCoverMatch) {
				const coverHref = itemCoverMatch[1];
				console.log(`[findCoverImage] Found item with cover-like href or id="cover": ${coverHref}`);
				for (const rootDir of epubContentRoots) {
					const coverPath = path.join(epubDir, rootDir, coverHref);
					console.log(`[findCoverImage] Checking path: ${coverPath}`);
					if (fs.existsSync(coverPath)) {
						console.log('[findCoverImage] Found cover image via item tag:', coverPath);
						return coverPath;
					}
					// Check if the href is absolute-like from epubDir (e.g. "images/cover.jpg" not "OEBPS/images/cover.jpg")
					const coverPathDirect = path.join(epubDir, coverHref);
					console.log(`[findCoverImage] Checking path (direct from epub root): ${coverPathDirect}`);
					if (fs.existsSync(coverPathDirect)) {
						console.log('[findCoverImage] Found cover image via item tag (direct from epub root):', coverPathDirect);
						return coverPathDirect;
					}
				}
			} else {
				console.log('[findCoverImage] No direct item tag for cover found.');
			}

			// 3. Fallback: look for common cover image names in standard directories
			for (const rootDir of epubContentRoots) {
				const contentPath = path.join(epubDir, rootDir);
				console.log(`[findCoverImage] Checking content root: ${contentPath}`);
				if (fs.existsSync(contentPath)) {
					// Check directly in contentPath
					const filesInContentPath = fs.readdirSync(contentPath);
					for (const file of filesInContentPath) {
						if (commonImageNames.test(file)) {
							const coverPath = path.join(contentPath, file);
							console.log(`[findCoverImage] Found common cover name in ${contentPath}: ${coverPath}`);
							if (fs.existsSync(coverPath)) return coverPath;
						}
					}

					// Check in common image folders within contentPath
					for (const imgFolder of commonImageFolders) {
						const imageFolderPath = path.join(contentPath, imgFolder);
						console.log(`[findCoverImage] Checking image folder: ${imageFolderPath}`);
						if (fs.existsSync(imageFolderPath)) {
							const imageFiles = fs.readdirSync(imageFolderPath);
							for (const imageFile of imageFiles) {
								if (commonImageNames.test(imageFile)) {
									const coverPath = path.join(imageFolderPath, imageFile);
									console.log(`[findCoverImage] Found common cover name in ${imageFolderPath}: ${coverPath}`);
									if (fs.existsSync(coverPath)) return coverPath;
								}
							}
						} else {
							console.log(`[findCoverImage] Image folder not found: ${imageFolderPath}`);
						}
					}
				} else {
					console.log(`[findCoverImage] Content root not found: ${contentPath}`);
				}
			}

			// 4. Fallback: Check common image folders directly under epubDir (less standard but possible)
			for (const imgFolder of commonImageFolders) {
				const imageFolderPath = path.join(epubDir, imgFolder);
				console.log(`[findCoverImage] Checking image folder directly under epub root: ${imageFolderPath}`);
				if (fs.existsSync(imageFolderPath)) {
					const imageFiles = fs.readdirSync(imageFolderPath);
					for (const imageFile of imageFiles) {
						if (commonImageNames.test(imageFile)) {
							const coverPath = path.join(imageFolderPath, imageFile);
							console.log(`[findCoverImage] Found common cover name in ${imageFolderPath}: ${coverPath}`);
							if (fs.existsSync(coverPath)) return coverPath;
						}
					}
				} else {
					console.log(`[findCoverImage] Image folder not found: ${imageFolderPath}`);
				}
			}


		} catch (error: any) {
			console.error('[findCoverImage] Error finding cover image:', error.message, error.stack);
		}
		console.log('[findCoverImage] No cover image found after all checks.');
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

	private static async executeSqlQueryWithHeaders(dbPath: string, query: string, options?: { maxBuffer?: number }): Promise<any[]> {
		try {
			// Clean up the query - remove extra whitespace and newlines
			const cleanQuery = query.replace(/\s+/g, ' ').trim();
			
			// Use -header mode to get column names
			const command = `sqlite3 -header "${dbPath}" "${cleanQuery.replace(/"/g, '""')}"`;
			console.log('Executing SQLite command with headers:', command);
			
			// Increase buffer size for large libraries (default is ~1MB, we'll use 50MB)
			const maxBuffer = options?.maxBuffer || 50 * 1024 * 1024; // 50MB
			const { stdout, stderr } = await execAsync(command, { maxBuffer });
			
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

	private static async getAvailableColumns(dbPath: string, tableName: string): Promise<string[]> {
		try {
			const query = `PRAGMA table_info(${tableName});`;
			const results = await this.executeSqlQueryWithHeaders(dbPath, query);
			const columns = results.map((row: any) => row.name);
			console.log(`Found ${columns.length} columns in ${tableName}:`, columns);
			return columns;
		} catch (error: any) {
			console.warn('Could not get table info, falling back to basic columns:', error.message);
			// Return the minimal set of columns that should exist in all versions
			return ['ZASSETID', 'ZSORTTITLE', 'ZSORTAUTHOR', 'ZBOOKDESCRIPTION', 'ZEPUBID', 'ZPATH'];
		}
	}

	static async getBookDetails(): Promise<BookDetail[]> {
		try {
			const dbPath = this.getDbPath(LIBRARY_DB_PATTERN);
			console.log('Opening library database:', dbPath);

			// Get available columns first to avoid errors on different database versions
			const availableColumns = await this.getAvailableColumns(dbPath, 'ZBKLIBRARYASSET');
			console.log('Available columns in ZBKLIBRARYASSET:', availableColumns);

			// Define basic required columns that should exist in all versions
			const basicColumns = ['ZASSETID', 'ZSORTTITLE', 'ZSORTAUTHOR', 'ZBOOKDESCRIPTION', 'ZEPUBID', 'ZPATH'];
			
			// Define optional extended columns that may not exist in all database versions
			const extendedColumns = [
				'ZGENRE', 'ZGENRES', 'ZYEAR', 'ZPAGECOUNT', 'ZRATING', 'ZCOMMENTS', 
				'ZLANGUAGE', 'ZREADINGPROGRESS', 'ZCREATIONDATE', 'ZLASTOPENDATE', 'ZMODIFICATIONDATE'
			];

			// Build query with available columns only
			const columnsToSelect = basicColumns.filter(col => availableColumns.includes(col));
			const availableExtended = extendedColumns.filter(col => availableColumns.includes(col));
			const allColumns = [...columnsToSelect, ...availableExtended];

			// Make sure we at least have the essential columns
			if (!columnsToSelect.includes('ZASSETID')) {
				throw new Error('Database schema incompatible: missing required ZASSETID column');
			}

			console.log('Querying columns:', allColumns);

			try {
				// First try with increased buffer
				const query = `SELECT ${allColumns.join(', ')} FROM ZBKLIBRARYASSET;`;
				const results = await this.executeSqlQueryWithHeaders(dbPath, query, { maxBuffer: 50 * 1024 * 1024 });

				console.log('Library rows found:', results.length);
				
				return this.mapBookResults(results);
			} catch (bufferError: any) {
				if (bufferError.message.includes('maxBuffer length exceeded')) {
					console.log('Large library detected, using chunked approach...');
					return await this.getBookDetailsChunked(dbPath, allColumns);
				} else {
					throw bufferError;
				}
			}
		} catch (error: any) {
			console.error('Error in getBookDetails:', error);
			throw new Error(`Failed to get book details: ${error?.message || 'Unknown error'}`);
		}
	}

	private static async getBookDetailsChunked(dbPath: string, columns: string[]): Promise<BookDetail[]> {
		try {
			// First get count to determine chunk size
			const countQuery = 'SELECT COUNT(*) as count FROM ZBKLIBRARYASSET;';
			const countResult = await this.executeSqlQueryWithHeaders(dbPath, countQuery);
			const totalBooks = parseInt(countResult[0].count);
			
			console.log(`Total books in library: ${totalBooks}, processing in chunks...`);
			
			const chunkSize = 1000; // Process 1000 books at a time
			const allBooks: BookDetail[] = [];
			
			for (let offset = 0; offset < totalBooks; offset += chunkSize) {
				console.log(`Processing books ${offset + 1} to ${Math.min(offset + chunkSize, totalBooks)}...`);
				
				const chunkQuery = `SELECT ${columns.join(', ')} FROM ZBKLIBRARYASSET LIMIT ${chunkSize} OFFSET ${offset};`;
				const chunkResults = await this.executeSqlQueryWithHeaders(dbPath, chunkQuery);
				
				const chunkBooks = this.mapBookResults(chunkResults);
				allBooks.push(...chunkBooks);
				
				// Small delay to prevent overwhelming the system
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			
			console.log(`Chunked processing complete: ${allBooks.length} books loaded`);
			return allBooks;
		} catch (error: any) {
			console.error('Error in chunked book details:', error);
			throw new Error(`Failed to get chunked book details: ${error?.message || 'Unknown error'}`);
		}
	}

	private static mapBookResults(results: any[]): BookDetail[] {
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
			// Extended fields (will be null if columns don't exist in this database version)
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

			// Use EXACT same query as Python script - just the basic 4 columns
			const query = `SELECT ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE, ZANNOTATIONLOCATION, ZPLABSOLUTEPHYSICALLOCATION, ZANNOTATIONSTYLE, ZANNOTATIONISUNDERLINE FROM ZAEANNOTATION WHERE ZANNOTATIONASSETID = '${assetId}' AND ZANNOTATIONSELECTEDTEXT != '';`;

			const results = await this.executeSqlQueryWithHeaders(dbPath, query);
			
			console.log(`Found ${results.length} annotation rows for asset ${assetId}`);

			const annotations = results
				.map((row: any) => ({
					selectedText: row.ZANNOTATIONSELECTEDTEXT || '',
					note: row.ZANNOTATIONNOTE || null,
					location: row.ZANNOTATIONLOCATION || null,
					physicalLocation: row.ZPLABSOLUTEPHYSICALLOCATION ? parseInt(row.ZPLABSOLUTEPHYSICALLOCATION) : null,
					// Set defaults for extended fields to match interface
					annotationType: null, // Assuming ZANNOTATIONTYPE might be added later or is not part of this specific request
					annotationStyle: row.ZANNOTATIONSTYLE || null, // Map ZANNOTATIONSTYLE
					isUnderline: row.ZANNOTATIONISUNDERLINE ? (parseInt(row.ZANNOTATIONISUNDERLINE) === 1) : false, // Map ZANNOTATIONISUNDERLINE, converting to boolean
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

			// The Python script must be grouping consecutive null-location annotations
			// with the next annotation that has location data
			return this.groupConsecutiveNullLocationAnnotations(annotations);
		} catch (error: any) {
			throw new Error(`Failed to get annotations for book ${assetId}: ${error?.message || 'Unknown error'}`);
		}
	}



	private static groupConsecutiveNullLocationAnnotations(annotations: Annotation[]): Annotation[] {
		const result: Annotation[] = [];
		let nullLocationGroup: Annotation[] = [];

		for (const annotation of annotations) {
			if (annotation.location === null && annotation.physicalLocation === null) {
				// Collect null-location annotations
				nullLocationGroup.push(annotation);
			} else {
				// Found annotation with location - combine any collected null-location ones with this one
				if (nullLocationGroup.length > 0) {
					const allTexts = [...nullLocationGroup, annotation].map(a => a.selectedText);
					const combinedText = allTexts.join('\n');
					
					const combinedAnnotation: Annotation = {
						...annotation, // Use the located annotation as the base
						selectedText: combinedText,
					};
					
					result.push(combinedAnnotation);
					nullLocationGroup = []; // Reset
				} else {
					// No preceding null-location annotations, just add this one
					result.push(annotation);
				}
			}
		}

		// Handle any remaining null-location annotations at the end
		if (nullLocationGroup.length > 0) {
			const combinedText = nullLocationGroup.map(a => a.selectedText).join('\n');
			const combinedAnnotation: Annotation = {
				...nullLocationGroup[0],
				selectedText: combinedText,
			};
			result.push(combinedAnnotation);
		}

		console.log(`Combined ${annotations.length} raw annotations into ${result.length} final annotations`);
		return result;
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
