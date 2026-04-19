'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Download, FileJson, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface SeriesData {
  id: number;
  title: string | null;
  seasons: Record<string, Record<string, string>>;
}

export default function OscarScanner() {
  const [idInput, setIdInput] = useState<string>('1, 3, 4, 5');
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({ series: 0, episodes: 0, links: 0 });
  
  const isScanningRef = useRef(false);
  const seriesRef = useRef<SeriesData[]>([]);
  const allLinksRef = useRef<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, msg]); 
  };

  const fetchApi = async (action: string, id: number) => {
    try {
      const res = await fetch(`/api/oscar?action=${action}&id=${id}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 'success') return data.data;
      return null;
    } catch (e) {
      return null;
    }
  };

  const getSeriesTitle = (seriesId: number, episodes: any[]) => {
    if (episodes && episodes.length > 0) {
      const title = episodes[0].series_title;
      if (title) return title;
    }
    return `Series_${seriesId}`;
  };

  const fetchBestLink = async (episodeId: number) => {
    const links = await fetchApi('watch_links', episodeId);
    if (!links || links.length === 0) return null;

    // Prefer b2.shahidtv.net
    for (const item of links) {
      if (item.url && item.url.includes('b2.shahidtv.net')) {
        return { url: item.url, quality: item.quality || 'Auto', server: item.server_name || 'Unknown' };
      }
    }
    // Fallback to any
    for (const item of links) {
      if (item.url) {
        return { url: item.url, quality: item.quality || 'Auto', server: item.server_name || 'Unknown' };
      }
    }
    return null;
  };

  const startScan = async () => {
    if (isScanning) return;
    
    const idList: number[] = [];
    const parts = idInput.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr.trim());
        const end = parseInt(endStr.trim());
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            idList.push(i);
          }
        }
      } else {
        const num = parseInt(trimmed);
        if (!isNaN(num)) {
          idList.push(num);
        }
      }
    }

    if (idList.length === 0) {
      addLog('❌ الرجاء إدخال معرفات صحيحة');
      return;
    }

    setIsScanning(true);
    isScanningRef.current = true;
    setLogs([]);
    seriesRef.current = [];
    allLinksRef.current = [];
    setStats({ series: 0, episodes: 0, links: 0 });

    addLog(`🎬 فحص ${idList.length} معرف...\n`);

    for (let idx = 0; idx < idList.length; idx++) {
      if (!isScanningRef.current) break;
      
      const sid = idList[idx];
      setCurrentId(sid);
      addLog(`[${idx + 1}/${idList.length}] 🔍 ID: ${sid}`);

      const seasons = await fetchApi('seasons', sid);

      if (!seasons || seasons.length === 0) {
        addLog(`   ❌ لا توجد مواسم`);
        continue;
      }

      const seriesData: SeriesData = {
        id: sid,
        title: null,
        seasons: {}
      };

      let totalEpisodes = 0;

      for (const season of seasons) {
        if (!isScanningRef.current) break;
        
        const seasonId = season.id;
        const seasonNum = season.season_number || 1;
        const episodesCount = season.episodes_count || 0;

        addLog(`   🎬 موسم ${seasonNum} (${episodesCount} حلقة)...`);

        const episodes = await fetchApi('episodes', seasonId);

        if (!episodes || episodes.length === 0) {
          addLog(`      ❌ لا توجد حلقات`);
          continue;
        }

        if (!seriesData.title) {
          seriesData.title = getSeriesTitle(sid, episodes);
          addLog(`   📺 الاسم: ${seriesData.title}`);
        }

        const seasonEpisodes: Record<string, string> = {};

        for (const ep of episodes) {
          if (!isScanningRef.current) break;

          const epNum = ep.episode_number || 0;
          const epId = ep.id;

          if (!epId || !epNum) continue;

          const link = await fetchBestLink(epId);

          if (link) {
            const epKey = `Episode ${epNum}`;
            seasonEpisodes[epKey] = link.url;
            allLinksRef.current.push(link.url);
            totalEpisodes++;

            if (epNum % 10 === 0 || epNum === 1) {
              const server = link.url.includes('b2.shahidtv.net') ? 'b2' : 'other';
              addLog(`      ✅ حلقة ${epNum}: ${link.quality} (${server})`);
            }
          } else {
            if (epNum % 10 === 0 || epNum === 1) {
              addLog(`      ❌ حلقة ${epNum}: لا يوجد رابط`);
            }
          }

          await new Promise(r => setTimeout(r, 200)); // 0.2s delay as in python script
        }

        if (Object.keys(seasonEpisodes).length > 0) {
          seriesData.seasons[`Season ${seasonNum}`] = seasonEpisodes;
        }
      }

      if (Object.keys(seriesData.seasons).length > 0) {
        seriesRef.current.push(seriesData);
        setStats(prev => ({
          series: prev.series + 1,
          episodes: prev.episodes + totalEpisodes,
          links: prev.links + totalEpisodes
        }));
        addLog(`   📊 ${totalEpisodes} حلقة ✓\n`);
      } else {
        addLog(`   ⚠️ لا توجد حلقات بروابط\n`);
      }

      await new Promise(r => setTimeout(r, 1000)); // 1s delay as in python script
    }

    setIsScanning(false);
    setCurrentId(null);
    addLog(`\n✅ تم الحفظ:`);
    addLog(`   - new_series_discovered.json (${seriesRef.current.length} مسلسل)`);
    addLog(`   - new_series_urls.txt (${allLinksRef.current.length} رابط)`);
    addLog(`\n📊 الإحصائيات:`);
    addLog(`   - مسلسلات جديدة: ${seriesRef.current.length}`);
    addLog(`   - حلقات: ${allLinksRef.current.length}`);
    addLog(`   - روابط: ${allLinksRef.current.length}`);
  };

  const stopScan = () => {
    isScanningRef.current = false;
    setIsScanning(false);
    addLog(`🛑 تم إيقاف الفحص.`);
  };

  const downloadJson = () => {
    const output = {
      generated: new Date().toISOString().replace('T', ' ').substring(0, 19),
      statistics: stats,
      series: seriesRef.current
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'new_series_discovered.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadUrls = () => {
    const blob = new Blob([allLinksRef.current.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'new_series_urls.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">استخراج المسلسلات الجديدة</h1>
            <p className="text-gray-400">سحب المسلسلات والحلقات من قائمة معرفات (IDs)</p>
          </div>
          <Link href="/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors flex items-center gap-2">
            العودة للأداة الرئيسية
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-700 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                قائمة المعرفات (IDs)
              </label>
              <input
                type="text"
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
                disabled={isScanning}
                placeholder="مثال: 1, 3, 4, 5 أو 1-100"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-2">يمكنك إدخال أرقام مفصولة بفواصل (1, 2, 3) أو نطاق (1-100)</p>
            </div>
            
            <div className="flex gap-4">
              {!isScanning ? (
                <button
                  onClick={startScan}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                >
                  <Play size={18} /> بدء الفحص
                </button>
              ) : (
                <button
                  onClick={stopScan}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
                >
                  <Square size={18} /> إيقاف الفحص
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <div className="text-gray-400 text-sm mb-1">المسلسلات</div>
            <div className="text-2xl font-bold text-blue-400">{stats.series}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <div className="text-gray-400 text-sm mb-1">الحلقات</div>
            <div className="text-2xl font-bold text-green-400">{stats.episodes}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <div className="text-gray-400 text-sm mb-1">الروابط</div>
            <div className="text-2xl font-bold text-purple-400">{stats.links}</div>
          </div>
        </div>

        <div className="bg-gray-950 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto font-mono text-sm mb-6">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center mt-32">لا توجد سجلات بعد. اضغط على بدء الفحص.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1 text-gray-300 whitespace-pre-wrap">{log}</div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        <div className="flex gap-4">
          <button
            onClick={downloadJson}
            disabled={stats.series === 0}
            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors border border-gray-600 flex justify-center items-center gap-2"
          >
            <FileJson size={18} /> تحميل JSON
          </button>
          <button
            onClick={downloadUrls}
            disabled={stats.links === 0}
            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors border border-gray-600 flex justify-center items-center gap-2"
          >
            <FileText size={18} /> تحميل الروابط (TXT)
          </button>
        </div>
      </div>
    </div>
  );
}
