// tests/database.test.ts
import { AppleBooksDatabase } from '../database'; // Adjust path as needed
import * as fs from 'fs';
import * as path from 'path';

// Mock the fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Helper to reset mocks before each test
beforeEach(() => {
  jest.resetAllMocks();
});

describe('AppleBooksDatabase', () => {
  describe('findCoverImage (private method - testing via getEpubMetadata or direct call if made public/static for testing)', () => {
    // For private methods, we'd typically test them through a public interface.
    // If we need to test findCoverImage directly, we might need to temporarily make it public or use a testing utility.
    // For this exercise, let's assume we can call it directly or test its effects via getEpubMetadata.
    // We'll simulate the direct call for findCoverImage for focused testing.

    const findCoverImage = AppleBooksDatabase['findCoverImage']; // Accessing private static method for testing

    it('should find cover image from meta tag in OPF', async () => {
      const epubDir = '/fake/epub';
      const opfContent = `
        <metadata>
          <meta name="cover" content="cover-image-id" />
        </metadata>
        <manifest>
          <item id="cover-image-id" href="images/cover.jpg" media-type="image/jpeg" />
        </manifest>
      `;
      const expectedCoverPath = path.join(epubDir, 'OEBPS', 'images/cover.jpg');

      mockedFs.existsSync.mockReturnValue(true); // Assume all paths exist for this specific test flow
      mockedFs.existsSync.mockImplementation((p) => p === expectedCoverPath);


      const coverPath = await findCoverImage(epubDir, opfContent);
      expect(coverPath).toBe(expectedCoverPath);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(expectedCoverPath);
    });

    it('should find cover image from item with id="cover" in OPF', async () => {
      const epubDir = '/fake/epub';
      const opfContent = `
        <manifest>
          <item id="cover" href="cover-pic.png" media-type="image/png" />
        </manifest>
      `;
      const expectedCoverPath = path.join(epubDir, 'OEBPS', 'cover-pic.png');
      mockedFs.existsSync.mockImplementation((p) => p === expectedCoverPath);

      const coverPath = await findCoverImage(epubDir, opfContent);
      expect(coverPath).toBe(expectedCoverPath);
    });

    it('should find cover.jpg in OEBPS directory', async () => {
      const epubDir = '/fake/epub';
      const opfContent = `<metadata></metadata><manifest></manifest>`; // No explicit cover in OPF
      const oebpsPath = path.join(epubDir, 'OEBPS');
      const expectedCoverPath = path.join(oebpsPath, 'cover.jpg');

      mockedFs.existsSync.mockImplementation((p) => {
        if (p === oebpsPath) return true;
        if (p === expectedCoverPath) return true;
        return false;
      });
      mockedFs.readdirSync.mockImplementation((p) => {
        if (p === oebpsPath) return ['cover.jpg', 'otherfile.xhtml'] as any;
        return [];
      });

      const coverPath = await findCoverImage(epubDir, opfContent);
      expect(coverPath).toBe(expectedCoverPath);
    });

    it('should find cover.jpeg in OPS/images directory', async () => {
      const epubDir = '/fake/epub';
      const opfContent = `<metadata></metadata><manifest></manifest>`;
      const opsPath = path.join(epubDir, 'OPS');
      const imagesPath = path.join(opsPath, 'images');
      const expectedCoverPath = path.join(imagesPath, 'cover.jpeg');

      mockedFs.existsSync.mockImplementation((p) => {
        return p === opsPath || p === imagesPath || p === expectedCoverPath;
      });
      mockedFs.readdirSync.mockImplementation((p) => {
        if (p === opsPath) return ['images'] as any; // Let's say readdir on OPS itself doesn't list files directly
        if (p === imagesPath) return ['cover.jpeg'] as any;
        return [];
      });

      const coverPath = await findCoverImage(epubDir, opfContent);
      expect(coverPath).toBe(expectedCoverPath);
    });

    it('should find thumbnail.png in Pictures directory directly under epubDir', async () => {
        const epubDir = '/fake/epub';
        const opfContent = `<metadata></metadata><manifest></manifest>`; // No explicit cover
        const picturesPath = path.join(epubDir, 'Pictures');
        const expectedCoverPath = path.join(picturesPath, 'thumbnail.png');

        mockedFs.existsSync.mockImplementation((p) => {
            // Mock OEBPS/OPS as non-existent or empty for this test
            if (p === path.join(epubDir, 'OEBPS')) return false;
            if (p === path.join(epubDir, 'OPS')) return false;
            // Target path exists
            return p === picturesPath || p === expectedCoverPath;
        });
        mockedFs.readdirSync.mockImplementation((p) => {
            if (p === picturesPath) return ['thumbnail.png'] as any;
            return [];
        });

        const coverPath = await findCoverImage(epubDir, opfContent);
        expect(coverPath).toBe(expectedCoverPath);
    });


    it('should return null if no cover image is found', async () => {
      const epubDir = '/fake/epub';
      const opfContent = `<metadata></metadata><manifest></manifest>`;
      mockedFs.existsSync.mockReturnValue(false); // No paths exist

      const coverPath = await findCoverImage(epubDir, opfContent);
      expect(coverPath).toBeNull();
    });

    it('should return null if OPF specifies a cover image that does not exist', async () => {
        const epubDir = '/fake/epub';
        const opfContent = `
          <manifest>
            <item id="cover" href="nonexistent.jpg" media-type="image/jpeg" />
          </manifest>
        `;
        // Simulate that OEBPS/OPS exist, but the specific file doesn't
        mockedFs.existsSync.mockImplementation((p) => {
            return p === path.join(epubDir, 'OEBPS') || p === path.join(epubDir, 'OPS');
        });

        const coverPath = await findCoverImage(epubDir, opfContent);
        expect(coverPath).toBeNull();
      });
  });

  describe('getEpubMetadata', () => {
    const epubDirPath = '/test/epub';

    mockedFs.statSync.mockReturnValue({ isDirectory: () => true, isFile: () => false } as fs.Stats);

    it('should extract full metadata including cover image', async () => {
      const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
      const opfFilePathRel = 'OEBPS/content.opf';
      const opfPath = path.join(epubDirPath, opfFilePathRel);
      const coverImagePathRel = 'images/cover.jpg';
      const coverPath = path.join(epubDirPath, 'OEBPS', coverImagePathRel);

      mockedFs.existsSync.mockImplementation(p => {
        return p === epubDirPath || p === containerXmlPath || p === opfPath || p === coverPath;
      });

      mockedFs.readFileSync.mockImplementation(p => {
        if (p === containerXmlPath) {
          return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
        }
        if (p === opfPath) {
          return `
            <package>
              <metadata>
                <dc:title>Test Book</dc:title>
                <dc:creator>Test Author</dc:creator>
                <meta name="cover" content="coverId" />
              </metadata>
              <manifest>
                <item id="coverId" href="${coverImagePathRel}" media-type="image/jpeg" />
              </manifest>
            </package>
          `;
        }
        if (p === coverPath) {
          return Buffer.from('fakeImageData');
        }
        throw new Error(`Unexpected readFileSync call to ${p}`);
      });

      const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);

      expect(metadata).not.toBeNull();
      expect(metadata.title).toBe('Test Book');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.cover).toBe(Buffer.from('fakeImageData').toString('base64'));
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(containerXmlPath, 'utf8');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(opfPath, 'utf8');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(coverPath);
    });

    it('should return metadata without cover if no cover image is found', async () => {
        const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
        const opfFilePathRel = 'OEBPS/content.opf';
        const opfPath = path.join(epubDirPath, opfFilePathRel);

        mockedFs.existsSync.mockImplementation(p => {
          return p === epubDirPath || p === containerXmlPath || p === opfPath || p === path.join(epubDirPath, 'OEBPS'); // OEBPS exists for findCoverImage checks
        });

        mockedFs.readFileSync.mockImplementation(p => {
          if (p === containerXmlPath) return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
          if (p === opfPath) return `<package><metadata><dc:title>No Cover Book</dc:title></metadata><manifest></manifest></package>`; // No cover specified
          throw new Error(`Unexpected readFileSync call to ${p}`);
        });

        // Ensure findCoverImage internally doesn't find anything
        mockedFs.readdirSync.mockReturnValue([]); // No files in common directories

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).not.toBeNull();
        expect(metadata.title).toBe('No Cover Book');
        expect(metadata.cover).toBeNull();
      });

      it('should return null if container.xml is missing and no iTunesMetadata.plist', async () => {
        mockedFs.existsSync.mockImplementation(p => {
          if (p === epubDirPath) return true;
          // META-INF/container.xml does not exist
          if (p === path.join(epubDirPath, 'META-INF', 'container.xml')) return false;
          // iTunesMetadata.plist does not exist
          if (p === path.join(epubDirPath, 'iTunesMetadata.plist')) return false;
          return false;
        });

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull();
      });

      it('should return null if OPF file is missing', async () => {
        const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
        const opfFilePathRel = 'OEBPS/nonexistent.opf';

        mockedFs.existsSync.mockImplementation(p => {
          if (p === epubDirPath) return true;
          if (p === containerXmlPath) return true; // container.xml exists
          if (p === path.join(epubDirPath, opfFilePathRel)) return false; // OPF file does NOT exist
          return false;
        });
        mockedFs.readFileSync.mockImplementation(p => {
          if (p === containerXmlPath) return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
          throw new Error(`Unexpected readFileSync call to ${p}`);
        });

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull(); // As readEpubDirectoryMetadata would return null
      });

      it('should return null if OPF parsing fails (e.g. malformed XML)', async () => {
        const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
        const opfFilePathRel = 'OEBPS/content.opf';
        const opfPath = path.join(epubDirPath, opfFilePathRel);

        mockedFs.existsSync.mockImplementation(p => {
          return p === epubDirPath || p === containerXmlPath || p === opfPath;
        });
        mockedFs.readFileSync.mockImplementation(p => {
          if (p === containerXmlPath) return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
          if (p === opfPath) return `<package><metadata>This is not valid XML`; // Malformed OPF
          throw new Error(`Unexpected readFileSync call to ${p}`);
        });
        // parseOPFMetadata is expected to catch the error and return null.
        // Then readEpubDirectoryMetadata should return null.
        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull();
      });

      it('should handle error during OPF file reading', async () => {
        const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
        const opfFilePathRel = 'OEBPS/content.opf';
        const opfPath = path.join(epubDirPath, opfFilePathRel);

        mockedFs.existsSync.mockImplementation(p => {
            return p === epubDirPath || p === containerXmlPath || p === opfPath;
        });
        mockedFs.readFileSync.mockImplementation(p => {
            if (p === containerXmlPath) {
                return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
            }
            if (p === opfPath) {
                throw new Error("FS Read Error for OPF");
            }
            throw new Error(`Unexpected readFileSync call to ${p}`);
        });

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull(); // readEpubDirectoryMetadata should catch and return null
    });

    it('should return metadata but no cover if cover image file reading fails', async () => {
        const containerXmlPath = path.join(epubDirPath, 'META-INF', 'container.xml');
        const opfFilePathRel = 'OEBPS/content.opf';
        const opfPath = path.join(epubDirPath, opfFilePathRel);
        const coverImagePathRel = 'images/cover.jpg';
        const coverPath = path.join(epubDirPath, 'OEBPS', coverImagePathRel);

        mockedFs.existsSync.mockImplementation(p => {
          return p === epubDirPath || p === containerXmlPath || p === opfPath || p === coverPath;
        });

        mockedFs.readFileSync.mockImplementation(p => {
          if (p === containerXmlPath) {
            return `<container><rootfiles><rootfile full-path="${opfFilePathRel}" /></rootfiles></container>`;
          }
          if (p === opfPath) {
            return `
              <package>
                <metadata><dc:title>Book With Unreadable Cover</dc:title></metadata>
                <manifest><item id="cover" href="${coverImagePathRel}" media-type="image/jpeg" /></manifest>
              </package>
            `;
          }
          if (p === coverPath) {
            throw new Error('Failed to read cover image file');
          }
          throw new Error(`Unexpected readFileSync call to ${p}`);
        });

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).not.toBeNull();
        expect(metadata.title).toBe('Book With Unreadable Cover');
        expect(metadata.cover).toBeNull(); // Cover processing failed
      });

      it('should return null if epubPath itself does not exist', async () => {
        mockedFs.existsSync.mockImplementation(p => {
            if (p === epubDirPath) return false; // Main epub dir does not exist
            return true; // Other calls might default to true but won't be reached
        });
        mockedFs.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => false } as fs.Stats); // Should not be called if existsSync is false

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull();
        expect(mockedFs.statSync).not.toHaveBeenCalled();
    });

    it('should return null if epubPath is a file, not a directory', async () => {
        mockedFs.existsSync.mockReturnValue(true); // Path exists
        mockedFs.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true } as fs.Stats); // It's a file

        const metadata = await AppleBooksDatabase.getEpubMetadata(epubDirPath);
        expect(metadata).toBeNull();
    });

  });
});
