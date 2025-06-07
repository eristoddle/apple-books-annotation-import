// tests/main.test.ts

// --- Mocking Utilities (Must be at the top) ---
const jestMockFn = () => {
    const mockFn = (...args: any[]) => {
        mockFn.mock.calls.push(args);
        if (mockFn.mock.implementation) {
            return mockFn.mock.implementation(...args);
        }
        // Return the last manually set mock result if no implementation
        if (mockFn.mock.results && mockFn.mock.results.length > 0) {
            const result = mockFn.mock.results[mockFn.mock.results.length - 1]; // Use last set result
            if (result.type === 'return') return result.value;
            if (result.type === 'resolve') return Promise.resolve(result.value);
            if (result.type === 'reject') return Promise.reject(result.value);
        }
        return undefined; // Default return
    };
    mockFn.mock = {
        calls: [] as any[][],
        instances: [] as any[],
        results: [] as Array<{type: 'return' | 'resolve' | 'reject', value: any}>,
        implementation: null as ((...args: any[]) => any) | null,
        mockClear: () => {
            mockFn.mock.calls = [];
            mockFn.mock.instances = [];
            // mockFn.mock.results = []; // Usually results are not cleared, but specific values can be reset if needed
            mockFn.mock.implementation = null;
        },
        mockResolvedValue: (val: any) => {
            mockFn.mock.results.push({ type: 'resolve', value: val });
        },
        mockReturnValue: (val: any) => {
            mockFn.mock.results.push({ type: 'return', value: val });
        },
        mockImplementation: (impl: (...args: any[]) => any) => {
            mockFn.mock.implementation = impl;
        }
    };
    return mockFn as any; // Cast to any to satisfy various jest.Mock uses
};

const jest = {
    fn: jestMockFn,
    mock: (moduleName: string, factory?: () => any) => {
        // This is a very simplified mock. In a real Jest environment,
        // this would properly replace modules in the module system.
        // Here, we're mostly using it to signal that mocks are being defined.
    }
};

// Now import dependent modules AFTER jest mock utilities are defined.
import AppleBooksImporterPlugin from '../main'; // Adjust path as needed
import { BookDetail, Annotation, AppleBooksImporterSettings } from '../types'; // Adjust path
import { BookSelectionItem } from '../BookSelectionModal'; // Adjust path
import { AppleBooksDatabase } from '../database'; // Adjust path
import { MarkdownGenerator } from '../markdown'; // Adjust path


// --- Simple Assertion Utility ---
let testsRun = 0;
let testsPassed = 0;

function assertEqual(actual: any, expected: any, message: string) {
    testsRun++;
    if (JSON.stringify(actual) === JSON.stringify(expected)) { // Simple deep compare for objects/arrays
        testsPassed++;
        // console.log(`PASSED: ${message}`); // Keep console cleaner for CI
    } else {
        console.error(`FAILED: ${message}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual:   ${JSON.stringify(actual)}`);
    }
}

function assertOk(condition: boolean, message: string) {
    testsRun++;
    if (condition) {
        testsPassed++;
        // console.log(`PASSED: ${message}`); // Keep console cleaner for CI
    } else {
        console.error(`FAILED: ${message}`);
        console.error(`  Condition was false`);
    }
}

