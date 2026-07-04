import React, { useState } from 'react';
import { 
  Scan, FileText, CreditCard, Sparkles, Send, Check, 
  RefreshCw, Upload, User, Info, ArrowRight, HelpCircle, ArrowLeft
} from 'lucide-react';
import { generateSampleDoc, generateSampleID, generateSamplePortrait, generateSampleIDBack } from '../lib/sampleGenerator';
import { ScannedDocument, DocType } from '../types';

interface CustomerScannerProps {
  onSendDocument: (doc: ScannedDocument) => Promise<{ success: boolean; error?: string }>;
  dbMode?: 'cloud' | 'local';
}

export default function CustomerScanner({ onSendDocument, dbMode = 'cloud' }: CustomerScannerProps) {
  // Use selectedService to show selection screen or specific form
  const [selectedService, setSelectedService] = useState<DocType | null>(null);

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
    if (type === 'document' || type === 'id_card') {
      setDocType(type as 'document' | 'id_card');
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
              <h2 className="font-sans font-bold text-lg text-white leading-tight">ग्राहक अपलोड केंद्र (Customer Upload)</h2>
              <p className="text-[11px] text-blue-100 font-mono tracking-wider">दुकानाशी सुरक्षित स्कॅन कनेक्शन</p>
            </div>
          </div>
          <span className={`${dbMode === 'local' ? 'bg-amber-500' : 'bg-emerald-500'} text-white text-[10px] font-bold px-2.5 py-1 rounded-full font-mono shadow-sm`} title={dbMode === 'local' ? 'Local Storage Failsafe Mode active due to Firebase Quota Exhaustion' : 'Online Sync Mode Active'}>
            {dbMode === 'local' ? 'LOCAL FAILSAFE' : 'ONLINE'}
          </span>
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
              { id: 'document', title: 'साधारण दस्तऐवज', subtitle: 'Standard Document', sub: 'A4 आकार, काळा-पांढरा किंवा रंगीत', icon: <FileText className="w-6 h-6 text-blue-600" />, color: 'bg-blue-50' },
              { id: 'id_card', title: 'ओळखपत्र (ID Card)', subtitle: 'Aadhar/PAN Card', sub: 'एकाच A4 वर पुढची आणि मागची बाजू', icon: <CreditCard className="w-6 h-6 text-indigo-600" />, color: 'bg-indigo-50' },
              { id: 'passport_8_copy', title: '८ पासपोर्ट फोटो', subtitle: '8x Passport Photos', sub: '४x६ शीटवर ८ प्रती', icon: <User className="w-6 h-6 text-emerald-600" />, color: 'bg-emerald-50' },
              { id: 'passport_4_copy', title: '४ पासपोर्ट फोटो', subtitle: '4x Passport Photos', sub: '४x६ शीटवर ४ प्रती', icon: <Sparkles className="w-6 h-6 text-amber-600" />, color: 'bg-amber-50' },
              { id: 'photo_4x6', title: '४x६ फोटो प्रिंट', subtitle: '4"x6" Portrait', sub: 'पूर्ण पोर्ट्रेट गुणवत्ता प्रिंट', icon: <Scan className="w-6 h-6 text-rose-600" />, color: 'bg-rose-50' },
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

          {dbMode === 'local' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-xs text-amber-900 space-y-2 text-left">
              <p className="font-black uppercase tracking-widest text-[10px] text-amber-700 flex items-center gap-2">
                ⚠️ कनेक्शन तांत्रिक अडचण (Connection Warning)
              </p>
              <p className="leading-relaxed opacity-80">
                दुकान सध्या ऑफलाइन आहे. तुमचे अपलोड तुमच्या डिव्हाइसवर जतन केले जातील पण ते आपोआप दुकानात पोहोचणार नाहीत.
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
                {selectedService === 'document' ? 'साधारण दस्तऐवज' : 
                 selectedService === 'id_card' ? 'ओळखपत्र (ID Card)' : 
                 selectedService === 'passport_8_copy' ? '८ पासपोर्ट फोटो' :
                 selectedService === 'passport_4_copy' ? '४ पासपोर्ट फोटो' : '४x६ फोटो प्रिंट'}
              </h3>
              <p className="text-[9px] text-blue-600 font-bold uppercase tracking-widest">निवडलेला मोड (Selected)</p>
            </div>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Form rendering logic based on selectedService */}
            {selectedService === 'document' || selectedService === 'id_card' ? (
              /* TAB A: DOCUMENTS & ID CARDS */
              <div className="space-y-5 animate-fade-in">
                {/* File Uploader */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 font-mono uppercase">
                      १. {selectedService === 'id_card' ? 'पुढची आणि मागची बाजू अपलोड करा' : 'फाईल अपलोड करा / फोटो काढा'}
                    </label>
                    <div className="flex gap-1.5">
                      {selectedService === 'document' ? (
                        <button type="button" onClick={loadSampleDocFile} className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded font-black cursor-pointer">नमुना (SAMPLE)</button>
                      ) : (
                        <button type="button" onClick={loadSampleIDFile} className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded font-black cursor-pointer">नमुना (SAMPLE)</button>
                      )}
                    </div>
                  </div>

                  {selectedService === 'id_card' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* FRONT SIDE */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase block">पुढची बाजू (Front)</span>
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-blue-500 transition-all bg-white relative overflow-hidden group min-h-[140px] flex flex-col justify-center items-center shadow-sm">
                          <input type="file" accept="image/*" onChange={handleFileChangeIDFront} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                          <div className="space-y-2">
                            {idFrontImage ? (
                              <div className="space-y-2">
                                <div className="w-20 h-12 mx-auto overflow-hidden rounded-lg border border-slate-100 shadow-sm bg-white">
                                  <img src={idFrontImage} className="w-full h-full object-cover" />
                                </div>
                                <p className="text-[10px] font-black text-emerald-600 uppercase">पुढची बाजू तयार</p>
                              </div>
                            ) : (
                              <>
                                <Upload className="w-6 h-6 mx-auto text-slate-300" />
                                <p className="text-[10px] font-black text-slate-700 uppercase">पुढची बाजू अपलोड करा</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* BACK SIDE */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black text-slate-400 uppercase block">मागची बाजू (Back)</span>
                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-blue-500 transition-all bg-white relative overflow-hidden group min-h-[140px] flex flex-col justify-center items-center shadow-sm">
                          <input type="file" accept="image/*" onChange={handleFileChangeIDBack} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                          <div className="space-y-2">
                            {idBackImage ? (
                              <div className="space-y-2">
                                <div className="w-20 h-12 mx-auto overflow-hidden rounded-lg border border-slate-100 shadow-sm bg-white">
                                  <img src={idBackImage} className="w-full h-full object-cover" />
                                </div>
                                <p className="text-[10px] font-black text-emerald-600 uppercase">मागची बाजू तयार</p>
                              </div>
                            ) : (
                              <>
                                <Upload className="w-6 h-6 mx-auto text-slate-300" />
                                <p className="text-[10px] font-black text-slate-700 uppercase">मागची बाजू अपलोड करा</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-500 transition-all bg-white relative overflow-hidden group shadow-sm">
                      <input type="file" accept="image/*,application/pdf" onChange={handleFileChangeDoc} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                      <div className="space-y-3">
                        {docImage ? (
                          <div className="space-y-2">
                            <div className="w-20 h-24 mx-auto overflow-hidden rounded-lg border border-slate-100 shadow-sm">
                              <img src={docImage} className="w-full h-full object-cover" />
                            </div>
                            <p className="text-xs font-black text-emerald-600 uppercase">फाईल लोड झाली</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px] mx-auto font-mono">{docFileName}</p>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-blue-600">
                              <Upload className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 uppercase">दस्तऐवज अपलोड करण्यासाठी क्लिक करा</p>
                              <p className="text-[10px] text-slate-400 mt-1">PDF, JPG, PNG किंवा कॅमेऱ्याद्वारे फोटो काढा</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 font-mono uppercase block text-left">
                    २. प्रिंटसाठी सूचना (Instructions)
                  </label>
                  <textarea
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    placeholder="उदा. २ प्रती, काळा-पांढरा, किंवा दोन्ही बाजूंनी प्रिंट..."
                    className="w-full text-xs p-4 rounded-2xl border border-slate-200 bg-white focus:border-blue-500 outline-none min-h-[80px] resize-none shadow-sm"
                  />
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={handleSendDocClick}
                  disabled={isSendingDoc || (selectedService === 'id_card' ? (!idFrontImage || !idBackImage) : !docImage)}
                  className={`w-full py-5 px-6 rounded-2xl font-sans font-black text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 cursor-pointer transition-all ${
                    sendSuccessDoc
                      ? 'bg-emerald-600 text-white'
                      : (selectedService === 'id_card' ? (idFrontImage && idBackImage) : docImage)
                      ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSendingDoc ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> अपलोड होत आहे (UPLOADING)...</>
                  ) : sendSuccessDoc ? (
                    <><Check className="w-5 h-5" /> दुकानदाराकडे पाठवले!</>
                  ) : (
                    <><Send className="w-4 h-4" /> प्रिंटरला पाठवा (SEND)</>
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
                  disabled={isSendingPhoto || !photoImage}
                  className={`w-full py-5 px-6 rounded-2xl font-sans font-black text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 cursor-pointer transition-all ${
                    sendSuccessPhoto
                      ? 'bg-emerald-600 text-white'
                      : photoImage
                      ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSendingPhoto ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> पाठवत आहे (SENDING)...</>
                  ) : sendSuccessPhoto ? (
                    <><Check className="w-5 h-5" /> दुकानात पाठवले!</>
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

    </div>
  );
}
