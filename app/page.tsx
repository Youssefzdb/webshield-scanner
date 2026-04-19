'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Loader2, FileJson, Database, Film, Tv, PlayCircle, RotateCcw, Key, Check, Clock, AlertCircle } from 'lucide-react';

// --- IndexedDB Helpers ---
const DB_NAME = 'AkScraperDB';
const STORE_NAME = 'scraper_progress';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveState(data: any): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, 'current_state');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadState(): Promise<any> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get('current_state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearState(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('current_state');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
// -------------------------

type Stage = 'idle' | 'fetching_sitemaps' | 'movies' | 'series' | 'episodes' | 'paused' | 'done' | 'error';

export default function Home() {
  const [stage, setStage] = useState<Stage>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({
    movies: { total: 0, processed: 0, found: 0 },
    series: { total: 0, processed: 0, found: 0 },
    episodes: { total: 0, processed: 0, found: 0 }
  });
  const [errorMsg, setErrorMsg] = useState('');
  const [hasSavedState, setHasSavedState] = useState(false);
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [sitemapUrls, setSitemapUrls] = useState<string>(
    "https://ak.sv/sitemap/movies-0.xml\n" +
    "https://ak.sv/sitemap/movies-1.xml\n" +
    "https://ak.sv/sitemap/series-0.xml\n" +
    "https://ak.sv/sitemap/episodes-0.xml\n" +
    "https://ak.sv/sitemap/episodes-1.xml\n" +
    "https://ak.sv/sitemap/episodes-2.xml\n" +
    "https://ak.sv/sitemap/episodes-3.xml\n" +
    "https://ak.sv/sitemap/episodes-4.xml\n" +
    "https://ak.sv/sitemap/episodes-5.xml\n" +
    "https://ak.sv/sitemap/episodes-6.xml\n" +
    "https://ak.sv/sitemap/episodes-7.xml\n" +
    "https://ak.sv/sitemap/episodes-8.xml\n" +
    "https://ak.sv/sitemap/episodes-9.xml"
  );
  const [apiKey, setApiKey] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [bgProgress, setBgProgress] = useState<any>(null);
  const [startTime, setStartTime] = useState<string>('');
  const isRetryModeRef = useRef(false);
  
  const isProcessing = ['fetching_sitemaps', 'movies', 'series', 'episodes'].includes(stage);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  
  const urlsRef = useRef({ movies: [] as string[], series: [] as string[], episodes: [] as string[] });
  const currentStageRef = useRef<'movies' | 'series' | 'episodes'>('movies');
  const currentIndexRef = useRef(0);
  
  const originalUrlsRef = useRef({ movies: [] as string[], series: [] as string[], episodes: [] as string[] });
  const originalStatsRef = useRef({
    movies: { total: 0, processed: 0, found: 0 },
    series: { total: 0, processed: 0, found: 0 },
    episodes: { total: 0, processed: 0, found: 0 }
  });
  const originalCurrentStageRef = useRef<'movies' | 'series' | 'episodes'>('movies');
  const originalCurrentIndexRef = useRef(0);

  const resultsRef = useRef({
    movies: [] as any[],
    series_links: [] as any[],
    series: {} as Record<string, any>,
    series_images: {} as Record<string, string>,
    episodes_success: [] as string[]
  });
  
  const statsRef = useRef({
    movies: { total: 0, processed: 0, found: 0 },
    series: { total: 0, processed: 0, found: 0 },
    episodes: { total: 0, processed: 0, found: 0 }
  });
  const logsRef = useRef<string[]>([]);

  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Poll background progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const checkProgress = async () => {
      try {
        const res = await fetch('/api/progress');
        if (res.ok) {
          const data = await res.json();
          if (data.status) {
            setBgProgress(data);
          }
        }
      } catch (e) {
        console.error('Failed to fetch background progress', e);
      }
    };

    checkProgress();
    interval = setInterval(checkProgress, 5000);
    return () => clearInterval(interval);
  }, []);

  const startBackgroundScrape = async () => {
    try {
      const rawInputs = sitemapUrls.split('\n').map(u => u.trim()).filter(Boolean);
      const urls = rawInputs.map(input => {
        // If it's just a number, treat it as an ak.sv episode ID
        if (/^\d+$/.test(input)) {
          return `https://ak.sv/episode/${input}/`;
        }
        return input;
      });
      
      let utcStartTime = undefined;
      if (startTime) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        const utcHours = date.getUTCHours();
        const utcMinutes = date.getUTCMinutes();
        utcStartTime = `${utcHours.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')}`;
      }

      const res = await fetch('/api/background-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrls: urls, startTime: utcStartTime })
      });
      if (res.ok) {
        if (startTime) {
          addLog(`🚀 تم جدولة الاستخراج التلقائي ليبدأ يومياً الساعة ${startTime} (بتوقيتك المحلي).`);
        } else {
          addLog('🚀 تم بدء الاستخراج التلقائي في الخلفية. سيعمل كل 24 ساعة.');
        }
      } else {
        addLog('❌ فشل بدء الاستخراج التلقائي.');
      }
    } catch (e) {
      addLog('❌ حدث خطأ أثناء بدء الاستخراج التلقائي.');
    }
  };

  const addLog = (msg: string) => {
    const newLog = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logsRef.current = [...logsRef.current, newLog];
    setLogs([...logsRef.current]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const fetchAndCopyApiKey = async () => {
    try {
      const res = await fetch('/api/get-key');
      const data = await res.json();
      if (data.apiKey) {
        setApiKey(data.apiKey);
        await navigator.clipboard.writeText(data.apiKey);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
      }
    } catch (err) {
      console.error('Failed to fetch API key', err);
    }
  };

  useEffect(() => {
    loadState().then(state => {
      if (state && state.urls && (state.urls.movies?.length > 0 || state.urls.episodes?.length > 0)) {
        setHasSavedState(true);
      }
    }).catch(console.error);
  }, []);

  const returnToNormal = () => {
    setIsRetryMode(false);
    isRetryModeRef.current = false;
    
    urlsRef.current = originalUrlsRef.current;
    currentStageRef.current = originalCurrentStageRef.current;
    currentIndexRef.current = originalCurrentIndexRef.current;
    
    statsRef.current = {
      movies: {
        ...originalStatsRef.current.movies,
        found: resultsRef.current.movies.length
      },
      series: {
        ...originalStatsRef.current.series,
        found: resultsRef.current.series_links.length
      },
      episodes: {
        ...originalStatsRef.current.episodes,
        found: resultsRef.current.episodes_success.length
      }
    };
    setStats({ ...statsRef.current });
    addLog('🔙 تم العودة للوضع الطبيعي.');
  };

  const handlePause = () => {
    isPausedRef.current = true;
    addLog('⏳ جاري إيقاف العملية بعد انتهاء الدفعة الحالية...');
  };

  const handleResume = () => {
    isPausedRef.current = false;
    processLoop();
  };

  const resetStage = async (targetStage: 'movies' | 'series' | 'episodes') => {
    if (isProcessing) return;
    
    if (targetStage === 'movies') resultsRef.current.movies = [];
    if (targetStage === 'series') resultsRef.current.series_links = [];
    if (targetStage === 'episodes') {
      resultsRef.current.series = {};
      resultsRef.current.episodes_success = [];
    }

    statsRef.current[targetStage].processed = 0;
    statsRef.current[targetStage].found = 0;
    setStats({ ...statsRef.current });

    const stages: ('movies' | 'series' | 'episodes')[] = ['movies', 'series', 'episodes'];
    const targetIdx = stages.indexOf(targetStage);
    const currentIdx = stages.indexOf(currentStageRef.current);
    
    if (targetIdx < currentIdx || stage === 'done' || stage === 'error') {
        currentStageRef.current = targetStage;
    }

    setStage('paused');
    addLog(`🔄 تم تصفير مرحلة ${targetStage === 'movies' ? 'الأفلام' : targetStage === 'series' ? 'المسلسلات' : 'الحلقات'}. اضغط استئناف للبدء.`);

    await saveState({
      urls: urlsRef.current,
      currentStage: currentStageRef.current,
      currentIndex: statsRef.current[currentStageRef.current].processed,
      results: resultsRef.current,
      stats: statsRef.current,
      logs: logsRef.current
    });
  };

  const restoreState = async () => {
    try {
      const state = await loadState();
      if (state) {
        urlsRef.current = state.urls;
        currentStageRef.current = state.currentStage;
        currentIndexRef.current = state.currentIndex;
        resultsRef.current = state.results;
        if (!resultsRef.current.episodes_success) {
          resultsRef.current.episodes_success = [];
        }
        if (!resultsRef.current.series_images) {
          resultsRef.current.series_images = {};
        }
        statsRef.current = state.stats;
        logsRef.current = state.logs || [];
        
        setStats(state.stats);
        setLogs(logsRef.current);
        setStage('paused');
        addLog('🔄 تم استعادة التقدم المحفوظ بنجاح. يمكنك استئناف العمل الآن.');
      }
    } catch (e) {
      console.error(e);
      addLog('❌ فشل استعادة التقدم المحفوظ.');
    }
  };

  const startProcess = async () => {
    try {
      await clearState();
      setHasSavedState(false);
      setIsRetryMode(false);
      isRetryModeRef.current = false;
      
      setStage('fetching_sitemaps');
      logsRef.current = [];
      setLogs([]);
      resultsRef.current = { movies: [], series_links: [], series: {}, series_images: {}, episodes_success: [] };
      statsRef.current = {
        movies: { total: 0, processed: 0, found: 0 },
        series: { total: 0, processed: 0, found: 0 },
        episodes: { total: 0, processed: 0, found: 0 }
      };
      setStats(statsRef.current);
      isPausedRef.current = false;
      currentIndexRef.current = 0;
      currentStageRef.current = 'movies';
      
      addLog('📥 جمع الروابط من sitemap...');
      
      const sitemapsArray = sitemapUrls.split('\n').map(u => u.trim()).filter(Boolean);
      
      const sitemapRes = await fetch('/api/sitemaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemaps: sitemapsArray })
      });
      if (!sitemapRes.ok) throw new Error('فشل في جلب خرائط الموقع');
      const allLinks = await sitemapRes.json();
      
      urlsRef.current = {
        movies: allLinks.movies || [],
        series: allLinks.series || [],
        episodes: allLinks.episodes || []
      };
      
      statsRef.current.movies.total = urlsRef.current.movies.length;
      statsRef.current.series.total = urlsRef.current.series.length;
      statsRef.current.episodes.total = urlsRef.current.episodes.length;
      setStats({ ...statsRef.current });
      
      addLog(`📊 الإجمالي: أفلام ${statsRef.current.movies.total}, مسلسلات ${statsRef.current.series.total}, حلقات ${statsRef.current.episodes.total}`);
      
      await processLoop();

    } catch (err: any) {
      setStage('error');
      setErrorMsg(err.message);
      addLog(`❌ خطأ: ${err.message}`);
    }
  };

  const processLoop = async () => {
    try {
      const stages: ('movies' | 'series' | 'episodes')[] = ['movies', 'series', 'episodes'];
      let stageIdx = stages.indexOf(currentStageRef.current);
      
      for (let s = stageIdx; s < stages.length; s++) {
        const currentS = stages[s];
        currentStageRef.current = currentS;
        
        const urls = urlsRef.current[currentS];
        if (urls.length === 0) continue;

        currentIndexRef.current = statsRef.current[currentS].processed;

        if (currentIndexRef.current >= urls.length) {
          continue;
        }

        setStage(currentS);

        if (currentIndexRef.current === 0) {
            addLog(`🚀 بدء معالجة ${currentS === 'movies' ? 'الأفلام' : currentS === 'series' ? 'المسلسلات' : 'الحلقات'}...`);
        }

        const BATCH_SIZE = 50; // 50 items per request
        const CONCURRENT_BATCHES = 8; // Increased from 4 to 8 (400 items total per cycle)

        for (let i = currentIndexRef.current; i < urls.length; i += BATCH_SIZE * CONCURRENT_BATCHES) {
          if (isPausedRef.current) {
            setStage('paused');
            addLog('⏸️ تم إيقاف العملية مؤقتاً. تم حفظ التقدم تلقائياً.');
            
            const stateToSave = isRetryModeRef.current ? {
              urls: originalUrlsRef.current,
              currentStage: originalCurrentStageRef.current,
              currentIndex: originalCurrentIndexRef.current,
              results: resultsRef.current,
              stats: {
                movies: { ...originalStatsRef.current.movies, found: resultsRef.current.movies.length },
                series: { ...originalStatsRef.current.series, found: resultsRef.current.series_links.length },
                episodes: { ...originalStatsRef.current.episodes, found: resultsRef.current.episodes_success.length }
              },
              logs: logsRef.current
            } : {
              urls: urlsRef.current,
              currentStage: currentStageRef.current,
              currentIndex: currentIndexRef.current,
              results: resultsRef.current,
              stats: statsRef.current,
              logs: logsRef.current
            };

            await saveState(stateToSave);
            return;
          }

          const promises = [];
          for (let j = 0; j < CONCURRENT_BATCHES; j++) {
            const start = i + j * BATCH_SIZE;
            if (start >= urls.length) break;
            const batch = urls.slice(start, start + BATCH_SIZE);
            promises.push(
              fetch('/api/process', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey || 'ak-secret-key-2026'
                },
                body: JSON.stringify({ urls: batch, type: currentS })
              })
              .then(res => res.ok ? res.json() : { results: [] })
              .then(data => data.results || [])
              .catch(e => { console.error(e); return []; })
            );
          }

          const batchResults = await Promise.all(promises);
          const flatResults = batchResults.flat();
          
          if (currentS === 'movies') {
            resultsRef.current.movies.push(...flatResults);
          } else if (currentS === 'series') {
            resultsRef.current.series_links.push(...flatResults);
          } else if (currentS === 'episodes') {
            flatResults.forEach(ep => {
              const { seriesName, season, episode, id, direct_url, original_url } = ep;
              if (!resultsRef.current.series[seriesName]) {
                resultsRef.current.series[seriesName] = {};
              }
              // We intentionally do NOT use the episode's image as the series image here,
              // because it's usually just an episode thumbnail, not the series poster.
              // Series images should come from the 'series' sitemap processing.
              const seasonKey = `Season ${season}`;
              if (!resultsRef.current.series[seriesName][seasonKey]) {
                resultsRef.current.series[seriesName][seasonKey] = {};
              }
              const episodeKey = id ? `Episode ${episode} (ID: ${id})` : `Episode ${episode}`;
              resultsRef.current.series[seriesName][seasonKey][episodeKey] = direct_url;
              if (original_url) {
                resultsRef.current.episodes_success.push(original_url);
              }
            });
          }

          let processedCount = i + (BATCH_SIZE * CONCURRENT_BATCHES);
          if (processedCount > urls.length) processedCount = urls.length;
          
          statsRef.current[currentS].processed = processedCount;
          statsRef.current[currentS].found += flatResults.length;
          currentIndexRef.current = processedCount;

          setStats({ ...statsRef.current });
          
          addLog(`✅ [${currentS === 'movies' ? 'أفلام' : currentS === 'series' ? 'مسلسلات' : 'حلقات'}] تمت معالجة ${processedCount}/${urls.length} (نجاح: ${statsRef.current[currentS].found})`);
          
          const stateToSave = isRetryModeRef.current ? {
            urls: originalUrlsRef.current,
            currentStage: originalCurrentStageRef.current,
            currentIndex: originalCurrentIndexRef.current,
            results: resultsRef.current,
            stats: {
              movies: { ...originalStatsRef.current.movies, found: resultsRef.current.movies.length },
              series: { ...originalStatsRef.current.series, found: resultsRef.current.series_links.length },
              episodes: { ...originalStatsRef.current.episodes, found: resultsRef.current.episodes_success.length }
            },
            logs: logsRef.current
          } : {
            urls: urlsRef.current,
            currentStage: currentStageRef.current,
            currentIndex: currentIndexRef.current,
            results: resultsRef.current,
            stats: statsRef.current,
            logs: logsRef.current
          };

          await saveState(stateToSave);
        }
        
        currentIndexRef.current = 0;
      }

      if (!isPausedRef.current) {
        if (isRetryModeRef.current) {
          addLog(`✅ اكتملت عملية إعادة المحاولة!`);
          returnToNormal();
          
          const isNormalDone = originalCurrentStageRef.current === 'episodes' && 
                               originalCurrentIndexRef.current >= originalUrlsRef.current.episodes.length;
                               
          if (!isNormalDone) {
            setStage('paused');
            addLog('⏸️ تم العودة للاستخراج الطبيعي. اضغط استئناف لإكمال باقي الروابط.');
            await saveState({
              urls: urlsRef.current,
              currentStage: currentStageRef.current,
              currentIndex: currentIndexRef.current,
              results: resultsRef.current,
              stats: statsRef.current,
              logs: logsRef.current
            });
          } else {
            setStage('done');
            addLog(`✅ اكتملت العملية بالكامل! تم تجميع المسلسلات والحلقات بنجاح.`);
            await clearState();
            setHasSavedState(false);
          }
        } else {
          setStage('done');
          addLog(`✅ اكتملت العملية بالكامل! تم تجميع المسلسلات والحلقات بنجاح.`);
          await clearState();
          setHasSavedState(false);
        }
      }
    } catch (err: any) {
      setStage('error');
      setErrorMsg(err.message);
      addLog(`❌ خطأ: ${err.message}`);
    }
  };

  const retryFailedLinks = async () => {
    if (isProcessing) return;
    
    const successfulMovies = new Set(resultsRef.current.movies.map(m => m.original_url));
    const failedMovies = urlsRef.current.movies.filter(url => !successfulMovies.has(url));

    const successfulSeries = new Set(resultsRef.current.series_links.map(s => s.original_url));
    const failedSeries = urlsRef.current.series.filter(url => !successfulSeries.has(url));

    const successfulEpisodes = new Set(resultsRef.current.episodes_success || []);
    const failedEpisodes = urlsRef.current.episodes.filter(url => !successfulEpisodes.has(url));

    const totalFailed = failedMovies.length + failedSeries.length + failedEpisodes.length;

    if (totalFailed === 0) {
      addLog('✅ جميع الروابط تم استخراجها بنجاح، لا توجد روابط فاشلة لإعادة المحاولة.');
      return;
    }

    // Save original state before retry
    originalUrlsRef.current = { ...urlsRef.current };
    originalStatsRef.current = {
      movies: { ...statsRef.current.movies },
      series: { ...statsRef.current.series },
      episodes: { ...statsRef.current.episodes }
    };
    originalCurrentStageRef.current = currentStageRef.current;
    originalCurrentIndexRef.current = currentIndexRef.current;

    setIsRetryMode(true);
    isRetryModeRef.current = true;

    addLog(`🔄 جاري إعادة محاولة ${totalFailed} رابط فاشل...`);

    urlsRef.current = {
      movies: failedMovies,
      series: failedSeries,
      episodes: failedEpisodes
    };

    statsRef.current.movies.total = failedMovies.length;
    statsRef.current.movies.processed = 0;
    statsRef.current.movies.found = 0;
    
    statsRef.current.series.total = failedSeries.length;
    statsRef.current.series.processed = 0;
    statsRef.current.series.found = 0;
    
    statsRef.current.episodes.total = failedEpisodes.length;
    statsRef.current.episodes.processed = 0;
    statsRef.current.episodes.found = 0;
    
    setStats({ ...statsRef.current });

    if (failedMovies.length > 0) currentStageRef.current = 'movies';
    else if (failedSeries.length > 0) currentStageRef.current = 'series';
    else if (failedEpisodes.length > 0) currentStageRef.current = 'episodes';

    currentIndexRef.current = 0;
    isPausedRef.current = false;
    
    await processLoop();
  };

  const downloadJson = () => {
    // Remove original_url from movies
    const cleanMovies = resultsRef.current.movies.map(({ original_url, ...rest }) => rest);
    
    // Merge series_links and series
    const seriesMap: Record<string, any> = {};
    
    // First, add all series from series_links
    resultsRef.current.series_links.forEach(({ title, image }) => {
      if (!seriesMap[title]) {
        seriesMap[title] = { title, seasons: {} };
      }
      if (image) {
        seriesMap[title].image = image;
      }
    });

    // Then, add episodes from series
    Object.entries(resultsRef.current.series).forEach(([seriesName, seasons]) => {
      if (!seriesMap[seriesName]) {
        seriesMap[seriesName] = { title: seriesName, seasons: {} };
      }
      seriesMap[seriesName].seasons = seasons;
      if (resultsRef.current.series_images && resultsRef.current.series_images[seriesName]) {
        seriesMap[seriesName].image = resultsRef.current.series_images[seriesName];
      }
    });

    const finalSeries = Object.values(seriesMap);

    const finalResult = {
      generated: new Date().toISOString().replace('T', ' ').substring(0, 19),
      statistics: {
        movies: resultsRef.current.movies.length,
        series: finalSeries.length,
        episodes: resultsRef.current.episodes_success?.length || 0
      },
      movies: cleanMovies,
      series: finalSeries
    };

    const blob = new Blob([JSON.stringify(finalResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ak_content_structured.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <FileJson size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">محول سكربت استخراج الروابط</h1>
              <p className="text-gray-500 text-sm mt-1">استخراج ذكي ومنظم (أفلام، مسلسلات، حلقات)</p>
            </div>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto flex-wrap justify-end items-center">
            <a href="/scanner" className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm border border-indigo-100 transition-colors font-medium">
              أداة فحص OscarTV
            </a>
            {bgProgress && (bgProgress.status === 'running' || bgProgress.status === 'scheduled') && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm border border-emerald-100 mr-auto">
                {bgProgress.status === 'running' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Clock size={16} />
                )}
                <span className="font-medium">
                  {bgProgress.status === 'running' ? 'الاستخراج التلقائي يعمل في الخلفية...' : `مجدول للبدء في ${bgProgress.scheduledTime ? new Date(bgProgress.scheduledTime).toLocaleTimeString() : 'غير محدد'}`}
                </span>
              </div>
            )}

            {stage === 'idle' && hasSavedState && (
              <button
                onClick={restoreState}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
              >
                <Database size={18} />
                <span>استعادة التقدم المحفوظ</span>
              </button>
            )}
            
            {stage === 'idle' || stage === 'error' || stage === 'done' ? (
              <>
                <button
                  onClick={startProcess}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                >
                  <Play size={18} />
                  <span>{hasSavedState && stage === 'idle' ? 'بدء استخراج جديد' : 'استخراج طبيعي'}</span>
                </button>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1">
                  <span className="text-sm text-gray-600">وقت البدء:</span>
                  <input 
                    type="time" 
                    value={startTime} 
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm text-gray-800"
                  />
                </div>
                <button
                  onClick={startBackgroundScrape}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                >
                  <Clock size={18} />
                  <span>استخراج تلقائي كل 24 ساعة</span>
                </button>
                {startTime && (
                  <div className="w-full mt-2 text-sm text-amber-600 flex flex-col items-center justify-center gap-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-1 font-bold">
                      <AlertCircle size={16} />
                      <span>تنبيه هام حول الاستخراج التلقائي:</span>
                    </div>
                    <p className="text-center">بسبب طبيعة الخوادم، قد يتوقف الاستخراج التلقائي إذا تم إغلاق الصفحة. يرجى إبقاء هذه الصفحة مفتوحة، أو إعداد <strong>Cron Job</strong> خارجي لزيارة الرابط التالي كل 5 دقائق لإبقاء الخادم متيقظاً:</p>
                    <code className="bg-amber-100 px-2 py-1 rounded text-xs mt-1" dir="ltr">
                      {origin}/api/ping
                    </code>
                  </div>
                )}
              </>
            ) : isProcessing ? (
              <button
                onClick={handlePause}
                disabled={stage === 'fetching_sitemaps' || isPausedRef.current}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {stage === 'fetching_sitemaps' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Pause size={18} />
                )}
                <span>{stage === 'fetching_sitemaps' ? 'جاري العمل...' : isPausedRef.current ? 'جاري الإيقاف...' : 'إيقاف مؤقت'}</span>
              </button>
            ) : stage === 'paused' ? (
              <>
                <button
                  onClick={handleResume}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                >
                  <Play size={18} />
                  <span>{isRetryMode ? 'استئناف المحاولة' : 'استئناف'}</span>
                </button>
                {isRetryMode ? (
                  <button
                    onClick={() => {
                      returnToNormal();
                      setStage('paused');
                    }}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                  >
                    <Play size={18} />
                    <span>العودة للاستخراج الطبيعي</span>
                  </button>
                ) : (
                  <button
                    onClick={startProcess}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                  >
                    <Play size={18} />
                    <span>استخراج طبيعي جديد</span>
                  </button>
                )}
              </>
            ) : null}
            
            {(stage === 'done' || stage === 'paused') && (
              <>
                <button
                  onClick={retryFailedLinks}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                >
                  <RotateCcw size={18} />
                  <span>إعادة محاولة الفاشلة</span>
                </button>
                <button
                  onClick={downloadJson}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
                >
                  <Download size={18} />
                  <span>تحميل JSON المنظم</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sitemap Configuration */}
        {(stage === 'idle' || stage === 'error' || stage === 'done') && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                روابط خرائط الموقع (Sitemaps) - رابط في كل سطر:
              </label>
              <textarea
                value={sitemapUrls}
                onChange={(e) => setSitemapUrls(e.target.value)}
                className="w-full h-40 p-3 border border-gray-200 rounded-xl text-left font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                dir="ltr"
                placeholder="https://example.com/sitemap.xml"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <div className="col-span-1 space-y-4">
            
            {/* Movies Stats */}
            <div className={`bg-white rounded-2xl shadow-sm border ${stage === 'movies' ? 'border-blue-400 ring-1 ring-blue-400' : 'border-gray-100'} p-5 transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gray-700 font-semibold">
                  <Film size={18} className="text-blue-500" />
                  <span>الأفلام</span>
                </div>
                {stats.movies.total > 0 && (
                  <button 
                    onClick={() => resetStage('movies')} 
                    disabled={isProcessing}
                    className={`transition-colors ${isProcessing ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                    title={isProcessing ? "قم بإيقاف العملية مؤقتاً لتتمكن من التصفير" : "إعادة تعيين مرحلة الأفلام"}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'الروابط الفاشلة' : 'الإجمالي'}</div>
                  <div className="text-xl font-bold text-gray-900">{stats.movies.total}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'تم استرداده' : 'ناجح'}</div>
                  <div className="text-xl font-bold text-emerald-600">{stats.movies.found}</div>
                </div>
              </div>
              {stats.movies.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{isRetryMode ? 'تمت معالجة الفاشلة' : 'تمت المعالجة'}</span>
                    <span>{stats.movies.processed} / {stats.movies.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (stats.movies.processed / stats.movies.total) * 100)}%` }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Series Stats */}
            <div className={`bg-white rounded-2xl shadow-sm border ${stage === 'series' ? 'border-purple-400 ring-1 ring-purple-400' : 'border-gray-100'} p-5 transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gray-700 font-semibold">
                  <Tv size={18} className="text-purple-500" />
                  <span>المسلسلات</span>
                </div>
                {stats.series.total > 0 && (
                  <button 
                    onClick={() => resetStage('series')} 
                    disabled={isProcessing}
                    className={`transition-colors ${isProcessing ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                    title={isProcessing ? "قم بإيقاف العملية مؤقتاً لتتمكن من التصفير" : "إعادة تعيين مرحلة المسلسلات"}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'الروابط الفاشلة' : 'الإجمالي'}</div>
                  <div className="text-xl font-bold text-gray-900">{stats.series.total}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'تم استرداده' : 'ناجح'}</div>
                  <div className="text-xl font-bold text-emerald-600">{stats.series.found}</div>
                </div>
              </div>
              {stats.series.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{isRetryMode ? 'تمت معالجة الفاشلة' : 'تمت المعالجة'}</span>
                    <span>{stats.series.processed} / {stats.series.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (stats.series.processed / stats.series.total) * 100)}%` }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* Episodes Stats */}
            <div className={`bg-white rounded-2xl shadow-sm border ${stage === 'episodes' ? 'border-orange-400 ring-1 ring-orange-400' : 'border-gray-100'} p-5 transition-all`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gray-700 font-semibold">
                  <PlayCircle size={18} className="text-orange-500" />
                  <span>الحلقات</span>
                </div>
                {stats.episodes.total > 0 && (
                  <button 
                    onClick={() => resetStage('episodes')} 
                    disabled={isProcessing}
                    className={`transition-colors ${isProcessing ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                    title={isProcessing ? "قم بإيقاف العملية مؤقتاً لتتمكن من التصفير" : "إعادة تعيين مرحلة الحلقات"}
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'الروابط الفاشلة' : 'الإجمالي'}</div>
                  <div className="text-xl font-bold text-gray-900">{stats.episodes.total}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isRetryMode ? 'تم استرداده' : 'ناجح'}</div>
                  <div className="text-xl font-bold text-emerald-600">{stats.episodes.found}</div>
                </div>
              </div>
              {stats.episodes.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{isRetryMode ? 'تمت معالجة الفاشلة' : 'تمت المعالجة'}</span>
                    <span>{stats.episodes.processed} / {stats.episodes.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (stats.episodes.processed / stats.episodes.total) * 100)}%` }}></div>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Logs Terminal */}
          <div className="col-span-1 md:col-span-2 bg-gray-900 rounded-2xl shadow-sm border border-gray-800 p-4 flex flex-col h-[500px]">
            <div className="flex items-center gap-2 mb-4 px-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-400 text-xs ml-auto font-mono">Terminal</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-sm space-y-1.5 text-gray-300 px-2 scrollbar-thin scrollbar-thumb-gray-700">
              {logs.length === 0 ? (
                <div className="text-gray-600 italic">في انتظار بدء العملية...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-emerald-400' : log.includes('🚀') ? 'text-blue-300 font-bold mt-2' : ''}`}>
                    {log}
                  </div>
                ))
              )}
              {isProcessing && stage !== 'fetching_sitemaps' && (
                <div className="flex items-center gap-2 text-blue-400 mt-2">
                  <Loader2 size={14} className="animate-spin" />
                  <span>جاري معالجة {stage === 'movies' ? 'الأفلام' : stage === 'series' ? 'المسلسلات' : 'الحلقات'}...</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
        
        {/* Background Progress Card */}
        {bgProgress && bgProgress.status !== 'idle' && (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Clock size={20} className="text-emerald-600" />
                حالة الاستخراج التلقائي (الخلفية)
              </h2>
              <div className="flex items-center gap-3">
                {bgProgress.status === 'done' && (
                  <a
                    href="/latest-scrape.json"
                    download="ak_content_structured_auto.json"
                    className="flex items-center gap-1 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Download size={14} />
                    تحميل الملف
                  </a>
                )}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  bgProgress.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  bgProgress.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                  bgProgress.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {bgProgress.status === 'running' ? 'قيد التشغيل' :
                   bgProgress.status === 'done' ? 'مكتمل' :
                   bgProgress.status === 'error' ? 'خطأ' : 'متوقف'}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">الأفلام</div>
                <div className="font-bold text-gray-900">{bgProgress.stats?.movies?.processed || 0} / {bgProgress.stats?.movies?.total || 0}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">المسلسلات</div>
                <div className="font-bold text-gray-900">{bgProgress.stats?.series?.processed || 0} / {bgProgress.stats?.series?.total || 0}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xs text-gray-500 mb-1">الحلقات</div>
                <div className="font-bold text-gray-900">{bgProgress.stats?.episodes?.processed || 0} / {bgProgress.stats?.episodes?.total || 0}</div>
              </div>
            </div>
            
            <div className="bg-gray-900 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-gray-300 scrollbar-thin scrollbar-thumb-gray-700">
              {bgProgress.logs?.map((log: string, i: number) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
              {(!bgProgress.logs || bgProgress.logs.length === 0) && (
                <div className="text-gray-600 italic">لا توجد سجلات بعد...</div>
              )}
            </div>
          </div>
        )}

        {/* API Usage Guide */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Database size={20} className="text-blue-600" />
              استخدام الـ API للبحث المباشر
            </h2>
            <button
              onClick={fetchAndCopyApiKey}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
                isCopied 
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
              }`}
            >
              {isCopied ? <Check size={16} /> : <Key size={16} />}
              <span className="text-sm">{isCopied ? 'تم نسخ المفتاح!' : 'نسخ مفتاح الـ API'}</span>
            </button>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            الآن أصبح النظام يعمل على خطوتين لتوفير ميزة البحث السريع (Autocomplete) في موقعك الثاني.
          </p>
          
          <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm text-gray-300 overflow-x-auto" dir="ltr">
            <div className="text-emerald-400 mb-2">{/* الخطوة 1: البحث وجلب النتائج (مع الصور) */}</div>
            <div className="mb-4">
              <span className="text-blue-400">GET</span> /api/search?q=<span className="text-yellow-300">الحفرة</span>
            </div>
            
            <div className="text-emerald-400 mb-2">{/* يجب إرسال مفتاح الـ API في الـ Headers للحماية */}</div>
            <div className="mb-4">
              x-api-key: <span className="text-yellow-300">{apiKey || 'ak-secret-key-2026'}</span>
            </div>
            
            <div className="text-emerald-400 mb-2">{/* مثال على رد البحث (Response) */}</div>
            <pre className="text-gray-300 mb-6">
{`{
  "success": true,
  "query": "الحفرة",
  "results": [
    {
      "title": "مسلسل الحفرة الموسم الرابع",
      "image": "https://ak.sv/wp-content/uploads/...",
      "url": "https://ak.sv/series/cukur-s4",
      "type": "series"
    },
    {
      "title": "فيلم الحفرة",
      "image": "https://ak.sv/wp-content/uploads/...",
      "url": "https://ak.sv/movie/cukur-movie",
      "type": "movie"
    }
  ]
}`}
            </pre>

            <div className="text-emerald-400 mb-2">{/* الخطوة 2: استخراج الروابط المباشرة (عندما يختار المستخدم نتيجة) */}</div>
            <div className="mb-4">
              <span className="text-blue-400">GET</span> /api/extract?url=<span className="text-yellow-300">https://ak.sv/series/cukur-s4</span>
            </div>

            <div className="text-emerald-400 mb-2">{/* مثال على رد الاستخراج لمسلسل */}</div>
            <pre className="text-gray-300 mb-6">
{`{
  "success": true,
  "type": "series",
  "totalEpisodes": 39,
  "episodes": [
    {
      "episode": 1,
      "directLink": "https://.../video.mp4"
    },
    ...
  ]
}`}
            </pre>

            <div className="text-emerald-400 mb-2">{/* مثال على رد الاستخراج لفيلم */}</div>
            <pre className="text-gray-300">
{`{
  "success": true,
  "type": "movie",
  "directLink": "https://.../video.mp4"
}`}
            </pre>
          </div>
        </div>

      </div>
    </div>
  );
}
