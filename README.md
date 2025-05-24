# Apple Books Annotation Import for Obsidian

This plugin imports highlights and notes from the Apple Books app directly into your Obsidian vault. It extracts annotations from the macOS Books SQLite databases and creates beautifully formatted markdown notes.

## Features

✨ **Automatic Import**: Import all books with highlights in one command  
📚 **Rich Metadata**: Includes book details, author information, and publication data  
🎯 **Smart Organization**: Automatically sorts annotations by location in the book  
🏷️ **Flexible Tagging**: Add custom tags to imported notes  
📝 **Chapter Detection**: Extracts chapter information from annotation locations  
⚙️ **Configurable**: Extensive settings for customizing the import process  
🔄 **Sync-Friendly**: Overwrites existing notes to keep everything up to date  

## Requirements

- **macOS only** (accesses Apple Books app databases)
- Apple Books app with highlighted books
- Obsidian 0.15.0 or later

## Installation & Setup

### Method 1: Manual Installation (Recommended)

1. **Download the latest release** from the [releases page](https://github.com/stmiller/obsidian-apple-books-import/releases)
2. **Extract the files** to your vault's `.obsidian/plugins/apple-books-annotation-import/` directory
3. **Restart Obsidian** and enable the plugin in Settings → Community Plugins

### Method 2: Build from Source

1. **Clone this repository** into your vault's plugins directory:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins/
   git clone https://github.com/stmiller/obsidian-apple-books-import.git apple-books-annotation-import
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
   - Make sure "Safe mode" is disabled
   - Find "Apple Books Annotation Import" and enable it

## Usage

### Quick Start

1. Open the Command Palette (`Cmd + P`)
2. Search for "Import all books with highlights"
3. Run the command and wait for the import to complete

### Alternative Access

- Click the book icon in the left ribbon
- Use the command "Select books to import" (coming soon)

### Settings Configuration

Go to Settings → Apple Books Annotation Import to configure:

- **Output Folder**: Where to save book notes (default: "Books")
- **Include Covers**: Extract and embed book cover images
- **Include Metadata**: Add detailed book information
- **Overwrite Existing**: Update existing notes during import
- **Add Tags**: Automatically tag imported notes
- **Custom Tags**: Specify which tags to add (default: "book/notes")
- **Chapter Information**: Extract chapter names from annotations
- **Sort Annotations**: Order highlights by position in book

### Output Format

Each imported book creates a markdown file with this structure:

```markdown
---
title: Book Title
author: Author Name
isbn: 978-1234567890
publisher: Publisher Name
publication_date: 2023
tags: #book/notes
---

# Book Title by Author Name

## Metadata
- **Author:** [[Authors/Author Name]]
- **ISBN:** 978-1234567890
- **Publisher:** Publisher Name

## Annotations

### Chapter 1

> This is a highlighted passage from the book.

*Author Name, *Book Title*, Publisher, 2023, loc. 45.*

**Note:** This is my note about the highlight.

---
```

## Commands

- **Import all books with highlights**: Imports all books that have annotations
- **Select books to import**: (Coming soon) Choose specific books to import

## Troubleshooting

### "No database found" Error

This usually means:
1. You're not on macOS
2. Apple Books app hasn't been used to highlight any books
3. Database files don't have the expected permissions

### "Permission denied" Error

Try:
1. Opening Apple Books app to ensure databases are created
2. Highlighting a passage in any book to initialize the annotation database
3. Restarting Obsidian with full disk access permissions

### No Books Found

Ensure you have:
1. Books in your Apple Books library
2. Highlighted or annotated passages in those books
3. The Books app has created annotation data

### Build Issues

If you encounter build errors:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### SQLite Dependencies

If you get SQLite-related errors, you may need to rebuild the native module:

```bash
npm rebuild better-sqlite3
```

## Technical Details

### Database Locations

The plugin accesses these SQLite databases:
- Annotations: `~/Library/Containers/com.apple.iBooksX/Data/Documents/AEAnnotation/AEAnnotation*.sqlite`
- Library: `~/Library/Containers/com.apple.iBooksX/Data/Documents/BKLibrary/BKLibrary*.sqlite`

### Privacy & Security

- All data processing happens locally on your device
- No data is sent to external servers
- Only reads from Apple Books databases (no modifications)
- Respects your vault's file organization

## Development

### Development Setup

1. Make changes to the TypeScript files
2. Run `npm run dev` for continuous building
3. Reload the plugin in Obsidian to test changes

### Building for Production

```bash
npm run build
```

### File Structure

```
apple-books-annotation-import/
├── main.ts              # Main plugin class
├── types.ts             # TypeScript interfaces
├── database.ts          # SQLite database access
├── markdown.ts          # Markdown generation
├── settings.ts          # Settings interface
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── esbuild.config.mjs   # Build configuration
└── README.md            # Documentation
```

## Comparison with Python Script

This plugin provides several advantages over the original Python script:

- 🔧 **Native Integration**: Works directly within Obsidian
- ⚙️ **Rich Settings**: Extensive configuration options
- 🎯 **Better UX**: Progress notifications and error handling
- 🔄 **Always Available**: No need to run external scripts
- 📱 **Platform Aware**: Detects macOS and provides helpful errors
- 🏷️ **Smarter Organization**: Automatic linking and tagging

## License

This project is licensed under the MIT License.

## Acknowledgments

- Inspired by the original Python script approach
- Built on the excellent Obsidian plugin architecture
- Thanks to the Obsidian community for feedback and suggestions