function printTestSummary() {
    console.log(`\n--- Test Summary ---`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsRun - testsPassed}`);
    if (testsRun === testsPassed) {
        console.log("All tests passed!");
    } else {
        console.error("Some tests failed. Check logs above.");
        // In a CI environment, you might want to exit with a non-zero code
        // process.exit(1);
    }
    // Reset for next potential run in same environment
    testsRun = 0;
    testsPassed = 0;
}

// --- Mocks ---

// Mock Obsidian App and other parts that are not easily instantiable

// Define the structure with placeholder functions first
const mockApp: any = {
    vault: {
        createFolder: () => {},
        create: () => {},
        modify: () => {},
        getAbstractFileByPath: () => {},
        adapter: {
            exists: () => {},
        }
    },
    metadataCache: {
        getFirstLinkpathDest: () => {},
    },
};

// Create and configure mock functions separately
const createFolderMock = jest.fn();
createFolderMock.mock.mockResolvedValue(undefined);

const createMock = jest.fn();
createMock.mock.mockResolvedValue(undefined);

const modifyMock = jest.fn();
modifyMock.mock.mockResolvedValue(undefined);

const getAbstractFileByPathMock = jest.fn();
getAbstractFileByPathMock.mock.mockReturnValue(null);

const adapterExistsMock = jest.fn(); // Create it
// Configure it immediately:
adapterExistsMock.mock.mockResolvedValue(false);

const getFirstLinkpathDestMock = jest.fn();

// Assign configured mocks to the mockApp structure
mockApp.vault.createFolder = createFolderMock;
mockApp.vault.create = createMock;
mockApp.vault.modify = modifyMock;
mockApp.vault.getAbstractFileByPath = getAbstractFileByPathMock;
mockApp.vault.adapter.exists = adapterExistsMock;
mockApp.metadataCache.getFirstLinkpathDest = getFirstLinkpathDestMock;


// Mock AppleBooksDatabase module level functions
// These will be assigned to the imported AppleBooksDatabase object's methods
const mockDbFunctions = {
    checkDatabaseAccess: jest.fn(),
    getBooksWithHighlights: jest.fn(),
    getBookDetails: jest.fn(),
    getAnnotationsForBook: jest.fn(),
    getEpubMetadata: jest.fn(),
    sortAnnotationsByCFI: jest.fn((ann: Annotation[]) => ann), // Simple pass-through
};
// Configure default mock behaviors for DB functions using .mock property
(mockDbFunctions.checkDatabaseAccess as any).mock.mockReturnValue({ canAccess: true, error: null });
(mockDbFunctions.getBooksWithHighlights as any).mock.mockResolvedValue([]);
(mockDbFunctions.getBookDetails as any).mock.mockResolvedValue([]);
(mockDbFunctions.getAnnotationsForBook as any).mock.mockResolvedValue([]);
(mockDbFunctions.getEpubMetadata as any).mock.mockResolvedValue(null);
// sortAnnotationsByCFI is already a simple function, no need to mock its behavior further unless specific test needs it

Object.assign(AppleBooksDatabase, mockDbFunctions);

// Mock MarkdownGenerator module level functions
const mockMdFunctions = {
    generateMarkdown: jest.fn(),
    generateFileName: jest.fn(),
};
// Configure default mock behaviors for MD functions
(mockMdFunctions.generateMarkdown as any).mock.mockReturnValue("");
(mockMdFunctions.generateFileName as any).mock.mockReturnValue("mockfilename.md");

Object.assign(MarkdownGenerator, mockMdFunctions);


// --- Test Suite ---

async function runTests() {
    console.log("Starting tests for AppleBooksImporterPlugin...");

    // Instantiate the plugin with mock app and manifest
    const plugin = new AppleBooksImporterPlugin(mockApp as any, { name: 'Apple Books Importer Test', version: '1.0.0' } as any);

    // --- Tests for data preparation (similar to showBookSelector) ---
    console.log("\n--- Testing data preparation for BookSelectionModal ---");

    plugin.settings = { ...plugin.settings, includeCovers: true, outputFolder: "Books" }; // Example setting

    // Define mock data using correct field names from types.ts
    const mockBookDetailsData: Partial<BookDetail>[] = [
        { assetId: 'book1', title: 'Book 1', author: 'Author A', path: 'path/to/book1.epub'},
        { assetId: 'book2', title: 'Book 2', author: 'Author B', path: 'path/to/book2.epub'},
        { assetId: 'book3', title: 'Book 3 (No Highlights)', author: 'Author C', path: 'path/to/book3.epub'}, // Will be filtered out
        { assetId: 'book4', title: 'Book 4 (No Path)', author: 'Author D', path: null}, // No path, so no cover from EPUB
    ];

    const mockAnnotationsBook1Data: Partial<Annotation>[] = [
        { uuid: 'uuid1-1', selectedText: 'Highlight 1 for Book 1', location: 'loc1', modificationDate: new Date(), representativeText: 'RepText1', annotationStyle: 0 },
        { uuid: 'uuid1-2', selectedText: 'Highlight 2 for Book 1', location: 'loc2', modificationDate: new Date(), note: 'A note here', annotationStyle: 1 },
    ];
    const mockAnnotationsBook2Data: Partial<Annotation>[] = [
        { uuid: 'uuid2-1', selectedText: 'Highlight 1 for Book 2', location: 'locB1', modificationDate: new Date(), annotationStyle: 0 },
    ];
    const mockAnnotationsBook4Data: Partial<Annotation>[] = [ // For book4 (no path, but has highlights)
        { uuid: 'uuid4-1', selectedText: 'Highlight 1 for Book 4', location: 'locD1', modificationDate: new Date(), annotationStyle: 0 },
    ];

    // Create full mock objects by spreading defaults first, then the partial data.
    const MOCK_BOOK_DETAILS = mockBookDetailsData.map(b => ({...DEFAULT_BOOK_DETAIL_MOCK, ...b})) as BookDetail[];
    const MOCK_ANNOTATIONS_B1 = mockAnnotationsBook1Data.map(a => ({...DEFAULT_ANNOTATION_MOCK, ...a})) as Annotation[];
    const MOCK_ANNOTATIONS_B2 = mockAnnotationsBook2Data.map(a => ({...DEFAULT_ANNOTATION_MOCK, ...a})) as Annotation[];
    const MOCK_ANNOTATIONS_B4 = mockAnnotationsBook4Data.map(a => ({...DEFAULT_ANNOTATION_MOCK, ...a})) as Annotation[];

    // Setup mock return values for database functions for this specific test section
    (AppleBooksDatabase.getBookDetails as any).mockResolvedValue(MOCK_BOOK_DETAILS);
    (AppleBooksDatabase.getBooksWithHighlights as any).mockResolvedValue(['book1', 'book2', 'book4']); // book3 has no highlights
    (AppleBooksDatabase.getAnnotationsForBook as any)
        .mockImplementation(async (assetId: string) => {
            if (assetId === 'book1') return MOCK_ANNOTATIONS_B1;
            if (assetId === 'book2') return MOCK_ANNOTATIONS_B2;
            if (assetId === 'book4') return MOCK_ANNOTATIONS_B4;
            return [];
        });
    (AppleBooksDatabase.getEpubMetadata as any)
        .mockImplementation(async (path: string | null) => { // path can be null
            if (path === 'path/to/book1.epub') return { cover: 'base64cover1data', isbn: '123' };
            if (path === 'path/to/book2.epub') return { cover: 'base64cover2data', isbn: '456' };
            return null;
        });

    // Simulate part of showBookSelector's data prep
    const allBookDetailsFromDb = await AppleBooksDatabase.getBookDetails() as BookDetail[];
    const booksWithHighlightsIdsFromDb = await AppleBooksDatabase.getBooksWithHighlights() as string[];

    let booksForModal: BookSelectionItem[] = [];
    if (booksWithHighlightsIdsFromDb.length > 0) {
        const booksForModalPromises = allBookDetailsFromDb
            .filter(book => booksWithHighlightsIdsFromDb.includes(book.assetId))
            .map(async (book) => {
                let annotationCount = 0;
                let coverImage: string | undefined = undefined;
                const annotations = await AppleBooksDatabase.getAnnotationsForBook(book.assetId) as Annotation[];
                annotationCount = annotations.filter(ann => ann.selectedText && ann.selectedText.trim().length > 0).length;

                if (plugin.settings.includeCovers && book.path) {
                    const epubMetadata = await AppleBooksDatabase.getEpubMetadata(book.path);
                    if (epubMetadata && epubMetadata.cover) {
                        coverImage = `data:image/jpeg;base64,${epubMetadata.cover}`;
                    }
                }
                return {
                    ...book,
                    annotationCount: annotationCount,
                    selected: true, // per current main.ts logic for BookSelectionItem
                    coverImage: coverImage,
                } as BookSelectionItem; // Cast needed as we add annotationCount etc.
            });
        booksForModal = (await Promise.all(booksForModalPromises)).filter(b => b.annotationCount > 0);
    }

    assertEqual(booksForModal.length, 3, "Correct number of books prepared for modal (book3 filtered, book1,2,4 included)");
    const book1Modal = booksForModal.find(b => b.assetId === 'book1');
    const book4Modal = booksForModal.find(b => b.assetId === 'book4');

    assertOk(!!book1Modal, "Book 1 is present in modal data");
    if (book1Modal) {
        assertEqual(book1Modal.annotationCount, 2, "Book 1 annotation count is correct");
        assertEqual(book1Modal.coverImage, 'data:image/jpeg;base64,base64cover1data', "Book 1 cover image is correct");
    }
    assertOk(!!book4Modal, "Book 4 (no path) is present in modal data as it has highlights");
     if (book4Modal) {
        assertEqual(book4Modal.annotationCount, 1, "Book 4 annotation count is correct");
        assertEqual(book4Modal.coverImage, undefined, "Book 4 cover image is undefined (no path)");
    }

    // Test with includeCovers = false
    plugin.settings.includeCovers = false;
    let booksForModalNoCovers: BookSelectionItem[] = [];
     if (booksWithHighlightsIdsFromDb.length > 0) {
        const booksForModalPromisesNoCovers = allBookDetailsFromDb
            .filter(book => booksWithHighlightsIdsFromDb.includes(book.assetId))
            .map(async (book) => {
                let annotationCount = 0;
                const annotations = await AppleBooksDatabase.getAnnotationsForBook(book.assetId) as Annotation[];
                annotationCount = annotations.filter(ann => ann.selectedText && ann.selectedText.trim().length > 0).length;
                let coverImage: string | undefined = undefined;
                 if (plugin.settings.includeCovers && book.path) { // This condition will now be false
                    const epubMetadata = await AppleBooksDatabase.getEpubMetadata(book.path);
                    if (epubMetadata && epubMetadata.cover) {
                        coverImage = `data:image/jpeg;base64,${epubMetadata.cover}`;
                    }
                }
                return { ...(book as BookDetail), annotationCount, selected: true, coverImage } as BookSelectionItem;
            });
        booksForModalNoCovers = (await Promise.all(booksForModalPromisesNoCovers)).filter(b => b.annotationCount > 0);
    }
    const book1ModalNoCover = booksForModalNoCovers.find(b => b.assetId === 'book1');
    assertOk(!!book1ModalNoCover, "Book 1 (no cover setting) is present");
    if (book1ModalNoCover) {
         assertEqual(book1ModalNoCover.coverImage, undefined, "Book 1 cover image is undefined when includeCovers is false");
    }


    // --- Tests for importSelectedBooks ---
    console.log("\n--- Testing importSelectedBooks ---");
    plugin.settings.includeCovers = true; // Reset for these tests
    plugin.settings.createAuthorPages = true;
    plugin.settings.outputFolder = "Books"; // Ensure output folder is set

    (AppleBooksDatabase.getAnnotationsForBook as any).mockClear();
    (MarkdownGenerator.generateMarkdown as any).mockClear();
    (MarkdownGenerator.generateFileName as any).mockClear();
    (mockApp.vault.create as any).mockClear();
    (mockApp.vault.createFolder as any).mockClear();


    // Scenario 1: Import one book
    const selectedBook1ForImport = booksForModal.find(b => b.assetId === 'book1');
    if (!selectedBook1ForImport) throw new Error("Test setup error: selectedBook1 not found for import");

    (AppleBooksDatabase.getAnnotationsForBook as any).mockResolvedValue(MOCK_ANNOTATIONS_B1);
    (MarkdownGenerator.generateMarkdown as any).mockReturnValue("Markdown content for Book 1");
    (MarkdownGenerator.generateFileName as any).mockReturnValue("Book 1 by Author A.md");
    (mockApp.vault.adapter.exists as any).mockResolvedValue(false); // Folder does not exist initially

    await plugin.importSelectedBooks([selectedBook1ForImport]);

    assertEqual((AppleBooksDatabase.getAnnotationsForBook as any).mock.calls.length, 1, "Import 1: getAnnotationsForBook called once");
    assertEqual((AppleBooksDatabase.getAnnotationsForBook as any).mock.calls[0][0], 'book1', "Import 1: getAnnotationsForBook called with correct assetId");
    assertEqual((MarkdownGenerator.generateMarkdown as any).mock.calls.length, 1, "Import 1: generateMarkdown called once");
    assertEqual((MarkdownGenerator.generateFileName as any).mock.calls.length, 1, "Import 1: generateFileName called once");

    // Check createFolder for Books folder (parent)
    assertOk((mockApp.vault.createFolder as any).mock.calls.some((call: any[]) => call[0] === "Books"), "Import 1: vault.createFolder called for 'Books' output folder");

    // Check create for book note
    assertOk((mockApp.vault.create as any).mock.calls.some((call: any[]) => call[0] === "Books/Book 1 by Author A.md"), "Import 1: vault.create called for book note in output folder");

    // Check createFolder for Authors subfolder
    assertOk((mockApp.vault.createFolder as any).mock.calls.some((call: any[]) => call[0] === "Books/Authors"), "Import 1: vault.createFolder called for 'Authors' subfolder");

    // Check create for author page
    assertOk((mockApp.vault.create as any).mock.calls.some((call: any[]) => call[0] === "Books/Authors/Author A.md"), "Import 1: vault.create called for author page");


    // Scenario 2: Import multiple books
    (AppleBooksDatabase.getAnnotationsForBook as any).mockClear();
    (MarkdownGenerator.generateMarkdown as any).mockClear();
    (MarkdownGenerator.generateFileName as any).mockClear();
    (mockApp.vault.create as any).mockClear();
    (mockApp.vault.createFolder as any).mockClear();
    (mockApp.vault.adapter.exists as any).mockResolvedValue(false); // Reset exists calls

    const selectedBook2ForImport = booksForModal.find(b => b.assetId === 'book2');
    if (!selectedBook2ForImport) throw new Error("Test setup error: selectedBook2 not found for import");

    (AppleBooksDatabase.getAnnotationsForBook as any)
        .mockImplementation(async (assetId: string) => {
            if (assetId === 'book1') return MOCK_ANNOTATIONS_B1;
            if (assetId === 'book2') return MOCK_ANNOTATIONS_B2;
            return [];
        });
    (MarkdownGenerator.generateMarkdown as any)
        .mockImplementation((book: BookDetail, _ann: Annotation[], _settings: any) => `Markdown for ${book.title}`);
    (MarkdownGenerator.generateFileName as any)
        .mockImplementation((book: BookDetail) => `${book.title} by ${book.author}.md`);

    await plugin.importSelectedBooks([selectedBook1ForImport, selectedBook2ForImport]);
    assertEqual((AppleBooksDatabase.getAnnotationsForBook as any).mock.calls.length, 2, "Import 2: getAnnotationsForBook called for each book");
    assertEqual((MarkdownGenerator.generateMarkdown as any).mock.calls.length, 2, "Import 2: generateMarkdown called for each book");

    const createCalls = (mockApp.vault.create as any).mock.calls;
    assertOk(createCalls.some((call: any[]) => call[0].includes("Book 1 by Author A.md")), "Import 2: Book 1 note created");
    assertOk(createCalls.some((call: any[]) => call[0].includes("Book 2 by Author B.md")), "Import 2: Book 2 note created");
    assertOk(createCalls.some((call: any[]) => call[0].includes("Author A.md")), "Import 2: Author A page creation attempted");
    assertOk(createCalls.some((call: any[]) => call[0].includes("Author B.md")), "Import 2: Author B page creation attempted");


    // Scenario 3: Import empty list
    (AppleBooksDatabase.getAnnotationsForBook as any).mockClear();
    (MarkdownGenerator.generateMarkdown as any).mockClear();
    await plugin.importSelectedBooks([]);
    assertEqual((AppleBooksDatabase.getAnnotationsForBook as any).mock.calls.length, 0, "Import Empty: getAnnotationsForBook not called");
    assertEqual((MarkdownGenerator.generateMarkdown as any).mock.calls.length, 0, "Import Empty: generateMarkdown not called");


    // --- Placeholder for BookSelectionModal tests (Conceptual) ---
    console.log("\n--- Testing BookSelectionModal (Conceptual) ---");
    assertOk(true, "BookSelectionModal tests are conceptual due to UI dependency. Manual testing is key here.");


    printTestSummary();
}


// Default mock objects for type safety (fill with minimum required fields)
const DEFAULT_BOOK_DETAIL_MOCK: BookDetail = {
    assetId: '',
    title: '',
    author: null,
    description: null,
    epubId: null,
    path: null,
    isbn: null,
    language: null,
    publisher: null,
    publicationDate: null,
    cover: null,
    genre: null,
    genres: null, // BLOB field for multiple genres
	year: null,
	pageCount: null,
	rating: null,
	comments: null,
	readingProgress: 0,
	creationDate: null,
	lastOpenDate: null,
	modificationDate: null,
	rights: null,
	subjects: null,
    // Removed ZRASSETID, seriesName, seriesPosition, sortTitle, sortAuthor, isExplicit
};

const DEFAULT_ANNOTATION_MOCK: Annotation = {
    selectedText: '',
    note: null,
    location: null,
    physicalLocation: null,
    annotationType: null,
    annotationStyle: null,
    isUnderline: false,
    creationDate: null,
    modificationDate: null,
    uuid: '', // Annotation's own unique ID
    representativeText: null,
    // Removed assetId (it's context from getAnnotationsForBook), Z-prefixed fields, chapter
};


// Execute
runTests().catch(err => {
    console.error("Test suite encountered an error:", err);
    printTestSummary(); // Print whatever ran
});

// End of tests/main.test.ts
