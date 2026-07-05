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
import { db } from './lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  setDoc, 
  doc, 
  deleteDoc,
  writeBatch
} from 'firebase/firestore';

export default // Main Application Component - Modified to support background auto-bake
function App() {
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString());
  
  // Failsafe Mode State: cloud (Firebase) vs local (LocalStorage Sync)
  const [dbMode, setDbMode] = useState<'cloud' | 'local'>(() => {
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
      
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime); // Slightly louder
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

  // 2. Real-time Database Sync (Firebase Firestore)
  useEffect(() => {
    if (dbMode === 'local') {
      const docs = getLocalDocs();
      setDocuments(docs);
      return;
    }

    // Cloud Mode (Firebase Firestore)
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLastSyncTime(new Date().toLocaleTimeString());
      const fbDocs: ScannedDocument[] = [];
      snapshot.forEach((doc) => {
        fbDocs.push(doc.data() as ScannedDocument);
      });

      setDocuments((prev) => {
        if (prev.length > 0 && fbDocs.length > prev.length) {
          const hasNewJob = fbDocs.some(fDoc => !prev.some(pDoc => pDoc.id === fDoc.id));
          if (hasNewJob) {
            const freshJob = fbDocs.find(fDoc => !prev.some(pDoc => pDoc.id === fDoc.id));
            if (freshJob) {
              triggerBellSound();
              setToastMessage(`New job "${freshJob.name}" arrived (Firebase Sync)!`);
              setTimeout(() => setToastMessage(null), 4000);
            }
          }
        }
        return fbDocs;
      });
    }, (error) => {
      console.warn("Firestore snapshot listener failed:", error);
      const docs = getLocalDocs();
      if (docs.length > 0 && documents.length === 0) {
        setDocuments(docs);
      }
    });

    return () => unsubscribe();
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
                  if (dbMode === 'cloud') {
                    // Update cloud database too
                    const docRef = doc(db, 'documents', sDoc.id);
                    setDoc(docRef, cleanObject(sDoc), { merge: true }).catch(() => {});
                  } else {
                    const updatedLocal = prev.map(item => item.id === pDoc.id ? { ...item, status: 'printed' as const } : item);
                    saveLocalDocs(updatedLocal);
                  }
                }
                return { ...pDoc, status: sDoc.status as 'queued' | 'pending' | 'printed' };
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

  const toDatabasePayload = (
    doc: ScannedDocument,
    originalUrl: string,
    processedUrl: string,
    idFrontUrl?: string,
    idBackUrl?: string
  ) => {
    const payload = {
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
    return cleanObject(payload);
  };

  // Helper to remove undefined values for Firestore
  function cleanObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(cleanObject);
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        cleaned[key] = cleanObject(obj[key]);
      }
    }
    return cleaned;
  }

  // Handle incoming submission from customer scanner
  const handleSendDocument = async (newDoc: ScannedDocument): Promise<{ success: boolean; error?: string }> => {
    const docWithTime = { ...newDoc, createdAt: Date.now() };

    if (dbMode === 'local') {
      const updated = [docWithTime, ...documents];
      saveLocalDocs(updated);
      setDocuments(updated);
      return { success: true };
    }

    // Save to Firebase Firestore
    try {
      const dbPayload = toDatabasePayload(
        docWithTime,
        docWithTime.originalUrl,
        docWithTime.processedUrl,
        docWithTime.idFrontUrl,
        docWithTime.idBackUrl
      );

      await setDoc(doc(db, 'documents', docWithTime.id), dbPayload);

      // Trigger bell locally if this device is also acting as merchant (for testing)
      triggerBellSound();
      setToastMessage(`Job "${newDoc.name}" submitted successfully!`);
      setTimeout(() => setToastMessage(null), 4000);
      return { success: true };
    } catch (err: any) {
      console.warn("Firestore send failed:", err);
      // Failsafe: save locally
      const updated = [docWithTime, ...documents];
      saveLocalDocs(updated);
      setDocuments(updated);
      return { success: false, error: err.message };
    }
  };

  // Update printed status
  const handleUpdateStatus = async (id: string, status: 'queued' | 'pending' | 'printed') => {
    setDocuments(prev => {
      const updated = prev.map(docItem => docItem.id === id ? { ...docItem, status } : docItem);
      const target = updated.find(docItem => docItem.id === id);
      
      if (dbMode === 'local') {
        saveLocalDocs(updated);
      } else if (target) {
        setDoc(doc(db, 'documents', id), cleanObject(target), { merge: true }).catch(err => {
          console.warn("Firestore update status failed:", err);
          saveLocalDocs(updated);
        });
      }
      return updated;
    });
  };

  // Discard a document
  const handleDeleteDocument = async (id: string) => {
    setDocuments(prev => {
      const updated = prev.filter(docItem => docItem.id !== id);
      
      if (dbMode === 'local') {
        saveLocalDocs(updated);
      } else {
        deleteDoc(doc(db, 'documents', id)).catch(err => {
          console.warn("Firestore delete failed:", err);
          saveLocalDocs(updated);
        });
      }
      return updated;
    });
  };

  // Full document updates
  const handleUpdateDocument = async (updatedDoc: ScannedDocument) => {
    setDocuments(prev => {
      const updated = prev.map(docItem => docItem.id === updatedDoc.id ? updatedDoc : docItem);
      
      if (dbMode === 'local') {
        saveLocalDocs(updated);
      } else {
        setDoc(doc(db, 'documents', updatedDoc.id), cleanObject(updatedDoc), { merge: true }).catch(err => {
          console.warn("Firestore document update failed:", err);
          saveLocalDocs(updated);
        });
      }
      return updated;
    });
  };

  // Safe manual database/state reset
  const handleResetDatabase = async () => {
    try {
      if (dbMode === 'local') {
        saveLocalDocs([]);
        setDocuments([]);
      } else {
        // Delete all docs (not efficient for large collections, but fine here)
        const batch = writeBatch(db);
        documents.forEach(d => {
          batch.delete(doc(db, 'documents', d.id));
        });
        await batch.commit();
        setDocuments([]);
      }
      setToastMessage("System data has been reset!");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.warn("Error resetting Firebase data:", err);
      saveLocalDocs([]);
      setDocuments([]);
    }
  };

  const pendingCount = documents.filter(d => d.status === 'pending').length;

  const handleRefresh = async () => {
    if (dbMode === 'local') {
      setDocuments(getLocalDocs());
      return;
    }
    // Snapshot listener handles this, but we can re-trigger if needed
    setToastMessage("Refreshing data...");
    setTimeout(() => setToastMessage(null), 2000);
  };

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
      <main className="flex-1 w-full mx-auto p-4 lg:p-6 flex flex-col items-stretch relative z-10 overflow-hidden">
        <div className="h-full flex-1">
          <MerchantPortal 
            documents={documents}
            onUpdateStatus={handleUpdateStatus}
            onDeleteDocument={handleDeleteDocument}
            onUpdateDocument={handleUpdateDocument}
            onResetDatabase={handleResetDatabase}
            onRefresh={handleRefresh}
            lastSyncTime={lastSyncTime}
            dbMode={dbMode}
            onChangeDbMode={changeDbMode}
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
