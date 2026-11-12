/**
 * Lirune Reader Mobile — Standardized Application Errors
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(format: string, reason?: string) {
    const userMsg = reason || `The file format ".${format}" is not supported by Lirune Reader. Supported formats are EPUB, PDF, TXT, HTML, FB2, and CBZ.`;
    super(`Unsupported format: ${format}`, 'UNSUPPORTED_FORMAT', userMsg);
    this.name = 'UnsupportedFormatError';
  }
}

export class CorruptBookError extends AppError {
  constructor(title: string, details?: string) {
    super(
      `Corrupt book file: ${title} (${details || 'unable to parse'})`,
      'CORRUPT_BOOK',
      `"${title}" appears to be damaged or could not be read properly.`
    );
    this.name = 'CorruptBookError';
  }
}

export class ImportFailureError extends AppError {
  constructor(fileName: string, reason: string) {
    super(
      `Import failed for ${fileName}: ${reason}`,
      'IMPORT_FAILED',
      `Could not import "${fileName}". ${reason}`
    );
    this.name = 'ImportFailureError';
  }
}

export class StorageError extends AppError {
  constructor(action: string, details?: string) {
    super(
      `Storage error during ${action}: ${details || ''}`,
      'STORAGE_ERROR',
      `A storage error occurred while saving your reading data.`
    );
    this.name = 'StorageError';
  }
}

export class ReaderError extends AppError {
  constructor(message: string, userMessage?: string) {
    super(
      message,
      'READER_ERROR',
      userMessage || 'An error occurred while displaying this book. Please try reopening it.'
    );
    this.name = 'ReaderError';
  }
}

export class SourceUnavailableError extends AppError {
  constructor(uriOrPath: string, details?: string) {
    super(
      `Source unavailable for: ${uriOrPath} (${details || 'file missing or permission revoked'})`,
      'SOURCE_UNAVAILABLE',
      'The source file for this book is unavailable or permissions were revoked. You can re-link the file or return to the library.'
    );
    this.name = 'SourceUnavailableError';
  }
}
