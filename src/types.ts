export type DocType = 'document' | 'id_card' | 'passport_8_copy' | 'passport_4_copy' | 'photo_4x6';

export interface ScannedDocument {
  id: string;
  type: DocType;
  name: string;
  timestamp: string;
  originalUrl: string;
  processedUrl: string; // The ready-to-print image url (dataUrl)
  status: 'queued' | 'pending' | 'printed';
  notes?: string;
  createdAt?: number; // Sorting helper for real-time Firebase DB
  idFrontUrl?: string;
  idBackUrl?: string;
  settings?: {
    brightness: number;
    contrast: number;
    backgroundColor?: string;
    hasBorder?: boolean;
    cropRect?: { x: number; y: number; width: number; height: number };
    idFrontUrl?: string;
    idBackUrl?: string;
    idFrontCropX?: number;
    idFrontCropY?: number;
    idFrontScale?: number;
    idBackCropX?: number;
    idBackCropY?: number;
    idBackScale?: number;
    idFrontYOffset?: number;
    idBackYOffset?: number;
    bgRemovedImage?: string;
    useRemoveBg?: boolean;
  };
}
