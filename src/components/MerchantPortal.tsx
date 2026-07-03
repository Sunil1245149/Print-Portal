import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Printer, CheckCircle, Clock, Trash2, Maximize, AlertCircle, 
  Layers, Download, Calendar, ArrowRight, Eye, ShieldAlert, MonitorCheck,
  Sparkles, Crop, Sliders, Check, RefreshCw, Copy, ExternalLink, RefreshCw as RotateCw, X, Database,
  Volume2, Mic, Play, Settings
} from 'lucide-react';
import { ScannedDocument, DocType } from '../types';
import { applyFilters, replaceBackgroundColor, create8CopySheet, create4CopySheet, createA4DocumentSheet, autoDetectIDCardSettings } from '../lib/canvasUtils';

interface MerchantPortalProps {
  documents: ScannedDocument[];
  onUpdateStatus: (id: string, status: 'pending' | 'printed') => void;
  onDeleteDocument: (id: string) => void;
  onUpdateDocument: (updatedDoc: ScannedDocument) => void;
  onResetDatabase?: () => void;
  dbMode?: 'cloud' | 'local';
}

export default function MerchantPortal({ 
  documents, 
  onUpdateStatus, 
  onDeleteDocument,
  onUpdateDocument,
  onResetDatabase,
  dbMode = 'cloud'
}: MerchantPortalProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const autoBgRemovedDocs = useRef<Set<string>>(new Set());
  const autoIDCroppedDocs = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'printed'>('all');

  // Copy scan link feedback state
  const [copied, setCopied] = useState<boolean>(false);

  // Active/selected document
  const activeDoc = documents.find(doc => doc.id === selectedDocId) || (documents.length > 0 ? documents[0] : null);

  // Filtered list
  const filteredDocs = documents.filter(doc => {
    if (activeTab === 'pending') return doc.status === 'pending';
    if (activeTab === 'printed') return doc.status === 'printed';
    return true;
  });

  // Local state for editing sliders (initialized from activeDoc settings on select)
  const [brightness, setBrightness] = useState<number>(10);
  const [contrast, setContrast] = useState<number>(15);
  const [saturation, setSaturation] = useState<number>(12);
  const [backgroundColor, setBackgroundColor] = useState<string>('#ff0000');
  const [fuzziness, setFuzziness] = useState<number>(45);
  const [hasBorder, setHasBorder] = useState<boolean>(true);
  
  // Crop zoom & pan settings
  const [cropScale, setCropScale] = useState<number>(1.2);
  const [cropX, setCropX] = useState<number>(0);
  const [cropY, setCropY] = useState<number>(-15);

  // ID Card Manual Crop, Scale and Position states
  const [idFrontCropX, setIdFrontCropX] = useState<number>(0);
  const [idFrontCropY, setIdFrontCropY] = useState<number>(0);
  const [idFrontScale, setIdFrontScale] = useState<number>(1.1);
  const [idBackCropX, setIdBackCropX] = useState<number>(0);
  const [idBackCropY, setIdBackCropY] = useState<number>(0);
  const [idBackScale, setIdBackScale] = useState<number>(1.1);
  const [idFrontYOffset, setIdFrontYOffset] = useState<number>(0);
  const [idBackYOffset, setIdBackYOffset] = useState<number>(0);

  // remove.bg States
  const [isRemovingBg, setIsRemovingBg] = useState<boolean>(false);
  const [bgRemovedImage, setBgRemovedImage] = useState<string | null>(null);
  const [useRemoveBg, setUseRemoveBg] = useState<boolean>(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);

  // Auto-Print Queue & Rendering States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pendingAutoPrintDocId, setPendingAutoPrintDocId] = useState<string | null>(null);

  // Auto-enhance state for documents
  const [docAutoEnhanced, setDocAutoEnhanced] = useState<boolean>(false);

  // Signboard print modal state
  const [isSignboardModalOpen, setIsSignboardModalOpen] = useState<boolean>(false);

  // Supabase SQL setup modal state
  const [isSqlModalOpen, setIsSqlModalOpen] = useState<boolean>(false);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // Custom Supabase database connection variables
  const [customSupaUrl, setCustomSupaUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('print_shop_supabase_url') || '';
    } catch (e) {
      return '';
    }
  });
  const [customSupaKey, setCustomSupaKey] = useState<string>(() => {
    try {
      return localStorage.getItem('print_shop_supabase_key') || '';
    } catch (e) {
      return '';
    }
  });
  const [supaSaved, setSupaSaved] = useState<boolean>(false);

  // remove.bg API Key state
  const [removeBgApiKey, setRemoveBgApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('print_shop_remove_bg_api_key') || '';
    } catch (e) {
      return '';
    }
  });

  const handleSaveRemoveBgApiKey = async (val: string) => {
    setRemoveBgApiKey(val);
    try {
      localStorage.setItem('print_shop_remove_bg_api_key', val);
    } catch (e) {}

    // Save to backend server API
    try {
      await fetch('/api/merchant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { removeBgApiKey: val } })
      });
    } catch (err) {
      console.warn("Failed to save removeBgApiKey to server:", err);
    }

    // Save to Firestore Database
    try {
      const docRef = doc(db, 'documents', 'merchant_settings');
      await setDoc(docRef, { removeBgApiKey: val }, { merge: true });
    } catch (err) {
      console.warn("Failed to save removeBgApiKey to Firestore:", err);
    }
  };

  // Auto-Print state
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('print_shop_auto_print') === 'true';
    } catch (e) {
      return false;
    }
  });

  const handleToggleAutoPrint = async () => {
    const newVal = !autoPrintEnabled;
    setAutoPrintEnabled(newVal);
    try {
      localStorage.setItem('print_shop_auto_print', String(newVal));
    } catch (e) {}

    // Save to backend server API
    try {
      await fetch('/api/merchant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { autoPrintEnabled: newVal } })
      });
    } catch (err) {
      console.warn("Failed to save autoPrintEnabled to server:", err);
    }

    // Save to Firestore Database
    try {
      const docRef = doc(db, 'documents', 'merchant_settings');
      await setDoc(docRef, { autoPrintEnabled: newVal }, { merge: true });
    } catch (err) {
      console.warn("Failed to save autoPrintEnabled to Firestore:", err);
    }
  };

  // Voice configurations state
  const defaultTexts: Record<string, string> = {
    id_card: "नया आई डी कार्ड प्राप्त हुआ है, कृपया चेक करें।",
    passport: "नया पासपोर्ट फोटो प्राप्त हुआ है।",
    document: "नया दस्तावेज़ प्राप्त हुआ है।",
    processing: "प्रिंटिंग शुरू हो रही है, कृपया प्रतीक्षा करें।",
    complete: "प्रिंट पूरा हो गया है, धन्यवाद!"
  };

  const [voiceConfigs, setVoiceConfigs] = useState<Record<string, { mode: string; ttsText: string; audioBase64: string; audioFileName?: string }>>(() => {
    const categories = ['id_card', 'passport', 'document', 'processing', 'complete'];
    const configs: Record<string, any> = {};
    categories.forEach(cat => {
      try {
        const saved = localStorage.getItem(`voice_config_${cat}`);
        if (saved) {
          configs[cat] = JSON.parse(saved);
        } else {
          configs[cat] = { mode: 'tts', ttsText: defaultTexts[cat], audioBase64: '' };
        }
      } catch (e) {
        configs[cat] = { mode: 'tts', ttsText: defaultTexts[cat], audioBase64: '' };
      }
    });
    return configs;
  });

  const updateVoiceConfig = async (category: string, updated: any) => {
    const nextConfigs = { ...voiceConfigs, [category]: updated };
    setVoiceConfigs(nextConfigs);
    try {
      localStorage.setItem(`voice_config_${category}`, JSON.stringify(updated));
    } catch (e) {}

    // Save to backend server API
    try {
      await fetch('/api/merchant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { voiceConfigs: nextConfigs } })
      });
    } catch (err) {
      console.warn("Failed to save voiceConfigs to server:", err);
    }

    // Save to Firestore Database
    try {
      const docRef = doc(db, 'documents', 'merchant_settings');
      await setDoc(docRef, { voiceConfigs: nextConfigs }, { merge: true });
    } catch (err) {
      console.warn("Failed to save voiceConfigs to Firestore:", err);
    }
  };

  // Fetch configurations from server API and Firestore on mount
  useEffect(() => {
    const loadMerchantConfig = async () => {
      let loadedKey = '';
      let loadedAutoPrint: boolean | undefined = undefined;
      let loadedVoiceConfigs: any = null;

      // 1. Load from Server API
      try {
        const response = await fetch('/api/merchant-config');
        if (response.ok) {
          const serverConfig = await response.json();
          if (serverConfig.removeBgApiKey) {
            loadedKey = serverConfig.removeBgApiKey;
          }
          if (serverConfig.autoPrintEnabled !== undefined) {
            loadedAutoPrint = serverConfig.autoPrintEnabled;
          }
          if (serverConfig.voiceConfigs) {
            loadedVoiceConfigs = serverConfig.voiceConfigs;
          }
        }
      } catch (err) {
        console.warn("Failed to load merchant config from server:", err);
      }

      // 2. Load from Firestore (takes priority or acts as robust backup)
      try {
        const docRef = doc(db, 'documents', 'merchant_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const dbData = docSnap.data();
          if (dbData.removeBgApiKey) {
            loadedKey = dbData.removeBgApiKey;
          }
          if (dbData.autoPrintEnabled !== undefined) {
            loadedAutoPrint = dbData.autoPrintEnabled;
          }
          if (dbData.voiceConfigs) {
            loadedVoiceConfigs = dbData.voiceConfigs;
          }
        }
      } catch (err) {
        console.warn("Failed to load merchant config from Firestore:", err);
      }

      // 3. Apply settings
      if (loadedKey) {
        setRemoveBgApiKey(loadedKey);
        try {
          localStorage.setItem('print_shop_remove_bg_api_key', loadedKey);
        } catch (e) {}
      }
      if (loadedAutoPrint !== undefined) {
        setAutoPrintEnabled(loadedAutoPrint);
        try {
          localStorage.setItem('print_shop_auto_print', String(loadedAutoPrint));
        } catch (e) {}
      }
      if (loadedVoiceConfigs) {
        setVoiceConfigs(loadedVoiceConfigs);
        Object.keys(loadedVoiceConfigs).forEach(cat => {
          try {
            localStorage.setItem(`voice_config_${cat}`, JSON.stringify(loadedVoiceConfigs[cat]));
          } catch (e) {}
        });
      }
    };

    loadMerchantConfig();
  }, []);

  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [seenDocIds, setSeenDocIds] = useState<string[]>([]);

  // Function to play sound alert for a specific event
  const playVoiceAlert = (categoryKey: string) => {
    const config = voiceConfigs[categoryKey];
    if (!config) return;

    if (config.mode === 'silent') return;

    if (config.mode === 'tts') {
      try {
        const textToSpeak = config.ttsText || defaultTexts[categoryKey];
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const voices = window.speechSynthesis.getVoices();
        const hindiVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('HI'));
        if (hindiVoice) {
          utterance.voice = hindiVoice;
        }
        utterance.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("TTS failed:", err);
      }
    } else if (config.mode === 'upload' && config.audioBase64) {
      try {
        const audio = new Audio(config.audioBase64);
        audio.play().catch(err => {
          console.warn("Audio play blocked:", err);
        });
      } catch (err) {
        console.warn("Audio play failed:", err);
      }
    } else {
      // Beep sound fallback
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(categoryKey === 'complete' ? 880 : 587, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } catch (e) {}
    }
  };

  const handleAudioUpload = (category: string, file: File | null) => {
    if (!file) return;
    if (file.size > 800 * 1024) {
      alert("Please upload an audio file smaller than 800 KB to keep system fast!");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const updated = {
        ...voiceConfigs[category],
        mode: 'upload',
        audioBase64: base64,
        audioFileName: file.name
      };
      updateVoiceConfig(category, updated);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSupaConfig = () => {
    try {
      const url = customSupaUrl.trim();
      const key = customSupaKey.trim();
      localStorage.setItem('print_shop_supabase_url', url);
      localStorage.setItem('print_shop_supabase_key', key);
      
      if (url && key) {
        localStorage.setItem('print_shop_db_mode', 'cloud');
      } else {
        localStorage.setItem('print_shop_db_mode', 'local');
      }
      
      setSupaSaved(true);
      setTimeout(() => {
        setSupaSaved(false);
        window.location.reload();
      }, 1200);
    } catch (e) {
      console.warn("Saving Supabase config to local storage failed:", e);
    }
  };

  // Customer Portal URL (dynamically embeds credentials so customer's phone connects seamlessly)
  const customerPortalUrl = React.useMemo(() => {
    let url = `${window.location.origin}${window.location.pathname}?mode=customer`;
    const supaUrl = customSupaUrl.trim();
    const supaKey = customSupaKey.trim();
    if (supaUrl && supaKey) {
      url += `&sb_url=${encodeURIComponent(supaUrl)}&sb_key=${encodeURIComponent(supaKey)}`;
    }
    return url;
  }, [customSupaUrl, customSupaKey]);

  const supabaseSqlScript = `-- Drop existing documents table if any to avoid conflicts
DROP TABLE IF EXISTS documents CASCADE;

-- Create documents table with camelCase columns matching the React client types exactly
CREATE TABLE documents (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "timestamp" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "processedUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'printed')),
  "notes" TEXT,
  "createdAt" BIGINT,
  "settings" JSONB
);

-- Enable Row Level Security (RLS)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Create public access policies so the website can select, insert, update, and delete directly
CREATE POLICY "Allow public select" ON documents FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON documents FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON documents FOR DELETE USING (true);

-- Enable Realtime for the documents table (for instant notifications)
alter publication supabase_realtime add table documents;

-- =========================================================
-- AUTOMATIC STORAGE BUCKET SETUP (स्टोरेज बकेट सेटअप)
-- =========================================================

-- Create a public bucket named 'documents' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if any to prevent conflicts
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- Storage policies to allow public access (select, insert, update, delete)
CREATE POLICY "Public Access" ON storage.objects FOR SELECT TO public USING (bucket_id = 'documents');
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Public Update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'documents');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE TO public USING (bucket_id = 'documents');`;

  const handleCopySql = () => {
    try {
      navigator.clipboard.writeText(supabaseSqlScript);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 3000);
    } catch (e) {
      console.warn("Clipboard copy failed:", e);
    }
  };

  const handlePrintSignboard = () => {
    console.log("Printing signboard...");
    const printArea = document.getElementById('print-area');
    if (!printArea) {
      const div = document.createElement('div');
      div.id = 'print-area';
      document.body.appendChild(div);
    }
    
    const targetPrintArea = document.getElementById('print-area')!;
    const customerUrl = customerPortalUrl;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(customerUrl)}`;
    
    // Create a background loading image to make sure QR loads before printing!
    const imgLoader = new Image();
    imgLoader.crossOrigin = 'anonymous';
    imgLoader.onload = () => {
      targetPrintArea.innerHTML = `
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm !important;
          }
          @media print {
            body > *:not(#print-area) {
              display: none !important;
            }
            html, body {
              background-color: #ffffff !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: 100% !important;
              overflow: hidden !important;
            }
            #print-area {
              display: block !important;
              width: 100% !important;
              height: 100% !important;
              max-height: 100vh !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
            }
          }
        </style>
        <div style="font-family: 'Inter', sans-serif; padding: 30px; background-color: white; color: black; max-width: 800px; margin: 0 auto; height: 95vh; display: flex; flex-direction: column; justify-content: space-between; border: 4px solid black; box-sizing: border-box; page-break-inside: avoid; page-break-after: avoid; overflow: hidden;">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 3px double black; padding-bottom: 15px; margin-bottom: 15px;">
            <h1 style="font-size: 30px; font-weight: 800; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">
              ⚡ SCAN & PRINT PORTAL
            </h1>
            <h2 style="font-size: 22px; font-weight: 700; margin: 0; color: #1e3a8a;">
              दस्तावेज़ एवं फोटो डायरेक्ट प्रिंटर
            </h2>
            <p style="font-size: 13px; font-weight: 500; margin: 6px 0 0 0; color: #4b5563;">
              No WhatsApp needed • Direct secure upload to our counter machine
            </p>
          </div>

          <!-- QR Code Frame -->
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 20px 0;">
            <div style="border: 8px solid black; padding: 20px; background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; width: 240px; height: 240px; box-sizing: border-box;">
              <img src="${qrCodeUrl}" style="width: 190px; height: 190px; object-fit: contain; display: block;" alt="Customer Portal QR Code" />
            </div>
            <div style="font-family: monospace; font-size: 11px; margin-top: 12px; background: #f3f4f6; padding: 5px 10px; border-radius: 6px; border: 1px solid #e5e7eb; max-width: 100%; word-break: break-all; color: #374151;">
              ${customerUrl}
            </div>
          </div>

          <!-- 3-Step Clear Instructions -->
          <div style="margin: 15px 0; background-color: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px;">
            <h3 style="font-size: 16px; font-weight: 700; text-align: center; margin: 0 0 15px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; color: #111827; text-transform: uppercase;">
              👉 How to Print (प्रिंट कैसे करें)
            </h3>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; align-items: flex-start; gap: 10px;">
                <span style="background: black; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">1</span>
                <div>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">Scan QR Code (क्यूआर कोड स्कैन करें)</p>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #4b5563;">Open your mobile camera and scan the QR code above.</p>
                </div>
              </div>

              <div style="display: flex; align-items: flex-start; gap: 10px;">
                <span style="background: black; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">2</span>
                <div>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">Upload Documents or Selfie (फाइल अपलोड करें या सेल्फी लें)</p>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #4b5563;">Select PDFs/images or take a fresh selfie portrait for passport pictures.</p>
                </div>
              </div>

              <div style="display: flex; align-items: flex-start; gap: 10px;">
                <span style="background: black; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; flex-shrink: 0;">3</span>
                <div>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">Send & Get Print (भेजें और प्रिंट लें)</p>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #4b5563;">Press "Send to Shop" button and inform the counter person for instant delivery!</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; border-top: 1px solid black; padding-top: 10px; margin-top: 10px;">
            <p style="font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #374151; margin: 0; text-transform: uppercase;">
              ⚡ FAST • SECURE • LOCAL SCANPRO WORKSTATION TERMINAL
            </p>
          </div>

        </div>
      `;
      window.print();
    };
    imgLoader.onerror = () => {
      // Fallback if network issue
      window.print();
    };
    imgLoader.src = qrCodeUrl;
  };

  // Trigger loading document settings into editor states
  useEffect(() => {
    if (!activeDoc) return;

    // Default or load portrait settings
    if (activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') {
      const s = activeDoc.settings;
      setBrightness(s?.brightness ?? 10);
      setContrast(s?.contrast ?? 15);
      setSaturation(12);
      setBackgroundColor(s?.backgroundColor ?? '#ff0000');
      setFuzziness(45);
      setHasBorder(s?.hasBorder ?? true);
      
      const cr = s?.cropRect || { x: 0, y: -15, width: 100, height: 100 };
      setCropScale(1.2);
      setCropX(cr.x ?? 0);
      setCropY(cr.y ?? -15);

      // Load AI background states from saved settings if they exist to prevent redundant api calls
      setBgRemovedImage(s?.bgRemovedImage ?? null);
      setUseRemoveBg(s?.useRemoveBg ?? false);
      setRemoveBgError(null);
    } else {
      // Document / ID Card settings - AUTO-ENHANCE BY DEFAULT!
      const s = activeDoc.settings;
      setBrightness(s?.brightness ?? 15);
      setContrast(s?.contrast ?? 45);
      setDocAutoEnhanced(true);

      // Reset AI background states for non-passport types
      setBgRemovedImage(null);
      setUseRemoveBg(false);
      setRemoveBgError(null);

      // Initialize ID card crop, scale & vertical offsets
      setIdFrontCropX(s?.idFrontCropX ?? 0);
      setIdFrontCropY(s?.idFrontCropY ?? 0);
      setIdFrontScale(s?.idFrontScale ?? 1.1);
      setIdBackCropX(s?.idBackCropX ?? 0);
      setIdBackCropY(s?.idBackCropY ?? 0);
      setIdBackScale(s?.idBackScale ?? 1.1);
      setIdFrontYOffset(s?.idFrontYOffset ?? 0);
      setIdBackYOffset(s?.idBackYOffset ?? 0);
    }
  }, [activeDoc?.id]);

  // Monitor incoming documents to trigger the voice notification and auto-print registration
  useEffect(() => {
    if (documents.length === 0) return;

    // Initialize seenDocIds if it's empty so we don't alert for existing items
    if (seenDocIds.length === 0) {
      setSeenDocIds(documents.map(d => d.id));
      return;
    }

    const newDocs = documents.filter(d => !seenDocIds.includes(d.id));
    if (newDocs.length > 0) {
      // Update seenDocIds with all current documents
      setSeenDocIds(documents.map(d => d.id));

      const latest = newDocs[0];
      
      // Determine the voice category based on the document type
      let category = 'document';
      if (latest.type === 'id_card') {
        category = 'id_card';
      } else if (latest.type.includes('passport') || latest.type === 'photo_4x6') {
        category = 'passport';
      }

      // Play the voice alert!
      playVoiceAlert(category);

      // If Auto-Print is enabled, queue it up so we print ONLY after full processing finishes
      if (autoPrintEnabled) {
        console.log(`[Auto-Print Engine] Queueing document ID: ${latest.id} for auto-print once fully processed`);
        setPendingAutoPrintDocId(latest.id);
      }
    } else if (documents.length !== seenDocIds.length) {
      // Keep seen ids list in sync in case of deletions
      setSeenDocIds(documents.map(d => d.id));
    }
  }, [documents, seenDocIds, autoPrintEnabled]);

  // Handle queueing and execution of Auto-Print ONLY when background removal and canvas rendering are 100% complete
  useEffect(() => {
    if (!pendingAutoPrintDocId) return;

    // Find the latest version of this document in our list to ensure we have the fully processed url
    const currentDoc = documents.find(d => d.id === pendingAutoPrintDocId);
    if (!currentDoc) {
      setPendingAutoPrintDocId(null);
      return;
    }

    // Check if background removal or canvas rendering is currently running
    const isWorking = isRemovingBg || isProcessing;

    // Also check if the processedUrl is still equal to the originalUrl (meaning it hasn't processed even once yet)
    const isStillRaw = currentDoc.processedUrl === currentDoc.originalUrl;

    if (!isWorking && !isStillRaw) {
      console.log(`[Auto-Print Engine] Document ${currentDoc.id} is fully processed and ready! Launching print...`);
      setPendingAutoPrintDocId(null); // Clear pending cue
      handlePrint(currentDoc);
    }
  }, [pendingAutoPrintDocId, documents, isProcessing, isRemovingBg]);

  // Reactive Off-Screen Render Loop for updating processedUrl dynamically
  useEffect(() => {
    if (!activeDoc) return;

    setIsProcessing(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') {
        // Step 1: Create cropped/recolored passport card (350x450 px)
        const singleW = 350;
        const singleH = 450;
        const singleCanvas = document.createElement('canvas');
        singleCanvas.width = singleW;
        singleCanvas.height = singleH;
        const sCtx = singleCanvas.getContext('2d');
        if (!sCtx) {
          setIsProcessing(false);
          return;
        }

        // Draw solid background color
        sCtx.fillStyle = backgroundColor;
        sCtx.fillRect(0, 0, singleW, singleH);

        // Center auto-crop calculations with perfect 7:9 passport aspect ratio (no stretching!)
        const targetRatio = singleW / singleH; // 350 / 450 = 7/9
        let cropWidth = img.width;
        let cropHeight = img.width / targetRatio;

        if (cropHeight > img.height) {
          cropHeight = img.height;
          cropWidth = img.height * targetRatio;
        }

        // Apply scale/zoom factor
        const finalCropW = cropWidth / cropScale;
        const finalCropH = cropHeight / cropScale;

        // Shift crop offset based on sliders
        const sourceX = (img.width - finalCropW) / 2 + (cropX / 100) * img.width;
        const sourceY = (img.height - finalCropH) / 2 + (cropY / 100) * img.height;

        sCtx.drawImage(
          img,
          Math.max(0, Math.min(img.width - finalCropW, sourceX)),
          Math.max(0, Math.min(img.height - finalCropH, sourceY)),
          finalCropW,
          finalCropH,
          0,
          0,
          singleW,
          singleH
        );

        // Replace background (Chroma key fallback if remove.bg not active/available)
        if (!useRemoveBg || !bgRemovedImage) {
          replaceBackgroundColor(sCtx, singleW, singleH, backgroundColor, fuzziness);
        }

        // Apply filters
        applyFilters(sCtx, singleW, singleH, brightness, contrast, saturation);

        // Optional black border
        if (hasBorder) {
          sCtx.strokeStyle = '#000000';
          sCtx.lineWidth = 10;
          sCtx.strokeRect(5, 5, singleW - 10, singleH - 10);
        }

        const singleDataUrl = singleCanvas.toDataURL('image/jpeg', 0.85);

        if (activeDoc.type === 'passport_8_copy') {
          // Compile 8 copies on a landscape 4x6 grid
          create8CopySheet(singleDataUrl, (tiledUrl) => {
            if (activeDoc.processedUrl !== tiledUrl) {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: tiledUrl,
                settings: {
                  ...activeDoc.settings,
                  brightness,
                  contrast,
                  backgroundColor,
                  hasBorder,
                  cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                  bgRemovedImage: bgRemovedImage || undefined,
                  useRemoveBg
                }
              });
            }
            setIsProcessing(false);
          });
        } else if (activeDoc.type === 'passport_4_copy') {
          // Compile 4 copies on a portrait 4x6 grid
          create4CopySheet(singleDataUrl, (tiledUrl) => {
            if (activeDoc.processedUrl !== tiledUrl) {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: tiledUrl,
                settings: {
                  ...activeDoc.settings,
                  brightness,
                  contrast,
                  backgroundColor,
                  hasBorder,
                  cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                  bgRemovedImage: bgRemovedImage || undefined,
                  useRemoveBg
                }
              });
            }
            setIsProcessing(false);
          });
        } else {
          // Single 4x6 photograph sheet
          // Create high-res 4x6 (1800 x 1200) portrait canvas
          const photoCanvas = document.createElement('canvas');
          photoCanvas.width = 1200;
          photoCanvas.height = 1800;
          const pCtx = photoCanvas.getContext('2d');
          if (pCtx) {
            pCtx.fillStyle = '#ffffff';
            pCtx.fillRect(0, 0, 1200, 1800);
            pCtx.drawImage(singleCanvas, 100, 150, 1000, 1500); // fitted in the sheet center
            const finalPhotoUrl = photoCanvas.toDataURL('image/jpeg', 0.85);
            if (activeDoc.processedUrl !== finalPhotoUrl) {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: finalPhotoUrl,
                settings: {
                  ...activeDoc.settings,
                  brightness,
                  contrast,
                  backgroundColor,
                  hasBorder,
                  cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                  bgRemovedImage: bgRemovedImage || undefined,
                  useRemoveBg
                }
              });
            }
            setIsProcessing(false);
          } else {
            setIsProcessing(false);
          }
        }
      } else if (activeDoc.type === 'id_card') {
        // ID Card A4 layout processing (Front & Back)
        const frontImg = new Image();
        frontImg.crossOrigin = 'anonymous';
        frontImg.onload = () => {
          // Process Front Image with filters
          const frontCanvas = document.createElement('canvas');
          frontCanvas.width = frontImg.width;
          frontCanvas.height = frontImg.height;
          const frontCtx = frontCanvas.getContext('2d');
          if (!frontCtx) {
            setIsProcessing(false);
            return;
          }
          frontCtx.drawImage(frontImg, 0, 0);
          applyFilters(frontCtx, frontImg.width, frontImg.height, brightness, contrast, 0);
          const frontProcUrl = frontCanvas.toDataURL('image/jpeg', 0.85);

          const backUrl = activeDoc.idBackUrl || activeDoc.settings?.idBackUrl;
          if (backUrl) {
            const backImg = new Image();
            backImg.crossOrigin = 'anonymous';
            backImg.onload = () => {
              // Process Back Image with filters
              const backCanvas = document.createElement('canvas');
              backCanvas.width = backImg.width;
              backCanvas.height = backImg.height;
              const backCtx = backCanvas.getContext('2d');
              if (!backCtx) {
                setIsProcessing(false);
                return;
              }
              backCtx.drawImage(backImg, 0, 0);
              applyFilters(backCtx, backImg.width, backImg.height, brightness, contrast, 0);
              const backProcUrl = backCanvas.toDataURL('image/jpeg', 0.85);

              // Generate joint A4 sheet
              const idSettingsObj = {
                idFrontCropX,
                idFrontCropY,
                idFrontScale,
                idBackCropX,
                idBackCropY,
                idBackScale,
                idFrontYOffset,
                idBackYOffset
              };

              // Generate joint A4 sheet
              createA4DocumentSheet(frontProcUrl, true, (finalA4Url) => {
                if (activeDoc.processedUrl !== finalA4Url) {
                  onUpdateDocument({
                    ...activeDoc,
                    processedUrl: finalA4Url,
                    settings: {
                      ...activeDoc.settings,
                      brightness,
                      contrast,
                      idFrontUrl: activeDoc.idFrontUrl || activeDoc.originalUrl,
                      idBackUrl: backUrl,
                      ...idSettingsObj
                    }
                  });
                }
                setIsProcessing(false);
              }, backProcUrl, idSettingsObj);
            };
            backImg.onerror = () => {
              const idSettingsObj = {
                idFrontCropX,
                idFrontCropY,
                idFrontScale,
                idBackCropX,
                idBackCropY,
                idBackScale,
                idFrontYOffset,
                idBackYOffset
              };
              createA4DocumentSheet(frontProcUrl, true, (finalA4Url) => {
                if (activeDoc.processedUrl !== finalA4Url) {
                  onUpdateDocument({
                    ...activeDoc,
                    processedUrl: finalA4Url,
                    settings: { 
                      ...activeDoc.settings,
                      brightness, 
                      contrast,
                      ...idSettingsObj
                    }
                  });
                }
                setIsProcessing(false);
              }, undefined, idSettingsObj);
            };
            backImg.src = backUrl;
          } else {
            const idSettingsObj = {
              idFrontCropX,
              idFrontCropY,
              idFrontScale,
              idBackCropX,
              idBackCropY,
              idBackScale,
              idFrontYOffset,
              idBackYOffset
            };
            createA4DocumentSheet(frontProcUrl, true, (finalA4Url) => {
              if (activeDoc.processedUrl !== finalA4Url) {
                onUpdateDocument({
                  ...activeDoc,
                  processedUrl: finalA4Url,
                  settings: { 
                    ...activeDoc.settings,
                    brightness, 
                    contrast,
                    ...idSettingsObj
                  }
                });
              }
              setIsProcessing(false);
            }, undefined, idSettingsObj);
          }
        };
        frontImg.onerror = () => {
          setIsProcessing(false);
        };
        frontImg.src = (useRemoveBg && bgRemovedImage) ? bgRemovedImage : (activeDoc.idFrontUrl || activeDoc.originalUrl);
      } else {
        // Standard Document A4 layout processing
        const procCanvas = document.createElement('canvas');
        procCanvas.width = img.width;
        procCanvas.height = img.height;
        const procCtx = procCanvas.getContext('2d');
        if (procCtx) {
          procCtx.drawImage(img, 0, 0);
          applyFilters(procCtx, img.width, img.height, brightness, contrast, 0);

          createA4DocumentSheet(procCanvas.toDataURL('image/jpeg', 0.85), false, (finalA4Url) => {
            if (activeDoc.processedUrl !== finalA4Url) {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: finalA4Url,
                settings: {
                  brightness,
                  contrast
                }
              });
            }
            setIsProcessing(false);
          });
        } else {
          setIsProcessing(false);
        }
      }
    };
    img.onerror = () => {
      setIsProcessing(false);
    };
    img.src = (useRemoveBg && bgRemovedImage) ? bgRemovedImage : activeDoc.originalUrl;
  }, [
    activeDoc?.id, activeDoc?.type, brightness, contrast, saturation, backgroundColor, fuzziness, 
    hasBorder, cropScale, cropX, cropY, useRemoveBg, bgRemovedImage,
    idFrontCropX, idFrontCropY, idFrontScale, idBackCropX, idBackCropY, idBackScale, idFrontYOffset, idBackYOffset
  ]);

  // Execute standard high-resolution print commands safely
  const handlePrint = async (doc: ScannedDocument) => {
    console.log("handlePrint called for doc:", doc.id);
    playVoiceAlert('processing');

    const printArea = document.getElementById('print-area');
    if (!printArea) {
      const div = document.createElement('div');
      div.id = 'print-area';
      document.body.appendChild(div);
    }
    
    const targetPrintArea = document.getElementById('print-area')!;
    const isPhotoOrPassport = doc.type === 'passport_8_copy' || doc.type === 'passport_4_copy' || doc.type === 'photo_4x6';
    const isPassport8 = doc.type === 'passport_8_copy';

    if (!doc.processedUrl) {
      console.error("No image URL provided for printing!");
      return;
    }

    // Set the print area
    targetPrintArea.innerHTML = `
      <style>
        @page {
          size: ${isPassport8 ? '6in 4in landscape' : (doc.type === 'photo_4x6' || doc.type === 'passport_4_copy') ? '4in 6in portrait' : 'A4 portrait'};
          margin: 0 !important;
        }
        @media print {
          body > *:not(#print-area) { display: none !important; }
          html, body {
            width: 100% !important; height: 100% !important;
            margin: 0 !important; padding: 0 !important;
            overflow: hidden !important; background-color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
          }
          #print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; height: 100% !important;
            margin: 0 !important; padding: 0 !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            background-color: #ffffff !important;
            page-break-inside: avoid !important;
          }
          img {
            display: block !important;
            max-width: 100% !important; max-height: 100% !important;
            width: auto !important; height: auto !important;
            object-fit: contain !important;
            margin: 0 auto !important;
          }
        }
      </style>
      <div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; max-height: 100vh; overflow: hidden; background-color: white;">
        <img id="print-image-node" src="${doc.processedUrl}" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;" />
      </div>
    `;

    const imgInDom = document.getElementById('print-image-node') as HTMLImageElement;
    
    const triggerPrint = () => {
      window.print();
      onUpdateStatus(doc.id, 'printed');
      setTimeout(() => playVoiceAlert('complete'), 500);
    };

    if (imgInDom.complete) {
      triggerPrint();
    } else {
      imgInDom.onload = triggerPrint;
      imgInDom.onerror = () => {
        console.error("Image failed to load for print");
        triggerPrint();
      };
    }
  };

  // remove.bg trigger
  const triggerRemoveBg = async () => {
    if (!activeDoc) return;
    setIsRemovingBg(true);
    setRemoveBgError(null);
    try {
      const response = await fetch("/api/remove-bg", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          image: activeDoc.originalUrl,
          apiKey: removeBgApiKey
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error(`Server returned HTML instead of JSON. The backend server API route might be missing or down. Try reloading the page.`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove background");
      }

      setBgRemovedImage(data.image);
      setUseRemoveBg(true);
    } catch (err: any) {
      console.error(err);
      setRemoveBgError(err.message || "Error occurred during AI background removal");
    } finally {
      setIsRemovingBg(false);
    }
  };

  // Automatically trigger background removal on photo & passport docs once they load/become active
  useEffect(() => {
    if (!activeDoc) return;
    const isPhotoType = activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6';
    if (!isPhotoType) return;

    // If already removed or is in the process, don't re-run
    if (bgRemovedImage || isRemovingBg) return;

    // Check if we've already tried to automatically remove bg for this document ID to prevent loops
    if (autoBgRemovedDocs.current.has(activeDoc.id)) return;

    // Mark document as auto-processed
    autoBgRemovedDocs.current.add(activeDoc.id);

    console.log(`[Auto Background Removal] Triggering remove.bg automatically for doc ID: ${activeDoc.id}`);
    triggerRemoveBg();
  }, [activeDoc?.id, activeDoc?.type, removeBgApiKey, bgRemovedImage, isRemovingBg]);

  // ID Card Smart Auto-Crop detection handler
  const handleAutoDetectIDCrop = async () => {
    if (!activeDoc || activeDoc.type !== 'id_card') return;

    console.log(`[Smart ID Auto-Crop] Detecting boundaries for ID front...`);
    const frontUrl = activeDoc.idFrontUrl || activeDoc.originalUrl;
    try {
      const frontRes = await autoDetectIDCardSettings(frontUrl);
      console.log(`[Smart ID Auto-Crop] Front detected:`, frontRes);
      setIdFrontCropX(frontRes.cropX);
      setIdFrontCropY(frontRes.cropY);
      setIdFrontScale(frontRes.scale);

      const backUrl = activeDoc.idBackUrl || activeDoc.settings?.idBackUrl;
      if (backUrl) {
        console.log(`[Smart ID Auto-Crop] Detecting boundaries for ID back...`);
        const backRes = await autoDetectIDCardSettings(backUrl);
        console.log(`[Smart ID Auto-Crop] Back detected:`, backRes);
        setIdBackCropX(backRes.cropX);
        setIdBackCropY(backRes.cropY);
        setIdBackScale(backRes.scale);
      }
    } catch (err) {
      console.warn("Smart ID Auto-Crop failed:", err);
    }
  };

  // Automatically trigger smart ID Card auto-crop once when selected
  useEffect(() => {
    if (!activeDoc || activeDoc.type !== 'id_card') return;

    // Check if we've already tried to automatically crop this ID card to prevent loops
    if (autoIDCroppedDocs.current.has(activeDoc.id)) return;

    // Mark document as auto-cropped
    autoIDCroppedDocs.current.add(activeDoc.id);

    console.log(`[Smart ID Auto-Crop] Triggering auto-crop for ID Card ID: ${activeDoc.id}`);
    handleAutoDetectIDCrop();
  }, [activeDoc?.id, activeDoc?.type]);

  // Document Auto-Enhance toggle
  const toggleDocEnhance = () => {
    if (docAutoEnhanced) {
      setBrightness(0);
      setContrast(0);
      setDocAutoEnhanced(false);
    } else {
      setBrightness(15);
      setContrast(45); // high contrast for text scan readability
      setDocAutoEnhanced(true);
    }
  };

  const copyCustomerLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?mode=customer`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Badge helpers
  const getCategoryBadge = (type: string) => {
    switch (type) {
      case 'document':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-50 border border-blue-200 text-blue-700">DOC (A4)</span>;
      case 'id_card':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-50 border border-indigo-200 text-indigo-700">ID CARD (A4)</span>;
      case 'passport_8_copy':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-pink-50 border border-pink-200 text-pink-700">PASSPORT 8-GRID (4x6)</span>;
      case 'photo_4x6':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-50 border border-cyan-200 text-cyan-700">PHOTO (4x6)</span>;
      default:
        return null;
    }
  };

  return (
    <div id="merchant-portal" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-full min-h-[600px]">
      
      {/* Portal Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex flex-col md:flex-row gap-4 md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600 p-2 rounded-xl text-white">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-sans font-bold text-lg text-white leading-tight">Merchant Portal Terminal</h2>
            <p className="text-xs text-slate-300 font-mono">PRINT CONTROLLER & IMAGE TUNER • FULL POWER</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsSqlModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-indigo-500"
            title="Setup Supabase Database Schema SQL"
          >
            <Database className="w-4 h-4" />
            SUPABASE SQL SETUP (डेटाबेस सेटअप)
          </button>

          <button
            type="button"
            onClick={() => setIsVoiceModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-emerald-500"
            title="Configure sound alerts and auto-printing parameters"
          >
            <Volume2 className="w-4 h-4" />
            SOUNDS & AUTO-PRINT (आवाज़ एवं ऑटो-प्रिंट)
          </button>

          <button
            type="button"
            onClick={() => setIsSignboardModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-blue-500"
          >
            <Printer className="w-4 h-4" />
            PRINT SHOP COUNTER QR SIGN (दुकान क्यूआर कोड)
          </button>

          {onResetDatabase && (
            <button
              type="button"
              onClick={onResetDatabase}
              className="bg-rose-700 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer border border-rose-600"
              title="Reset database and clear all records permanently"
            >
              <RefreshCw className="w-4 h-4" />
              RESET SYSTEM DATA (डेटा रीसेट करें)
            </button>
          )}

          {/* Sync Status Badge */}
          <div className={`flex items-center gap-2 bg-slate-900 border ${dbMode === 'local' ? 'border-amber-700/60' : 'border-slate-700'} px-3 py-1.5 rounded-full`} title={dbMode === 'local' ? 'Local Storage Failsafe Mode Active (Firebase Quota Exhausted)' : 'Online Cloud Database Active'}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dbMode === 'local' ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${dbMode === 'local' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className={`text-[10px] font-mono font-bold ${dbMode === 'local' ? 'text-amber-400' : 'text-emerald-400'}`}>
              {dbMode === 'local' ? 'LOCAL FAILSAFE SYNC' : 'LIVE CLOUD SYNC'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-5 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 overflow-hidden">
        
        {/* Column 1 & 2: Left Queue (Received Jobs) */}
        <div className="xl:col-span-2 flex flex-col h-full bg-slate-50 min-h-[250px]">
          
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md border border-slate-200">
              <button 
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === 'all' ? 'bg-white text-slate-800 shadow' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({documents.length})
              </button>
              <button 
                onClick={() => setActiveTab('pending')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Pending ({documents.filter(d => d.status === 'pending').length})
              </button>
              <button 
                onClick={() => setActiveTab('printed')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  activeTab === 'printed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Printed ({documents.filter(d => d.status === 'printed').length})
              </button>
            </div>
            
            <span className="text-[10px] font-mono font-bold text-slate-400">
              CUSTOMER STREAM
            </span>
          </div>

          {/* Job Queue List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[500px] xl:max-h-none">
            {filteredDocs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded-full text-slate-400">
                  <Layers className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-600">No print requests yet</p>
                  <p className="text-xs text-slate-400 max-w-[220px] mx-auto mt-1 font-sans">
                    Give the connection QR code/link to customer on counter to upload documents.
                  </p>
                </div>
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = activeDoc?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 relative overflow-hidden group ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className={`absolute top-0 left-0 bottom-0 w-1 ${
                      doc.status === 'pending' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />

                    {/* Miniature thumbnail of original photo received */}
                    <div className="w-12 h-16 shrink-0 bg-slate-100 border border-slate-200 rounded overflow-hidden relative flex items-center justify-center">
                      <img 
                        src={doc.originalUrl} 
                        alt="Original Upload" 
                        className="w-full h-full object-cover" 
                      />
                      {doc.status === 'printed' && (
                        <div className="absolute inset-0 bg-emerald-900/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-emerald-600 drop-shadow" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1 text-slate-700">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                          {doc.name}
                        </p>
                        <span className="text-[9px] font-mono font-bold text-slate-400">
                          {doc.timestamp}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5">
                        {getCategoryBadge(doc.type)}
                        {doc.status === 'pending' ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                            <Clock className="w-2 h-2" /> PENDING
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                            <CheckCircle className="w-2 h-2" /> PRINTED
                          </span>
                        )}
                      </div>

                      {doc.notes && (
                        <p className="text-[9px] text-slate-500 italic truncate">
                          💬 "{doc.notes}"
                        </p>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                        if (isSelected) setSelectedDocId(null);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 bg-white hover:bg-red-50 hover:text-red-600 rounded border border-slate-200 text-slate-400 self-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3, 4 & 5: Workstation + Image Editor */}
        <div className="xl:col-span-3 flex flex-col h-full p-6">
          {activeDoc ? (
            <div className="h-full flex flex-col space-y-5">
              
              {/* Header block with Job Details */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-sans font-bold text-base text-slate-800">
                      Tuner active: {activeDoc.name}
                    </h3>
                    {getCategoryBadge(activeDoc.type)}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono">
                    ID: {activeDoc.id} | REC: {activeDoc.timestamp}
                  </p>
                </div>

                <button
                  onClick={() => onDeleteDocument(activeDoc.id)}
                  className="px-2.5 py-1.5 text-xs font-semibold hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-lg border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Discard
                </button>
              </div>

              {/* Central Editor Layout */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 min-h-0">
                
                {/* Editor Tuner Controls sidebar (Left 5 cols) */}
                <div className="md:col-span-5 space-y-4 overflow-y-auto pr-1">
                  
                  {/* Passport/Photo specific controls */}
                  {(activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') ? (
                    <div className="space-y-4">
                      
                      {/* Active Layout Switcher for Merchant */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner space-y-2">
                        <span className="text-[10px] font-bold text-slate-600 font-mono uppercase block">
                          📄 Layout Sheet Format (फॉर्मेट बदलें)
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateDocument({
                                ...activeDoc,
                                type: 'passport_8_copy',
                                name: '8-Grid Passport Photos'
                              });
                            }}
                            className={`py-2 px-1 rounded-lg text-[10px] font-bold transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                              activeDoc.type === 'passport_8_copy'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span>8 Copies</span>
                            <span className="text-[8px] opacity-80 font-mono">(4x6 Land)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateDocument({
                                ...activeDoc,
                                type: 'passport_4_copy',
                                name: '4-Grid Passport Photos'
                              });
                            }}
                            className={`py-2 px-1 rounded-lg text-[10px] font-bold transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                              activeDoc.type === 'passport_4_copy'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span>4 Copies</span>
                            <span className="text-[8px] opacity-80 font-mono">(4x6 Port)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateDocument({
                                ...activeDoc,
                                type: 'photo_4x6',
                                name: 'Full Portrait Print (4"x6")'
                              });
                            }}
                            className={`py-2 px-1 rounded-lg text-[10px] font-bold transition-all border flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                              activeDoc.type === 'photo_4x6'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span>Single 4x6</span>
                            <span className="text-[8px] opacity-80 font-mono">(4x6 Port)</span>
                          </button>
                        </div>
                      </div>
                      
                      {/* Background recoloring swatches */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-inner">
                        <span className="text-xs font-bold text-slate-600 font-mono uppercase block">
                          🎨 Background Recolor (Merchant Only)
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            { name: 'Passport Red', hex: '#ff0000' },
                            { name: 'Royal Blue', hex: '#3b82f6' },
                            { name: 'Light Gray', hex: '#e2e8f0' },
                            { name: 'Plain White', hex: '#ffffff' },
                            { name: 'Navy Blue', hex: '#1e3a8a' },
                          ].map((item) => (
                            <button
                              key={item.hex}
                              onClick={() => setBackgroundColor(item.hex)}
                              className={`w-7 h-7 rounded-full border-2 relative flex items-center justify-center transition-all hover:scale-110 cursor-pointer ${
                                backgroundColor === item.hex ? 'border-slate-800 ring-2 ring-blue-400' : 'border-slate-300'
                              }`}
                              style={{ backgroundColor: item.hex }}
                              title={item.name}
                            >
                              {backgroundColor === item.hex && (
                                <Check className={`w-3.5 h-3.5 ${item.hex === '#ffffff' || item.hex === '#e2e8f0' ? 'text-slate-800' : 'text-white'}`} />
                              )}
                            </button>
                          ))}
                        </div>

                        {/* Custom Color selection picker */}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] text-slate-500 font-sans">Custom Hex:</span>
                          <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-6 h-6 border rounded cursor-pointer p-0"
                          />
                          <input
                            type="text"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="text-[10px] font-mono border rounded px-1.5 py-0.5 w-16"
                          />
                        </div>

                        {/* remove.bg AI cutout */}
                        <div className="border-t border-slate-200/60 pt-2.5 mt-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-900 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              AI Background Removal
                            </span>
                            {bgRemovedImage && (
                              <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                AI ACTIVE
                              </span>
                            )}
                          </div>

                          {/* remove.bg API Key Input (entered in portal) */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                                remove.bg API Key:
                              </label>
                              <a 
                                href="https://www.remove.bg/api" 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[8px] text-blue-600 hover:underline font-bold"
                              >
                                Get Free Key ↗
                              </a>
                            </div>
                            <input
                              type="password"
                              value={removeBgApiKey}
                              onChange={(e) => handleSaveRemoveBgApiKey(e.target.value)}
                              placeholder="Paste custom key (or leaves empty for default)"
                              className="w-full text-[10px] bg-white border border-slate-300 rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex gap-1.5">
                            <button
                              onClick={triggerRemoveBg}
                              disabled={isRemovingBg}
                              className={`flex-1 py-1.5 px-2 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                                bgRemovedImage 
                                  ? 'bg-slate-200 text-slate-800 hover:bg-slate-300' 
                                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                              }`}
                            >
                              {isRemovingBg ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  REMOVING...
                                </>
                              ) : bgRemovedImage ? (
                                <>
                                  <RefreshCw className="w-3 h-3" />
                                  RE-RUN AI REMOVAL
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3" />
                                  AI REMOVE BACKGROUND
                                </>
                              )}
                            </button>

                            {bgRemovedImage && (
                              <button
                                onClick={() => setUseRemoveBg(!useRemoveBg)}
                                className={`px-2 py-1.5 rounded text-[10px] font-bold transition-all border cursor-pointer ${
                                  useRemoveBg
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                {useRemoveBg ? 'AI ON' : 'AI OFF'}
                              </button>
                            )}
                          </div>

                          {removeBgError && (
                            <p className="text-[9px] text-red-600 bg-red-50 p-1 rounded border border-red-100 leading-normal">
                              ⚠️ {removeBgError}
                            </p>
                          )}
                        </div>

                        {/* Edge fuzziness */}
                        <div className="pt-1.5 border-t border-slate-200/60">
                          <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                            <span>Edge Fuzziness (Fallback)</span>
                            <span>{fuzziness}</span>
                          </div>
                          <input 
                            type="range" 
                            min="10" 
                            max="120" 
                            value={fuzziness} 
                            onChange={(e) => setFuzziness(Number(e.target.value))}
                            disabled={useRemoveBg && !!bgRemovedImage}
                            className={`w-full h-1 rounded-lg accent-blue-600 ${useRemoveBg && !!bgRemovedImage ? 'opacity-50' : ''}`}
                          />
                        </div>
                      </div>

                      {/* Face Auto-cropping sliders */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-inner">
                        <span className="text-xs font-bold text-slate-600 font-mono uppercase flex items-center gap-1">
                          <Crop className="w-3.5 h-3.5 text-blue-500" />
                          🎯 Passport Auto-Crop & Face Framing
                        </span>

                        <div className="space-y-2.5">
                          <div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                              <span>ZOOM SCALE</span>
                              <span>{cropScale.toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0.5"
                              max="2.5"
                              step="0.1"
                              value={cropScale}
                              onChange={(e) => setCropScale(Number(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                              <span>PAN LEFT/RIGHT</span>
                              <span>{cropX}</span>
                            </div>
                            <input
                              type="range"
                              min="-50"
                              max="50"
                              value={cropX}
                              onChange={(e) => setCropX(Number(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                              <span>PAN UP/DOWN</span>
                              <span>{cropY}</span>
                            </div>
                            <input
                              type="range"
                              min="-50"
                              max="50"
                              value={cropY}
                              onChange={(e) => setCropY(Number(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Photo border layout selection */}
                      {(activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy') && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-600 font-mono uppercase">PASSPORT OUTLINE BORDER</span>
                          <button
                            onClick={() => setHasBorder(!hasBorder)}
                            className={`text-[10px] font-bold px-2 py-1 rounded transition-all cursor-pointer border ${
                              hasBorder 
                                ? 'bg-blue-50 text-blue-600 border-blue-200' 
                                : 'bg-white text-slate-500 border-slate-200'
                            }`}
                          >
                            {hasBorder ? 'OUTLINE (ON)' : 'OUTLINE (OFF)'}
                          </button>
                        </div>
                      )}

                    </div>
                  ) : (
                    /* Standard Document & ID card processing panel */
                    <div className="space-y-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-inner">
                        <span className="text-xs font-bold text-slate-600 font-mono uppercase block">
                          ⚡ Quick Scan Enhancers
                        </span>

                        <button
                          type="button"
                          onClick={toggleDocEnhance}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                            docAutoEnhanced 
                              ? 'bg-blue-600 text-white border-blue-500 shadow' 
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          {docAutoEnhanced ? 'HIGH CONTRAST ACTIVE' : 'AUTO GLOW (TEXT SCAN)'}
                        </button>
                        <p className="text-[9px] text-slate-400 leading-normal font-sans">
                          Auto Glow filters out raw shadows, enhances handwriting clarity, and maximizes pure black/white contrast for laser office printing.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ID Card Specific Crop, Zoom & Vertical Offset controls */}
                  {activeDoc.type === 'id_card' && (
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-800 font-mono uppercase block flex items-center gap-1">
                          💳 ID Card Crop & Placement Tuning
                        </span>
                        <button
                          type="button"
                          onClick={handleAutoDetectIDCrop}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer border border-blue-500"
                        >
                          <Sparkles className="w-3 h-3 text-white" /> Smart Auto-Crop
                        </button>
                      </div>

                      {/* FRONT CARD CONTROLS */}
                      <div className="space-y-2.5 border-b border-blue-100/60 pb-3">
                        <div className="text-[11px] font-bold text-slate-700 font-mono uppercase">
                          FRONT SIDE (सामने का भाग)
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>FRONT ZOOM SCALE</span>
                              <span>{idFrontScale.toFixed(2)}x</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" 
                              max="3" 
                              step="0.05"
                              value={idFrontScale} 
                              onChange={(e) => setIdFrontScale(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>FRONT VERTICAL POS</span>
                              <span>{idFrontYOffset}px</span>
                            </div>
                            <input 
                              type="range" 
                              min="-200" 
                              max="200" 
                              step="5"
                              value={idFrontYOffset} 
                              onChange={(e) => setIdFrontYOffset(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>FRONT PAN HORIZ (X)</span>
                              <span>{idFrontCropX}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="-50" 
                              max="50" 
                              value={idFrontCropX} 
                              onChange={(e) => setIdFrontCropX(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>FRONT PAN VERT (Y)</span>
                              <span>{idFrontCropY}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="-50" 
                              max="50" 
                              value={idFrontCropY} 
                              onChange={(e) => setIdFrontCropY(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      {/* BACK CARD CONTROLS */}
                      <div className="space-y-2.5">
                        <div className="text-[11px] font-bold text-slate-700 font-mono uppercase">
                          BACK SIDE (पीछे का भाग)
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>BACK ZOOM SCALE</span>
                              <span>{idBackScale.toFixed(2)}x</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" 
                              max="3" 
                              step="0.05"
                              value={idBackScale} 
                              onChange={(e) => setIdBackScale(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>BACK VERTICAL POS</span>
                              <span>{idBackYOffset}px</span>
                            </div>
                            <input 
                              type="range" 
                              min="-200" 
                              max="200" 
                              step="5"
                              value={idBackYOffset} 
                              onChange={(e) => setIdBackYOffset(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>BACK PAN HORIZ (X)</span>
                              <span>{idBackCropX}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="-50" 
                              max="50" 
                              value={idBackCropX} 
                              onChange={(e) => setIdBackCropX(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-0.5">
                              <span>BACK PAN VERT (Y)</span>
                              <span>{idBackCropY}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="-50" 
                              max="50" 
                              value={idBackCropY} 
                              onChange={(e) => setIdBackCropY(Number(e.target.value))}
                              className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 bg-slate-100/50 p-2 rounded border border-slate-200/50 flex items-center justify-between">
                        <span>💡 Swap Front & Back Positions?</span>
                        <button
                          type="button"
                          onClick={() => {
                            // Swaps vertical offsets
                            const tempY = idFrontYOffset;
                            setIdFrontYOffset(idBackYOffset);
                            setIdBackYOffset(tempY);

                            // Swaps crop settings
                            const tempCX = idFrontCropX;
                            const tempCY = idFrontCropY;
                            const tempS = idFrontScale;
                            setIdFrontCropX(idBackCropX);
                            setIdFrontCropY(idBackCropY);
                            setIdFrontScale(idBackScale);
                            setIdBackCropX(tempCX);
                            setIdBackCropY(tempCY);
                            setIdBackScale(tempS);
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-sans font-bold text-[10px]"
                        >
                          Swap Places
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Standard Image Quality Exposure Sliders */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3.5 shadow-inner">
                    <span className="text-xs font-bold text-slate-600 font-mono uppercase block">
                      ⚙️ Image Quality Fine-Tuning
                    </span>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                          <span>EXPOSURE (BRIGHTNESS)</span>
                          <span>{brightness > 0 ? `+${brightness}` : brightness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="-40" 
                          max="40" 
                          value={brightness} 
                          onChange={(e) => setBrightness(Number(e.target.value))}
                          className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                          <span>CONTRAST STRETCH</span>
                          <span>{contrast > 0 ? `+${contrast}` : contrast}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="-40" 
                          max="40" 
                          value={contrast} 
                          onChange={(e) => setContrast(Number(e.target.value))}
                          className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg"
                        />
                      </div>

                      {(activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') && (
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                            <span>COLOR SATURATION</span>
                            <span>{saturation > 0 ? `+${saturation}` : saturation}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="-40" 
                            max="40" 
                            value={saturation} 
                            onChange={(e) => setSaturation(Number(e.target.value))}
                            className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {activeDoc.notes && (
                    <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
                      <p className="text-[10px] font-bold font-mono text-amber-800 uppercase flex items-center gap-1">
                        💬 Customer Note / Special Instructions:
                      </p>
                      <p className="text-[11px] text-slate-700 font-sans mt-1 leading-relaxed">
                        "{activeDoc.notes}"
                      </p>
                    </div>
                  )}

                </div>

                {/* Right Workspace Preview Stream Panel (Right 7 cols) */}
                <div className="md:col-span-7 bg-slate-800 rounded-2xl border border-slate-700 p-4 flex flex-col justify-between overflow-hidden relative group">
                  
                  {/* Status Overlay Info */}
                  <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-700 text-[9px] font-mono px-2.5 py-1.5 rounded-lg text-slate-300 shadow z-10 space-y-0.5">
                    <p className="flex items-center gap-1 text-emerald-400 font-bold uppercase">
                      <MonitorCheck className="w-3 h-3" /> Live Print Workspace
                    </p>
                    <p>Format: {activeDoc.type.includes('passport') ? '4"x6" Photo Sheet (Landscape)' : activeDoc.type.includes('4x6') ? '4"x6" Photo Single (Portrait)' : 'A4 Vertical Document Layout'}</p>
                  </div>

                  {/* High Quality Canvas Stream preview */}
                  <div className="flex-1 flex items-center justify-center p-2 mt-4">
                    <div className="bg-white p-2 shadow-2xl rounded border border-slate-200 overflow-hidden max-h-[360px] flex items-center justify-center">
                      <img
                        src={activeDoc.processedUrl}
                        alt="Workspace Stream"
                        className="max-h-[340px] max-w-full object-contain shadow-inner"
                      />
                    </div>
                  </div>

                  {/* Print Command footer bar */}
                  <div className="border-t border-slate-700/60 pt-3 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-slate-400 font-mono">STATUS: {activeDoc.status.toUpperCase()}</p>
                      <p className="text-[9px] text-slate-500 font-sans leading-tight">Ready for office printing setup.</p>
                    </div>

                    <button
                      onClick={() => {
                        console.log("Print button clicked!");
                        handlePrint(activeDoc);
                      }}
                      disabled={isProcessing || isRemovingBg}
                      className={`w-full sm:w-auto py-2.5 px-6 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-wider border cursor-pointer ${
                        (isProcessing || isRemovingBg)
                          ? 'bg-slate-600 border-slate-500 cursor-not-allowed opacity-75'
                          : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 border-emerald-500'
                      }`}
                    >
                      {isProcessing || isRemovingBg ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          Processing... (प्रोसेसिंग हो रही है)
                        </>
                      ) : (
                        <>
                          <Printer className="w-4 h-4 text-white" />
                          Print Alignment Page (प्रिंट करें)
                        </>
                      )}
                    </button>
                  </div>

                </div>

              </div>

            </div>
          ) : (
            /* CONNECTION WIDGET (No document is selected) */
            <div className="h-full flex flex-col items-center justify-center p-6 space-y-6">
              
              <div className="text-center max-w-md space-y-2">
                <div className="inline-flex p-3 bg-blue-50 border border-blue-100 rounded-2xl text-blue-600 mb-2">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="font-sans font-bold text-lg text-slate-800">ScanPro Print Workstation</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  The terminal is idle. Scan the QR code or share the customer portal link below to receive scans instantly.
                </p>
              </div>

              {/* STUNNING QR CODE CONNECTION PANEL */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 w-full max-w-sm shadow-sm flex flex-col items-center text-center space-y-4">
                
                {/* Real Dynamic QR Code Frame */}
                <div className="relative border-4 border-slate-300 p-2 bg-white rounded-xl shadow-inner w-32 h-32 flex items-center justify-center group overflow-hidden">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(customerPortalUrl)}`} 
                    alt="Scan to Connect"
                    className="w-full h-full object-contain"
                  />
                  {/* Subtle Scan Overlay Line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-blue-500 animate-bounce top-1/2" />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-700 font-sans">
                    Scan to Connect Customer Devices
                  </p>
                  <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto leading-normal">
                    Let customers scan this QR at the counter. They can instantly upload files/selfies without any app install!
                  </p>
                </div>

                {/* Display url */}
                <div className="bg-slate-200/60 rounded-xl p-2.5 w-full flex items-center justify-between border border-slate-300">
                  <span className="text-[9px] font-mono text-slate-600 truncate max-w-[180px]">
                    {window.location.origin}/?mode=customer
                  </span>
                  <button
                    onClick={copyCustomerLink}
                    className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-300/50 rounded transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold font-sans uppercase shrink-0 border border-slate-300"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>

                {/* Open in new tab tester */}
                <a
                  href={`${window.location.pathname}?mode=customer`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer border border-blue-500"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  TEST SCAN: OPEN CUSTOMER PORTAL
                </a>

                {/* Print Counter Poster button */}
                <button
                  type="button"
                  onClick={() => setIsSignboardModalOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-all shadow-sm border border-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  🖨️ PRINT DESK POSTER / QR CARD
                </button>

              </div>

            </div>
          )}
        </div>

      </div>

      {/* Supabase SQL Setup Modal */}
      {isSqlModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-fade-in text-slate-800">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400 animate-pulse" />
                <h3 className="font-sans font-bold text-sm text-white">
                  Configure Supabase Database Backend (डेटाबेस सेटअप गाइड)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6">
              
              {/* Quick instructions */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                <h4 className="font-sans font-bold text-indigo-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  Easy Supabase Steps (आसान निर्देश)
                </h4>
                <ol className="text-xs text-indigo-950 list-decimal pl-4 space-y-2">
                  <li>
                    Create a free project on <strong>Supabase</strong> (https://supabase.com).
                  </li>
                  <li>
                    Go to the <strong>SQL Editor</strong> tab in your Supabase Dashboard.
                  </li>
                  <li>
                    Paste the SQL script below and click <strong>Run</strong>. This will automatically set up your table <strong>AND configure your Supabase Storage Bucket ('documents') with public permissions!</strong>
                  </li>
                  <li>
                    Copy your <strong>Project URL</strong> and <strong>Anon Public API Key</strong>.
                  </li>
                  <li>
                    Add them as environment variables / secrets: <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, <strong>OR enter them in the form below</strong> for automatic configuration!
                  </li>
                </ol>
              </div>

              {/* Database Connection Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-left">
                <h4 className="font-sans font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-500" />
                  Connect Database (डेटाबेस क्रेडेंशियल भरें)
                </h4>
                <p className="text-xs text-slate-500">
                  Paste your Supabase Project details here. The app will automatically share these credentials with customer's mobile phone via the generated QR Code securely!
                </p>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                      SUPABASE PROJECT URL:
                    </label>
                    <input
                      type="text"
                      value={customSupaUrl}
                      onChange={(e) => setCustomSupaUrl(e.target.value)}
                      placeholder="https://yourprojectid.supabase.co"
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block">
                      SUPABASE ANON PUBLIC API KEY:
                    </label>
                    <input
                      type="password"
                      value={customSupaKey}
                      onChange={(e) => setCustomSupaKey(e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSaveSupaConfig}
                    disabled={supaSaved}
                    className={`text-xs font-bold px-4 py-2 rounded-lg transition-all active:scale-95 cursor-pointer shadow ${
                      supaSaved 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {supaSaved ? (
                      <span className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        SAVED & CONNECTING...
                      </span>
                    ) : (
                      'Save & Connect (सुरक्षित करें)'
                    )}
                  </button>
                </div>
              </div>

              {/* SQL script header & copy button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                    PostgreSQL Schema Setup Script
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer shadow"
                  >
                    {sqlCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        SQL COPIED!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        COPY SQL SCRIPT (कॉपी करें)
                      </>
                    )}
                  </button>
                </div>

                {/* Script box */}
                <div className="relative">
                  <pre className="bg-slate-950 text-slate-200 font-mono text-[11px] p-4 rounded-xl overflow-x-auto border border-slate-800 max-h-[250px] leading-relaxed select-all">
                    {supabaseSqlScript}
                  </pre>
                </div>
              </div>

              {/* Failsafe Note */}
              <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 text-[11px] text-slate-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Automatic Local Storage Failsafe Mode:</strong> If you do not configure your Supabase variables, the application will automatically run in local mode. All scans, crops, and processing will save inside your browser cache so the app remains 100% usable without crashing!
                </p>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCopySql}
                className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {sqlCopied ? 'Copied!' : 'Copy Schema SQL'}
              </button>
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs cursor-pointer transition-all"
              >
                Done / Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Voice Notification & Auto-Print Settings Modal */}
      {isVoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto text-slate-800">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-fade-in text-slate-800">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
                <h3 className="font-sans font-bold text-sm text-white">
                  🔊 Voice Alert & Auto-Print Configuration (आवाज़ एवं ऑटो-प्रिंट सेटिंग्स)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6">
              
              {/* Auto-Print Section */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="font-sans font-bold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      🖨️ Auto-Print Incoming Scans (ऑटो-प्रिंट सक्षम करें)
                    </h4>
                    <p className="text-[11px] text-emerald-700 font-sans">
                      Automatically open the print dialog the instant a customer sends a document!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAutoPrint}
                    className={`py-1.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      autoPrintEnabled 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {autoPrintEnabled ? 'ENABLED (सक्रिय)' : 'DISABLED (बंद)'}
                  </button>
                </div>

                {/* Chrome Kiosk Printing Setup Guide */}
                <div className="border-t border-emerald-200/60 pt-3 space-y-2">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase block font-mono">
                    💡 FOR 100% SILENT AUTO-PRINTING (बिना क्लिक किये डायरेक्ट प्रिंट के लिए):
                  </span>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                    By default, browsers show a confirmation screen before printing. To bypass this and achieve fully automatic silent printing, start Chrome in <strong>Kiosk Mode</strong>.
                  </p>
                  <div className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs font-mono space-y-1.5">
                    <p className="text-[10px] text-slate-400">// Run this command in Windows Command Prompt (Cmd) or Mac Terminal:</p>
                    <p className="text-emerald-400 select-all font-semibold">
                      chrome.exe --kiosk --kiosk-printing "{window.location.origin}"
                    </p>
                  </div>
                  <ol className="text-[10px] text-slate-500 list-decimal pl-4 space-y-1 font-sans">
                    <li>Close all open Chrome windows first.</li>
                    <li>Copy the command above, paste in your Terminal/Run window, and press Enter.</li>
                    <li>Now, whenever a customer uploads any document, the printer will instantly start printing without any popup!</li>
                  </ol>
                </div>
              </div>

              {/* Desktop Print Agent Section */}
              <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-100 rounded-2xl p-5 space-y-4 text-left shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-sans font-extrabold text-indigo-900 text-xs uppercase tracking-wider flex items-center gap-2">
                      <span className="flex items-center justify-center bg-indigo-100 p-1 rounded-lg">🤖</span>
                      Desktop Auto-Print Agent (डेस्कटॉप ऑटो-प्रिंट एजेंट)
                    </h4>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                      Run a dedicated background script on your shop's computer to print scans **100% automatically** and silently on your default printer, with absolutely no browser popups or manual clicks!
                    </p>
                  </div>
                  <a
                    href="/api/download-agent"
                    download="print-agent.py"
                    className="self-start inline-flex items-center gap-1.5 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-200 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Agent (.py)
                  </a>
                </div>

                <div className="bg-white/80 border border-indigo-50 rounded-xl p-4.5 space-y-3 text-xs leading-relaxed text-slate-700 font-sans">
                  <span className="font-bold text-indigo-950 block text-[10px] uppercase tracking-wider">
                    🛠️ Simple 3-Step Setup Instructions (आसान सेटअप):
                  </span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                        <span className="w-4.5 h-4.5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-[10px]">1</span>
                        Download Script
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Click the button above to download the <strong>print-agent.py</strong> script.
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                        <span className="w-4.5 h-4.5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-[10px]">2</span>
                        Install Python
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Make sure Python is installed on your PC (download from python.org if needed).
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                        <span className="w-4.5 h-4.5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-[10px]">3</span>
                        Run Print Agent
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono text-[9px] bg-slate-900 text-slate-200 p-1 px-1.5 rounded block select-all">
                        python print-agent.py
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Open cmd/terminal and run this command. It will connect to your shop instantly!
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-[10px] text-amber-800 flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>
                      <strong>हिन्दी निर्देश:</strong> इस स्क्रिप्ट को डाउनलोड करके अपने कंप्यूटर पर चलाएं। जैसे ही कोई कस्टमर डॉक्यूमेंट भेजेगा, यह आपके डिफ़ॉल्ट प्रिंटर से खुद-ब-खुद (डायरेक्ट प्रिंट) निकाल देगा! आपको ब्राउज़र में कुछ भी क्लिक करने की ज़रूरत नहीं पड़ेगी।
                    </span>
                  </div>
                </div>
              </div>

              {/* Voice alerts configuration */}
              <div className="space-y-4 text-left">
                <h4 className="font-sans font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                  <Volume2 className="w-4 h-4 text-emerald-500" />
                  Configure Voice Events (सभी दस्तावेज़ों के लिए अलग-अलग आवाज़ सेट करें)
                </h4>

                <div className="space-y-4">
                  {[
                    { id: 'document', title: '📄 Standard A4 Documents (सामान्य दस्तावेज़)' },
                    { id: 'id_card', title: '🪪 ID Cards & Aadhaar (आईडी कार्ड और आधार)' },
                    { id: 'passport', title: '📷 Passport Photos (पासपोर्ट साइज फोटो)' },
                    { id: 'processing', title: '⚡ Printing Processing (प्रिंट होना शुरू होने पर)' },
                    { id: 'complete', title: '✅ Printing Completed (प्रिंट पूरा होने पर)' },
                  ].map((event) => {
                    const cfg = voiceConfigs[event.id] || { mode: 'tts', ttsText: '', audioBase64: '' };
                    return (
                      <div key={event.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <span className="text-xs font-bold text-slate-800 font-sans">{event.title}</span>
                          
                          {/* Selector */}
                          <div className="flex bg-slate-200 p-0.5 rounded-lg text-[10px]">
                            {['tts', 'upload', 'beep', 'silent'].map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => {
                                  const updated = { ...cfg, mode };
                                  updateVoiceConfig(event.id, updated);
                                }}
                                className={`px-2.5 py-1 rounded-md font-bold uppercase transition-all cursor-pointer ${
                                  cfg.mode === mode 
                                    ? 'bg-white text-slate-800 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Settings depending on mode */}
                        {cfg.mode === 'tts' && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                              Text To Speak (हिंदी या अंग्रेजी में लिखें):
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={cfg.ttsText}
                                onChange={(e) => {
                                  const updated = { ...cfg, ttsText: e.target.value };
                                  updateVoiceConfig(event.id, updated);
                                }}
                                placeholder="जैसे: नया दस्तावेज़ आया है"
                                className="flex-1 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => playVoiceAlert(event.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow"
                              >
                                <Play className="w-3.5 h-3.5" />
                                Test
                              </button>
                            </div>
                          </div>
                        )}

                        {cfg.mode === 'upload' && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
                              Upload Audio File (अपनी आवाज़ रिकॉर्ड करके डालें):
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                              <input
                                type="file"
                                accept="audio/*"
                                onChange={(e) => handleAudioUpload(event.id, e.target.files?.[0] || null)}
                                className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                              />
                              
                              {cfg.audioFileName && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[150px] font-mono bg-slate-200/50 px-1.5 py-0.5 rounded">
                                  {cfg.audioFileName}
                                </span>
                              )}

                              {cfg.audioBase64 && (
                                <button
                                  type="button"
                                  onClick={() => playVoiceAlert(event.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow ml-auto sm:ml-0"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  Test Audio
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {cfg.mode === 'beep' && (
                          <div className="flex items-center justify-between text-xs text-slate-500 font-sans pt-1">
                            <span>Plays a classic retro sine oscillator chime sound.</span>
                            <button
                              type="button"
                              onClick={() => playVoiceAlert(event.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow"
                            >
                              <Play className="w-3.5 h-3.5" />
                              Test Beep
                            </button>
                          </div>
                        )}

                        {cfg.mode === 'silent' && (
                          <p className="text-[11px] text-slate-400 italic">This event is muted. No sound will play.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(false)}
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-bold text-xs cursor-pointer transition-all"
              >
                Save & Close (सुरक्षित करें)
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Printable Counter QR Signboard Modal */}
      {isSignboardModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-fade-in">
            
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="font-sans font-bold text-sm text-white">
                  Counter Poster / Signboard Print Preview
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSignboardModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body - Standee Mock */}
            <div className="p-6 bg-slate-100 overflow-y-auto max-h-[70vh] flex flex-col items-center">
              
              <p className="text-xs text-slate-500 font-sans text-center mb-4">
                This is how the counter standee card will print. Put it on your desk or stick it to your wall!
              </p>

              {/* Mock Printed Paper (A4 aspect-ratio mockup) */}
              <div className="bg-white border-2 border-slate-800 rounded-xl p-6 w-full max-w-[420px] shadow-lg flex flex-col justify-between aspect-[1/1.414] text-slate-800 font-sans relative">
                
                {/* Header */}
                <div className="text-center border-b-2 border-double border-slate-800 pb-3 mb-4">
                  <h4 className="text-lg font-black tracking-tight text-slate-900 leading-none">
                    ⚡ SCAN & PRINT PORTAL
                  </h4>
                  <h5 className="text-sm font-bold text-blue-800 mt-1">
                    दस्तावेज़ एवं फोटो डायरेक्ट प्रिंटर
                  </h5>
                  <p className="text-[9px] text-slate-500 mt-1 leading-normal font-sans">
                    Direct secure upload to our shop counter machine. No WhatsApp required.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="flex flex-col items-center my-3">
                  <div className="border-4 border-slate-900 p-2 bg-white rounded-lg shadow-sm w-32 h-32 flex items-center justify-center">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(customerPortalUrl)}`} 
                      alt="Customer Portal QR Code"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  <span className="text-[8px] font-mono bg-slate-100 px-2 py-0.5 mt-2 rounded max-w-full truncate text-slate-500">
                    {customerPortalUrl}
                  </span>
                </div>

                {/* Instructions */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] leading-snug space-y-2">
                  <p className="font-bold text-center border-b border-slate-200 pb-1 text-slate-800 text-[10px] uppercase">
                    👉 HOW TO PRINT / प्रिंट कैसे करें
                  </p>
                  
                  <div className="space-y-1.5 text-slate-700">
                    <div className="flex gap-1.5 items-start">
                      <span className="bg-slate-900 text-white font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] shrink-0 mt-0.5">1</span>
                      <p><strong>Scan QR Code:</strong> Open camera & scan the QR above.<br/><span className="text-[9px] text-slate-500">(क्यूआर कोड स्कैन करें)</span></p>
                    </div>
                    <div className="flex gap-1.5 items-start">
                      <span className="bg-slate-900 text-white font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] shrink-0 mt-0.5">2</span>
                      <p><strong>Upload Selfie or Files:</strong> Choose documents or a selfie.<br/><span className="text-[9px] text-slate-500">(फाइल अपलोड करें या सेल्फी लें)</span></p>
                    </div>
                    <div className="flex gap-1.5 items-start">
                      <span className="bg-slate-900 text-white font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] shrink-0 mt-0.5">3</span>
                      <p><strong>Submit Print:</strong> Direct send! Ask operator for prints.<br/><span className="text-[9px] text-slate-500">(भेजें और प्रिंट लें)</span></p>
                    </div>
                  </div>
                </div>

                {/* Footer branding */}
                <div className="border-t border-slate-300 pt-2 text-center mt-3 text-[8px] uppercase tracking-wider text-slate-500 font-bold">
                  Powered by ScanPro Workstation Terminal
                </div>

              </div>

            </div>

            {/* Modal Actions */}
            <div className="bg-slate-50 px-6 py-4 flex gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  console.log("Signboard print button clicked!");
                  handlePrintSignboard();
                }}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold text-xs tracking-wide shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer border border-blue-500"
              >
                <Printer className="w-4 h-4" />
                🖨️ PRINT COUNTER BOARD (A4 PAPER)
              </button>
              <button
                type="button"
                onClick={() => setIsSignboardModalOpen(false)}
                className="py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs cursor-pointer transition-all"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
