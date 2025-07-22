import { App, Modal, Setting } from 'obsidian';
import { BookDetail } from './types'; // Assuming BookDetail will be enhanced or used

// Define a type for the items in the selection modal, extending BookDetail
export interface BookSelectionItem extends BookDetail {
  selected: boolean;
  annotationCount: number; // Add this if not already in BookDetail
  coverImage?: string; // Base64 string for the cover
}

export class BookSelectionModal extends Modal {
  private booksToDisplay: BookSelectionItem[];
  private onImportCallback: (selectedBooks: BookDetail[]) => void; // Use BookDetail or a relevant type
  private selectAllCheckbox: HTMLInputElement;
  private selectionStates: Map<string, boolean>;

  constructor(app: App, books: BookDetail[], onImport: (selectedBooks: BookDetail[]) => void) {
    super(app);
    // Initialize selectionStates and booksToDisplay
    this.selectionStates = new Map<string, boolean>();
    this.booksToDisplay = books.map(book => {
      // Assuming annotationCount might need to be explicitly passed or is part of BookDetail
      // For now, let's ensure 'selected' is part of the mapped object.
      // And 'annotationCount' needs to be sourced, e.g. book.annotations.length if available
      // or passed in a pre-processed BookSelectionItem array.
      // For this step, we'll assume BookDetail might not have annotationCount directly.
      // This part might need adjustment based on the actual structure of BookDetail
      // and how annotationCount is derived before calling the modal.
      // Let's assume books are pre-processed to include annotationCount for now.
      const bookItem: BookSelectionItem = {
        ...book,
        annotationCount: (book as BookSelectionItem).annotationCount || 0,
        selected: true, // Select all by default
        // Ensure 'null' cover from BookDetail becomes 'undefined' for BookSelectionItem's 'coverImage'
        coverImage: book.cover === null ? undefined : book.cover
      };
      this.selectionStates.set(book.assetId, bookItem.selected);
      return bookItem;
    });
    this.onImportCallback = onImport;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Select Books to Import' });

    // Controls: Select All / Deselect All
    const controlsEl = contentEl.createDiv('book-selection-controls');
    new Setting(controlsEl)
      .setName('Select/Deselect All')
      .addToggle(toggle => {
        this.selectAllCheckbox = toggle.toggleEl as HTMLInputElement;
        this.selectAllCheckbox.checked = this.booksToDisplay.every(book => this.selectionStates.get(book.assetId));
        this.updateSelectAllCheckboxVisualState(); // Initialize visual state

        toggle.onChange(value => {
          this.booksToDisplay.forEach(book => this.selectionStates.set(book.assetId, value));
          this.renderBookList(bookListEl); // Re-render to update individual checkboxes
          this.updateSelectAllCheckboxVisualState();
        });
      });

    // Book List Container
    const bookListEl = contentEl.createDiv('book-list-container');
    this.renderBookList(bookListEl);

    // Action Buttons
    const buttonsEl = contentEl.createDiv('book-selection-buttons');
    new Setting(buttonsEl)
      .addButton(button => {
        button.setButtonText('Import Selected')
          .setCta()
          .onClick(() => {
            const selectedAssetIds = Array.from(this.selectionStates.entries())
              .filter(([, selected]) => selected)
              .map(([assetId]) => assetId);

            const selectedBooksToImport = this.booksToDisplay.filter(book => selectedAssetIds.includes(book.assetId));
            this.onImportCallback(selectedBooksToImport);
            this.close();
          });
      })
      .addButton(button => {
        button.setButtonText('Cancel')
          .onClick(() => {
            this.close();
          });
      });

    // Add some basic styling
    this.addStyles();
  }

