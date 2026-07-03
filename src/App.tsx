import React, { useState, useEffect } from 'react';
import { 
  Printer, Scan, Sparkles, MonitorCheck, Info, FileText, 
  HelpCircle, ChevronRight, CheckCircle, Bell, ArrowRight, Layers
} from 'lucide-react';
import CustomerScanner from './components/CustomerScanner';
import MerchantPortal from './components/MerchantPortal';
import { ScannedDocument } from './types';
import { generateSampleDoc, generateSampleID, generateSamplePortrait } from './lib/sampleGenerator';
import { create8CopySheet, createA4DocumentSheet } from './lib/canvasUtils';
import { supabase, isSupabaseConfigured, uploadBase64ToStorage } from './lib/supabase';

export default function App() {
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Failsafe Mode State: cloud (Supabase) vs local (LocalStorage Sync)
  const [dbMode, setDbMode] = useState<'cloud' | 'local'>(() => {
    if (!isSupabaseConfigured) return 'local';
    try {
      const stored = localStorage.getItem('print_shop_db_mode');
      if (stored === 'local') return 'local';
    } catch (e) {}
    return 'cloud';
  });

  const isSeedingRef = React.useRef(false);

  // Helper to load fallback documents from localStorage
  const getLocalDocs = (): ScannedDocument[] => {
    try {
      const saved = localStorage.getItem('print_shop_documents');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  };

  // Helper to save fallback documents to localStorage
  const saveLocalDocs = (docs: ScannedDocument[]) => {
    try {
      localStorage.setItem('print_shop_documents', JSON.stringify(docs));
    } catch (e) {}
  };

  // Track and persist the database mode to local storage
  const changeDbMode = (mode: 'cloud' | 'local') => {
    setDbMode(mode);
    try {
      localStorage.setItem('print_shop_db_mode', mode);
    } catch (e) {}
  };

  // Detect if url contains mode=customer to show only customer upload portal
  // Or auto-detect if the device is a mobile or the screen is small (where Merchant Portal is unusable)
  const [isCustomerMode, setIsCustomerMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || params.get('portal');
    const hash = window.location.hash;

    if (mode === 'merchant' || hash === '#merchant') {
      return false;
    }
    if (mode === 'customer' || hash === '#customer') {
      return true;
    }

    // Smart auto-detection fallback
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isNarrowScreen = window.innerWidth < 768;
    return isMobileDevice || isNarrowScreen;
  });

  // Keep checking url changes in case of navigation or popstate
  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode') || params.get('portal');
      const hash = window.location.hash;

      if (mode === 'merchant' || hash === '#merchant') {
        setIsCustomerMode(false);
      } else if (mode === 'customer' || hash === '#customer') {
        setIsCustomerMode(true);
      } else {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isNarrowScreen = window.innerWidth < 768;
        setIsCustomerMode(isMobileDevice || isNarrowScreen);
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Helper to play a notify beep/bell
  const triggerBellSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
      
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  // 1. Sync & listen to localStorage changes if in local mode (for cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'print_shop_documents') {
        try {
          const updated = JSON.parse(e.newValue || '[]');
          setDocuments((prev) => {
            // Trigger notify bell if a new document was added in the other tab
            if (prev.length > 0 && updated.length > prev.length) {
              const hasNew = updated.some((uDoc: any) => !prev.some((pDoc) => pDoc.id === uDoc.id));
              if (hasNew) {
                triggerBellSound();
                setToastMessage("New print job received from customer!");
                setTimeout(() => setToastMessage(null), 4000);
              }
            }
            return updated;
          });
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 2. Real-time Database Sync (Supabase PostgreSQL with local storage fallback)
  useEffect(() => {
    if (dbMode === 'local' || !isSupabaseConfigured || !supabase) {
      const docs = getLocalDocs();
      if (docs.length > 0) {
        setDocuments(docs);
      } else {
        // Seed local storage with default high-quality lightweight samples
        if (isSeedingRef.current) return;
        isSeedingRef.current = true;
        
        const docSampleBase64 = generateSampleDoc();
        const idSampleBase64 = generateSampleID();
        const portraitSampleBase64 = generateSamplePortrait();

        createA4DocumentSheet(docSampleBase64, false, (a4DocUrl) => {
          const initialDoc1: ScannedDocument = {
            id: 'PRE-DOC-101',
            type: 'document',
            name: 'A4 Digital Scan - Standard Document',
            timestamp: '11:24:10 AM',
            originalUrl: docSampleBase64,
            processedUrl: a4DocUrl,
            status: 'pending',
            notes: 'Pre-loaded Demo A4 Page',
            createdAt: Date.now() - 60000
          };

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 350;
          tempCanvas.height = 450;
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx) {
            tCtx.fillStyle = '#3b82f6';
            tCtx.fillRect(0, 0, 350, 450);
            
            const faceImg = new Image();
            faceImg.onload = () => {
              tCtx.drawImage(faceImg, 25, 25, 300, 400);
              tCtx.strokeStyle = '#000000';
              tCtx.lineWidth = 10;
              tCtx.strokeRect(5, 5, 340, 440);

              create8CopySheet(tempCanvas.toDataURL('image/png'), (tiledUrl) => {
                const initialDoc2: ScannedDocument = {
                  id: 'PRE-PASS-202',
                  type: 'passport_8_copy',
                  name: '8x Passport Photo Sheet (4"x6" Layout)',
                  timestamp: '11:28:45 AM',
                  originalUrl: portraitSampleBase64,
                  processedUrl: tiledUrl,
                  status: 'printed',
                  notes: 'Pre-loaded 4x6 Landscape Sheet • Blue Background',
                  createdAt: Date.now() - 30000,
                  settings: {
                    brightness: 10,
                    contrast: 15,
                    backgroundColor: '#3b82f6',
                    hasBorder: true
                  }
                };

                const defaultDocs = [initialDoc1, initialDoc2];
                saveLocalDocs(defaultDocs);
                setDocuments(defaultDocs);
                isSeedingRef.current = false;
              });
            };
            faceImg.src = portraitSampleBase64;
          }
        });
      }
      return;
    }

    // Cloud Mode (Supabase)
    let active = true;

    const initSupabaseSync = async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .order('createdAt', { ascending: false });

        if (error) throw error;

        if (active) {
          if (data && data.length > 0) {
            setDocuments((prev) => {
              const sbDocs = data as ScannedDocument[];
              // Play bell sound for any incoming documents
              if (prev.length > 0) {
                const hasNewJob = sbDocs.some(sDoc => !prev.some(pDoc => pDoc.id === sDoc.id));
                if (hasNewJob) {
                  const freshJob = sbDocs.find(sDoc => !prev.some(pDoc => pDoc.id === sDoc.id));
                  if (freshJob) {
                    triggerBellSound();
                    setToastMessage(`New job "${freshJob.name}" arrived on the Merchant portal!`);
                    setTimeout(() => setToastMessage(null), 4000);
                  }
                }
              }
              return sbDocs;
            });
          } else {
            // Seed Supabase if empty
            if (isSeedingRef.current) return;
            isSeedingRef.current = true;

            const docSampleBase64 = generateSampleDoc();
            const idSampleBase64 = generateSampleID();
            const portraitSampleBase64 = generateSamplePortrait();

            createA4DocumentSheet(docSampleBase64, false, async (a4DocUrl) => {
              const initialDoc1: ScannedDocument = {
                id: 'PRE-DOC-101',
                type: 'document',
                name: 'A4 Digital Scan - Standard Document',
                timestamp: '11:24:10 AM',
                originalUrl: docSampleBase64,
                processedUrl: a4DocUrl,
                status: 'pending',
                notes: 'Pre-loaded Demo A4 Page',
                createdAt: Date.now() - 60000
              };

              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = 350;
              tempCanvas.height = 450;
              const tCtx = tempCanvas.getContext('2d');
              if (tCtx) {
                tCtx.fillStyle = '#3b82f6';
                tCtx.fillRect(0, 0, 350, 450);
                
                const faceImg = new Image();
                faceImg.onload = () => {
                  tCtx.drawImage(faceImg, 25, 25, 300, 400);
                  tCtx.strokeStyle = '#000000';
                  tCtx.lineWidth = 10;
                  tCtx.strokeRect(5, 5, 340, 440);

                  create8CopySheet(tempCanvas.toDataURL('image/png'), async (tiledUrl) => {
                    const initialDoc2: ScannedDocument = {
                      id: 'PRE-PASS-202',
                      type: 'passport_8_copy',
                      name: '8x Passport Photo Sheet (4"x6" Layout)',
                      timestamp: '11:28:45 AM',
                      originalUrl: portraitSampleBase64,
                      processedUrl: tiledUrl,
                      status: 'printed',
                      notes: 'Pre-loaded 4x6 Landscape Sheet • Blue Background',
                      createdAt: Date.now() - 30000,
                      settings: {
                        brightness: 10,
                        contrast: 15,
                        backgroundColor: '#3b82f6',
                        hasBorder: true
                      }
                    };

                    const defaultDocs = [initialDoc1, initialDoc2];
                    
                    try {
                      const { error: insertError } = await supabase
                        .from('documents')
                        .insert(defaultDocs);
                      
                      if (insertError) throw insertError;
                    } catch (err) {
                      console.warn("Supabase seeding error, falling back to localStorage:", err);
                      changeDbMode('local');
                      saveLocalDocs(defaultDocs);
                      setDocuments(defaultDocs);
                    } finally {
                      isSeedingRef.current = false;
                    }
                  });
                };
                faceImg.src = portraitSampleBase64;
              }
            });
          }
        }
      } catch (err) {
        console.warn("Supabase connection or fetch query failed. Switching to LocalStorage:", err);
        changeDbMode('local');
        const docs = getLocalDocs();
        if (docs.length > 0) {
          setDocuments(docs);
        }
      }
    };

    initSupabaseSync();

    // Subscribe to real-time additions/modifications using Supabase Realtime Channels
    const channel = supabase.channel('documents_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, async () => {
        try {
          const { data, error } = await supabase
            .from('documents')
            .select('*')
            .order('createdAt', { ascending: false });
          if (!error && data && active) {
            setDocuments(data as ScannedDocument[]);
          }
        } catch (e) {
          console.error("Realtime fetch reload failed:", e);
        }
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [dbMode]);

  // Synchronize documents with backend server for local Print Agent polling
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        await fetch('/api/documents/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents })
        });
      } catch (err) {
        console.warn("Failed to sync documents with backend server:", err);
      }
    };
    if (documents.length > 0) {
      syncWithServer();
    }
  }, [documents]);

  // Periodically poll server to sync status updates from Desktop Print Agent
  useEffect(() => {
    const pollServerUpdates = async () => {
      try {
        const response = await fetch('/api/documents');
        if (response.ok) {
          const data = await response.json();
          const serverDocs = data.documents || [];
          
          setDocuments(prev => {
            let stateChanged = false;
            const nextDocs = prev.map(pDoc => {
              const sDoc = serverDocs.find((d: any) => d.id === pDoc.id);
              if (sDoc && sDoc.status !== pDoc.status) {
                stateChanged = true;
                
                // If it was printed by the agent, trigger success notifies!
                if (sDoc.status === 'printed' && pDoc.status === 'pending') {
                  if (dbMode === 'cloud' && supabase) {
                    // Update cloud database too
                    supabase.from('documents').upsert(sDoc).then(() => {});
                  } else {
                    const updatedLocal = prev.map(item => item.id === pDoc.id ? { ...item, status: 'printed' as const } : item);
                    saveLocalDocs(updatedLocal);
                  }
                }
                return { ...pDoc, status: sDoc.status as 'pending' | 'printed' };
              }
              return pDoc;
            });
            return stateChanged ? nextDocs : prev;
          });
        }
      } catch (err) {
        console.warn("Failed to poll server updates:", err);
      }
    };

    const interval = setInterval(pollServerUpdates, 3000);
    return () => clearInterval(interval);
  }, [dbMode]);

  // Helper to strip non-database columns before inserting/upserting to Supabase
  const toDatabasePayload = (
    doc: ScannedDocument,
    originalUrl: string,
    processedUrl: string,
    idFrontUrl?: string,
    idBackUrl?: string
  ) => {
    return {
      id: doc.id,
      type: doc.type,
      name: doc.name,
      timestamp: doc.timestamp,
      originalUrl,
      processedUrl,
      status: doc.status,
      notes: doc.notes || null,
      createdAt: doc.createdAt,
      settings: {
        ...doc.settings,
        brightness: doc.settings?.brightness ?? 0,
        contrast: doc.settings?.contrast ?? 0,
        idFrontUrl: idFrontUrl || doc.settings?.idFrontUrl || doc.idFrontUrl || null,
        idBackUrl: idBackUrl || doc.settings?.idBackUrl || doc.idBackUrl || null
      }
    };
  };

  // Handle incoming submission from customer scanner
  const handleSendDocument = async (newDoc: ScannedDocument): Promise<{ success: boolean; error?: string }> => {
    const docWithTime = { ...newDoc, createdAt: Date.now() };

    if (dbMode === 'local' || !supabase) {
      const updated = [docWithTime, ...documents];
      saveLocalDocs(updated);
      setDocuments(updated);
      try {
        localStorage.setItem('print_shop_documents', JSON.stringify(updated));
      } catch (e) {}

      // Play sound locally
      triggerBellSound();
      setToastMessage(`New job "${newDoc.name}" arrived (Local Storage Failsafe)!`);
      setTimeout(() => setToastMessage(null), 4000);
      return { success: true };
    }

    // Save to Supabase
    try {
      // Direct Storage upload to keep DB row size extremely small and super fast
      let finalOriginalUrl = docWithTime.originalUrl;
      let finalProcessedUrl = docWithTime.processedUrl;
      let finalIdFrontUrl = docWithTime.idFrontUrl;
      let finalIdBackUrl = docWithTime.idBackUrl;

      if (docWithTime.originalUrl?.startsWith('data:')) {
        finalOriginalUrl = await uploadBase64ToStorage(docWithTime.originalUrl);
      }
      if (docWithTime.processedUrl?.startsWith('data:')) {
        finalProcessedUrl = await uploadBase64ToStorage(docWithTime.processedUrl);
      }
      if (docWithTime.idFrontUrl?.startsWith('data:')) {
        finalIdFrontUrl = await uploadBase64ToStorage(docWithTime.idFrontUrl);
      }
      if (docWithTime.idBackUrl?.startsWith('data:')) {
        finalIdBackUrl = await uploadBase64ToStorage(docWithTime.idBackUrl);
      }

      const dbPayload = toDatabasePayload(
        docWithTime,
        finalOriginalUrl,
        finalProcessedUrl,
        finalIdFrontUrl,
        finalIdBackUrl
      );

      const { error } = await supabase
        .from('documents')
        .upsert(dbPayload);
      if (error) throw error;

      // Play sound locally
      triggerBellSound();
      setToastMessage(`New job "${newDoc.name}" arrived on the Merchant portal!`);
      setTimeout(() => setToastMessage(null), 4000);
      return { success: true };
    } catch (err: any) {
      console.warn("Supabase insert/upsert failed, falling back to localStorage sync mode:", err);
      const errorMsg = err?.message || err?.details || JSON.stringify(err);
      
      // Still save locally as failsafe so the document is not lost
      const updated = [docWithTime, ...documents];
      saveLocalDocs(updated);
      setDocuments(updated);
      try {
        localStorage.setItem('print_shop_documents', JSON.stringify(updated));
      } catch (e) {}

      return { success: false, error: errorMsg };
    }
  };

  // Update printed status
  const handleUpdateStatus = async (id: string, status: 'pending' | 'printed') => {
    setDocuments(prev => {
      const updated = prev.map(docItem => docItem.id === id ? { ...docItem, status } : docItem);
      const target = updated.find(docItem => docItem.id === id);
      
      if (dbMode === 'local' || !supabase) {
        saveLocalDocs(updated);
      } else if (target) {
        const dbPayload = toDatabasePayload(
          target,
          target.originalUrl,
          target.processedUrl
        );
        supabase
          .from('documents')
          .upsert(dbPayload)
          .then(({ error }) => {
            if (error) {
              console.warn("Supabase update status failed, falling back to localStorage:", error);
              changeDbMode('local');
              saveLocalDocs(updated);
            }
          });
      }
      return updated;
    });
  };

  // Discard a document
  const handleDeleteDocument = async (id: string) => {
    setDocuments(prev => {
      const updated = prev.filter(docItem => docItem.id !== id);
      
      if (dbMode === 'local' || !supabase) {
        saveLocalDocs(updated);
      } else {
        supabase
          .from('documents')
          .delete()
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.warn("Supabase delete failed, falling back to localStorage:", error);
              changeDbMode('local');
              saveLocalDocs(updated);
            }
          });
      }
      return updated;
    });
  };

  // Full document updates (for background color, cropping, filters, etc.)
  const handleUpdateDocument = async (updatedDoc: ScannedDocument) => {
    setDocuments(prev => {
      const updated = prev.map(docItem => docItem.id === updatedDoc.id ? updatedDoc : docItem);
      
      if (dbMode === 'local' || !supabase) {
        saveLocalDocs(updated);
      } else {
        const uploadAndUpdate = async () => {
          try {
            let finalOriginalUrl = updatedDoc.originalUrl;
            let finalProcessedUrl = updatedDoc.processedUrl;
            let finalIdFrontUrl = updatedDoc.idFrontUrl;
            let finalIdBackUrl = updatedDoc.idBackUrl;

            if (updatedDoc.originalUrl?.startsWith('data:')) {
              finalOriginalUrl = await uploadBase64ToStorage(updatedDoc.originalUrl);
            }
            if (updatedDoc.processedUrl?.startsWith('data:')) {
              finalProcessedUrl = await uploadBase64ToStorage(updatedDoc.processedUrl);
            }
            if (updatedDoc.idFrontUrl?.startsWith('data:')) {
              finalIdFrontUrl = await uploadBase64ToStorage(updatedDoc.idFrontUrl);
            }
            if (updatedDoc.idBackUrl?.startsWith('data:')) {
              finalIdBackUrl = await uploadBase64ToStorage(updatedDoc.idBackUrl);
            }

            const dbPayload = toDatabasePayload(
              updatedDoc,
              finalOriginalUrl,
              finalProcessedUrl,
              finalIdFrontUrl,
              finalIdBackUrl
            );

            const { error } = await supabase
              .from('documents')
              .upsert(dbPayload);
            if (error) throw error;
          } catch (err: any) {
            console.warn("Supabase document update failed, falling back to localStorage:", err);
            changeDbMode('local');
            saveLocalDocs(updated);
          }
        };
        uploadAndUpdate();
      }
      return updated;
    });
  };

  // Safe manual database/state reset for clearing stale records
  const handleResetDatabase = async () => {
    try {
      if (dbMode === 'local' || !supabase) {
        saveLocalDocs([]);
        setDocuments([]);
      } else {
        const { error } = await supabase
          .from('documents')
          .delete()
          .neq('id', 'NONE_DUMMY_ID_TO_DELETE_ALL');
        
        if (error) throw error;
        setDocuments([]);
      }
      setToastMessage("System data has been reset! Reloading fresh optimized samples...");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.warn("Error resetting system data in Supabase, falling back to local reset:", err);
      changeDbMode('local');
      saveLocalDocs([]);
      setDocuments([]);
    }
  };

  const pendingCount = documents.filter(d => d.status === 'pending').length;

  if (isCustomerMode) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col font-sans select-none antialiased text-slate-800 p-4 items-center justify-between">
        {/* Top bar to switch to Merchant Portal */}
        <div className="w-full max-w-xl flex justify-between items-center mb-2 px-1 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Customer Upload Portal (ग्राहक पोर्टल)</span>
          </div>
          <button
            onClick={() => {
              setIsCustomerMode(false);
              // Update URL hash to avoid auto-detecting mobile on next load
              window.location.hash = '#merchant';
              const params = new URLSearchParams(window.location.search);
              params.set('mode', 'merchant');
              window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
            }}
            className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
          >
            <MonitorCheck className="w-3.5 h-3.5" />
            Shop Owner Portal (दुकानदार पोर्टल)
          </button>
        </div>

        <div className="max-w-xl w-full flex-1 flex flex-col justify-center">
          <CustomerScanner onSendDocument={handleSendDocument} dbMode={dbMode} />
        </div>

        {/* Small disclaimer */}
        <div className="text-[10px] text-slate-400 mt-4 text-center">
          Powered by SCANPRO Print Platform • Direct local secure pipe
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col font-sans select-none antialiased text-slate-800">
      
      {/* Main App Bar Header - Match professional white aesthetic */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 relative z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* App Titles */}
          <div className="text-center sm:text-left flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-sm">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-tight text-slate-800">
                SCANPRO Print Platform
              </h1>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1">
                <span>दस्तावेज़ और पासपोर्ट फोटो प्रिंट पोर्टल</span>
                <span className="text-slate-300">•</span>
                <span className="text-blue-600 font-semibold">MERCHANT CONTROLLER TERMINAL</span>
              </p>
            </div>
          </div>

          {/* Quick Stats Indicator Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setIsCustomerMode(true);
                window.location.hash = '#customer';
                const params = new URLSearchParams(window.location.search);
                params.set('mode', 'customer');
                window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
              }}
              className="bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <Scan className="w-4 h-4" />
              Customer Scan Page (ग्राहक पोर्टल)
            </button>

            <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="text-center">
                <p className="text-[9px] font-bold font-mono text-slate-400">PENDING PRINTS</p>
                <p className="text-sm font-bold font-mono text-amber-600">{pendingCount}</p>
              </div>
              <div className="h-6 w-[1px] bg-slate-200" />
              <div className="text-center">
                <p className="text-[9px] font-bold font-mono text-slate-400">TOTAL RECEIVES</p>
                <p className="text-sm font-bold font-mono text-slate-700">{documents.length}</p>
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 flex flex-col items-stretch relative z-10 overflow-hidden">
        <div className="h-full flex-1">
          <MerchantPortal 
            documents={documents}
            onUpdateStatus={handleUpdateStatus}
            onDeleteDocument={handleDeleteDocument}
            onUpdateDocument={handleUpdateDocument}
            onResetDatabase={handleResetDatabase}
            dbMode={dbMode}
          />
        </div>
      </main>

      {/* Footer System Credits */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 text-center text-slate-400 text-xs font-sans">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <p>
            Designed exclusively for rapid digital-to-print merchant environments. Built under standard ISO print parameters.
          </p>
          <div className="flex gap-4 font-mono text-[10px] text-slate-400">
            <span>A4 ASPECT: 1.414</span>
            <span>PHOTO ASPECT: 3:2</span>
            <span>SYSTEM SECURE</span>
          </div>
        </div>
      </footer>

      {/* Real-time Toast Notifications */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white rounded-xl shadow-xl p-4 flex items-center gap-3 max-w-md z-50 animate-bounce border border-slate-800">
          <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold font-mono text-blue-400">REAL-TIME INCOMING JOB</p>
            <p className="text-xs font-sans text-slate-200 mt-0.5 leading-normal">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* Hidden printable element specifically styled for isolated physical printing */}
      <div id="print-area" className="hidden" />

    </div>
  );
}
