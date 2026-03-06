
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Search, Copy, MessageSquare, User, Hash, 
  RefreshCw, Mail, BookOpen, Wand2, 
  Smartphone, Zap, Heart, 
  Sun, Moon, BarChart3, Download, 
  Lock, Globe, CloudCheck, CloudOff, Settings,
  Layers, FilterX, ExternalLink, UserCheck, AlertCircle,
  Mic, MicOff, Share2, X
} from 'lucide-react';
import { SEGMENTS, INITIAL_DB, WEBHOOK_URL } from './constants';
import { Segment, AppContext, ToastState, UsageRecord, SupervisorConfig } from './types';
import Toast from './components/Toast';
import ContextInput from './components/ContextInput';
import ScriptCard from './components/ScriptCard';
import { formalizeMessage } from './services/geminiService';

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('claro_theme') === 'dark');
  const [activeTab, setActiveTab] = useState<'library' | 'studio' | 'metrics'>('library');
  const [isMetricsUnlocked, setIsMetricsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  
  const [supConfig, setSupConfig] = useState<SupervisorConfig>(() => {
    const saved = localStorage.getItem('claro_sup_config');
    const defaultConfig = {
      accessPin: '1723',
      isOnlineEnabled: true
    };
    return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
  });

  const [selectedSegment, setSelectedSegment] = useState<Segment>(SEGMENTS[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  
  const [context, setContext] = useState<AppContext>({
    agentName: localStorage.getItem('claro_agent_name') || '',
    customerName: '',
    ticketId: ''
  });

  const [usageLogs, setUsageLogs] = useState<UsageRecord[]>(() => {
    const saved = localStorage.getItem('claro_usage_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const [studioInput, setStudioInput] = useState('');
  const [studioOutput, setStudioOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const recognitionRef = useRef<any>(null);

  const isValidAgentName = useMemo(() => {
    const name = context.agentName.trim();
    const parts = name.split(/\s+/).filter(p => p.length > 0);
    return name.length >= 6 && parts.length >= 2;
  }, [context.agentName]);

  // Obtener categorías únicas del segmento actual
  const categories = useMemo(() => {
    const segmentScripts = INITIAL_DB.filter(s => s.segment === selectedSegment.id);
    const uniqueCats = Array.from(new Set(segmentScripts.map(s => s.category)));
    return ['Todas', ...uniqueCats.sort()];
  }, [selectedSegment]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('claro_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('claro_usage_logs', JSON.stringify(usageLogs));
    localStorage.setItem('claro_sup_config', JSON.stringify(supConfig));
    localStorage.setItem('claro_agent_name', context.agentName);
  }, [usageLogs, supConfig, context.agentName]);



  const syncToCloud = async (record: UsageRecord) => {
    if (!supConfig.isOnlineEnabled || !WEBHOOK_URL) return;
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: record.timestamp,
          agentName: record.agentName,
          action: record.action,
          segment: record.segment,
          scenario: record.scenario || 'N/A',
          customer: context.customerName || 'N/A',
          ticket: context.ticketId || 'N/A',
          scriptId: record.scriptId || 'N/A'
        })
      });
      setUsageLogs(prev => prev.map(l => l.id === record.id ? { ...l, synced: true } : l));
    } catch (e) { 
      console.error("Sync Error", e);
    }
  };

  const logUsage = useCallback((action: UsageRecord['action'], scriptId?: string, scenario?: string) => {
    if (!isValidAgentName) return;
    const newRecord: UsageRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      agentName: context.agentName,
      action,
      segment: selectedSegment.name,
      scriptId,
      scenario,
      synced: false
    };
    setUsageLogs(prev => [newRecord, ...prev].slice(0, 500));
    syncToCloud(newRecord);
  }, [isValidAgentName, context.agentName, context.customerName, context.ticketId, selectedSegment, supConfig]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === supConfig.accessPin) {
      setIsMetricsUnlocked(true);
      setPinInput('');
    } else {
      setToast({ show: true, message: 'PIN Incorrecto', type: 'error' });
      setPinInput('');
      setTimeout(() => setToast(p => ({...p, show: false})), 3000);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast({ show: true, message: 'Su navegador no soporta reconocimiento de voz', type: 'error' });
      setTimeout(() => setToast(p => ({...p, show: false})), 3000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'es-HN';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onend = () => setIsListening(false);
    
    recognitionRef.current.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setStudioInput(prev => (prev ? prev + ' ' : '') + finalTranscript);
      }
    };

    recognitionRef.current.start();
  };

  const filteredScripts = useMemo(() => {
    return INITIAL_DB
      .filter(s => s.segment === selectedSegment.id)
      .filter(item => {
        const content = `${item.scenario} ${item.text} ${item.category}`.toLowerCase();
        const matchesSearch = content.includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'Todas' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
      });
  }, [selectedSegment, searchTerm, selectedCategory]);

  const totalSegmentScripts = useMemo(() => INITIAL_DB.filter(s => s.segment === selectedSegment.id).length, [selectedSegment]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-800 dark:text-slate-100 antialiased transition-colors duration-500">
      <header className={`${selectedSegment.color} text-white shadow-xl sticky top-0 z-50 transition-colors`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-full h-11 w-11 flex items-center justify-center p-0.5 shadow-lg">
               <div className="w-full h-full bg-[#DA291C] rounded-full flex items-center justify-center"><span className="text-white font-black text-[11px]">Claro</span></div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">Eficiencia Conversacional</h1>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">Conexión Segura • Google Gemini • Honduras</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex gap-1 bg-black/15 p-1 rounded-2xl border border-white/10">
              <button onClick={() => setActiveTab('library')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === 'library' ? 'bg-white text-slate-900 shadow-md' : 'text-white hover:bg-white/10'}`}><BookOpen size={14}/> Biblioteca</button>
              <button onClick={() => setActiveTab('studio')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === 'studio' ? 'bg-white text-slate-900 shadow-md' : 'text-white hover:bg-white/10'}`}><Zap size={14}/> Estudio IA</button>
              <button onClick={() => setActiveTab('metrics')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === 'metrics' ? 'bg-white text-slate-900 shadow-md' : 'text-white hover:bg-white/10'}`}><BarChart3 size={14}/> Monitoreo</button>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 bg-black/15 text-white rounded-xl border border-white/10 hover:bg-black/25 transition-all">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
        <div className="bg-black/10 border-t border-white/5">
          <div className="max-w-7xl mx-auto flex overflow-x-auto scrollbar-hide px-4">
            {SEGMENTS.map(seg => (
              <button key={seg.id} onClick={() => { setSelectedSegment(seg); setSelectedCategory('Todas'); }} className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-4 ${selectedSegment.id === seg.id ? 'border-white text-white bg-white/10' : 'border-transparent text-white/50 hover:text-white'}`}>
                {seg.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 px-6 py-5 sticky top-[104px] z-40 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap lg:flex-nowrap gap-6 items-end">
          <div className="flex-1 min-w-[280px] relative group">
            <label className={`block text-[10px] font-black uppercase mb-1.5 ml-1 tracking-[0.15em] flex items-center gap-2 ${isValidAgentName ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
              <User size={12}/> Nombre Agente 
              {!isValidAgentName && <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-ping"></span>}
              {isValidAgentName && <UserCheck size={12} className="animate-in fade-in zoom-in" />}
            </label>
            <div className={`relative rounded-xl border-2 transition-all ${!isValidAgentName ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-green-500/30'}`}>
              <ContextInput 
                label="" 
                icon={isValidAgentName ? UserCheck : AlertCircle} 
                value={context.agentName} 
                onChange={v => setContext({...context, agentName: v})} 
                placeholder="NOMBRE Y APELLIDO" 
                theme={selectedSegment} 
              />
            </div>
          </div>
          <ContextInput label="Nombre Cliente" icon={MessageSquare} value={context.customerName} onChange={v => setContext({...context, customerName: v})} placeholder="Cliente" theme={selectedSegment} />
          <ContextInput label="Caso Q-Flow" icon={Hash} value={context.ticketId} onChange={v => setContext({...context, ticketId: v})} placeholder="Ticket" theme={selectedSegment} />
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 pb-24">
        {activeTab === 'library' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col gap-6 shadow-sm">
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-red-500 transition-colors" size={20} />
                <input type="text" placeholder={`Buscar en ${selectedSegment.name}...`} className={`w-full pl-14 pr-14 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none font-semibold focus:ring-4 ${selectedSegment.ring} transition-all`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition-all">
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Contenedor de Categorías - Actualizado para mostrar todas (flex-wrap) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Filtrar por Categoría:</label>
                  {(searchTerm || selectedCategory !== 'Todas') && (
                    <button 
                      onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); }} 
                      className="text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-all"
                    >
                      <FilterX size={12} /> Limpiar Filtros
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                        selectedCategory === cat 
                          ? `${selectedSegment.color} text-white shadow-lg shadow-red-500/20` 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3 bg-white/50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
              <div className="flex items-center gap-3 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                <Layers size={14} className={selectedSegment.text} />
                <span>Mostrando: <span className={`${selectedSegment.text} text-sm ml-1 font-black`}>{filteredScripts.length}</span> <span className="mx-1 text-slate-200">/</span> Total: <span className="text-slate-600 dark:text-slate-300 font-bold">{totalSegmentScripts}</span></span>
              </div>
              {(searchTerm || selectedCategory !== 'Todas') && (
                <button 
                  onClick={() => { setSearchTerm(''); setSelectedCategory('Todas'); }} 
                  className="text-red-500 font-black text-[10px] uppercase flex items-center gap-1.5 px-3 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                >
                  <FilterX size={14} /> Limpiar Filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredScripts.map(s => <ScriptCard key={s.id} script={s} context={context} onCopy={t => { navigator.clipboard.writeText(t); setToast({show: true, message: 'Copiado al portapapeles', type: 'success'}); setTimeout(() => setToast(p => ({...p, show: false})), 2000); }} onLog={logUsage} theme={selectedSegment} />)}
            </div>
          </div>
        )}



        {activeTab === 'studio' && (
          <div className="grid lg:grid-cols-2 gap-8 min-h-[500px] animate-in slide-in-from-bottom-6 duration-500">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col h-full shadow-xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h2 className={`text-2xl font-black flex items-center gap-3 ${selectedSegment.text} tracking-tighter`}><Wand2 size={28}/> Studio: Eficiencia Conversacional</h2>
                <button 
                  onClick={startListening}
                  className={`p-4 rounded-2xl transition-all flex items-center gap-3 shadow-lg active:scale-90 ${isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/10'}`}
                >
                  <Mic size={24}/>
                  <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{isListening ? 'Escuchando...' : 'Dictar Borrador'}</span>
                </button>
              </div>
              <textarea className={`w-full flex-1 p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none text-lg font-medium resize-none focus:ring-4 ${selectedSegment.ring} transition-all`} placeholder={`Pega aquí un texto informal o dicta usando el micrófono...`} value={studioInput} onChange={e => setStudioInput(e.target.value)} />
              <button onClick={async () => {
                if (!studioInput.trim() || !isValidAgentName) return;
                setIsGenerating(true);
                const res = await formalizeMessage(studioInput, { agentName: context.agentName, customerName: context.customerName }, selectedSegment.id.includes('mail'));
                if (res) { setStudioOutput(res); logUsage('formalize'); }
                setIsGenerating(false);
              }} disabled={isGenerating || !studioInput.trim() || !isValidAgentName} className={`w-full py-5 mt-6 ${selectedSegment.color} text-white text-lg font-black rounded-2xl shadow-xl disabled:opacity-50 transition-all active:scale-[0.98]`}>
                {!isValidAgentName ? 'Falta identificar Agente' : isGenerating ? <RefreshCw className="animate-spin mx-auto" size={24}/> : 'Optimizar con IA'}
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col h-full shadow-inner relative group">
                <div className="flex justify-between items-center mb-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultado: Eficiencia Conversacional</span>
                    {studioOutput && <button onClick={() => { navigator.clipboard.writeText(studioOutput); setToast({show: true, message: 'Copiado', type: 'success'}); setTimeout(() => setToast(p => ({...p, show: false})), 2000); }} className={`${selectedSegment.text} font-black text-xs flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-900/10 hover:bg-red-100 transition-all`}><Copy size={16}/> COPIAR</button>}
                </div>
                <div className="flex-1 overflow-auto">
                    {studioOutput ? <p className="text-slate-800 dark:text-slate-100 text-xl leading-relaxed whitespace-pre-wrap font-medium animate-in fade-in duration-700">{studioOutput}</p> : <div className="h-full flex flex-col items-center justify-center opacity-5"><Wand2 size={80} /><p className="font-black text-lg">Borrador vacío</p></div>}
                </div>
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
            {!isMetricsUnlocked ? (
              <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-100 dark:border-slate-800 text-center shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner"><Lock size={40} /></div>
                <h2 className="text-2xl font-black mb-2 tracking-tight">Supervisor de Proyecto</h2>
                <form onSubmit={handlePinSubmit} className="flex flex-col items-center gap-4">
                  <input type="password" placeholder="••••" maxLength={4} className="w-44 text-center text-4xl tracking-[1.2em] font-black py-5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 rounded-2xl focus:border-red-500 outline-none transition-all shadow-sm" value={pinInput} onChange={e => setPinInput(e.target.value)} />
                  <button type="submit" className="px-12 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-red-700 transition-all">Acceder a Logs</button>
                </form>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-red-500/20 shadow-2xl space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black flex items-center gap-3"><Settings className="text-red-500" /> claro-eficiencia-conversional</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="https://docs.google.com/spreadsheets/d/1e1zvxXMxLiH5GL9LHw9nxxbGNtF40tDE8uZ2RQW1Qc0/edit?usp=sharing" target="_blank" rel="noopener noreferrer" className="p-6 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-2xl flex items-center justify-between group hover:bg-green-100 transition-all shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-600 text-white rounded-xl"><Globe size={20} /></div>
                        <p className="font-black text-[10px] text-green-900 dark:text-green-100 uppercase tracking-widest">Hoja de Logs</p>
                      </div>
                      <ExternalLink size={16} className="text-green-600" />
                    </a>

                    <button onClick={() => { navigator.clipboard.writeText('https://claro-eficiencia-conversional-454240806977.us-west1.run.app'); setToast({show:true, message:'URL de producción copiada', type:'info'}); setTimeout(()=>setToast(p=>({...p, show:false})),2000); }} className="p-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl flex items-center justify-between group hover:bg-blue-100 transition-all shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-600 text-white rounded-xl"><Share2 size={20} /></div>
                        <p className="font-black text-[10px] text-blue-900 dark:text-blue-100 uppercase tracking-widest">Compartir URL</p>
                      </div>
                      <Copy size={16} className="text-blue-600" />
                    </button>
                  </div>
                  
                  <button onClick={() => setIsMetricsUnlocked(false)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cerrar Sesión Supervisor</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-white/95 dark:bg-slate-900/95 border-t py-3 px-6 fixed bottom-0 left-0 right-0 z-10 flex justify-between items-center opacity-80 hover:opacity-100 transition-opacity">
          <div className="flex flex-col">
            <span className="text-[8px] font-black tracking-[0.2em] text-slate-500 uppercase">Claro Honduras • Proyecto: claro-eficiencia-conversional</span>
            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Endpoint: us-west1 • Conexión Gemini API Activa</span>
          </div>
          <div className="flex items-center gap-4">
             {supConfig.isOnlineEnabled && <div className="flex items-center gap-2 text-[8px] font-black uppercase text-green-600"><CloudCheck size={10}/> Proyecto Vinculado OK</div>}
             <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">2026 <Heart size={8} className="text-red-500 inline fill-red-500" /> Honduras</p>
          </div>
      </footer>
      <Toast toast={toast} />
    </div>
  );
};

export default App;
