import React, { useState } from 'react';
import { 
  Scan, FileText, Sparkles, Send, Check, 
  RefreshCw, Upload, User, Info, ArrowRight, HelpCircle, ArrowLeft, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSampleDoc, generateSamplePortrait } from '../lib/sampleGenerator';
import { ScannedDocument, DocType } from '../types';

interface CustomerScannerProps {
  onSendDocument: (doc: ScannedDocument) => Promise<{ success: boolean; error?: string }>;
  dbMode?: 'cloud' | 'local';
  isCloudQuotaExceeded?: boolean;
}

export default function CustomerScanner({ onSendDocument, dbMode = 'cloud', isCloudQuotaExceeded = false }: CustomerScannerProps) {
  // Use selectedService to show selection screen or specific form
  const [selectedService, setSelectedService] = useState<DocType | null>(null);

  // Form states for Document upload
  const [docImage, setDocImage] = useState<string | null>(null);
  const [docFileName, setDocFileName] = useState<string>('');
  const [docNotes, setDocNotes] = useState<string>('');
  const [isSendingDoc, setIsSendingDoc] = useState<boolean>(false);
  const [sendSuccessDoc, setSendSuccessDoc] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states for Passport/Portrait upload
  const [photoType, setPhotoType] = useState<'passport_8_copy' | 'passport_4_copy' | 'photo_4x6'>('passport_8_copy');
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [isSendingPhoto, setIsSendingPhoto] = useState<boolean>(false);
  const [sendSuccessPhoto, setSendSuccessPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Form states for ID Card upload
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const [idFrontFileName, setIdFrontFileName] = useState<string>('');
  const [idBackFileName, setIdBackFileName] = useState<string>('');
  const [isSendingID, setIsSendingID] = useState<boolean>(false);
  const [sendSuccessID, setSendSuccessID] = useState<boolean>(false);
  const [idError, setIdError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');

  // Reset to service list
  const resetToServices = () => {
    setSelectedService(null);
    setSendSuccessDoc(false);
    setSendSuccessPhoto(false);
    setDocError(null);
    setPhotoError(null);
  };

  // Helper to handle service selection
  const handleSelectService = (type: DocType) => {
    setSelectedService(type);
    if (type === 'document') {
      // PDF mode
    } else {
      setPhotoType(type as 'passport_8_copy' | 'passport_4_copy' | 'photo_4x6');
    }
  };

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
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
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
      if (!file.type.includes('pdf')) {
        alert("कृपया फक्त PDF फाईल निवडा (Please select PDF file only for A4)");
        return;
      }

      // Check file size (Now supporting up to 5MB via chunking)
      if (file.size > 5 * 1024 * 1024) {
        alert("फाईल खूप मोठी आहे (File too large). कृपया ५ MB पेक्षा कमी आकाराची PDF निवडा.");
        return;
      }

      setDocFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = reader.result as string;
        // PDFs should NOT be passed through compressImage as they are not images
        setDocImage(rawBase64);
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

  // Sample triggers
  const loadSampleDocFile = () => {
    // Generate a fake PDF data URL for sample
    setDocImage('data:application/pdf;base64,JVBERi0xLjcKOCAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDMgMCBSL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSA5IDAgUj4+Pj4vQ29udGVudHMgMTAgMCBSL01lZGlhQm94WzAgMCA1OTUuMjc1IDg0MS44ODldPj4KZW5kb2JqCjEwIDAgb2JqCjw8L0xlbmd0aCA2MD4+c3RyZWFtCkJUCi9GMSAxMiBUZgoyODAgODAwIFRkCihTYW1wbGUgUERGIERvY3VtZW50KSBUagpFVQplbmRzdHJlYW0KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzggMCBSXS9Db3VudCAxPj4KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDMgMCBSPj4KZW5kb2JqCjkgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCnRyYWlsZXIKPDwvUm9vdCAxIDAgUi9TaXplIDEwPj4KJSVFT0YK');
    setDocFileName('sample_document.pdf');
  };

  const loadSamplePortraitFile = () => {
    setPhotoImage(generateSamplePortrait());
    setPhotoFileName('sample_customer_portrait.jpg');
  };

  // Submission handler
  const handleSendDocClick = () => {
    if (!docImage) return;
    
    setIsSendingDoc(true);
    setDocError(null);

    const primaryImage = docImage!;

    const newDoc: ScannedDocument = {
      id: `DOC-${Date.now()}`,
      type: 'document',
      name: 'Customer PDF Document (A4)',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      originalUrl: primaryImage,
      processedUrl: primaryImage,
      status: 'queued',
      notes: docNotes || undefined,
    };

    setTimeout(async () => {
      try {
        console.log("[CustomerScanner] Sending document:", newDoc.id);
        const result = await onSendDocument(newDoc);
        setIsSendingDoc(false);
        if (result && !result.success) {
          console.error("[CustomerScanner] Send failed:", result.error);
          setDocError(result.error || "Could not save to database");
          
          if (dbMode === 'cloud') {
            setToastMessage("Cloud sync failed, saved to your phone locally. (क्लाउड सिंक विफल, फोन पर सुरक्षित)");
            setTimeout(() => setToastMessage(null), 5000);
          }
        } else {
          console.log("[CustomerScanner] Send success!");
          setSendSuccessDoc(true);
          setDocNotes('');
          setDocImage(null);
          setDocFileName('');
          setTimeout(() => setSendSuccessDoc(false), 5000);
        }
      } catch (err: any) {
        setIsSendingDoc(false);
        setDocError(err?.message || "Internal sending error occurred");
      }
    }, 1200);
  };

  const handleSendIDClick = () => {
    if (!idFrontImage || !idBackImage) return;
    
    setIsSendingID(true);
    setIdError(null);

    const newDoc: ScannedDocument = {
      id: `ID-${Date.now()}`,
      type: 'id_card',
      name: `ID Card: ${customerName || 'Anonymous'}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      originalUrl: idFrontImage, // Base image for reference
      processedUrl: idFrontImage, // Will be replaced by composite in portal
      status: 'queued',
      idFrontUrl: idFrontImage,
      idBackUrl: idBackImage,
    };

    setTimeout(async () => {
      try {
        const result = await onSendDocument(newDoc);
        setIsSendingID(false);
        if (result && !result.success) {
          setIdError(result.error || "Could not save to database");
        } else {
          setSendSuccessID(true);
          setIdFrontImage(null);
          setIdBackImage(null);
          setCustomerName('');
          setTimeout(() => setSendSuccessID(false), 5000);
        }
      } catch (err: any) {
        setIsSendingID(false);
        setIdError(err?.message || "Internal sending error occurred");
      }
    }, 1500);
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
      status: 'queued',
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
        console.log("[CustomerScanner] Sending photo:", newDoc.id);
        const result = await onSendDocument(newDoc);
        setIsSendingPhoto(false);
        if (result && !result.success) {
          console.error("[CustomerScanner] Photo send failed:", result.error);
          setPhotoError(result.error || "Could not save to database");
          
          if (dbMode === 'cloud') {
            setToastMessage("Cloud sync failed, saved to your phone locally. (क्लाउड सिंक विफल, फोन पर सुरक्षित)");
            setTimeout(() => setToastMessage(null), 5000);
          }
        } else {
          console.log("[CustomerScanner] Photo send success!");
          setSendSuccessPhoto(true);
          setPhotoNotes('');
          setPhotoImage(null);
          setPhotoFileName('');
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
              <h2 className="font-sans font-bold text-lg text-white leading-tight">ग्राहक अपलोड केंद्र (Customer Upload)</h2>
              <p className="text-[11px] text-blue-100 font-mono tracking-wider">दुकानाशी सुरक्षित स्कॅन कनेक्शन</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`${(dbMode === 'local' || isCloudQuotaExceeded) ? 'bg-amber-500' : 'bg-emerald-500'} text-white text-[9px] font-black px-3 py-1 rounded-full font-sans shadow-lg flex items-center gap-2 uppercase tracking-widest transition-all`} title={(dbMode === 'local' || isCloudQuotaExceeded) ? 'Local Mode: Jobs will not sync' : 'Cloud Sync: Connected to Store'}>
              <div className={`w-1.5 h-1.5 rounded-full bg-white ${dbMode === 'cloud' && !isCloudQuotaExceeded ? 'animate-pulse' : ''}`} />
              {isCloudQuotaExceeded ? 'Quota Exceeded' : dbMode === 'local' ? 'Offline' : 'Connected'}
            </span>
            <p className="text-[7px] font-black text-blue-100 uppercase tracking-widest opacity-60">Store Link Status</p>
          </div>
        </div>
      </div>

      {/* Conditionally render Service Selection or Specific Form */}
      {!selectedService ? (
        /* SERVICE MARKETPLACE GRID */
        <div className="p-6 space-y-6 animate-fade-in">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">सेवा निवडा (Select Service)</h3>
            <p className="text-[11px] text-slate-500">आज तुम्हाला काय प्रिंट किंवा स्कॅन करायचे आहे ते निवडा</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              { id: 'passport_8_copy', title: '८ पासपोर्ट फोटो', subtitle: '8x Passport Photos', sub: '४x६ शीटवर ८ प्रती', icon: <User className="w-6 h-6 text-emerald-600" />, color: 'bg-emerald-50' },
              { id: 'passport_4_copy', title: '४ पासपोर्ट फोटो', subtitle: '4x Passport Photos', sub: '४x६ शीटवर ४ प्रती', icon: <Sparkles className="w-6 h-6 text-amber-600" />, color: 'bg-amber-50' },
              { id: 'photo_4x6', title: '४x६ फोटो प्रिंट', subtitle: '4"x6" Portrait', sub: 'पूर्ण पोर्ट्रेट गुणवत्ता प्रिंट', icon: <Scan className="w-6 h-6 text-rose-600" />, color: 'bg-rose-50' },
              { id: 'id_card', title: 'आयडी कार्ड (F+B)', subtitle: 'ID Card (Front & Back)', sub: 'पुढचा आणि मागचा भाग अपलोड करा', icon: <User className="w-6 h-6 text-purple-600" />, color: 'bg-purple-50' },
              { id: 'document', title: 'PDF दस्तऐवज (A4)', subtitle: 'PDF Documents Only', sub: 'केवळ PDF फाईल प्रिंट करण्यासाठी', icon: <FileText className="w-6 h-6 text-blue-600" />, color: 'bg-blue-50' },
            ].map((service) => (
              <button
                key={service.id}
                onClick={() => handleSelectService(service.id as DocType)}
                className="flex items-center gap-5 p-5 rounded-2xl border border-slate-100 bg-white hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all text-left group cursor-pointer"
              >
                <div className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  {service.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{service.title}</h4>
                    <span className="text-[10px] text-slate-400 font-bold">{service.subtitle}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{service.sub}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>

          {(dbMode === 'local' || isCloudQuotaExceeded) && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-xs text-amber-900 space-y-2 text-left">
              <p className="font-black uppercase tracking-widest text-[10px] text-amber-700 flex items-center gap-2">
                ⚠️ कनेक्शन तांत्रिक अडचण (Connection Warning)
              </p>
              <p className="leading-relaxed opacity-80">
                {isCloudQuotaExceeded 
                  ? "क्लाउड कोटा संपला आहे. तुमचे अपलोड तुमच्या डिव्हाइसवर जतन केले जातील पण ते आपोआप दुकानात पोहोचणार नाहीत."
                  : "दुकान सध्या ऑफलाइन आहे. तुमचे अपलोड तुमच्या डिव्हाइसवर जतन केले जातील पण ते आपोआप दुकानात पोहोचणार नाहीत."}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* SPECIFIC SERVICE FORM VIEW */
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
          {/* Sub-header with back button */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <button 
              onClick={resetToServices}
              className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors font-bold text-xs group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              मागे (BACK)
            </button>
            <div className="text-right">
              <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-tighter">
                {selectedService === 'document' ? 'PDF दस्तऐवज (A4)' : 
                 selectedService === 'id_card' ? 'आयडी कार्ड (F+B)' :
                 selectedService === 'passport_8_copy' ? '८ पासपोर्ट फोटो' :
                 selectedService === 'passport_4_copy' ? '४ पासपोर्ट फोटो' : '४x६ फोटो प्रिंट'}
              </h3>
              <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest">निवडलेला मोड (Selected)</p>
            </div>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Form rendering logic based on selectedService */}
            {selectedService === 'document' ? (
              /* TAB A: PDF DOCUMENTS */
              <div className="space-y-5 animate-fade-in">
                {/* File Uploader */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 font-mono uppercase">
                      १. PDF फाईल अपलोड करा
                    </label>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={loadSampleDocFile} className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded font-black cursor-pointer">नमुना (SAMPLE)</button>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-500 transition-all bg-white relative overflow-hidden group shadow-sm">
                    <input type="file" accept="application/pdf" onChange={handleFileChangeDoc} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                    <div className="space-y-3">
                      {docImage ? (
                        <div className="space-y-2">
                          <div className="w-20 h-24 mx-auto bg-blue-50 flex items-center justify-center rounded-lg border border-slate-100 shadow-sm">
                            <FileText className="w-10 h-10 text-blue-600" />
                          </div>
                          <p className="text-xs font-black text-emerald-600 uppercase">PDF लोड झाली</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[200px] mx-auto font-mono">{docFileName}</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-blue-600">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 uppercase">PDF अपलोड करण्यासाठी क्लिक करा</p>
                            <p className="text-[10px] text-slate-400 mt-1">केवळ PDF फाईल निवडा</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 font-mono uppercase block text-left">
                    २. प्रिंटसाठी सूचना (Instructions)
                  </label>
                  <textarea
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    placeholder="उदा. २ प्रती, दोन्ही बाजूंनी प्रिंट..."
                    className="w-full text-xs p-4 rounded-2xl border border-slate-200 bg-white focus:border-blue-500 outline-none min-h-[80px] resize-none shadow-sm"
                  />
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={handleSendDocClick}
                  disabled={isSendingDoc || !docImage || (dbMode === 'cloud' && isCloudQuotaExceeded)}
                  className={`w-full py-5 px-6 rounded-2xl font-sans font-black text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 cursor-pointer transition-all ${
                    sendSuccessDoc
                      ? 'bg-emerald-600 text-white'
                      : docImage && !isCloudQuotaExceeded
                      ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                      : isCloudQuotaExceeded
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSendingDoc ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> अपलोड होत आहे (UPLOADING)...</>
                  ) : sendSuccessDoc ? (
                    <><Check className="w-5 h-5" /> दुकानदाराकडे पाठवले!</>
                  ) : isCloudQuotaExceeded ? (
                    <><AlertCircle className="w-4 h-4" /> क्लाउड कोटा संपला (QUOTA FULL)</>
                  ) : (
                    <><Send className="w-4 h-4" /> प्रिंटरला पाठवा (SEND)</>
                  )}
                </button>
              </div>
            ) : selectedService === 'id_card' ? (
              /* TAB C: ID CARD DUAL UPLOAD */
              <div className="space-y-5 animate-fade-in">
                <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex gap-3 items-start">
                  <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-purple-900 uppercase tracking-tight">आयडी कार्ड मोड (ID Card Mode)</h4>
                    <p className="text-[10px] text-purple-700 font-medium leading-tight mt-0.5">आधार, पॅन किंवा रेशन कार्डसाठी. पुढचा आणि मागचा भाग स्वतंत्रपणे अपलोड करा.</p>
                  </div>
                </div>

                {/* Dual Uploader */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-500 font-mono uppercase block text-center">१. पुढचा भाग (Front)</label>
                    <div className={`border-2 border-dashed ${idFrontImage ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 bg-white'} rounded-2xl p-4 text-center relative overflow-hidden group shadow-sm transition-all h-32 flex items-center justify-center`}>
                      <input type="file" accept="image/*" onChange={handleFileChangeIDFront} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      {idFrontImage ? (
                        <div className="space-y-2">
                          <img src={idFrontImage} className="w-full h-20 object-cover rounded-lg shadow-sm" alt="Front" />
                          <p className="text-[9px] font-black text-emerald-600 uppercase">LOADED</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                          <p className="text-[9px] font-black text-slate-400 uppercase">FRONT CLICK</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-500 font-mono uppercase block text-center">२. मागचा भाग (Back)</label>
                    <div className={`border-2 border-dashed ${idBackImage ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-200 bg-white'} rounded-2xl p-4 text-center relative overflow-hidden group shadow-sm transition-all h-32 flex items-center justify-center`}>
                      <input type="file" accept="image/*" onChange={handleFileChangeIDBack} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      {idBackImage ? (
                        <div className="space-y-2">
                          <img src={idBackImage} className="w-full h-20 object-cover rounded-lg shadow-sm" alt="Back" />
                          <p className="text-[9px] font-black text-emerald-600 uppercase">LOADED</p>
                        </div>
                      ) : (
                        <div className="py-2">
                          <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                          <p className="text-[9px] font-black text-slate-400 uppercase">BACK CLICK</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Name Input */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-black text-slate-500 font-mono uppercase block">
                    ३. आपले नाव (Your Name)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full text-xs p-4 rounded-2xl border border-slate-200 bg-white focus:border-purple-500 outline-none shadow-sm"
                  />
                </div>

                {idError && (
                  <p className="text-[10px] text-rose-500 font-bold bg-rose-50 p-3 rounded-xl border border-rose-100">{idError}</p>
                )}

                <button
                  type="button"
                  onClick={handleSendIDClick}
                  disabled={isSendingID || !idFrontImage || !idBackImage || !customerName || (dbMode === 'cloud' && isCloudQuotaExceeded)}
                  className={`w-full py-5 px-6 rounded-2xl font-sans font-black text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 cursor-pointer transition-all ${
                    sendSuccessID
                      ? 'bg-emerald-600 text-white'
                      : (idFrontImage && idBackImage && customerName) && !isCloudQuotaExceeded
                      ? 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                      : isCloudQuotaExceeded
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSendingID ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : sendSuccessID ? (
                    <><Check className="w-5 h-5" /> पाठवले (SENT)</>
                  ) : isCloudQuotaExceeded ? (
                    <><AlertCircle className="w-4 h-4" /> क्लाउड कोटा संपला (QUOTA FULL)</>
                  ) : (
                    <><Send className="w-5 h-5" /> दुकानात पाठवा (SEND TO STORE)</>
                  )}
                </button>
              </div>
            ) : (
              /* TAB B: PORTRAIT & PASSPORT UPLOAD */
              <div className="space-y-5 animate-fade-in">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-500 font-mono uppercase">
                      १. पोर्ट्रेट फोटो अपलोड करा
                    </label>
                    <button type="button" onClick={loadSamplePortraitFile} className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded font-black cursor-pointer">नमुना (SAMPLE)</button>
                  </div>

                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-blue-500 transition-all bg-white relative overflow-hidden group shadow-sm">
                    <input type="file" accept="image/*" onChange={handleFileChangePhoto} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                    <div className="space-y-3">
                      {photoImage ? (
                        <div className="space-y-3">
                          <div className="w-24 h-24 mx-auto overflow-hidden rounded-full border-2 border-blue-100 shadow-inner">
                            <img src={photoImage} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-emerald-600 uppercase">सेल्फी काढला (Captured)</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px] mx-auto font-mono mt-1">{photoFileName}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600">
                            <User className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 uppercase">सेल्फी / पासपोर्ट फोटो अपलोड करा</p>
                            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">कोणत्याही एका रंगाच्या भिंतीसमोर फोटो काढा.<br/>सिस्टीम आपोआप बॅकग्राउंड बदलेल.</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 font-mono uppercase block">
                    २. बॅकग्राउंड कलर निवडा (Background Choice)
                  </label>
                  <textarea
                    value={photoNotes}
                    onChange={(e) => setPhotoNotes(e.target.value)}
                    placeholder="उदा. निळा बॅकग्राउंड हवा आहे किंवा पांढरा ठेवा..."
                    className="w-full text-xs p-4 rounded-2xl border border-slate-200 bg-white focus:border-blue-500 outline-none min-h-[80px] resize-none shadow-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendPhotoClick}
                  disabled={isSendingPhoto || !photoImage || (dbMode === 'cloud' && isCloudQuotaExceeded)}
                  className={`w-full py-5 px-6 rounded-2xl font-sans font-black text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 cursor-pointer transition-all ${
                    sendSuccessPhoto
                      ? 'bg-emerald-600 text-white'
                      : photoImage && !isCloudQuotaExceeded
                      ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                      : isCloudQuotaExceeded
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSendingPhoto ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> पाठवत आहे (SENDING)...</>
                  ) : sendSuccessPhoto ? (
                    <><Check className="w-5 h-5" /> दुकानात पाठवले!</>
                  ) : isCloudQuotaExceeded ? (
                    <><AlertCircle className="w-4 h-4" /> क्लाउड कोटा संपला (QUOTA FULL)</>
                  ) : (
                    <><Send className="w-4 h-4" /> प्रोसेस करण्यासाठी पाठवा</>
                  )}
                </button>
              </div>
            )}
            
            {/* Success Feedback Overlay */}
            {(sendSuccessDoc || sendSuccessPhoto) && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 animate-bounce-in">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-900 uppercase tracking-tight">यशस्वीरित्या पाठवले! (Sent)</p>
                    <p className="text-[11px] text-emerald-700 mt-1 leading-relaxed">तुमची विनंती आता दुकानाच्या स्क्रीनवर आहे. कृपया प्रिंटसाठी ऑपरेटरशी बोला.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Notice card footer */}
      <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2.5">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-normal font-sans">
          <strong>मॅन्युअल एडिटिंगची गरज नाही!</strong> फक्त तुमची फाईल/सेल्फी अपलोड करा आणि पाठवा. ऑपरेटर तुमची फोटो आपोआप क्रॉप करेल आणि प्रिंटसाठी बॅकग्राउंड कलर बदलेल.
        </p>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 z-[100] pointer-events-none"
          >
            <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800">
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">{toastMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
