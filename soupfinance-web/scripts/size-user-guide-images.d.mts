// Types for size-user-guide-images.mjs, so the unit tests can import it.
export declare const GUIDE_DIR: string;
export declare function jpegSize(buffer: Uint8Array): { width: number; height: number };
export declare function sizeGuideImages(html: string, guideDir?: string): string;
