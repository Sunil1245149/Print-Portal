import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  onUpdateStatus: (id: string, status: 'queued' | 'pending' | 'printed') => void;
  onDeleteDocument: (id: string) => void;
  onUpdateDocument: (updatedDoc: ScannedDocument) => void;
  onResetDatabase?: () => void;
  onRefresh?: () => Promise<void>;
  lastSyncTime?: string;
  dbMode?: 'cloud' | 'local';
  onChangeDbMode?: (mode: 'cloud' | 'local') => void;
  isCloudQuotaExceeded?: boolean;
}

export default function MerchantPortal({ 
  documents, 
  onUpdateStatus, 
  onDeleteDocument,
  onUpdateDocument,
  onResetDatabase,
  onRefresh,
  lastSyncTime,
  dbMode = 'cloud',
  onChangeDbMode,
  isCloudQuotaExceeded = false
}: MerchantPortalProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const autoBgRemovedDocs = useRef<Set<string>>(new Set());
  const autoIDCroppedDocs = useRef<Set<string>>(new Set());

  // Copy scan link feedback state
  const [copied, setCopied] = useState<boolean>(false);

  // Active/selected document
  const activeDoc = documents.find(doc => doc.id === selectedDocId) || (documents.length > 0 ? documents[0] : null);

  // Filter state (Persisted per terminal)
  const [filterType, setFilterType] = useState<'all' | 'documents' | 'photos'>(() => {
    return (localStorage.getItem('terminal_role') as any) || 'photos';
  });

  const handleSetFilterType = (val: 'all' | 'documents' | 'photos') => {
    setFilterType(val);
    localStorage.setItem('terminal_role', val);
  };

  // Filtered list
  const filteredDocs = documents.filter(doc => {
    if (filterType === 'all') return true;
    if (filterType === 'documents') return doc.type === 'document';
    if (filterType === 'photos') return doc.type !== 'document';
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
  const [idFrontBrightness, setIdFrontBrightness] = useState<number>(0);
  const [idBackBrightness, setIdBackBrightness] = useState<number>(0);
  const [idFrontContrast, setIdFrontContrast] = useState<number>(0);
  const [idBackContrast, setIdBackContrast] = useState<number>(0);
  const lastUploadedSettingsRef = useRef<string>('');

  // remove.bg States
  const [isRemovingBg, setIsRemovingBg] = useState<boolean>(false);
  const [bgRemovedImage, setBgRemovedImage] = useState<string | null>(null);
  const [useRemoveBg, setUseRemoveBg] = useState<boolean>(false);
  const [removeBgError, setRemoveBgError] = useState<string | null>(null);

  // Auto-Print Queue & Rendering States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingAutoPrintDocId, setPendingAutoPrintDocId] = useState<string | null>(null);

  // Auto-enhance state for documents
  const [docAutoEnhanced, setDocAutoEnhanced] = useState<boolean>(false);

  // Signboard print modal state
  // Signboard print modal state
  const [isSignboardModalOpen, setIsSignboardModalOpen] = useState<boolean>(false);

  // remove.bg API Key state
  const [removeBgApiKey, setRemoveBgApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('print_shop_remove_bg_api_key') || '';
    } catch (e) {
      return '';
    }
  });

  const settingsSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const syncSettingsToCloud = useCallback((settings: any) => {
    if (settingsSyncTimeoutRef.current) {
      clearTimeout(settingsSyncTimeoutRef.current);
    }

    settingsSyncTimeoutRef.current = setTimeout(async () => {
      if (isCloudQuotaExceeded) return;
      try {
        const docRef = doc(db, 'documents', 'merchant_settings');
        await setDoc(docRef, settings, { merge: true });
        console.log("[MerchantPortal] Settings synced to cloud.");
      } catch (err) {
        console.warn("Failed to sync settings to Firestore:", err);
      }
    }, 5000); // 5 second debounce for settings
  }, []);

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

    // Debounced Firestore sync
    syncSettingsToCloud({ removeBgApiKey: val });
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

    // Debounced Firestore sync
    syncSettingsToCloud({ autoPrintEnabled: newVal });
  };

  // Voice configurations state
  const defaultTexts: Record<string, string> = {
    passport: "नया पासपोर्ट फोटो प्राप्त हुआ है।",
    document: "नया दस्तावेज़ प्राप्त हुआ है।",
    processing: "प्रिंटिंग शुरू हो रही है, कृपया प्रतीक्षा करें।",
    complete: "प्रिंट पूरा हो गया है, धन्यवाद!"
  };

  const [voiceConfigs, setVoiceConfigs] = useState<Record<string, { mode: string; ttsText: string; audioBase64: string; audioFileName?: string }>>(() => {
    const categories = ['passport', 'document', 'processing', 'complete'];
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

    // Debounced Firestore sync
    syncSettingsToCloud({ voiceConfigs: nextConfigs });
  };

  // Fetch configurations from server API and Firestore on mount
  useEffect(() => {
    // Pre-load voices for TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }

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
        // Priority: Hindi -> Indian English -> Any English -> First Available
        const hindiVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('HI')) ||
                           voices.find(v => v.lang.includes('en-IN')) ||
                           voices.find(v => v.lang.includes('en')) ||
                           voices[0];
        
        if (hindiVoice) {
          utterance.voice = hindiVoice;
          utterance.lang = hindiVoice.lang;
        } else {
          utterance.lang = 'hi-IN';
        }
        
        utterance.rate = 0.95;
        utterance.volume = 1;
        
        // Cancel any pending speech to avoid queuing
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


  // Customer Portal URL
  const customerPortalUrl = React.useMemo(() => {
    return `${window.location.origin}${window.location.pathname}?mode=customer`;
  }, []);


  const handleDownloadAgent = async () => {
    try {
      const response = await fetch('/api/download-agent');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'print-agent.py';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Agent download failed:", err);
      // Fallback to direct link if fetch fails
      window.open('/api/download-agent', '_blank');
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
      setBackgroundColor(s?.backgroundColor ?? '#ffffff');
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
      setIdFrontBrightness(s?.idFrontBrightness ?? 0);
      setIdBackBrightness(s?.idBackBrightness ?? 0);
      setIdFrontContrast(s?.idFrontContrast ?? 0);
      setIdBackContrast(s?.idBackContrast ?? 0);
    }

    // Update ref to current state to prevent immediate re-sync loop on doc switch
    lastUploadedSettingsRef.current = JSON.stringify({
      id: activeDoc.id,
      type: activeDoc.type,
      brightness: activeDoc.settings?.brightness ?? (activeDoc.type.includes('passport') ? 0 : 0),
      contrast: activeDoc.settings?.contrast ?? (activeDoc.type.includes('passport') ? 0 : 0),
      saturation: 0,
      backgroundColor: activeDoc.settings?.backgroundColor ?? '#ffffff',
      fuzziness: 45,
      hasBorder: activeDoc.settings?.hasBorder ?? true,
      cropScale: 1.2,
      cropX: activeDoc.settings?.cropRect?.x ?? 0,
      cropY: activeDoc.settings?.cropRect?.y ?? (activeDoc.type.includes('passport') ? -15 : 0),
      useRemoveBg: false,
      idFrontCropX: activeDoc.settings?.idFrontCropX ?? 0,
      idFrontCropY: activeDoc.settings?.idFrontCropY ?? 0,
      idFrontScale: activeDoc.settings?.idFrontScale ?? 1.1,
      idBackCropX: activeDoc.settings?.idBackCropX ?? 0,
      idBackCropY: activeDoc.settings?.idBackCropY ?? 0,
      idBackScale: activeDoc.settings?.idBackScale ?? 1.1,
      idFrontYOffset: activeDoc.settings?.idFrontYOffset ?? 0,
      idBackYOffset: activeDoc.settings?.idBackYOffset ?? 0,
      idFrontBrightness: activeDoc.settings?.idFrontBrightness ?? 0,
      idBackBrightness: activeDoc.settings?.idBackBrightness ?? 0,
      idFrontContrast: activeDoc.settings?.idFrontContrast ?? 0,
      idBackContrast: activeDoc.settings?.idBackContrast ?? 0
    });
  }, [activeDoc?.id]);

  // Monitor incoming documents to trigger the voice notification and auto-print registration
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (documents.length === 0) {
      isFirstRender.current = false;
      return;
    }

    // Initialize seenDocIds on first load with documents that already exist
    if (isFirstRender.current) {
      setSeenDocIds(documents.map(d => d.id));
      isFirstRender.current = false;
      return;
    }

    const newDocs = documents.filter(d => !seenDocIds.includes(d.id));
    if (newDocs.length > 0) {
      // Update seenDocIds with all current documents
      setSeenDocIds(documents.map(d => d.id));

      const latest = newDocs[0];
      
      // Determine the voice category based on the document type
      let category = 'document';
      if (latest.type.includes('passport') || latest.type === 'photo_4x6') {
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
    // OR if it is still in the 'queued' state
    const isStillRaw = currentDoc.status === 'queued' || currentDoc.processedUrl === currentDoc.originalUrl;

    if (!isWorking && !isStillRaw) {
      console.log(`[Auto-Print Engine] Document ${currentDoc.id} is fully processed and ready! Launching print...`);
      setPendingAutoPrintDocId(null); // Clear pending cue
      handlePrint(currentDoc);
    }
  }, [pendingAutoPrintDocId, documents, isProcessing, isRemovingBg]);

  // ---------------------------------------------------------
  // BACKGROUND AUTO-BAKE ENGINE
  // Automatically processes 'queued' docs into 'pending'
  // ---------------------------------------------------------
  // Background processing effect for 'queued' documents
  const processingRef = useRef<string | null>(null);

  useEffect(() => {
    // Look for any 'queued' document that isn't the one the user is currently editing
    const docToProcess = documents.find(d => d.status === 'queued' && d.id !== activeDoc?.id);
    if (!docToProcess || processingRef.current === docToProcess.id) return;

    processingRef.current = docToProcess.id;
    console.log(`[Background Bake] Starting auto-process for ${docToProcess.id} (${docToProcess.type})`);

    // If it's a PDF or already processed, just promote to pending
    if (docToProcess.originalUrl.startsWith('data:application/pdf') || docToProcess.type === 'document') {
      console.log(`[Background Bake] Skipping image processing for PDF/Document ${docToProcess.id}`);
      onUpdateDocument({ ...docToProcess, status: 'pending' });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (docToProcess.type === 'passport_8_copy' || docToProcess.type === 'passport_4_copy' || docToProcess.type === 'photo_4x6') {
        // Auto-bake Passport/Photo types
        const brightness = docToProcess.settings?.brightness ?? 10;
        const contrast = docToProcess.settings?.contrast ?? 10;
        
        const procCanvas = document.createElement('canvas');
        const procCtx = procCanvas.getContext('2d');
        if (!procCtx) return;
        procCanvas.width = img.width;
        procCanvas.height = img.height;
        procCtx.drawImage(img, 0, 0);
        applyFilters(procCtx, img.width, img.height, brightness, contrast, 0);
        const singleDataUrl = procCanvas.toDataURL('image/jpeg', 0.7);

        const finalize = (tiledUrl: string) => {
          onUpdateDocument({
            ...docToProcess,
            processedUrl: tiledUrl,
            status: 'pending',
            settings: { ...docToProcess.settings, brightness, contrast }
          });
        };

        if (docToProcess.type === 'passport_8_copy') {
          create8CopySheet(singleDataUrl, finalize);
        } else if (docToProcess.type === 'passport_4_copy') {
          create4CopySheet(singleDataUrl, finalize);
        } else {
          // 4x6 Photo
          const photoCanvas = document.createElement('canvas');
          photoCanvas.width = 1200;
          photoCanvas.height = 1800;
          const pCtx = photoCanvas.getContext('2d');
          if (pCtx) {
            pCtx.fillStyle = 'white';
            pCtx.fillRect(0, 0, 1200, 1800);
            pCtx.drawImage(procCanvas, 100, 150, 1000, 1500);
            finalize(photoCanvas.toDataURL('image/jpeg', 0.7));
          }
        }
      } else {
        // Standard document
        onUpdateDocument({ ...docToProcess, status: 'pending' });
      }
    };
    img.onerror = () => {
      // Fallback: just promote so it doesn't stay stuck
      onUpdateDocument({ ...docToProcess, status: 'pending' });
    };
    img.src = docToProcess.originalUrl;
  }, [documents, activeDoc?.id]);

  // Reactive Off-Screen Render Loop for updating processedUrl dynamically
  useEffect(() => {
    if (!activeDoc) return;

    const currentSettingsKey = JSON.stringify({
      id: activeDoc.id,
      type: activeDoc.type,
      brightness, contrast, saturation, backgroundColor, fuzziness,
      hasBorder, cropScale, cropX, cropY, useRemoveBg,
      idFrontCropX, idFrontCropY, idFrontScale, idBackCropX, idBackCropY, idBackScale, idFrontYOffset, idBackYOffset,
      idFrontBrightness, idBackBrightness, idFrontContrast, idBackContrast
    });

    // Avoid loops if settings haven't actually changed
    if (lastUploadedSettingsRef.current === currentSettingsKey && activeDoc.status !== 'queued') {
      return;
    }

    const debounceTimer = setTimeout(() => {
      if (isProcessing) return;
      setIsProcessing(true);
      setIsSyncing(true);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (activeDoc.type === 'passport_8_copy' || activeDoc.type === 'passport_4_copy' || activeDoc.type === 'photo_4x6') {
          // ... (keep existing logic)
          const isSinglePhoto = activeDoc.type === 'photo_4x6';
          const singleW = isSinglePhoto ? 1200 : 350;
          const singleH = isSinglePhoto ? 1800 : 450;
          
          const singleCanvas = document.createElement('canvas');
          singleCanvas.width = singleW;
          singleCanvas.height = singleH;
          const sCtx = singleCanvas.getContext('2d');
          if (!sCtx) {
            setIsProcessing(false);
            setIsSyncing(false);
            return;
          }

          if (useRemoveBg) {
            sCtx.fillStyle = backgroundColor;
            sCtx.fillRect(0, 0, singleW, singleH);
          } else {
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, singleW, singleH);
          }

          const targetRatio = singleW / singleH;
          let cropWidth = img.width;
          let cropHeight = img.width / targetRatio;
          if (cropHeight > img.height) {
            cropHeight = img.height;
            cropWidth = img.height * targetRatio;
          }
          const finalCropW = cropWidth / cropScale;
          const finalCropH = cropHeight / cropScale;
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

          if (useRemoveBg && !bgRemovedImage) {
            replaceBackgroundColor(sCtx, singleW, singleH, backgroundColor, fuzziness);
          }
          applyFilters(sCtx, singleW, singleH, brightness, contrast, saturation);
          if (hasBorder) {
            sCtx.strokeStyle = '#000000';
            sCtx.lineWidth = 10;
            sCtx.strokeRect(5, 5, singleW - 10, singleH - 10);
          }

          const singleDataUrl = singleCanvas.toDataURL('image/jpeg', 0.7);

          if (activeDoc.type === 'passport_8_copy') {
            create8CopySheet(singleDataUrl, (tiledUrl) => {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: tiledUrl,
                status: activeDoc.status === 'queued' ? 'pending' : activeDoc.status,
                settings: {
                  ...activeDoc.settings,
                  brightness, contrast, backgroundColor, hasBorder,
                  cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                  bgRemovedImage: bgRemovedImage || undefined,
                  useRemoveBg
                }
              });
              lastUploadedSettingsRef.current = currentSettingsKey;
              setIsProcessing(false);
              setIsSyncing(false);
            });
          } else if (activeDoc.type === 'passport_4_copy') {
            create4CopySheet(singleDataUrl, (tiledUrl) => {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: tiledUrl,
                status: activeDoc.status === 'queued' ? 'pending' : activeDoc.status,
                settings: {
                  ...activeDoc.settings,
                  brightness, contrast, backgroundColor, hasBorder,
                  cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                  bgRemovedImage: bgRemovedImage || undefined,
                  useRemoveBg
                }
              });
              lastUploadedSettingsRef.current = currentSettingsKey;
              setIsProcessing(false);
              setIsSyncing(false);
            });
          } else {
            const finalPhotoUrl = singleCanvas.toDataURL('image/jpeg', 0.7);
            onUpdateDocument({
              ...activeDoc,
              processedUrl: finalPhotoUrl,
              status: activeDoc.status === 'queued' ? 'pending' : activeDoc.status,
              settings: {
                ...activeDoc.settings,
                brightness, contrast, backgroundColor, hasBorder,
                cropRect: { x: cropX, y: cropY, width: 100, height: 100 },
                bgRemovedImage: bgRemovedImage || undefined,
                useRemoveBg
              }
            });
            lastUploadedSettingsRef.current = currentSettingsKey;
            setIsProcessing(false);
            setIsSyncing(false);
          }
        } else if (activeDoc.type === 'id_card') {
          createA4DocumentSheet(
            activeDoc.idFrontUrl || activeDoc.originalUrl,
            true,
            (finalIDUrl) => {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: finalIDUrl,
                status: activeDoc.status === 'queued' ? 'pending' : activeDoc.status,
                settings: {
                  ...activeDoc.settings,
                  idFrontCropX, idFrontCropY, idFrontScale,
                  idBackCropX, idBackCropY, idBackScale,
                  idFrontYOffset, idBackYOffset,
                  idFrontBrightness, idBackBrightness,
                  idFrontContrast, idBackContrast
                }
              });
              lastUploadedSettingsRef.current = currentSettingsKey;
              setIsProcessing(false);
              setIsSyncing(false);
            },
            activeDoc.idBackUrl,
            {
              idFrontCropX, idFrontCropY, idFrontScale,
              idBackCropX, idBackCropY, idBackScale,
              idFrontYOffset, idBackYOffset,
              idFrontBrightness, idBackBrightness,
              idFrontContrast, idBackContrast
            }
          );
        } else {
          const procCanvas = document.createElement('canvas');
          procCanvas.width = img.width;
          procCanvas.height = img.height;
          const procCtx = procCanvas.getContext('2d');
          if (procCtx) {
            procCtx.drawImage(img, 0, 0);
            applyFilters(procCtx, img.width, img.height, brightness, contrast, 0);
            createA4DocumentSheet(procCanvas.toDataURL('image/jpeg', 0.7), false, (finalA4Url) => {
              onUpdateDocument({
                ...activeDoc,
                processedUrl: finalA4Url,
                status: activeDoc.status === 'queued' ? 'pending' : activeDoc.status,
                settings: { brightness, contrast }
              });
              lastUploadedSettingsRef.current = currentSettingsKey;
              setIsProcessing(false);
              setIsSyncing(false);
            });
          } else {
            setIsProcessing(false);
            setIsSyncing(false);
          }
        }
      };
      img.onerror = () => {
        setIsProcessing(false);
        setIsSyncing(false);
      };
      img.src = (useRemoveBg && bgRemovedImage) ? bgRemovedImage : activeDoc.originalUrl;
    }, 1000); // 1 second debounce for cloud save

    return () => clearTimeout(debounceTimer);
  }, [
    activeDoc?.id, activeDoc?.type, brightness, contrast, saturation, backgroundColor, fuzziness, 
    hasBorder, cropScale, cropX, cropY, useRemoveBg, bgRemovedImage,
    idFrontCropX, idFrontCropY, idFrontScale, idBackCropX, idBackCropY, idBackScale, idFrontYOffset, idBackYOffset,
    idFrontBrightness, idBackBrightness, idFrontContrast, idBackContrast
  ]);

  // Execute standard high-resolution print commands safely
  const handleDownload = async (doc: ScannedDocument) => {
    if (doc.processedUrl === 'CHUNKS_PENDING') {
      alert("File is still downloading from customer... (फाईल अजून डाउनलोड होत आहे...)");
      return;
    }
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
    if (doc.processedUrl === 'CHUNKS_PENDING') {
      alert("File is still downloading from customer... (फाईल अजून डाउनलोड होत आहे...)");
      return;
    }
    console.log("handlePrint called for doc:", doc.id);
    playVoiceAlert('processing');

    // Handle PDF printing first to avoid losing user gesture context due to await fetch
    if (doc.processedUrl.startsWith('data:application/pdf')) {
      const pdfWindow = window.open('', '_blank');
      if (pdfWindow) {
        pdfWindow.document.write(`
          <html>
            <title>Print PDF</title>
            <body style="margin:0;padding:0;">
              <embed src="${doc.processedUrl}" type="application/pdf" width="100%" height="100%">
            </body>
            <script>
              // Wait for embed to load
              setTimeout(() => {
                window.print();
              }, 1000);
            </script>
          </html>
        `);
        pdfWindow.document.close();
      } else {
        alert("Pop-up blocked! Please allow pop-ups for this site to print PDFs. (पॉप-अप ब्लॉक झाले आहे! कृपया परवानगी द्या)");
      }
      return;
    }

    let printImageUrl = doc.processedUrl;

    // Specialized high-res composite generation for Passport/ID Cards
    if (doc.type === 'passport_8_copy') {
      await new Promise<void>((resolve) => {
        create8CopySheet(doc.processedUrl, (dataUrl) => {
          printImageUrl = dataUrl;
          resolve();
        });
      });
    } else if (doc.type === 'passport_4_copy') {
      await new Promise<void>((resolve) => {
        create4CopySheet(doc.processedUrl, (dataUrl) => {
          printImageUrl = dataUrl;
          resolve();
        });
      });
    } else if (doc.type === 'id_card') {
      await new Promise<void>((resolve) => {
        createA4DocumentSheet(
          doc.idFrontUrl || doc.originalUrl,
          true,
          (dataUrl) => {
            printImageUrl = dataUrl;
            resolve();
          },
          doc.idBackUrl,
          {
            idFrontCropX, idFrontCropY, idFrontScale,
            idBackCropX, idBackCropY, idBackScale,
            idFrontYOffset, idBackYOffset,
            idFrontBrightness, idBackBrightness,
            idFrontContrast, idBackContrast
          }
        );
      });
    } else {
      // 1. Fetch the image to get a Blob (this handles CORS and ensures image is fully loaded)
      try {
        const response = await fetch(doc.processedUrl);
        const blob = await response.blob();
        printImageUrl = window.URL.createObjectURL(blob);
      } catch (e) {
        console.error("Fetch/Blob conversion failed:", e);
      }
    }

    const isPassport8 = doc.type === 'passport_8_copy';

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
              width: ${isPassport8 ? '6in' : (doc.type === 'photo_4x6' || doc.type === 'passport_4_copy') ? '4in' : '210mm'};
              height: ${isPassport8 ? '4in' : (doc.type === 'photo_4x6' || doc.type === 'passport_4_copy') ? '6in' : '297mm'};
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
      <aside className="w-20 lg:w-72 bg-white flex flex-col items-center lg:items-stretch transition-all duration-500 z-30 shadow-xl shrink-0 border-r border-slate-200">
        
        {/* Brand Header */}
        <div className="h-24 flex items-center gap-4 px-8 border-b border-slate-100">
          <div className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 group transition-transform hover:rotate-12">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-none font-display uppercase">SCANPRO <span className="text-indigo-600 text-[10px] ml-1">v5.0</span></h1>
            <p className="text-[10px] text-slate-400 font-bold mt-1.5 tracking-[0.2em] uppercase">Enterprise Terminal</p>
          </div>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          <div className="pb-3 px-4 hidden lg:block">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Operational Area</span>
          </div>
          
          <button 
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 rounded-2xl transition-all group relative overflow-hidden bg-indigo-50 text-indigo-600 border border-indigo-100"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />
            <LayoutDashboard className="w-5 h-5 text-indigo-600" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Workspace</span>
              <span className="block text-[9px] font-bold opacity-70">वर्कस्पेस टर्मिनल</span>
            </div>
          </button>

          <button 
            onClick={downloadQrCode}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 rounded-2xl transition-all group border border-transparent hover:border-emerald-100"
          >
            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Save QR Code</span>
              <span className="block text-[9px] font-bold opacity-50">क्यूआर कोड डाउनलोड</span>
            </div>
          </button>

          <div className="pt-8 pb-3 px-4 hidden lg:block">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">Core System</span>
          </div>

          <button 
            onClick={() => setIsSignboardModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 rounded-2xl transition-all group border border-transparent"
          >
            <QrCode className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Signboard</span>
              <span className="block text-[9px] font-bold opacity-50">शॉप पोस्टर प्रिंट</span>
            </div>
          </button>

          <button 
            onClick={() => setIsVoiceModalOpen(true)}
            className="w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all group border border-transparent"
          >
            <Settings className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className="block text-xs font-black uppercase tracking-wider">Settings</span>
              <span className="block text-[9px] font-bold opacity-50">सिस्टम सेटिंग्स</span>
            </div>
          </button>

          <button 
            onClick={() => onChangeDbMode?.(dbMode === 'cloud' ? 'local' : 'cloud')}
            className={`w-full flex items-center justify-center lg:justify-start gap-4 px-4 py-3.5 rounded-2xl transition-all group border ${
              isCloudQuotaExceeded
                ? 'text-rose-600 bg-rose-50 border-rose-100 shadow-sm shadow-rose-500/5'
                : dbMode === 'cloud' 
                ? 'text-emerald-600 bg-emerald-50 border-emerald-100 shadow-sm shadow-emerald-500/5' 
                : 'text-amber-600 bg-amber-50 border-amber-100 shadow-sm shadow-amber-500/5'
            }`}
          >
            <Database className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <div className="hidden lg:block text-left">
              <span className={`block text-xs font-black uppercase tracking-wider ${isCloudQuotaExceeded ? 'text-rose-600' : dbMode === 'cloud' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isCloudQuotaExceeded ? 'Quota Exceeded' : dbMode === 'cloud' ? 'Firebase Live' : 'Local Failsafe'}
              </span>
              <span className="block text-[9px] font-bold opacity-70">
                {isCloudQuotaExceeded ? 'कोटा संपला आहे' : dbMode === 'cloud' ? 'डेटाबेस कनेक्टेड' : 'स्थानीय स्टोरेज'}
              </span>
            </div>
          </button>

          <div className="pt-8 px-4">
            <button 
              onClick={handleToggleAutoPrint}
              className={`w-full flex items-center justify-center lg:justify-between px-4 py-4 rounded-2xl transition-all group border ${
                autoPrintEnabled 
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' 
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600 border-transparent'
              }`}
            >
              <div className="flex items-center gap-4">
                <RefreshCw className={`w-5 h-5 ${autoPrintEnabled ? 'animate-spin-slow' : 'group-hover:scale-110 transition-transform'}`} />
                <div className="hidden lg:block text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">Auto-Print</span>
                  <span className="block text-[8px] font-bold opacity-50 tracking-widest uppercase">Smart Stream</span>
                </div>
              </div>
              <div className={`hidden lg:block w-10 h-5 rounded-full relative transition-all shadow-inner ${autoPrintEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-lg ${autoPrintEnabled ? 'left-6' : 'left-1'}`} />
              </div>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer - System Health */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 w-full space-y-4">
          <div className="hidden lg:block space-y-3">
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
              <span className="text-slate-400">System Health</span>
              <span className="text-emerald-500">Stable</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 w-[94%] shadow-[0_0_12px_rgba(79,70,229,0.2)]" />
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-start gap-4 px-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-200 shrink-0 shadow-sm">
              AD
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-[11px] font-black text-slate-900 truncate uppercase tracking-tighter">Admin Terminal</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.3)]" />
                <p className="text-[8px] text-slate-400 font-mono uppercase font-bold tracking-widest">Station #01 Online</p>
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
                <span className="bg-indigo-600 text-[10px] px-2 py-0.5 rounded-full text-white font-black tracking-widest uppercase shadow-lg shadow-indigo-500/20">
                  Live
                </span>
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Enterprise Terminal Station 01</p>
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${dbMode === 'local' ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]'}`} />
                  <span className={`text-[9px] font-black tracking-widest uppercase ${dbMode === 'local' ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {dbMode === 'local' ? 'Single PC Mode (सिंगल कंप्यूटर)' : 'Multi-PC Sync (सभी कंप्यूटर जुड़े हैं)'}
                  </span>
                </div>
              </div>
            </div>

            {dbMode === 'local' && (
              <button 
                onClick={() => {
                  try {
                    localStorage.setItem('print_shop_db_mode', 'cloud');
                    window.location.reload();
                  } catch(e){}
                }}
                className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                Sync with Cloud
              </button>
            )}

            {/* Cloud Sync Status Indicator */}
            {dbMode === 'cloud' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-indigo-500 animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Synced</span>
                  </>
                )}
              </div>
            )}

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
              className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-indigo-600 hover:text-white transition-all relative group"
              title="Copy Customer Link"
            >
              <Copy className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {copied && <span className="absolute -bottom-10 bg-slate-900 text-white text-[10px] px-2 py-1 rounded">Copied!</span>}
            </button>
            
            <button className="h-11 px-5 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2">
              System Console
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </header>

        {/* Primary Workspace Dashboard */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: JOB STREAM (स्क्रॉलिंग लिस्ट) */}
          <section className="w-[240px] shrink-0 flex flex-col border-r border-slate-200/60 bg-white z-10">
            <div className="p-6 border-b border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Terminal Queue</h3>
                <div className="flex items-center gap-4">
                  {lastSyncTime && (
                    <div className="flex items-center gap-2 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Sync: {lastSyncTime}</span>
                    </div>
                  )}
                  <button 
                    onClick={() => onRefresh && onRefresh()}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer group"
                    title="Force Refresh (डेटा रिफ्रेश करें)"
                  >
                    <RotateCw className="w-3.5 h-3.5 group-active:rotate-180 transition-transform duration-500" />
                  </button>
                </div>
              </div>

              {/* Filter Tabs - Solves Multi-PC Printer split */}
              <div className="flex p-1 bg-slate-100 rounded-xl">
                <button 
                  onClick={() => handleSetFilterType('photos')}
                  className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${filterType === 'photos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Passport
                </button>
                <button 
                  onClick={() => handleSetFilterType('documents')}
                  className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${filterType === 'documents' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  PDF/A4
                </button>
                <button 
                  onClick={() => handleSetFilterType('all')}
                  className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${filterType === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  All
                </button>
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
                            {doc.processedUrl === 'CHUNKS_PENDING' ? (
                              <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                              </div>
                            ) : (
                              <img src={doc.processedUrl} className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700" alt="Job" />
                            )}
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
                                  doc.status === 'queued'
                                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                                    : doc.status === 'pending' 
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
                        disabled={activeDoc.processedUrl === 'CHUNKS_PENDING'}
                        className="h-8 px-4 rounded-xl bg-slate-100 text-slate-700 font-black text-[9px] uppercase tracking-[0.2em] shadow-sm flex items-center gap-1.5 transition-all hover:bg-slate-200 active:scale-95 group disabled:opacity-50"
                        aria-label="Download document"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      <button 
                        onClick={() => handlePrint(activeDoc)}
                        disabled={isProcessing || activeDoc.processedUrl === 'CHUNKS_PENDING'}
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
                        
                        {activeDoc.type === 'id_card' ? (
                          /* ID CARD SPECIALIZED CONTROLS */
                          <div className="space-y-8 animate-fade-in">
                            <div className="space-y-1">
                              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ID Studio Pro</h3>
                              <p className="text-xs font-bold text-slate-900 leading-tight">Front & Back Alignment</p>
                            </div>

                            {/* Front Card Tuning */}
                            <div className="space-y-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">१. पुढचा भाग (FRONT)</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setIdFrontScale(s => Math.max(0.5, s - 0.1))} className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center text-xs">-</button>
                                  <button onClick={() => setIdFrontScale(s => Math.min(2, s + 0.1))} className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center text-xs">+</button>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                    <span>Brightness</span>
                                    <span className="text-blue-600">{idFrontBrightness}%</span>
                                  </div>
                                  <input 
                                    type="range" min="-50" max="50" value={idFrontBrightness} 
                                    onChange={(e) => setIdFrontBrightness(parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                    <span>Vertical Position</span>
                                    <span className="text-blue-600">{idFrontYOffset}px</span>
                                  </div>
                                  <input 
                                    type="range" min="-200" max="200" value={idFrontYOffset} 
                                    onChange={(e) => setIdFrontYOffset(parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Back Card Tuning */}
                            <div className="space-y-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">२. मागचा भाग (BACK)</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setIdBackScale(s => Math.max(0.5, s - 0.1))} className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center text-xs">-</button>
                                  <button onClick={() => setIdBackScale(s => Math.min(2, s + 0.1))} className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center text-xs">+</button>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                    <span>Brightness</span>
                                    <span className="text-purple-600">{idBackBrightness}%</span>
                                  </div>
                                  <input 
                                    type="range" min="-50" max="50" value={idBackBrightness} 
                                    onChange={(e) => setIdBackBrightness(parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                                    <span>Vertical Position</span>
                                    <span className="text-purple-600">{idBackYOffset}px</span>
                                  </div>
                                  <input 
                                    type="range" min="-200" max="200" value={idBackYOffset} 
                                    onChange={(e) => setIdBackYOffset(parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Presets */}
                            <div className="grid grid-cols-2 gap-3">
                              <button 
                                onClick={() => {
                                  setIdFrontYOffset(0); setIdBackYOffset(200);
                                }}
                                className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 transition-all text-left"
                              >
                                <LayoutDashboard className="w-4 h-4 text-blue-600 mb-2" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-900">Stacked</p>
                              </button>
                              <button 
                                onClick={() => {
                                  setIdFrontYOffset(0); setIdBackYOffset(0);
                                  setIdFrontScale(1.0); setIdBackScale(1.0);
                                  setIdFrontBrightness(0); setIdBackBrightness(0);
                                }}
                                className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 transition-all text-left"
                              >
                                <RefreshCw className="w-4 h-4 text-slate-400 mb-2" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-900">Reset</p>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                              { label: 'Brightness', val: brightness, min: -50, max: 50, set: setBrightness, color: 'bg-gradient-to-r from-indigo-400 to-indigo-600' },
                              { label: 'Contrast', val: contrast, min: -50, max: 50, set: setContrast, color: 'bg-gradient-to-r from-emerald-400 to-emerald-600' },
                              { label: 'Saturation', val: saturation, min: -50, max: 50, set: setSaturation, color: 'bg-gradient-to-r from-violet-400 to-violet-600' }
                            ].map((sl, i) => (
                              <div key={i} className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{sl.label}</label>
                                  <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-white text-slate-900 font-mono border border-slate-200 shadow-sm">
                                    {sl.val > 0 ? `+${sl.val}` : sl.val}
                                  </span>
                                </div>
                                <div className="relative h-2.5 bg-slate-100 rounded-full border border-slate-200/50 shadow-inner">
                                  <input 
                                    type="range" min={sl.min} max={sl.max} value={sl.val}
                                    onChange={(e) => sl.set(parseInt(e.target.value))}
                                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                  />
                                  <motion.div 
                                    className={`absolute left-0 top-0 h-full rounded-full ${sl.color}`}
                                    animate={{ width: `${((sl.val + 50) / 100) * 100}%` }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-inherit shadow-lg transform translate-x-1/2" />
                                  </motion.div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        </>
                      )}
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
                          {activeDoc.processedUrl === 'CHUNKS_PENDING' ? (
                            <div className="w-[400px] h-[500px] flex flex-col items-center justify-center bg-white rounded-lg shadow-inner">
                              <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Downloading Chunks...</p>
                            </div>
                          ) : activeDoc.type === 'id_card' ? (
                            /* ID CARD A4 WORD-LIKE PREVIEW */
                            <div className="w-[400px] aspect-[1/1.414] bg-white shadow-2xl flex flex-col items-center p-8 relative overflow-hidden ring-1 ring-slate-200">
                              {/* Page Guidelines */}
                              <div className="absolute top-4 left-4 text-[7px] text-slate-300 font-mono uppercase tracking-widest pointer-events-none">A4 Workspace Stage</div>
                              
                              <div className="flex flex-col items-center gap-4 w-full h-full justify-start pt-10">
                                {/* Front Card */}
                                <div 
                                  className="relative group cursor-move shadow-lg rounded-sm border border-slate-100 bg-white"
                                  style={{
                                    width: `${85.6 * 2.5}px`, // ID-1 Standard size scaled
                                    height: `${53.98 * 2.5}px`,
                                    transform: `translateY(${idFrontYOffset}px) scale(${idFrontScale})`,
                                    filter: `brightness(${1 + idFrontBrightness/100}) contrast(${1 + idFrontContrast/100})`
                                  }}
                                >
                                  <img 
                                    src={activeDoc.idFrontUrl || activeDoc.originalUrl} 
                                    className="w-full h-full object-cover"
                                    alt="Front"
                                  />
                                  <div className="absolute -top-3 -left-3 bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg uppercase">Front</div>
                                </div>

                                {/* Back Card */}
                                <div 
                                  className="relative group cursor-move shadow-lg rounded-sm border border-slate-100 bg-white"
                                  style={{
                                    width: `${85.6 * 2.5}px`,
                                    height: `${53.98 * 2.5}px`,
                                    transform: `translateY(${idBackYOffset}px) scale(${idBackScale})`,
                                    filter: `brightness(${1 + idBackBrightness/100}) contrast(${1 + idBackContrast/100})`
                                  }}
                                >
                                  <img 
                                    src={activeDoc.idBackUrl || activeDoc.originalUrl} 
                                    className="w-full h-full object-cover"
                                    alt="Back"
                                  />
                                  <div className="absolute -top-3 -left-3 bg-purple-600 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg uppercase">Back</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img 
                              id="processed-preview"
                              src={activeDoc.processedUrl} 
                              className="max-w-full max-h-full object-contain shadow-2xl"
                              alt="Preview"
                            />
                          )}
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
              
              {/* Terminal Role Settings (Multi-Printer Support) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-left shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                    <LayoutDashboard className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-sans font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                      Terminal Role (प्रिंटर सेटिंग)
                    </h4>
                    <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                      इस कंप्यूटर को प्रिंटर के हिसाब से सेट करें। फोटो वाला कंप्यूटर 'Photo' पर रखें और दस्तावेज़ वाला 'A4' पर।
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'All Jobs', sub: 'सभी काम' },
                    { id: 'documents', label: 'A4 / ID', sub: 'दस्तावेज़' },
                    { id: 'photos', label: 'Passport', sub: 'फोटो' }
                  ].map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleSetFilterType(role.id as any)}
                      className={`p-3 rounded-xl border-2 transition-all text-center ${
                        filterType === role.id 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span className="block text-[10px] font-black uppercase">{role.label}</span>
                      <span className="block text-[8px] font-bold opacity-60 mt-0.5">{role.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI & API Section (Remove.bg) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-left shadow-xl">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-xl border border-blue-500/30">
                    <Zap className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-sans font-extrabold text-blue-50 text-xs uppercase tracking-wider">
                      AI Background Removal (रिमूव बीजी सेटिंग्स)
                    </h4>
                    <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                      Configure your <span className="text-blue-400 font-bold">Remove.bg</span> API key to enable high-quality AI background removal for passport photos.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono pl-1">
                    API Key (अपना API की डालें):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={removeBgApiKey}
                      onChange={(e) => handleSaveRemoveBgApiKey(e.target.value)}
                      placeholder="Enter remove.bg API key here..."
                      className="flex-1 text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono placeholder:text-slate-600"
                    />
                  </div>
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <a 
                      href="https://www.remove.bg/api" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <MoreVertical className="w-3 h-3 rotate-90" />
                      Get Free Key at remove.bg
                    </a>
                  </div>
                </div>
              </div>

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
                  <button
                    onClick={handleDownloadAgent}
                    className="self-start inline-flex items-center gap-1.5 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-200 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Agent (.py)
                  </button>
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
                      <p className="text-[9px] text-indigo-600 font-bold mt-1">
                        Note: For PC/Laptop only (यह केवल कंप्यूटर के लिए है)
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
                    { id: 'document', title: '📄 PDF/A4 Documents (पीडीएफ दस्तावेज़)' },
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
