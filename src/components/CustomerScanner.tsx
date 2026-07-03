import React, { useState } from 'react';
import { 
  Scan, FileText, CreditCard, Sparkles, Send, Check, 
  RefreshCw, Upload, User, Info, ArrowRight, HelpCircle
} from 'lucide-react';
import { generateSampleDoc, generateSampleID, generateSamplePortrait, generateSampleIDBack } from '../lib/sampleGenerator';
import { ScannedDocument, DocType } from '../types';

interface CustomerScannerProps {
  onSendDocument: (doc: ScannedDocument) => Promise<{ success: boolean; error?: string }>;
  dbMode?: 'cloud' | 'local';
}

export default function CustomerScanner({ onSendDocument, dbMode = 'cloud' }: CustomerScannerProps) {
  // Tabs: 'document' (Docs & IDs) vs 'portrait' (Passports & Photos)
  const [activeTab, setActiveTab] = useState<'document' | 'portrait'>('document');

  // Form states for Document/ID upload
  const [docType, setDocType] = useState<'document' | 'id_card'>('document');
  const [docImage, setDocImage] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState<string>('');
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const [idFrontFileName, setIdFrontFileName] = useState<string>('');
  const [idBackFileName, setIdBackFileName] = useState<string>('');
  const [docNotes, setDocNotes] = useState<string>('');
  const [isSendingDoc, setIsSendingDoc] = useState<boolean>(false);
  const [sendSuccessDoc, setSendSuccessDoc] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Form states for Passport/Portrait upload
  const [photoType, setPhotoType] = useState<'passport_8_copy' | 'passport_4_copy' | 'photo_4x6'>('passport_8_copy');
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [isSendingPhoto, setIsSendingPhoto] = useState<boolean>(false);
  const [sendSuccessPhoto, setSendSuccessPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Client-side image compression helper to make uploads lightning fast and fit under body size limits
  const compressImage = (base64Str: string, callback: (compressed: string) => void) => {
    // If it's a PDF, bypass compression
    if (base64Str.startsWith('data:application/pdf')) {
      callback(base64Str);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600; // Optimal resolution for beautiful A4 printing and micro passport photos
      let width = img.width;
      let height = img.height;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Compress to JPEG with 0.85 quality for incredible detail retention and ultra small size (~200kb)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        callback(compressedDataUrl);
      } else {
        callback(base64Str);
      }
    };
    img.onerror = () => {
      callback(base64Str);
    };
    img.src = base64Str;
  };

  // File triggers
  const handleFileChangeDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        compressImage(rawBase64, (compressed) => {
          setDocImage(compressed);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChangeIDFront = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdFrontFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        compressImage(rawBase64, (compressed) => {
          setIdFrontImage(compressed);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChangeIDBack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdBackFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        compressImage(rawBase64, (compressed) => {
          setIdBackImage(compressed);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChangePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        compressImage(rawBase64, (compressed) => {
          setPhotoImage(compressed);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Sample triggers
  const loadSampleDocFile = () => {
    setDocImage(generateSampleDoc());
    setDocFileName('sample_written_invoice.png');
  };

  const loadSampleIDFile = () => {
    const front = generateSampleID();
    const back = generateSampleIDBack();
    setIdFrontImage(front);
    setIdFrontFileName('sample_national_id_front.png');
    setIdBackImage(back);
    setIdBackFileName('sample_national_id_back.png');
    
    // Also populate docImage just in case
    setDocImage(front);
    setDocFileName('sample_national_id_front.png');
  };

  const loadSamplePortraitFile = () => {
    setPhotoImage(generateSamplePortrait());
    setPhotoFileName('sample_customer_portrait.jpg');
  };

  // Submission handler
  const handleSendDocClick = () => {
    if (docType === 'document' && !docImage) return;
    if (docType === 'id_card' && !idFrontImage) return;
    
    setIsSendingDoc(true);
    setDocError(null);

    const primaryImage = docType === 'id_card' ? idFrontImage! : docImage!;

    const newDoc: ScannedDocument = {
      id: `DOC-${Date.now()}`,
      type: docType,
      name: docType === 'id_card' ? 'National ID Card (Front & Back)' : 'Customer Document Scan',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      originalUrl: primaryImage,
      processedUrl: primaryImage, // Merchant's system will process this in high contrast
      status: 'pending',
      notes: docNotes || undefined,
      idFrontUrl: docType === 'id_card' ? idFrontImage || undefined : undefined,
      idBackUrl: docType === 'id_card' ? idBackImage || undefined : undefined,
      settings: docType === 'id_card' ? {
        brightness: 15,
        contrast: 45,
        idFrontUrl: idFrontImage || undefined,
        idBackUrl: idBackImage || undefined,
      } : undefined,
    };

    setTimeout(async () => {
      try {
        const result = await onSendDocument(newDoc);
        setIsSendingDoc(false);
        if (result && !result.success) {
          setDocError(result.error || "Could not save to database");
        } else {
          setSendSuccessDoc(true);
          setDocNotes('');
          // Clear ID fields after success
          if (docType === 'id_card') {
            setIdFrontImage(null);
            setIdBackImage(null);
            setIdFrontFileName('');
            setIdBackFileName('');
          } else {
            setDocImage(null);
            setDocFileName('');
          }
          setTimeout(() => setSendSuccessDoc(false), 5000);
        }
      } catch (err: any) {
        setIsSendingDoc(false);
        setDocError(err?.message || "Internal sending error occurred");
      }
    }, 1200);
  };

  const handleSendPhotoClick = () => {
    if (!photoImage) return;
    setIsSendingPhoto(true);
    setPhotoError(null);

    const newDoc: ScannedDocument = {
      id: `PASS-${Date.now()}`,
      type: photoType,
      name: photoType === 'passport_8_copy' ? '8-Grid Passport Photos' : photoType === 'passport_4_copy' ? '4-Grid Passport Photos' : 'Full Portrait Print (4"x6")',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      originalUrl: photoImage,
      processedUrl: photoImage, // Merchant's system will auto-crop & recolor
      status: 'pending',
      notes: photoNotes || undefined,
      settings: {
        brightness: 10,
        contrast: 15,
        backgroundColor: '#3b82f6', // Default blue
        hasBorder: true,
        cropRect: { x: 0, y: -15, width: 100, height: 100 } // center auto crop
      }
    };

    setTimeout(async () => {
      try {
        const result = await onSendDocument(newDoc);
        setIsSendingPhoto(false);
        if (result && !result.success) {
          setPhotoError(result.error || "Could not save to database");
        } else {
          setSendSuccessPhoto(true);
          setPhotoNotes('');
          setTimeout(() => setSendSuccessPhoto(false), 5000);
        }
      } catch (err: any) {
        setIsSendingPhoto(false);
        setPhotoError(err?.message || "Internal sending error occurred");
      }
    }, 1200);
  };

  return (
    <div id="customer-portal" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md flex flex-col w-full">
      
      {/* Portal Header - Customer friendly style */}
      <div className="bg-blue-600 border-b border-blue-700 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/10 p-2 rounded-xl text-white">
              <Scan className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-sans font-bold text-lg text-white leading-tight">Customer Upload Station</h2>
              <p className="text-[11px] text-blue-100 font-mono tracking-wider">SECURED SCAN TO SHOP CONNECTION</p>
            </div>
          </div>
          <span className={`${dbMode === 'local' ? 'bg-amber-500' : 'bg-emerald-500'} text-white text-[10px] font-bold px-2.5 py-1 rounded-full font-mono shadow-sm`} title={dbMode === 'local' ? 'Local Storage Failsafe Mode active due to Firebase Quota Exhaustion' : 'Online Sync Mode Active'}>
            {dbMode === 'local' ? 'LOCAL FAILSAFE' : 'ONLINE'}
          </span>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="grid grid-cols-2 border-b border-slate-100">
        <button
          onClick={() => setActiveTab('document')}
          className={`py-4 px-3 text-xs font-bold font-sans transition-all flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'document'
              ? 'border-blue-600 text-blue-600 bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          📄 DOCUMENTS & ID CARDS
        </button>
        <button
          onClick={() => setActiveTab('portrait')}
          className={`py-4 px-3 text-xs font-bold font-sans transition-all flex items-center justify-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'portrait'
              ? 'border-blue-600 text-blue-600 bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <User className="w-4 h-4" />
          👤 PASSPORTS & PORTRAITS
        </button>
      </div>

      {/* Form Content */}
      <div className="p-6 space-y-6">

        {dbMode === 'local' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1 text-left animate-pulse">
            <p className="font-bold uppercase tracking-wider text-[10px] text-amber-700 flex items-center gap-1.5">
              ⚠️ LOCAL FAILSAFE ACTIVE (ऑफ़लाइन / लोकल मोड सक्रिय है)
            </p>
            <p className="leading-relaxed font-sans text-[11.5px]">
              The shopkeeper's database is not connected. Your uploaded documents will only be saved in your phone's temporary cache and <strong>will NOT reach the shopkeeper's terminal</strong>.
            </p>
            <p className="text-[10px] text-amber-800">
              Please ask the shopkeeper to configure their Supabase credentials on their computer first, or scan the correct dynamic QR code.
            </p>
          </div>
        )}
        
        {activeTab === 'document' ? (
          /* TAB A: DOCUMENTS & ID CARDS */
          <div className="space-y-5 animate-fade-in">
            
            {/* Category Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 font-mono uppercase block">
                1. Select Document Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDocType('document')}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    docType === 'document'
                      ? 'border-blue-600 bg-blue-50/40 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span className="text-[11px] font-bold">Standard Document (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDocType('id_card')}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    docType === 'id_card'
                      ? 'border-blue-600 bg-blue-50/40 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span className="text-[11px] font-bold">National ID Card (A4)</span>
                </button>
              </div>
            </div>

            {/* File Uploader */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 font-mono uppercase">
                  {docType === 'id_card' ? '2. Upload Front & Back Sides (सामने और पीछे का भाग)' : '2. Upload File / Take Photo'}
                </label>
                {/* Developer helpers for testing */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={loadSampleDocFile}
                    className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 px-2 py-0.5 rounded font-bold cursor-pointer"
                  >
                    SAMPLE DOC
                  </button>
                  <button
                    type="button"
                    onClick={loadSampleIDFile}
                    className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 px-2 py-0.5 rounded font-bold cursor-pointer"
                  >
                    SAMPLE ID
                  </button>
                </div>
              </div>

              {docType === 'id_card' ? (
                /* ID CARD FRONT & BACK DUAL SLOT */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* FRONT SIDE */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 block text-left">Front Side (सामने का भाग) *</span>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-500 transition-all bg-slate-50/30 relative overflow-hidden group min-h-[140px] flex flex-col justify-center items-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChangeIDFront}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      />
                      <div className="space-y-1.5">
                        {idFrontImage ? (
                          <div className="space-y-1">
                            <div className="w-16 h-10 mx-auto overflow-hidden rounded border border-slate-200 shadow-sm bg-white flex items-center justify-center">
                              <img src={idFrontImage} className="max-w-full max-h-full object-contain" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-600 flex items-center justify-center gap-0.5">
                              <Check className="w-3.5 h-3.5" /> Front Loaded
                            </p>
                            <p className="text-[9px] text-slate-500 truncate max-w-[150px] font-mono mx-auto">
                              {idFrontFileName || "front.png"}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="mx-auto w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                              <Upload className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-700">Click to Upload Front</p>
                            <p className="text-[9px] text-slate-400">ID Front Side Image</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BACK SIDE */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-600 block text-left">Back Side (पीछे का भाग) *</span>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-500 transition-all bg-slate-50/30 relative overflow-hidden group min-h-[140px] flex flex-col justify-center items-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChangeIDBack}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      />
                      <div className="space-y-1.5">
                        {idBackImage ? (
                          <div className="space-y-1">
                            <div className="w-16 h-10 mx-auto overflow-hidden rounded border border-slate-200 shadow-sm bg-white flex items-center justify-center">
                              <img src={idBackImage} className="max-w-full max-h-full object-contain" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-600 flex items-center justify-center gap-0.5">
                              <Check className="w-3.5 h-3.5" /> Back Loaded
                            </p>
                            <p className="text-[9px] text-slate-500 truncate max-w-[150px] font-mono mx-auto">
                              {idBackFileName || "back.png"}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="mx-auto w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                              <Upload className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-700">Click to Upload Back</p>
                            <p className="text-[9px] text-slate-400">ID Back Side Image</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* STANDARD SINGLE FILE UPLOADER */
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-500 transition-all bg-slate-50/30 relative overflow-hidden group">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChangeDoc}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />
                  
                  <div className="space-y-2">
                    <div className="mx-auto w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    {docImage ? (
                      <div>
                        <p className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" /> File Loaded Successfully
                        </p>
                        <p className="text-[11px] text-slate-500 truncate max-w-xs mx-auto mt-0.5 font-mono">
                          {docFileName || "scanned_image.jpg"}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-slate-700">Click to upload file or capture image</p>
                        <p className="text-[10px] text-slate-400 mt-1">Supports PDF, JPG, PNG from phone, tablet, or webcam</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 font-mono uppercase block text-left">
                3. Print Instructions (Optional)
              </label>
              <textarea
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                placeholder="Example: Print in color, need 3 copies, or print back-to-back..."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:border-blue-500 focus:bg-white outline-none min-h-[60px] resize-none"
              />
            </div>

            {/* Send to shop action button */}
            <button
              type="button"
              onClick={handleSendDocClick}
              disabled={isSendingDoc || (docType === 'id_card' ? (!idFrontImage || !idBackImage) : !docImage)}
              className={`w-full py-4 px-6 rounded-xl font-sans font-bold text-sm tracking-wide shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                sendSuccessDoc
                  ? 'bg-emerald-600 text-white'
                  : (docType === 'id_card' ? (idFrontImage && idBackImage) : docImage)
                  ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              {isSendingDoc ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sending Document securely...
                </>
              ) : sendSuccessDoc ? (
                <>
                  <Check className="w-5 h-5 text-white animate-bounce" />
                  SUCCESSFULLY SENT TO MERCHANT COMPUTER!
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  SEND TO SHOPKEEPER / PORTAL
                </>
              )}
            </button>

            {sendSuccessDoc && (
              <p className="text-[10px] text-emerald-600 font-sans text-center mt-1 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                ✔️ Your document has arrived on the Shop's screen! Please inform the counter operator.
              </p>
            )}

            {docError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs font-sans mt-2 space-y-1.5 animate-fade-in text-left">
                <p className="font-bold uppercase tracking-wider text-[10px] text-red-600">Database Connection Error (डेटाबेस एरर):</p>
                <p className="leading-relaxed font-mono text-[11px] bg-white p-2 rounded border border-red-100 overflow-x-auto">{docError}</p>
                <p className="text-[10px] text-red-700">
                  <strong>Failsafe Active:</strong> We saved your document inside your local browser cache. Please ask the shopkeeper to configure their Supabase backend variables or run the database SQL script correctly.
                </p>
              </div>
            )}

          </div>
        ) : (
          /* TAB B: PORTRAIT & PASSPORT UPLOAD */
          <div className="space-y-5 animate-fade-in">
            
            {/* Category Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 font-mono uppercase block">
                1. Select Layout Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPhotoType('passport_8_copy')}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-between text-center gap-1 transition-all cursor-pointer ${
                    photoType === 'passport_8_copy'
                      ? 'border-blue-600 bg-blue-50/40 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="text-[10px] font-bold leading-tight">8-Copy Passport (4"x6")</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoType('passport_4_copy')}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-between text-center gap-1 transition-all cursor-pointer ${
                    photoType === 'passport_4_copy'
                      ? 'border-blue-600 bg-blue-50/40 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-bold leading-tight">4-Copy Passport (4"x6")</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoType('photo_4x6')}
                  className={`p-2.5 rounded-xl border-2 flex flex-col items-center justify-between text-center gap-1 transition-all cursor-pointer ${
                    photoType === 'photo_4x6'
                      ? 'border-blue-600 bg-blue-50/40 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-pink-600" />
                  <span className="text-[10px] font-bold leading-tight">Single 4"x6" Portrait</span>
                </button>
              </div>
            </div>

            {/* File Uploader */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 font-mono uppercase">
                  2. Upload Selfie / Portrait
                </label>
                <button
                  type="button"
                  onClick={loadSamplePortraitFile}
                  className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 px-2 py-0.5 rounded font-bold cursor-pointer"
                >
                  LOAD SAMPLE SELFIE
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-blue-500 transition-all bg-slate-50/30 relative overflow-hidden group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChangePhoto}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                />
                
                <div className="space-y-2">
                  <div className="mx-auto w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <Upload className="w-5 h-5" />
                  </div>
                  {photoImage ? (
                    <div>
                      <p className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1">
                        <Check className="w-4 h-4" /> Portrait Selfie Loaded
                      </p>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs mx-auto mt-0.5 font-mono">
                        {photoFileName || "portrait_selfie.jpg"}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-700">Click to upload raw passport selfie</p>
                      <p className="text-[10px] text-slate-400 mt-1">Take a clean portrait in front of any wall</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 font-mono uppercase block">
                3. Portrait Instructions (Optional)
              </label>
              <textarea
                value={photoNotes}
                onChange={(e) => setPhotoNotes(e.target.value)}
                placeholder="Example: Need light blue background or need clean white background..."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:border-blue-500 focus:bg-white outline-none min-h-[60px] resize-none"
              />
            </div>

            {/* Send to shop action button */}
            <button
              type="button"
              onClick={handleSendPhotoClick}
              disabled={isSendingPhoto || !photoImage}
              className={`w-full py-4 px-6 rounded-xl font-sans font-bold text-sm tracking-wide shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all ${
                sendSuccessPhoto
                  ? 'bg-emerald-600 text-white'
                  : photoImage
                  ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              {isSendingPhoto ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sending Portrait to shop...
                </>
              ) : sendSuccessPhoto ? (
                <>
                  <Check className="w-5 h-5 text-white animate-bounce" />
                  PORTRAIT SENT TO MERCHANT WORKSTATION!
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  SEND TO SHOP / PORTAL
                </>
              )}
            </button>

            {sendSuccessPhoto && (
              <p className="text-[10px] text-emerald-600 font-sans text-center mt-1 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                ✔️ Your portrait selfie is successfully uploaded. The shop operator will automatically crop and replace your background!
              </p>
            )}

            {photoError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs font-sans mt-2 space-y-1.5 animate-fade-in text-left">
                <p className="font-bold uppercase tracking-wider text-[10px] text-red-600">Database Connection Error (डेटाबेस एरर):</p>
                <p className="leading-relaxed font-mono text-[11px] bg-white p-2 rounded border border-red-100 overflow-x-auto">{photoError}</p>
                <p className="text-[10px] text-red-700">
                  <strong>Failsafe Active:</strong> We saved your portrait inside your local browser cache. Please ask the shopkeeper to configure their Supabase backend variables or run the database SQL script correctly.
                </p>
              </div>
            )}

          </div>
        )}
        
      </div>

      {/* Info Notice card footer */}
      <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2.5">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-normal font-sans">
          <strong>No manual editing required!</strong> Just upload your file/selfie and send. The operator terminal automatically auto-crops your passport photo and edits the background color for printing.
        </p>
      </div>

    </div>
  );
}
