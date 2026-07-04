import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Printer, CheckCircle, Clock, Trash2, Maximize, AlertCircle, 
  Layers, Download, Calendar, ArrowRight, Eye, ShieldAlert, MonitorCheck,
  Sparkles, Crop, Sliders, Check, RefreshCw, Copy, ExternalLink, RefreshCw as RotateCw, X, Database,
  Volume2, Mic, Play, Settings, LayoutDashboard, QrCode, Search, Filter, MoreVertical, ChevronRight, Zap, Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

  // Copy scan link feedback state
  const [copied, setCopied] = useState<boolean>(false);

  // Active/selected document
  const activeDoc = documents.find(doc => doc.id === selectedDocId) || (documents.length > 0 ? documents[0] : null);

  // Filtered list
  const filteredDocs = documents;

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
      setBrightness(s?.brightness ?? 0);
      setContrast(s?.contrast ?? 0);
      setSaturation(0);
      setBackgroundColor(s?.backgroundColor ?? '#4285f4');
      setFuzziness(45);
      setHasBorder(s?.hasBorder ?? true);
      
      const cr = s?.cropRect || { x: 0, y: -15, width: 100, height: 100 };
      setCropScale(1.2);
      setCropX(cr.x ?? 0);
      setCropY(cr.y ?? -15);

      // Load AI background states from saved settings if they exist to prevent redundant api calls
      setBgRemovedImage(null);
      setUseRemoveBg(false);
      setRemoveBgError(null);
    } else {
      // Document / ID Card settings - NO AUTO-ENHANCE BY DEFAULT!
      const s = activeDoc.settings;
      setBrightness(s?.brightness ?? 0);
      setContrast(s?.contrast ?? 0);
      setDocAutoEnhanced(false);

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

        // Draw solid background color if removal is active
        if (useRemoveBg) {
          sCtx.fillStyle = backgroundColor;
          sCtx.fillRect(0, 0, singleW, singleH);
        } else {
          sCtx.fillStyle = '#ffffff';
          sCtx.fillRect(0, 0, singleW, singleH);
        }

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
        if (useRemoveBg && !bgRemovedImage) {
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
  const handleDownload = async (doc: ScannedDocument) => {
    try {
      const response = await fetch(doc.processedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document_${doc.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handlePrint = async (doc: ScannedDocument) => {
    console.log("handlePrint called for doc:", doc.id);
    playVoiceAlert('processing');

    let printImageUrl = doc.processedUrl;

    // 1. Fetch the image to get a Blob (this handles CORS and ensures image is fully loaded)
    try {
      const response = await fetch(doc.processedUrl);
      const blob = await response.blob();
      printImageUrl = window.URL.createObjectURL(blob);
      
      // Also trigger a normal download as requested by user
      console.log("Auto-download triggered removed as requested");
    } catch (e) {
      console.error("Fetch/Blob conversion failed:", e);
      // Fallback to original URL if fetch fails
    }

    const printArea = document.getElementById('print-area');
    if (!printArea) {
      const div = document.createElement('div');
      div.id = 'print-area';
      document.body.appendChild(div);
    }
    
    const targetPrintArea = document.getElementById('print-area')!;
    const isPassport8 = doc.type === 'passport_8_copy';

    if (!doc.processedUrl) {
      console.error("No image URL provided for printing!");
      return;
    }

    // Use a hidden iframe for more reliable printing (prevents blank pages and CSS leakage)
    let printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }

    const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!frameDoc) return;

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            @page {
              size: ${isPassport8 ? '6in 4in landscape' : (doc.type === 'photo_4x6' || doc.type === 'passport_4_copy') ? '4in 6in portrait' : 'A4 portrait'};
              margin: 0 !important;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
              height: 100vh;
              background-color: white;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              width: auto;
              height: auto;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          <img id="print-img" src="${printImageUrl}" />
          <script>
            const img = document.getElementById('print-img');
            img.onload = () => {
              window.focus();
              setTimeout(() => {
                window.print();
                window.parent.postMessage('print-done', '*');
              }, 500);
            };
            img.onerror = () => {
              window.parent.postMessage('print-error', '*');
            };
          </script>
        </body>
      </html>
    `);
    frameDoc.close();

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'print-done' || event.data === 'print-error') {
        window.removeEventListener('message', handleMessage);
        onUpdateStatus(doc.id, 'printed');
        setTimeout(() => playVoiceAlert('complete'), 500);
        if (printImageUrl.startsWith('blob:')) {
          window.URL.revokeObjectURL(printImageUrl);
        }
      }
    };
    window.addEventListener('message', handleMessage);
  };

  // remove.bg trigger
  const handleAutoEnhance = () => {
    if (docAutoEnhanced) {
      setBrightness(10);
      setContrast(15);
      setSaturation(12);
      setDocAutoEnhanced(false);
    } else {
      setBrightness(15);
      setContrast(45);
      setSaturation(14);
      setDocAutoEnhanced(true);
    }
  };

  const handleToggleRemoveBg = () => {
    if (useRemoveBg) {
      setUseRemoveBg(false);
    } else {
      triggerRemoveBg();
    }
  };

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
      if (err.message.includes('Insufficient credits')) {
        setRemoveBgError('remove.bg API account out of credits. Please check your remove.bg account or update your API key.');
        setUseRemoveBg(false); // Disable auto-removal
      } else {
        setRemoveBgError(err.message || "Error occurred during AI background removal");
      }
    } finally {
      setIsRemovingBg(false);
    }
  };

  // Reset state when active document changes
  useEffect(() => {
    setUseRemoveBg(false);
    setBgRemovedImage(null);
  }, [activeDoc?.id]);

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

  const downloadQrCode = async () => {
    const qrElement = document.getElementById('qr-download-area');
    if (!qrElement) {
      console.error("QR download area not found");
      return;
    }
    
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(qrElement, { 
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.download = `Shop_QR_Signboard.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("QR Download failed:", err);
    }
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
    <div id="merchant-portal" className="bg-slate-50 flex h-screen w-full overflow-hidden font-sans text-slate-900">
      
      {/* LEFT: PROFESSIONAL ENTERPRISE SIDEBAR (साइडबार) */}
      <aside className="w-20 lg:w-72 bg-slate-900 flex flex-col items-center lg:items-stretch transition-all duration-500 z-30 shadow-xl shrink-0 border-r border-slate-800">
        
        {/* Brand Header */}
        <div className="h-24 flex items-center gap-4 px-8 border-b border-slate-800/40">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shrink-0 group transition-transform hover:rotate-12">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-base font-black text-white tracking-tight leading-none font-display uppercase">SCANPRO <span className="text-blue-500 text-[10px] ml-1">v4.2</span></h1>
            <p className="text-[10px] text-slate-500 font-bold mt-1.5 tracking-[0.2em] uppercase">Enterprise Terminal</p>
          </div>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="pb-3 px-4 hidden lg:block">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Operational Area</span>
          </div>
          
          <button 
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 rounded-2xl transition-all group relative overflow-hidden bg-blue-600/10 text-blue-400 border border-blue-500/20"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
            <LayoutDashboard className="w-5 h-5 text-blue-400" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Workspace</span>
              <span className="block text-[9px] font-bold opacity-50">वर्कस्पेस टर्मिनल</span>
            </div>
          </button>

          <button 
            onClick={downloadQrCode}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-2xl transition-all group border border-transparent hover:border-emerald-500/20"
          >
            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Save QR Code</span>
              <span className="block text-[9px] font-bold opacity-50">क्यूआर कोड डाउनलोड</span>
            </div>
          </button>

          <div className="pt-8 pb-3 px-4 hidden lg:block">
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Core System</span>
          </div>

          <button 
            onClick={() => setIsSignboardModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:bg-slate-800/30 hover:text-white rounded-2xl transition-all group border border-transparent"
          >
            <QrCode className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Signboard</span>
              <span className="block text-[9px] font-bold opacity-50">शॉप पोस्टर प्रिंट</span>
            </div>
          </button>

          <button 
            onClick={() => setIsVoiceModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-2xl transition-all group border border-transparent"
          >
            <Volume2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Audio Alerts</span>
              <span className="block text-[9px] font-bold opacity-50">आवाज़ नोटिफिकेशन</span>
            </div>
          </button>

          <button 
            onClick={() => setIsSqlModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-2xl transition-all group border border-transparent"
          >
            <Database className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Cloud Data</span>
              <span className="block text-[9px] font-bold opacity-50">डेटाबेस सेटअप</span>
            </div>
          </button>

          <div className="pt-8 px-4">
            <button 
              onClick={handleToggleAutoPrint}
              className={`w-full flex items-center justify-center lg:justify-between px-4 py-4 rounded-2xl transition-all group border ${
                autoPrintEnabled 
                  ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/30' 
                  : 'text-slate-500 hover:bg-slate-800/30 hover:text-slate-300 border-transparent'
              }`}
            >
              <div className="flex items-center gap-4">
                <RefreshCw className={`w-5 h-5 ${autoPrintEnabled ? 'animate-spin-slow' : 'group-hover:scale-110 transition-transform'}`} />
                <div className="hidden lg:block text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">Auto-Print</span>
                  <span className="block text-[8px] font-bold opacity-50 tracking-widest uppercase">Smart Stream</span>
                </div>
              </div>
              <div className={`hidden lg:block w-10 h-5 rounded-full relative transition-all shadow-inner ${autoPrintEnabled ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-lg ${autoPrintEnabled ? 'left-6' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer - System Health */}
        <div className="p-6 border-t border-slate-800 bg-black/20 w-full space-y-4">
          <div className="hidden lg:block space-y-3">
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
              <span className="text-slate-500">System Health</span>
              <span className="text-emerald-500">Stable</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[94%] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-start gap-4 px-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-slate-400 font-bold text-xs border border-slate-700/50 shrink-0 shadow-lg">
              AD
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-[11px] font-black text-white truncate uppercase tracking-tighter">Admin Terminal</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
                <p className="text-[8px] text-slate-500 font-mono uppercase font-bold tracking-widest">Station #01 Online</p>
              </div>
            </div>
          </div>

          {onResetDatabase && (
            <button
              onClick={onResetDatabase}
              className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-rose-500/70 hover:bg-rose-500/10 hover:text-rose-500 transition-all cursor-pointer text-[9px] font-black uppercase tracking-widest border border-transparent hover:border-rose-500/20"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden lg:block">System Factory Reset</span>
            </button>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full bg-[#f8fafc]">
        
        {/* Top Professional Header */}
        <header className="h-24 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-10 flex items-center justify-between z-20 shrink-0 sticky top-0">
          <div className="flex items-center gap-8">
            <div className="hidden xl:block">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 uppercase font-display">
                Job Stream
                <span className="bg-blue-600 text-[10px] px-2 py-0.5 rounded-full text-white font-black tracking-widest uppercase shadow-lg shadow-blue-500/20">
                  Live
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Enterprise Terminal Station 01</p>
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${dbMode === 'local' ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'}`} />
                  <span className={`text-[9px] font-black tracking-widest uppercase ${dbMode === 'local' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {dbMode === 'local' ? 'Offline Storage' : 'Cloud Synchronized'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="flex items-center gap-4 bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                All Jobs ({documents.length})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search terminal jobs..."
                className="bg-slate-100 border-none rounded-2xl pl-11 pr-6 py-3 text-sm font-medium w-64 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none text-slate-700 placeholder:text-slate-400"
              />
            </div>
            
            <div className="h-10 w-px bg-slate-200 mx-2" />
            
            <button 
              onClick={copyCustomerLink}
              className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-600 hover:text-white transition-all relative group"
              title="Copy Customer Link"
            >
              <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {copied && <span className="absolute -bottom-10 bg-slate-900 text-white text-[10px] px-2 py-1 rounded">Copied!</span>}
            </button>
            
            <button className="h-11 px-5 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2">
              System Console
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* Primary Workspace Dashboard */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: JOB STREAM (स्क्रॉलिंग लिस्ट) */}
          <section className="w-[240px] shrink-0 flex flex-col border-r border-slate-200/60 bg-white z-10">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Terminal Queue</h3>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><Filter className="w-3.5 h-3.5" /></button>
                <button className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><RotateCw className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 bg-[#fbfcfd]">
              <AnimatePresence mode="popLayout">
                {filteredDocs.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center opacity-40 py-20 px-10 text-center"
                  >
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                      <MonitorCheck className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Buffer Empty</p>
                    <p className="text-xs font-medium text-slate-400 mt-2">Standing by for incoming scan requests...</p>
                  </motion.div>
                ) : (
                  filteredDocs.map((doc, idx) => {
                    const isSelected = activeDoc?.id === doc.id;
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.05 }}
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`group relative p-3 rounded-[24px] border transition-all cursor-pointer overflow-hidden ${
                          isSelected 
                            ? 'bg-white border-blue-500/30 shadow-[0_10px_20px_rgba(0,0,0,0.05)] ring-1 ring-blue-500/10' 
                            : 'bg-transparent border-transparent hover:bg-white hover:border-slate-200'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 shadow-[1px_0_5px_rgba(37,99,235,0.3)]" />
                        )}
                        
                        <div className="flex gap-4 relative">
                          <div className="w-16 h-16 bg-slate-100 rounded-[20px] overflow-hidden shadow-inner shrink-0 relative group-hover:rotate-1 transition-transform">
                            <img src={doc.processedUrl} className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700" alt="Job" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            {doc.status === 'printed' && (
                              <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-md ring-1 ring-white">
                                <Check className="w-2 h-2" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 flex flex-col min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest truncate">{doc.id.slice(0, 8)}</p>
                                  <div className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(doc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <h4 className="text-sm font-black text-slate-900 truncate tracking-tight uppercase leading-tight">{doc.name || 'Untitled Entry'}</h4>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                                className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-rose-500 hover:bg-rose-50 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            
                            <div className="flex items-center justify-between mt-4">
                              <div className="flex flex-wrap gap-2">
                                <span className={`text-[8px] font-black px-2.5 py-1 rounded-full tracking-widest uppercase border-2 shadow-sm ${
                                  doc.status === 'pending' 
                                    ? 'bg-amber-50 text-amber-600 border-amber-200/50' 
                                    : 'bg-emerald-50 text-emerald-600 border-emerald-200/50'
                                }`}>
                                  {doc.status}
                                </span>
                                <span className="text-[8px] font-black text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-200/50">
                                  {doc.type.toUpperCase().replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* RIGHT: JOB INSPECTION & RENDERING (डिटेल्स व्यू) */}
          <section className="flex-1 flex flex-col bg-white overflow-hidden relative p-4 lg:p-6 gap-6">
            <AnimatePresence mode="wait">
              {activeDoc ? (
                <motion.div 
                  key={activeDoc.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-slate-200/60 shadow-sm"
                >
                  {/* Active Job Toolbar */}
                  <div className="h-16 border-b border-slate-200/60 flex items-center justify-between px-6 bg-white/50 backdrop-blur-xl relative z-20 rounded-t-3xl">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 shrink-0 shadow-sm">
                          <Maximize className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none uppercase font-display">{activeDoc.name || 'Job Inspector'}</h3>
                          <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-[0.2em]">Stream: <span className="text-blue-600">Active</span> // <span className="text-slate-300 font-mono">{activeDoc.id.slice(0, 12)}</span></p>
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200" />
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Category</span>
                          <span className="text-[10px] font-black text-slate-700 mt-0.5 uppercase tracking-tighter">{activeDoc.type.replace('_', ' ')}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Date</span>
                          <span className="text-[10px] font-black text-slate-700 mt-0.5 uppercase tracking-tighter">{new Date(activeDoc.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => onDeleteDocument(activeDoc.id)}
                        className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-all flex items-center justify-center group shadow-sm"
                        aria-label="Delete document"
                      >
                        <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      </button>
                      <div className="h-8 w-px bg-slate-200 mx-1" />
                      <button 
                        onClick={() => handleDownload(activeDoc)}
                        className="h-8 px-4 rounded-xl bg-slate-100 text-slate-700 font-black text-[9px] uppercase tracking-[0.2em] shadow-sm flex items-center gap-1.5 transition-all hover:bg-slate-200 active:scale-95 group"
                        aria-label="Download document"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      <button 
                        onClick={() => handlePrint(activeDoc)}
                        disabled={isProcessing}
                        className="h-8 px-6 rounded-xl bg-blue-600 text-white font-black text-[9px] uppercase tracking-[0.2em] shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:grayscale group"
                        aria-label="Print document"
                      >
                        <Printer className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                        Print
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden bg-white">
                    {/* Controls Column */}
                    <div className="w-[300px] border-r border-slate-200/60 flex flex-col bg-white overflow-y-auto custom-scrollbar">
                      <div className="p-6 space-y-8">
                        
                        {/* Layout Selector Module */}
                        {(activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') && (
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Calibration Profile</h4>
                            <div className="grid grid-cols-1 gap-2">
                              {[
                                { id: 'passport_8_copy', label: '8x Grid Array', sub: 'ISO Portrait Matrix' },
                                { id: 'passport_4_copy', label: '4x Grid Array', sub: 'Vertical Array' },
                                { id: 'photo_4x6', label: 'Single Node 4x6', sub: 'Standard Precision' }
                              ].map(opt => (
                                <button
                                  key={opt.id}
                                  onClick={() => onUpdateDocument({ ...activeDoc, type: opt.id as DocType, name: opt.label })}
                                  className={`w-full p-3 rounded-2xl border transition-all text-left group relative overflow-hidden ${
                                    activeDoc.type === opt.id 
                                      ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20' 
                                      : 'bg-slate-50 border-transparent hover:border-slate-200 text-slate-500'
                                  }`}
                                >
                                  {activeDoc.type === opt.id && <div className="absolute top-0 right-0 p-3"><Check className="w-3 h-3 text-white/50" /></div>}
                                  <div className="relative z-10">
                                    <p className="text-[10px] font-black uppercase tracking-wider">{opt.label}</p>
                                    <p className={`text-[9px] font-bold mt-0.5 ${activeDoc.type === opt.id ? 'text-blue-100' : 'text-slate-400'}`}>{opt.sub}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Processing Engine Module */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Neural Enhancement</h4>
                          </div>

                          {removeBgError && (
                            <div className="bg-rose-50 border border-rose-100 p-2 rounded-xl text-[9px] text-rose-600 font-bold leading-tight">
                              AI Background removal failed: {removeBgError}. 
                            </div>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={handleAutoEnhance}
                              className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 text-center group ${
                                docAutoEnhanced 
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20' 
                                  : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${docAutoEnhanced ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                                <Sparkles className={`w-4 h-4 ${docAutoEnhanced ? 'text-white' : 'text-blue-500'}`} />
                              </div>
                              <span className="text-[9px] font-black uppercase tracking-widest">Auto HD</span>
                            </button>
                            
                            <button 
                              onClick={() => setUseRemoveBg(!useRemoveBg)}
                              className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 text-center group ${
                                useRemoveBg 
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-500/20' 
                                  : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${useRemoveBg ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                                <MonitorCheck className={`w-4 h-4 ${useRemoveBg ? 'text-white' : 'text-emerald-500'}`} />
                              </div>
                              <span className="text-[9px] font-black uppercase tracking-widest">BG: {useRemoveBg ? 'ON' : 'OFF'}</span>
                            </button>
                            
                            <button 
                              onClick={triggerRemoveBg}
                              disabled={isRemovingBg || !useRemoveBg}
                              className={`p-3 rounded-2xl border transition-all flex flex-col items-center gap-2 text-center group col-span-2 ${
                                isRemovingBg
                                  ? 'bg-slate-50 border-slate-200'
                                  : useRemoveBg 
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-500/20' 
                                    : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'
                              }`}
                            >
                              <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                {isRemovingBg ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MonitorCheck className="w-3 h-3" />}
                                Clear Background
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Hardware Tuning Module */}
                        <div className="space-y-6 pb-10">
                          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 pb-4">Hardware Signal</h4>
                          <div className="space-y-8">
                            {[
                              { label: 'Brightness', val: brightness, min: -50, max: 50, set: setBrightness, color: 'bg-amber-400' },
                              { label: 'Contrast', val: contrast, min: -50, max: 50, set: setContrast, color: 'bg-blue-400' },
                              { label: 'Saturation', val: saturation, min: -50, max: 50, set: setSaturation, color: 'bg-rose-400' }
                            ].map((sl, i) => (
                              <div key={i} className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{sl.label}</label>
                                  <span className="text-[10px] font-black px-2 py-1 rounded bg-slate-100 text-slate-900 font-mono border border-slate-200">
                                    {sl.val > 0 ? `+${sl.val}` : sl.val}
                                  </span>
                                </div>
                                <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <input 
                                    type="range" min={sl.min} max={sl.max} value={sl.val}
                                    onChange={(e) => sl.set(parseInt(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                  />
                                  <motion.div 
                                    className={`absolute left-0 top-0 h-full ${sl.color}`}
                                    animate={{ width: `${((sl.val + 50) / 100) * 100}%` }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rendering Stage */}
                    <div className="flex-1 bg-[#f8fafc] p-16 flex flex-col items-center justify-center relative overflow-hidden">
                      {/* Pattern Background */}
                      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                      
                      <div className="absolute top-10 left-10 flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] select-none">Live Canvas Pipeline // Enterprise</span>
                      </div>
                      
                      <div className="relative shadow-[0_50px_100px_rgba(0,0,0,0.12)] rounded-2xl overflow-hidden bg-white ring-8 ring-black/5 group">
                        {isProcessing && (
                          <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-30 flex flex-col items-center justify-center">
                            <div className="relative">
                              <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full" 
                              />
                              <div className="absolute inset-0 m-auto w-6 h-6 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-blue-600 animate-pulse" />
                              </div>
                            </div>
                            <p className="mt-6 text-[10px] font-black text-slate-900 tracking-widest uppercase">Processing Assets...</p>
                          </div>
                        )}
                        
                        <div className="max-w-full max-h-[60vh] flex items-center justify-center bg-[#eef2f6]">
                          <img 
                            id="processed-preview"
                            src={activeDoc.processedUrl} 
                            className="max-w-full max-h-full object-contain shadow-2xl"
                            alt="Preview"
                          />
                        </div>
                      </div>

                      {/* View Controls Floating Bar */}
                      <motion.div 
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="mt-16 bg-white/80 backdrop-blur-xl px-10 py-5 rounded-[40px] border border-slate-200 shadow-2xl flex items-center gap-10 relative z-30"
                      >
                        <div className="flex flex-col items-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Optical Scale</p>
                          <div className="flex items-center gap-4">
                            <button onClick={() => setCropScale(s => Math.max(0.5, s - 0.1))} className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-all active:scale-90">-</button>
                            <span className="text-[13px] font-black font-mono w-14 text-center text-blue-600">{(cropScale * 100).toFixed(0)}%</span>
                            <button onClick={() => setCropScale(s => Math.min(3, s + 0.1))} className="w-10 h-10 rounded-2xl bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-all active:scale-90">+</button>
                          </div>
                        </div>
                        
                        <div className="h-12 w-px bg-slate-200" />
                        
                        <button 
                          onClick={() => {
                            setBrightness(0); setContrast(0); setSaturation(0);
                            setCropScale(1.0); setCropX(0); setCropY(0);
                            setUseRemoveBg(false);
                          }}
                          className="flex flex-col items-center group transition-all hover:-translate-y-1 active:scale-95"
                        >
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 group-hover:text-blue-600 transition-colors">Reset Tuning</p>
                          <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <RefreshCw className="w-5 h-5" />
                          </div>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center p-20 bg-white relative overflow-hidden"
                >
                  <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-40 h-40 bg-slate-50 rounded-[56px] shadow-2xl flex items-center justify-center text-slate-200 mb-12 rotate-6 animate-float group transition-all duration-700 hover:rotate-0">
                      <div className="w-24 h-24 rounded-[40px] bg-blue-50 flex items-center justify-center border border-blue-100 group-hover:scale-110 transition-transform duration-700">
                        <Terminal className="w-12 h-12 text-blue-300" />
                      </div>
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight uppercase font-display">System Standby</h3>
                    <p className="text-slate-400 mt-6 max-w-[450px] text-sm font-bold leading-relaxed uppercase tracking-[0.2em]">
                      Uplink established. Sector Station 01 is online and waiting for scan requests from nodes.
                    </p>
                    
                    <div className="mt-16 grid grid-cols-2 gap-8">
                      <div className="bg-slate-50 px-10 py-7 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center group transition-all hover:border-blue-200">
                        <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">Signal Health</p>
                        <p className="text-sm font-black text-emerald-500 uppercase flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                          Optimal
                        </p>
                      </div>
                      <div className="bg-slate-50 px-10 py-7 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center group transition-all hover:border-blue-200">
                        <p className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">Core Load</p>
                        <p className="text-sm font-black text-slate-400 uppercase font-mono tracking-tighter">0.4% // Nominal</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

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
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadQrCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg shadow-green-900/20"
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD QR
                </button>
                <button
                  type="button"
                  onClick={() => setIsSignboardModalOpen(false)}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body - Standee Mock */}
            <div className="p-6 bg-slate-100 overflow-y-auto max-h-[70vh] flex flex-col items-center">
              
              <p className="text-xs text-slate-500 font-sans text-center mb-4">
                This is how the counter standee card will print. Put it on your desk or stick it to your wall!
              </p>

              {/* Mock Printed Paper (A4 aspect-ratio mockup) */}
              <div id="qr-download-area" className="bg-white border-2 border-slate-800 rounded-xl p-6 w-full max-w-[420px] shadow-lg flex flex-col justify-between aspect-[1/1.414] text-slate-800 font-sans relative">
                
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
