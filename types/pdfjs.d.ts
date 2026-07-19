// Minimal type declarations for the pdf.js legacy build entry points we import.
// pdfjs-dist ships full types for its main entry but not for these deep file paths.
declare module 'pdfjs-dist/legacy/build/pdf.js' {
	export const GlobalWorkerOptions: { workerSrc: string; workerPort: unknown };
	export const version: string;
	export function getDocument(src: unknown): { promise: Promise<any> };
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.js' {
	export const WorkerMessageHandler: unknown;
}
