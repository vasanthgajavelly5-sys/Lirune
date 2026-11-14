declare module 'pst-parser' {
  export class PSTFile {
    constructor(buffer: ArrayBuffer);
    getMessageStore(): {
      displayName?: string;
      getRootFolder(): PSTFolder;
    };
  }

  export interface PSTFolder {
    displayName?: string;
    contentCount: number;
    hasSubfolders: boolean;
    getSubFolderEntries(): Array<{ nid: number }>;
    getSubFolder(nid: number): PSTFolder;
    getContents(start?: number, end?: number): Array<{ nid: number }>;
    getMessage(nid: number): {
      subject?: string;
      body?: string;
      bodyHTML?: string;
      hasAttachments?: boolean;
      getAllRecipients(): Array<Record<string, string>>;
      getAttachmentEntries(): Array<Record<string, string>>;
    };
  }
}