  private renderBookList(containerEl: HTMLElement) {
    containerEl.empty();

    if (this.booksToDisplay.length === 0) {
      containerEl.createEl('p', { text: 'No books with annotations found to display.' });
      return;
    }

    this.booksToDisplay.forEach((book) => {
      const bookItemEl = containerEl.createDiv('book-item');

      // Cover Image
      if (book.coverImage) { // Assuming coverImage is a base64 string
        const coverEl = bookItemEl.createEl('img', { cls: 'book-cover-placeholder' });
        coverEl.src = book.coverImage; //  e.g. `data:image/jpeg;base64,${book.coverImage}` if it's just the data
        coverEl.alt = `${book.title} Cover`;
      } else {
        const placeholderDiv = bookItemEl.createDiv('book-cover-placeholder-div');
        placeholderDiv.textContent = 'No Cover';
      }

      const bookInfoEl = bookItemEl.createDiv('book-info');
      bookInfoEl.createEl('div', { text: book.title, cls: 'book-title' });
      bookInfoEl.createEl('div', { text: `Author: ${book.author || 'Unknown'}`, cls: 'book-author' });
      // Ensure annotationCount is available on book or calculated before this point
      bookInfoEl.createEl('div', { text: `Annotations: ${book.annotationCount || 0}`, cls: 'book-annotations' });

      const checkboxEl = bookItemEl.createEl('input', { type: 'checkbox', cls: 'book-select-checkbox' });
      checkboxEl.checked = this.selectionStates.get(book.assetId) || false;
      checkboxEl.onchange = () => {
        this.selectionStates.set(book.assetId, checkboxEl.checked);
        this.updateSelectAllCheckboxVisualState();
      };
    });
  }

  private updateSelectAllCheckboxVisualState() {
    if (!this.selectAllCheckbox) return;

    let allSelected = true;
    let noneSelected = true;

    for (const selected of this.selectionStates.values()) {
      if (selected) noneSelected = false;
      else allSelected = false;
    }

    if (allSelected) {
      this.selectAllCheckbox.checked = true;
      this.selectAllCheckbox.indeterminate = false;
    } else if (noneSelected) {
      this.selectAllCheckbox.checked = false;
      this.selectAllCheckbox.indeterminate = false;
    } else {
      this.selectAllCheckbox.checked = false; // Or true, depending on how you want indeterminate to behave if clicked
      this.selectAllCheckbox.indeterminate = true;
    }
  }

  private addStyles() {
    const css = `
      .book-list-container {
        max-height: 400px;
        overflow-y: auto;
        margin-bottom: 10px;
        border: 1px solid var(--background-modifier-border);
        padding: 10px;
        border-radius: var(--radius-m);
      }
      .book-item {
        display: flex;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--background-modifier-border-hover);
      }
      .book-item:last-child {
        border-bottom: none;
      }
      .book-cover-placeholder {
        width: 50px; /* Ensure this matches your design */
        height: 70px; /* Ensure this matches your design */
        object-fit: cover;
        margin-right: 10px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
      }
      .book-cover-placeholder-div {
        width: 50px;
        height: 70px;
        margin-right: 10px;
        border-radius: var(--radius-s);
        border: 1px solid var(--background-modifier-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--font-ui-smaller);
        color: var(--text-faint);
        background-color: var(--background-secondary);
      }
      .book-info {
        flex-grow: 1;
      }
      .book-title {
        font-weight: bold;
        font-size: var(--font-ui-normal);
      }
      .book-author, .book-annotations {
        font-size: var(--font-ui-small);
        color: var(--text-muted);
      }
      .book-select-checkbox {
        margin-left: 10px;
        width: 18px; /* Adjust size as needed */
        height: 18px; /* Adjust size as needed */
      }
      .book-selection-controls {
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .book-selection-buttons .setting-item {
        border-top: none; /* Remove default border from Setting for buttons */
      }
      .book-selection-buttons .setting-item-control {
        justify-content: flex-end; /* Align buttons to the right */
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'apple-books-importer-modal-styles'; // Keep consistent ID
    styleEl.innerHTML = css;
    if (!document.getElementById(styleEl.id)) {
      document.head.appendChild(styleEl);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    // Consider removing styles if they are only for this modal and added to document.head
    const styleEl = document.getElementById('apple-books-importer-modal-styles');
    if (styleEl) {
      // styleEl.remove(); // Or manage styles more globally if shared
    }
  }
}
