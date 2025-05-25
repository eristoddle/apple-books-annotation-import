// settings.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import AppleBooksImporterPlugin from "./main";
import { AppleBooksImporterSettings } from "./types";

export const DEFAULT_SETTINGS: AppleBooksImporterSettings = {
	outputFolder: "Books",
	includeCovers: true,
	includeMetadata: true,
	overwriteExisting: true,
	addTags: true,
	customTags: "book/notes",
	includeChapterInfo: true,
	sortAnnotations: true,
	includeAnnotationDates: true,
	includeAnnotationStyles: true,
	includeReadingProgress: true,
	createAuthorPages: true,
};

export class AppleBooksImporterSettingTab extends PluginSettingTab {
	plugin: AppleBooksImporterPlugin;

	constructor(app: App, plugin: AppleBooksImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Apple Books Annotation Import Settings" });

		// Output folder setting
		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Folder where book notes will be created (leave empty for vault root)")
			.addText((text) =>
				text
					.setPlaceholder("Books")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// Include covers setting
		new Setting(containerEl)
			.setName("Include cover images")
			.setDesc("Include book cover images in the generated notes (requires EPUB access)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeCovers)
					.onChange(async (value) => {
						this.plugin.settings.includeCovers = value;
						await this.plugin.saveSettings();
					})
			);

		// Include metadata setting
		new Setting(containerEl)
			.setName("Include extended metadata")
			.setDesc("Include detailed metadata like ISBN, publisher, publication date")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeMetadata)
					.onChange(async (value) => {
						this.plugin.settings.includeMetadata = value;
						await this.plugin.saveSettings();
					})
			);

		// Overwrite existing files
		new Setting(containerEl)
			.setName("Overwrite existing files")
			.setDesc("Overwrite existing book notes when importing")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overwriteExisting)
					.onChange(async (value) => {
						this.plugin.settings.overwriteExisting = value;
						await this.plugin.saveSettings();
					})
			);

		// Add tags setting
		new Setting(containerEl)
			.setName("Add tags to notes")
			.setDesc("Automatically add tags to imported book notes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addTags)
					.onChange(async (value) => {
						this.plugin.settings.addTags = value;
						await this.plugin.saveSettings();
					})
			);

		// Custom tags setting
		new Setting(containerEl)
			.setName("Custom tags")
			.setDesc("Comma-separated list of tags to add to book notes")
			.addText((text) =>
				text
					.setPlaceholder("book/notes, reading")
					.setValue(this.plugin.settings.customTags)
					.onChange(async (value) => {
						this.plugin.settings.customTags = value;
						await this.plugin.saveSettings();
					})
			);

		// Include chapter info
		new Setting(containerEl)
			.setName("Include chapter information")
			.setDesc("Try to extract chapter information from annotation locations")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeChapterInfo)
					.onChange(async (value) => {
						this.plugin.settings.includeChapterInfo = value;
						await this.plugin.saveSettings();
					})
			);

		// Sort annotations
		new Setting(containerEl)
			.setName("Sort annotations by location")
			.setDesc("Sort annotations by their position in the book")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sortAnnotations)
					.onChange(async (value) => {
						this.plugin.settings.sortAnnotations = value;
						await this.plugin.saveSettings();
					})
			);

		// Include annotation dates
		new Setting(containerEl)
			.setName("Include annotation dates")
			.setDesc("Show when annotations were created")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeAnnotationDates)
					.onChange(async (value) => {
						this.plugin.settings.includeAnnotationDates = value;
						await this.plugin.saveSettings();
					})
			);

		// Include annotation styles
		new Setting(containerEl)
			.setName("Include annotation styles")
			.setDesc("Show highlight colors and underline indicators")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeAnnotationStyles)
					.onChange(async (value) => {
						this.plugin.settings.includeAnnotationStyles = value;
						await this.plugin.saveSettings();
					})
			);

		// Include reading progress
		new Setting(containerEl)
			.setName("Include reading progress")
			.setDesc("Show how much of each book has been read")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeReadingProgress)
					.onChange(async (value) => {
						this.plugin.settings.includeReadingProgress = value;
						await this.plugin.saveSettings();
					})
			);

		// Create author pages
		new Setting(containerEl)
			.setName("Create author pages")
			.setDesc("Automatically create author pages with dataview queries that list all books by that author")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createAuthorPages)
					.onChange(async (value) => {
						this.plugin.settings.createAuthorPages = value;
						await this.plugin.saveSettings();
					})
			);
	}
}