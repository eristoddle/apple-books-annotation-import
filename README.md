# Apple Books Annotation Import for Obsidian

Import highlights and notes from the Apple Books app directly into your Obsidian vault. This plugin extracts annotations from the macOS Books SQLite databases and creates beautifully formatted markdown notes with comprehensive metadata.

## ✨ Features

### 📚 **Comprehensive Data Extraction**
- **Book Metadata**: Title, author, description, ISBN, publisher, publication date, genre, page count, language
- **Enhanced Metadata**: User ratings, reading progress, user comments, creation/modification dates
- **EPUB Metadata**: Rights information, subjects/categories, enhanced cover extraction
- **Annotation Details**: Highlight text, notes, location, creation dates, annotation styles, underline indicators

### 🎨 **Rich Annotation Support**
- **Highlight Colors**: Visual indicators for different highlight colors (🟡🟢🔵🟣🔴)
- **Annotation Types**: Support for highlights, underlines, and notes
- **Smart Sorting**: Annotations sorted by location in the book
- **Chapter Detection**: Intelligent chapter extraction from EPUB CFI locations
- **Creation Dates**: Track when annotations were made

### 🏷️ **Smart Organization**
- **Flexible Output**: Choose output folder or use vault root
- **Custom Tagging**: Add custom tags to imported notes
- **Author Linking**: Automatic linking to author pages
- **Overwrite Control**: Option to update existing notes or skip them

### ⚙️ **Extensive Configuration**
- **Metadata Control**: Choose which metadata fields to include
- **Cover Images**: Extract and embed book cover images
- **Reading Progress**: Show completion percentage for each book
- **Annotation Styling**: Include or exclude highlight colors and underline indicators
- **Date Information**: Show when annotations were created
- **Chapter Information**: Extract and display chapter names

## 📋 Requirements

- **macOS only** (accesses Apple Books app databases)
- Apple Books app with highlighted books
- Obsidian 0.15.0 or later

## 🚀 Installation

### Method 1: Manual Installation (Recommended)

