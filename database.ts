// database.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as glob from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';
import EPub from 'epub'; // Changed import
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
			if (!fs.existsSync(epubPath)) {
				console.log(`[getEpubMetadata] EPUB path does not exist: ${epubPath}`);
				return null;
			}

			const stats = fs.statSync(epubPath);
			console.log(`[getEpubMetadata] Path exists - isFile: ${stats.isFile()}, isDirectory: ${stats.isDirectory()}`);

			if (stats.isFile()) {
				console.log('[getEpubMetadata] Processing EPUB file with `epub` library:', epubPath);
				try {
					const epubInstance = new EPub(epubPath);

					await new Promise<void>((resolve, reject) => {
						epubInstance.on('end', () => {
							console.log('[getEpubMetadata] EPub (julien-c) parsed successfully for:', epubPath);
							resolve();
						});
						epubInstance.on('error', (err: Error) => {
							console.error('[getEpubMetadata] EPub (julien-c) parsing error for:', epubPath, err);
							reject(err);
						});
						epubInstance.parse();
					});

					const parsedMetadata = epubInstance.metadata || {} as EPub.Metadata;
					const metadata: any = {
						title: parsedMetadata.title,
						author: parsedMetadata.creator,
						language: parsedMetadata.language,
						publisher: undefined,
						isbn: undefined,
						publicationDate: parsedMetadata.date,
						rights: undefined,
						subjects: Array.isArray(parsedMetadata.subject) ? parsedMetadata.subject : (parsedMetadata.subject ? [parsedMetadata.subject] : []),
						description: parsedMetadata.description,
						toc: [],
						manifest: [],
						spine: [],
						cover: null,
					};

					if (epubInstance.toc && Array.isArray(epubInstance.toc)) {
						metadata.toc = this._transformToc(epubInstance.toc);
					}

					if (epubInstance.flow && Array.isArray(epubInstance.flow)) {
						metadata.spine = epubInstance.flow.map((flowItem: EPub.TocElement) => ({
							idref: flowItem.id,
							linear: 'yes'
						}));
						metadata.manifest = epubInstance.flow.map((flowItem: EPub.TocElement) => ({
							id: flowItem.id,
							href: flowItem.href,
							mediaType: 'application/xhtml+xml'
						}));
					}

					const potentialCoverIds = ['cover-image', 'cover', 'Cover', 'COVER', 'coverimage', 'cover-img'];
					let coverFile: { data: Buffer; mimeType: string } | null = null;

					for (const currentId of potentialCoverIds) {
						try {
							// Directly attempt to fetch; errors will be caught by the catch block
							coverFile = await new Promise((resolve, reject) => {
								epubInstance.getImage(currentId, (err, data, mimeType) => {
									if (err) {
										epubInstance.getFile(currentId, (fileErr, fileData, fileMimeType) => {
											if (fileErr) {
												// Resolve with null if this ID specifically fails,
												// rather than rejecting the whole Promise chain for this ID.
												resolve(null); // Indicate failure for this ID
											} else {
												console.log(`[getEpubMetadata] Found cover using getFile with ID: ${currentId}`);
												resolve({ data: fileData, mimeType: fileMimeType });
											}
										});
									} else {
										console.log(`[getEpubMetadata] Found cover using getImage with ID: ${currentId}`);
										resolve({ data, mimeType });
									}
								});
							});
							if (coverFile) { // If successfully found (not null)
								 metadata.cover = coverFile.data.toString('base64');
								 console.log(`[getEpubMetadata] Successfully processed cover image with ID: ${currentId}`);
								 break; // Exit loop as cover is found
							}
						} catch (error) {
							// This catch is for if the Promise created by `new Promise` is rejected by 'reject(fileErr)'
							// This means both getImage and getFile failed for this ID.
							// console.warn(`[getEpubMetadata] Both getImage and getFile failed for cover ID ${currentId}:`, error);
						}
					}

					if (!metadata.cover) { // Check if cover was set in the loop
						console.log('[getEpubMetadata] Could not find cover image using conventional IDs.');
					}

					console.log('[getEpubMetadata] Successfully extracted metadata using `epub` library for:', metadata.title || 'Unknown Title');
					return metadata;

				} catch (parseError: any) {
					console.error(`[getEpubMetadata] Error processing EPUB file ${epubPath} with 'epub' library:`, parseError.message, parseError.stack);
				}
			} else if (stats.isDirectory()) {
				console.log('[getEpubMetadata] Found extracted EPUB directory, proceeding to read metadata...');
				const metadataFromDir = await this.readEpubDirectoryMetadata(epubPath);
				if (metadataFromDir) {
					console.log('[getEpubMetadata] Successfully extracted EPUB metadata from directory:', metadataFromDir.title);
					return metadataFromDir;
				} else {
					console.log('[getEpubMetadata] Failed to extract metadata from EPUB directory.');
				}
			}

		} catch (error: any) {
			console.error(`[getEpubMetadata] Error during EPUB metadata extraction for path ${epubPath}:`, error.message, error.stack);
		}

		console.log('[getEpubMetadata] EPUB metadata not accessible or extraction failed, continuing without enhanced metadata');
		return null;
	}

	private static async readEpubDirectoryMetadata(epubDir: string): Promise<any> {
		let containerContent, opfContent, directoryMetadata;

		try {
			const metaInfPath = path.join(epubDir, 'META-INF');
			const containerXmlPath = path.join(metaInfPath, 'container.xml');

			if (!fs.existsSync(containerXmlPath)) {
				const iTunesMetadataPath = path.join(epubDir, 'iTunesMetadata.plist');
				if (fs.existsSync(iTunesMetadataPath)) {
					try {
						const iTunesContent = fs.readFileSync(iTunesMetadataPath, 'utf8');
						return this.parseITunesMetadata(iTunesContent);
					} catch (itunesError: any) {
						console.error(`[readEpubDirectoryMetadata] Failed to read or parse iTunesMetadata.plist:`, itunesError.message);
						return null;
					}
				}
				return null;
			}

			containerContent = fs.readFileSync(containerXmlPath, 'utf8');
			const rootfileMatch = containerContent.match(/full-path="([^"]+)"/);
			if (!rootfileMatch || !rootfileMatch[1]) return null;

			const opfFilePath = rootfileMatch[1];
			const opfPath = path.resolve(epubDir, opfFilePath);

			if (!fs.existsSync(opfPath)) return null;
			opfContent = fs.readFileSync(opfPath, 'utf8');
			
			directoryMetadata = this.parseOPFMetadata(opfContent, opfPath);
			if (!directoryMetadata) return null;
			
			try {
				const coverPath = await this.findCoverImage(epubDir, opfContent);
				if (coverPath) {
					const coverBuffer = fs.readFileSync(coverPath);
					directoryMetadata.cover = coverBuffer.toString('base64');
				}
			} catch (coverImageError: any) {
				console.error('[readEpubDirectoryMetadata] Error processing cover image from directory:', coverImageError.message);
			}
			return directoryMetadata;
		} catch (error: any) {
			console.error('[readEpubDirectoryMetadata] Error processing directory:', error.message);
			return null;
		}
	}

	private static parseOPFMetadata(opfContent: string, opfPath?: string): any {
		const metadata: any = {
			isbn: null, language: null, publisher: null, publicationDate: null, rights: null, subjects: null,
			cover: null, toc: [], manifest: [], spine: []
		};
		try {
			const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
			if (titleMatch) metadata.title = titleMatch[1];
			const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
			if (authorMatch) metadata.author = authorMatch[1];
			const isbnMatch = opfContent.match(/<dc:identifier[^>]*(?:scheme="ISBN"|opf:scheme="ISBN")[^>]*>([^<]+)<\/dc:identifier>/i);
			if (isbnMatch) metadata.isbn = isbnMatch[1];
			const languageMatch = opfContent.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
			if (languageMatch) metadata.language = languageMatch[1];
			const publisherMatch = opfContent.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
			if (publisherMatch) metadata.publisher = publisherMatch[1];
			const dateMatch = opfContent.match(/<dc:date[^>]*>([^<]+)<\/dc:date>/i);
			if (dateMatch) metadata.publicationDate = dateMatch[1];
			const rightsMatch = opfContent.match(/<dc:rights[^>]*>([^<]+)<\/dc:rights>/i);
			if (rightsMatch) metadata.rights = rightsMatch[1];
			const subjectMatches = opfContent.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/ig);
			if (subjectMatches) {
				metadata.subjects = subjectMatches.map(match => {
					const subjectContentMatch = match.match(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/i);
					return subjectContentMatch ? subjectContentMatch[1] : null;
				}).filter(subject => subject !== null);
			}
		} catch (error: any) {
			console.error(`[parseOPFMetadata] Error parsing OPF:`, error.message); return null;
		}
		return metadata;
	}

	private static parseITunesMetadata(iTunesContent: string): any {
		const metadata: any = {
			isbn: null, language: null, publisher: null, publicationDate: null,
			cover: null, toc: [], manifest: [], spine: []
		};
		try {
			const artistNameMatch = iTunesContent.match(/<key>artistName<\/key>\s*<string>([^<]+)<\/string>/);
			if (artistNameMatch) metadata.author = artistNameMatch[1];
			const itemNameMatch = iTunesContent.match(/<key>itemName<\/key>\s*<string>([^<]+)<\/string>/);
			if (itemNameMatch) metadata.title = itemNameMatch[1];
		} catch (error: any) {
			console.error('[parseITunesMetadata] Error parsing iTunes:', error.message); return null;
		}
		return metadata;
	}

	private static async findCoverImage(epubDir: string, opfContent: string): Promise<string | null> {
		// Simplified findCoverImage logic for brevity in this step
		try {
			const metaCoverMatch = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"\s*\/>/i);
			if (metaCoverMatch) {
				const coverId = metaCoverMatch[1];
				const itemMatch = opfContent.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, "i"));
				if (itemMatch) {
					const coverHref = itemMatch[1];
					// Basic check, assumes OPF and image in same dir or coverHref is root-relative
					const potentialPath = path.resolve(path.dirname(path.join(epubDir, "placeholder.opf")), coverHref); // Approx path
					if (fs.existsSync(potentialPath)) return potentialPath;
					const directPath = path.join(epubDir, coverHref); // Check from epub root
                     if (fs.existsSync(directPath)) return directPath;

				}
			}
		} catch (e) { console.error("Error finding cover in OPF", e); }
		return null;
	}

	// Adapting _transformToc for the 'epub' library's ToC structure (EPub.TocElement[])
	private static _transformToc(
		epubLibTocItems: EPub.TocElement[] // Type from 'epub' library
	): Array<import('./types').TocEntry> { // Explicitly use TocEntry from our types
		let orderCounter = 0; // Initialize counter locally
		return epubLibTocItems.map((item: EPub.TocElement) => {
			orderCounter++;
			let href = item.href || '';
			if (href.includes('#')) {
				href = href.substring(0, href.indexOf('#'));
			}
			try {
				href = decodeURIComponent(href);
			} catch (e) {
				// console.warn(`Could not decode href URI component: ${href}`, e);
				// Keep href as is if decoding fails
			}

			const entry: import('./types').TocEntry = {
				title: item.title || 'Untitled Section', // EPub.TocElement has 'title'
				href: href,
				order: item.order || orderCounter, // EPub.TocElement has 'order'
				id: item.id, // EPub.TocElement has 'id'
				level: item.level, // EPub.TocElement has 'level'
				// parent and subitems will be undefined as EPub.TocElement is a flat list from epubInstance.toc
			};
			return entry;
		});
	}

	private static async executeSqlQuery(dbPath: string, query: string): Promise<any[]> {
		// Implementation from original file
		try {
			const command = `sqlite3 "${dbPath}" "${query.replace(/"/g, '""')}"`;
			const { stdout, stderr } = await execAsync(command);
			if (stderr) console.warn('SQLite stderr:', stderr);
			if (!stdout.trim()) return [];
			const lines = stdout.trim().split('\n');
			return lines.map(line => line.split('|'));
		} catch (error: any) {
			console.error('SQLite execution error:', error);
			throw new Error(`SQLite query failed: ${error.message}`);
		}
	}

	private static async executeSqlQueryWithHeaders(dbPath: string, query: string, options?: { maxBuffer?: number }): Promise<any[]> {
		// Implementation from original file
		try {
			const cleanQuery = query.replace(/\s+/g, ' ').trim();
			const command = `sqlite3 -header "${dbPath}" "${cleanQuery.replace(/"/g, '""')}"`;
			const maxBuffer = options?.maxBuffer || 50 * 1024 * 1024;
			const { stdout, stderr } = await execAsync(command, { maxBuffer });
			if (stderr) console.warn('SQLite stderr:', stderr);
			if (!stdout.trim()) return [];
			const lines = stdout.trim().split('\n');
			if (lines.length < 2) return [];
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
		// Implementation from original file
		try {
			if (os.platform() !== 'darwin') return { canAccess: false, error: 'Apple Books Importer only works on macOS' };
			const annotationPath = this.getDbPath(ANNOTATION_DB_PATTERN);
			if (!fs.existsSync(annotationPath)) return { canAccess: false, error: 'Apple Books annotation database not found' };
			const libraryPath = this.getDbPath(LIBRARY_DB_PATTERN);
			if (!fs.existsSync(libraryPath)) return { canAccess: false, error: 'Apple Books library database not found' };
			return { canAccess: true };
		} catch (error: any) {
			return { canAccess: false, error: `Database access error: ${error?.message || 'Unknown error'}` };
		}
	}

	private static async getAvailableColumns(dbPath: string, tableName: string): Promise<string[]> {
		// Implementation from original file
		try {
			const query = `PRAGMA table_info(${tableName});`;
			const results = await this.executeSqlQueryWithHeaders(dbPath, query);
			return results.map((row: any) => row.name);
		} catch (error: any) {
			console.warn('Could not get table info, falling back to basic columns:', error.message);
			return ['ZASSETID', 'ZSORTTITLE', 'ZSORTAUTHOR', 'ZBOOKDESCRIPTION', 'ZEPUBID', 'ZPATH'];
		}
	}

	static async getBookDetails(): Promise<BookDetail[]> {
		// Implementation from original file (simplified for brevity)
		const dbPath = this.getDbPath(LIBRARY_DB_PATTERN);
		const availableColumns = await this.getAvailableColumns(dbPath, 'ZBKLIBRARYASSET');
		const basicColumns = ['ZASSETID', 'ZSORTTITLE', 'ZSORTAUTHOR', 'ZBOOKDESCRIPTION', 'ZEPUBID', 'ZPATH'];
		const columnsToSelect = basicColumns.filter(col => availableColumns.includes(col));
		if (!columnsToSelect.includes('ZASSETID')) throw new Error('DB schema incompatible');
		const query = `SELECT ${columnsToSelect.join(', ')} FROM ZBKLIBRARYASSET;`;
		const results = await this.executeSqlQueryWithHeaders(dbPath, query);
		return this.mapBookResults(results);
	}

	private static mapBookResults(results: any[]): BookDetail[] {
		// Implementation from original file
		return results.map((row: any) => ({
			assetId: row.ZASSETID,
			title: row.ZSORTTITLE || 'Unknown Title',
			author: row.ZSORTAUTHOR || null,
			description: row.ZBOOKDESCRIPTION || null,
			epubId: row.ZEPUBID || null,
			path: row.ZPATH || null,
			isbn: null, language: row.ZLANGUAGE || null, publisher: null, publicationDate: null, cover: null,
			genre: row.ZGENRE || null, genres: row.ZGENRES || null, year: row.ZYEAR || null,
			pageCount: (row.ZPAGECOUNT && parseInt(row.ZPAGECOUNT) > 1) ? parseInt(row.ZPAGECOUNT) : null,
			rating: row.ZRATING ? parseInt(row.ZRATING) : null, comments: row.ZCOMMENTS || null,
			readingProgress: row.ZREADINGPROGRESS ? parseFloat(row.ZREADINGPROGRESS) : null,
			creationDate: row.ZCREATIONDATE ? new Date(row.ZCREATIONDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
			lastOpenDate: row.ZLASTOPENDATE ? new Date(row.ZLASTOPENDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
			modificationDate: row.ZMODIFICATIONDATE ? new Date(row.ZMODIFICATIONDATE * 1000 + Date.UTC(2001, 0, 1)) : null,
			rights: null, subjects: null,
		}));
	}

	static async getBooksWithHighlights(): Promise<string[]> {
		// Implementation from original file (simplified)
		const annotationDbPath = this.getDbPath(ANNOTATION_DB_PATTERN);
		const query = `SELECT DISTINCT ZANNOTATIONASSETID FROM ZAEANNOTATION WHERE ZANNOTATIONASSETID IS NOT NULL AND ZANNOTATIONSELECTEDTEXT IS NOT NULL AND ZANNOTATIONSELECTEDTEXT != '';`;
		const annotationRows = await this.executeSqlQueryWithHeaders(annotationDbPath, query);
		return [...new Set(annotationRows.map((row: any) => String(row.ZANNOTATIONASSETID)))];
	}

	static async getAnnotationsForBook(assetId: string): Promise<Annotation[]> {
		// Implementation from original file (simplified)
		const dbPath = this.getDbPath(ANNOTATION_DB_PATTERN);
		const query = `SELECT ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE, ZANNOTATIONLOCATION, ZPLABSOLUTEPHYSICALLOCATION, ZANNOTATIONSTYLE, ZANNOTATIONISUNDERLINE, ZANNOTATIONCREATIONDATE FROM ZAEANNOTATION WHERE ZANNOTATIONASSETID = '${assetId}' AND ZANNOTATIONSELECTEDTEXT != '';`;
		const results = await this.executeSqlQueryWithHeaders(dbPath, query);
		const annotations: Annotation[] = results.map((row: any) => ({
			selectedText: row.ZANNOTATIONSELECTEDTEXT || '',
			note: row.ZANNOTATIONNOTE || null,
			location: row.ZANNOTATIONLOCATION || null,
			physicalLocation: row.ZPLABSOLUTEPHYSICALLOCATION ? parseInt(row.ZPLABSOLUTEPHYSICALLOCATION) : null,
			annotationStyle: row.ZANNOTATIONSTYLE !== null && row.ZANNOTATIONSTYLE !== '' ? parseInt(row.ZANNOTATIONSTYLE) : null,
			isUnderline: row.ZANNOTATIONISUNDERLINE ? (parseInt(row.ZANNOTATIONISUNDERLINE) === 1) : false,
			creationDate: row.ZANNOTATIONCREATIONDATE ? new Date(parseFloat(row.ZANNOTATIONCREATIONDATE) * 1000 + Date.UTC(2001, 0, 1)) : null,
			// Initialize missing Annotation properties to null
			annotationType: null,
			modificationDate: null,
			uuid: null,
			representativeText: null,
		})).filter((annotation: Annotation) => annotation.selectedText.trim().length > 0);
		return this.groupConsecutiveNullLocationAnnotations(annotations);
	}

	private static groupConsecutiveNullLocationAnnotations(annotations: Annotation[]): Annotation[] {
		// Simplified for brevity
		if (!annotations || annotations.length === 0) return [];
		const result: Annotation[] = [];
		let currentGroup: Annotation[] = [];
		for (const ann of annotations) {
			if (ann.location === null && ann.physicalLocation === null) {
				currentGroup.push(ann);
			} else {
				if (currentGroup.length > 0) {
					const combinedText = [...currentGroup, ann].map(a => a.selectedText).join('\n');
					result.push({ ...ann, selectedText: combinedText });
					currentGroup = [];
				} else {
					result.push(ann);
				}
			}
		}
		if (currentGroup.length > 0) { // Handle trailing group
			const combinedText = currentGroup.map(a => a.selectedText).join('\n');
			result.push({ ...currentGroup[0], selectedText: combinedText, location: null, physicalLocation: null });
		}
		return result;
	}

	static sortAnnotationsByCFI(annotations: Annotation[]): Annotation[] {
		return annotations.sort((a, b) => {
			const aCfi = this.parseCFIForSorting(a.location || '');
			const bCfi = this.parseCFIForSorting(b.location || '');
			for (let i = 0; i < Math.min(aCfi.length, bCfi.length); i++) {
				if (aCfi[i] !== bCfi[i]) return aCfi[i] - bCfi[i];
			}
			return aCfi.length - bCfi.length;
		});
	}

	private static parseCFIForSorting(cfi: string): number[] {
		if (!cfi || !cfi.startsWith('epubcfi(')) return [0];
		try {
			const content = cfi.substring(8, cfi.length - 1);
			const numbers: number[] = [];
			const parts = content.split('!');
			for (const part of parts) {
				const cleanPart = part.replace(/\[[^\]]*\]/g, '');
				const nums = cleanPart.match(/\d+/g) || [];
				numbers.push(...nums.map(n => parseInt(n, 10)));
			}
			return numbers.length > 0 ? numbers : [0];
		} catch (error) { return [0]; }
	}
}