1. **Download the latest release** from the [releases page](https://github.com/eristoddle/obsidian-apple-books-import/releases)
2. **Extract the files** to your vault's `.obsidian/plugins/apple-books-annotation-import/` directory
3. **Restart Obsidian** and enable the plugin in Settings → Community Plugins

### Method 2: Build from Source

1. **Clone this repository** into your vault's plugins directory:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins/
   git clone https://github.com/eristoddle/obsidian-apple-books-import.git apple-books-annotation-import
   cd apple-books-annotation-import
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the plugin:**
   ```bash
   npm run build
   ```

4. **Enable in Obsidian:**
   - Restart Obsidian
   - Go to Settings → Community Plugins
   - Find "Apple Books Annotation Import" and enable it

## 📖 Usage

### Quick Start

1. Open the Command Palette (`Cmd + P`)
2. Search for "Import all books with highlights"
3. Run the command and wait for the import to complete

### Alternative Access

- Click the 📖 book icon in the left ribbon
- Use the command "Select books to import" to preview available books

## ⚙️ Configuration

Go to **Settings → Apple Books Annotation Import** to configure:

### Basic Settings

- **Output Folder**: Where to save book notes (default: "Books")
- **Overwrite Existing**: Update existing notes during import
- **Add Tags**: Automatically tag imported notes
- **Custom Tags**: Specify which tags to add (default: "book/notes")

### Content Settings

- **Include Covers**: Extract and embed book cover images
- **Include Metadata**: Add detailed book information (ISBN, publisher, etc.)
- **Include Chapter Information**: Extract chapter names from annotations
- **Include Reading Progress**: Show completion percentage
- **Sort Annotations**: Order highlights by position in book

### Annotation Settings

- **Include Annotation Dates**: Show when annotations were created
- **Include Annotation Styles**: Show highlight colors and underline indicators

## 📝 Output Format

Each imported book creates a markdown file with this structure:

```markdown
---
title: The Example Book
author: Jane Author
isbn: 978-1234567890
language: en
publisher: Example Press
publication_date: 2023-01-15
year: 2023
genre: Fiction
page_count: 320
rating: 4
reading_progress: 75%
subjects: ["Literature", "Modern Fiction"]
rights: © 2023 Example Press
last_opened: 2024-01-15
tags: #book/notes
---

# The Example Book by Jane Author

<p align="center">
<img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABA..." width="50%">
</p>

## Metadata

- **Author:** [[Authors/Jane Author]]
- **ISBN:** 978-1234567890
- **Language:** English
- **Publisher:** Example Press
- **Publication Date:** 2023-01-15
- **Genre:** Fiction
- **Pages:** 320
- **Rating:** 4/5 ⭐
- **Reading Progress:** 75%
- **Subjects:** Literature, Modern Fiction
- **Last Opened:** Mon Jan 15 2024

## Annotations

### Chapter 1

> 🟡 This is a highlighted passage from the book that caught my attention.

*Jane Author, *The Example Book*, Example Press, 2023, loc. 45.* *(Created: Mon Jan 15 2024)*

**Note:** This is my personal note about this highlight.

---

### Chapter 3

> 🔵 📝 Another important quote that I underlined and highlighted in blue.

*Jane Author, *The Example Book*, Example Press, 2023, loc. 127.* *(Created: Tue Jan 16 2024)*

---
```

## 🎨 Annotation Styling

The plugin provides visual indicators for different highlight types:

- 🟡 **Yellow highlights** (default)
- 🟢 **Green highlights**
- 🔵 **Blue highlights**
- 🟣 **Purple highlights**
- 🔴 **Red highlights**
- 📝 **Underlined text**

## 🔧 Commands

- **Import all books with highlights**: Imports all books that have annotations
- **Select books to import**: Preview available books and their annotation counts

## 📊 Data Extracted

### From Apple Books Library Database
- Asset ID, Title, Author, Description
- EPUB ID, File Path, Genre
- Page Count, User Rating, User Comments
- Reading Progress, Creation Date, Last Opened Date
- Language, Publication Year

### From Apple Books Annotation Database
- Selected Text, User Notes, Location (CFI)
- Physical Location, Annotation Type, Style/Color
- Underline Status, Creation Date, Modification Date
- Annotation UUID, Representative Text

### From EPUB Metadata (when available)
- ISBN, Publisher, Publication Date
- Rights Information, Subject Categories
- Enhanced Cover Images

## 🔍 Technical Details

### Database Locations
The plugin accesses these SQLite databases:
- **Annotations**: `~/Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation*.sqlite`
- **Library**: `~/Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary*.sqlite`

### Chapter Detection
The plugin uses sophisticated CFI (Canonical Fragment Identifier) parsing to extract chapter information:
- Handles various chapter naming patterns (`chapter_4`, `c3.xhtml`, etc.)
- Recognizes special sections (Preface, Introduction, Appendix)
- Falls back to cleaned chapter IDs when patterns don't match

### Privacy & Security
- All data processing happens locally on your device
- No data is sent to external servers
- Only reads from Apple Books databases (no modifications)
- Respects your vault's file organization

## 🛠️ Troubleshooting

### "No database found" Error
This usually means:
1. You're not on macOS
2. Apple Books app hasn't been used to highlight any books
3. Database files don't have the expected permissions

**Solutions:**
- Ensure you're running on macOS
- Open Apple Books and highlight at least one passage
- Check that the Books app has full access to its data

### "Permission denied" Error
**Solutions:**
1. Grant Obsidian full disk access in System Preferences → Security & Privacy
2. Restart Obsidian after granting permissions
3. Try highlighting a new passage in Books to refresh the database

### No Books Found
Ensure you have:
1. Books in your Apple Books library
2. Highlighted or annotated passages in those books
3. Recent activity in the Books app

### Build Issues
If you encounter build errors:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 🆚 Comparison with Python Script

This plugin provides several advantages over [the original Python script](https://www.stephanmiller.com/import-osx-book-notes-into-obsidian/):

| Feature | Python Script | Obsidian Plugin |
|---------|---------------|-----------------|
| **Integration** | External script | Native Obsidian integration |
| **Configuration** | Command line args | Rich settings interface |
| **Progress** | Console output | Visual notifications |
| **Error Handling** | Basic | Comprehensive with user feedback |
| **Metadata** | Basic fields | Comprehensive extraction |
| **Annotation Styling** | None | Visual highlight indicators |
| **Chapter Detection** | Basic CFI parsing | Enhanced CFI parsing |
| **Always Available** | Manual execution | Always available in Obsidian |
| **User Experience** | Technical | User-friendly |

## 📁 Project Structure

```
apple-books-annotation-import/
├── main.ts              # Main plugin class and orchestration
├── types.ts             # TypeScript interfaces and types
├── database.ts          # SQLite database access and queries
├── markdown.ts          # Markdown generation and formatting
├── settings.ts          # Settings interface and configuration
├── manifest.json        # Plugin metadata and requirements
├── package.json         # Dependencies and build scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
└── README.md            # This documentation
```

## 🔄 Development

### Development Setup

1. Make changes to the TypeScript files
2. Run `npm run dev` for continuous building during development
3. Reload the plugin in Obsidian to test changes

### Building for Production

```bash
npm run build
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on macOS with Apple Books
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the original Python script for extracting Apple Books annotations
- Built on the excellent Obsidian plugin architecture
- Thanks to the Obsidian community for feedback and suggestions
- Special thanks to Apple for maintaining accessible SQLite databases

## 🐛 Known Issues

- Only works on macOS (by design, as it accesses Apple Books databases)
- Requires Apple Books to have been used with highlights/annotations
- EPUB cover extraction may not work for all book formats
- Some very old books may have limited metadata

## 🔮 Future Enhancements

- [ ] Interactive book selection dialog
- [ ] Bulk export/import operations
- [ ] Custom note templates
- [ ] Integration with other reading apps
- [ ] Annotation synchronization detection
- [ ] Enhanced metadata from online sources

---

**Need help?** Open an issue on GitHub or check the [troubleshooting section](#🛠️-troubleshooting) above.
