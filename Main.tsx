import React, { useState, useCallback, useRef, useEffect } from 'react';
import { VideoFile, SourceFolder, Composition, BgmFile, OverlayConfig } from './types';
import { FolderIcon, FilmIcon, TrashIcon, SparklesIcon, ChevronUpIcon, ChevronDownIcon, DownloadIcon, LoaderIcon, MusicIcon, TypeIcon, XIcon, SettingsIcon, KeyIcon } from './components/Icon';
import { SeamlessPlayer } from './components/SeamlessPlayer';
import { generateMetadata } from './services/geminiService';

// Utility to generate distinct colors for folders
const FOLDER_COLORS = [
  'border-emerald-500', 'border-blue-500', 'border-purple-500', 
  'border-rose-500', 'border-amber-500', 'border-cyan-500'
];

// Default configuration for new overlays
const DEFAULT_OVERLAY: OverlayConfig = {
  text: "输入标题...",
  x: 50,
  y: 50,
  fontSize: 40,
  color: "#ffffff",
  strokeWidth: 0,
  strokeColor: "#000000",
  shadowBlur: 0,
  shadowColor: "#000000",
  bgColor: "",
  bgPadding: 20
};

const Main: React.FC = () => {
  // --- State ---
  const [folders, setFolders] = useState<SourceFolder[]>([]);
  const [bgm, setBgm] = useState<BgmFile | null>(null);
  const [sequence, setSequence] = useState<string[]>([]); // Array of Folder IDs representing the order
  const [results, setResults] = useState<Composition[]>([]);
  const [generationCount, setGenerationCount] = useState(5);
  const [activeComposition, setActiveComposition] = useState<Composition | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Overlay Editor State
  const [editingFolder, setEditingFolder] = useState<SourceFolder | null>(null);
  const [tempOverlay, setTempOverlay] = useState<OverlayConfig>(DEFAULT_OVERLAY);
  
  // Selection State for Batch Export
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Batch Export State
  const [batchStatus, setBatchStatus] = useState<{ current: number; total: number; active: boolean }>({ 
    current: 0, total: 0, active: false 
  });

  // API Key Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('GEMINI_API_KEY');
    if (stored) setApiKey(stored);
  }, []);

  const saveApiKey = () => {
    localStorage.setItem('GEMINI_API_KEY', apiKey);
    setShowKeyModal(false);
    alert("API Key 已保存！");
  };

  // --- Handlers ---

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFoldersMap = new Map<string, VideoFile[]>();

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('video/')) return; // Skip non-videos

      const pathParts = file.webkitRelativePath.split('/');
      const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';
      
      const videoFile: VideoFile = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        url: URL.createObjectURL(file),
        type: file.type
      };

      if (!newFoldersMap.has(folderName)) {
        newFoldersMap.set(folderName, []);
      }
      newFoldersMap.get(folderName)?.push(videoFile);
    });

    const newFolders: SourceFolder[] = [];
    let colorIndex = folders.length % FOLDER_COLORS.length;

    newFoldersMap.forEach((files, name) => {
      if (files.length > 0) {
        const id = Math.random().toString(36).substring(7);
        newFolders.push({
          id,
          name,
          files,
          color: FOLDER_COLORS[colorIndex % FOLDER_COLORS.length]
        });
        colorIndex++;
      }
    });

    setFolders(prev => [...prev, ...newFolders]);
  };

  const handleBgmUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const audio = document.createElement('audio');
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    
    audio.onloadedmetadata = () => {
      setBgm({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        url: objectUrl,
        duration: audio.duration
      });
    };
  };

  const removeFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setSequence(prev => prev.filter(fid => fid !== id));
  };
  
  // --- Overlay Editor Handlers ---
  const openOverlayEditor = (folder: SourceFolder) => {
    setEditingFolder(folder);
    // Use existing overlay from first file if available, or default
    const existingOverlay = folder.files[0]?.overlay;
    setTempOverlay(existingOverlay || { ...DEFAULT_OVERLAY });
  };
  
  const saveOverlay = () => {
    if (!editingFolder) return;
    
    const folderId = editingFolder.id;
    const fileIdsInFolder = new Set(editingFolder.files.map(f => f.id));

    // 1. Update Folders State
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
         return { 
           ...f, 
           files: f.files.map(file => ({ ...file, overlay: tempOverlay })) 
         };
      }
      return f;
    }));

    // 2. Update Existing Results
    setResults(prev => prev.map(comp => ({
      ...comp,
      segments: comp.segments.map(seg => {
        if (fileIdsInFolder.has(seg.id)) {
          return { ...seg, overlay: tempOverlay };
        }
        return seg;
      })
    })));

    // 3. Update Active Composition Preview
    if (activeComposition) {
       setActiveComposition(prev => {
          if(!prev) return null;
          return {
             ...prev,
             segments: prev.segments.map(seg => {
                if (fileIdsInFolder.has(seg.id)) {
                   return { ...seg, overlay: tempOverlay };
                }
                return seg;
             })
          };
       });
    }

    setEditingFolder(null);
  };

  const removeOverlayFromFolder = () => {
     if (!editingFolder) return;
     const folderId = editingFolder.id;
     const fileIdsInFolder = new Set(editingFolder.files.map(f => f.id));

     setFolders(prev => prev.map(f => {
      if (f.id === folderId) {
         return { 
           ...f, 
           files: f.files.map(file => {
             const { overlay, ...rest } = file;
             return rest;
           }) 
         };
      }
      return f;
    }));
    
    // Clear from results
    setResults(prev => prev.map(comp => ({
      ...comp,
      segments: comp.segments.map(seg => {
        if (fileIdsInFolder.has(seg.id)) {
           const { overlay, ...rest } = seg;
           return rest;
        }
        return seg;
      })
    })));

     if (activeComposition) {
       setActiveComposition(prev => {
          if(!prev) return null;
          return {
             ...prev,
             segments: prev.segments.map(seg => {
                if (fileIdsInFolder.has(seg.id)) {
                   const { overlay, ...rest } = seg;
                   return rest;
                }
                return seg;
             })
          };
       });
    }

    setEditingFolder(null);
  };

  // --- Sequence Handlers ---

  const moveSequenceItem = (index: number, direction: 'up' | 'down') => {
    const newSeq = [...sequence];
    if (direction === 'up' && index > 0) {
      [newSeq[index], newSeq[index - 1]] = [newSeq[index - 1], newSeq[index]];
    } else if (direction === 'down' && index < newSeq.length - 1) {
      [newSeq[index], newSeq[index + 1]] = [newSeq[index + 1], newSeq[index]];
    }
    setSequence(newSeq);
  };

  const removeFromSequence = (index: number) => {
    const newSeq = [...sequence];
    newSeq.splice(index, 1);
    setSequence(newSeq);
  };

  const addToSequence = (folderId: string) => {
    setSequence(prev => [...prev, folderId]);
  };

  const generateCompositions = () => {
    if (sequence.length === 0) {
      alert("请先配置时间线顺序。");
      return;
    }

    setIsGenerating(true);
    
    setTimeout(() => {
      const newCompositions: Composition[] = [];

      for (let i = 0; i < generationCount; i++) {
        const segments: VideoFile[] = [];
        let isValid = true;

        for (const folderId of sequence) {
          const folder = folders.find(f => f.id === folderId);
          if (!folder || folder.files.length === 0) {
            isValid = false;
            break;
          }
          const randomFile = folder.files[Math.floor(Math.random() * folder.files.length)];
          segments.push(randomFile);
        }

        if (isValid) {
          newCompositions.push({
            id: Math.random().toString(36).substring(7),
            name: `混剪作品 #${results.length + i + 1}`,
            segments,
            createdAt: Date.now()
          });
        }
      }

      setResults(prev => [...newCompositions, ...prev]);
      setIsGenerating(false);
      if (newCompositions.length > 0) {
        setActiveComposition(newCompositions[0]);
      }
    }, 800);
  };

  const handleAiAnalysis = async (composition: Composition) => {
    setIsAiProcessing(true);
    const fileNames = composition.segments.map(s => s.name);
    const metadata = await generateMetadata(fileNames);
    
    setResults(prev => prev.map(c => {
      if (c.id === composition.id) {
        return { ...c, aiTitle: metadata.title, aiDescription: metadata.description };
      }
      return c;
    }));
    
    if (activeComposition?.id === composition.id) {
      setActiveComposition(prev => prev ? ({ ...prev, aiTitle: metadata.title, aiDescription: metadata.description }) : null);
    }
    
    setIsAiProcessing(false);
  };

  // Selection Logic
  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length && results.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const handleExport = async (composition: Composition, isBatch = false) => {
    if (isExporting && !isBatch) return;
    
    if (!isBatch) setIsExporting(true);
    setExportProgress(0);

    let audioCtx: AudioContext | null = null;
    let drawInterval: any = null;
    const chunks: Blob[] = [];

    try {
      // Setup 9:16 Canvas (Portrait)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 720;
      canvas.height = 1280;
      
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass();
      const dest = audioCtx.createMediaStreamDestination();
      
      // Prepare BGM Buffer
      let bgmBuffer: AudioBuffer | null = null;
      let totalDuration = 0;
      
      if (bgm) {
        try {
          const response = await fetch(bgm.url);
          const arrayBuffer = await response.arrayBuffer();
          bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          totalDuration = bgm.duration;
        } catch (e) {
           console.error("Failed to load BGM", e);
           totalDuration = 9999; 
        }
      } else {
        totalDuration = 999999; 
      }

      // Setup Video Element
      const video = document.createElement('video');
      video.muted = false; 
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.volume = 1.0; 
      video.preload = 'auto';

      // Connect video audio
      const videoSourceNode = audioCtx.createMediaElementSource(video);
      videoSourceNode.connect(dest);

      // Combine Streams
      const canvasStream = canvas.captureStream(30); 
      if (dest.stream.getAudioTracks().length > 0) {
        canvasStream.addTrack(dest.stream.getAudioTracks()[0]);
      }

      // Recorder Setup
      let mimeType = 'video/mp4'; 
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=h264'; 
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      const recorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 8000000 
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.start();
      recorder.pause(); 

      // Loop Logic Variables
      let currentSegmentIndex = 0;
      let accumulatedTime = 0; 
      let isFinished = false;
      
      // To access current segment in interval
      let activeSegment: VideoFile | null = null;

      // Animation/Draw Loop
      drawInterval = setInterval(() => {
        if (isFinished) return;
        
        if (ctx && !video.paused && !video.ended && video.readyState >= 2) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const cw = canvas.width;
          const ch = canvas.height;
          
          // Draw Video
          const scale = Math.max(cw / vw, ch / vh);
          const w = vw * scale;
          const h = vh * scale;
          const x = (cw - w) / 2;
          const y = (ch - h) / 2;
          
          ctx.drawImage(video, x, y, w, h);

          // Draw Overlay if exists
          if (activeSegment?.overlay) {
            const { 
              text, x: px, y: py, fontSize, color, 
              strokeColor, strokeWidth, shadowColor, shadowBlur, bgColor, bgPadding 
            } = activeSegment.overlay;
            
            ctx.save();
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textBaseline = 'middle';
            
            const lines = text.split('\n');
            const lineHeight = fontSize * 1.2;
            
            // Measure for Background
            let maxWidth = 0;
            lines.forEach(line => {
               const m = ctx.measureText(line);
               if (m.width > maxWidth) maxWidth = m.width;
            });
            
            const pad = bgPadding || 0;
            const boxWidth = maxWidth + (pad * 2);
            const totalHeight = lines.length * lineHeight;
            const boxHeight = totalHeight + (pad * 2);

            const xPos = (px / 100) * cw;
            const yPos = (py / 100) * ch;
            
            const boxX = xPos - (boxWidth / 2);
            const boxY = yPos - (boxHeight / 2);
            
            // Draw Background
            if (bgColor) {
              ctx.fillStyle = bgColor;
              ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            }

            // Setup Shadow
            if (shadowBlur && shadowColor) {
              ctx.shadowColor = shadowColor;
              ctx.shadowBlur = shadowBlur;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
            } else {
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
            }

            ctx.textAlign = 'center';
            let lineY = boxY + pad + (lineHeight / 2);

            lines.forEach(line => {
               // Stroke (draw first if we want text on top)
               if (strokeWidth && strokeColor) {
                 ctx.lineWidth = strokeWidth;
                 ctx.strokeStyle = strokeColor;
                 ctx.strokeText(line, xPos, lineY);
               }
               // Fill
               ctx.fillStyle = color;
               ctx.fillText(line, xPos, lineY);
               
               lineY += lineHeight;
            });

            ctx.restore();
          }
        }
      }, 33); 

      // Recursive function to play segments
      const playNextSegment = async () => {
        if (bgm && accumulatedTime >= totalDuration) {
           isFinished = true;
           return;
        }

        if (!bgm && currentSegmentIndex >= composition.segments.length) {
           isFinished = true;
           return;
        }

        const segment = composition.segments[currentSegmentIndex % composition.segments.length];
        activeSegment = segment;

        let progress = 0;
        if (bgm) {
            progress = Math.min(100, (accumulatedTime / totalDuration) * 100);
        } else {
            progress = Math.min(100, (currentSegmentIndex / composition.segments.length) * 100);
        }
        setExportProgress(Math.round(progress));

        video.src = segment.url;
        
        await new Promise<void>((resolve) => {
          let segmentBgmSource: AudioBufferSourceNode | null = null;
          let timeCheckInterval: any = null;
          
          // Increased timeout for robustness
          const loadTimeout = setTimeout(() => {
            console.warn(`Video load timeout: ${segment.name}`);
            // Force skip corrupted/slow files
            video.src = "";
            currentSegmentIndex++;
            resolve();
          }, 15000);

          video.onloadeddata = () => {
            clearTimeout(loadTimeout);
            if (isFinished) { resolve(); return; }
            
            if (recorder.state === 'paused') recorder.resume();

            if (bgmBuffer && audioCtx) {
              try {
                segmentBgmSource = audioCtx.createBufferSource();
                segmentBgmSource.buffer = bgmBuffer;
                segmentBgmSource.loop = true; 
                segmentBgmSource.connect(dest);
                const offset = accumulatedTime % bgmBuffer.duration;
                segmentBgmSource.start(0, offset);
              } catch(e) {
                console.error("Audio source creation failed", e);
              }
            }

            video.play().catch(e => {
               console.error("Play error", e);
               // If play fails, we resolve to skip this clip but keep exporting
               currentSegmentIndex++;
               resolve(); 
            });
          };

          timeCheckInterval = setInterval(() => {
             if (bgm && !video.paused) {
                const currentClipTime = video.currentTime;
                if (accumulatedTime + currentClipTime >= totalDuration) {
                    video.pause();
                    clearInterval(timeCheckInterval);
                    video.dispatchEvent(new Event('ended'));
                }
             }
          }, 100);

          video.onended = () => {
            clearInterval(timeCheckInterval);
            clearTimeout(loadTimeout);
            
            if (recorder.state === 'recording') recorder.pause();
            
            if (segmentBgmSource) {
               try { segmentBgmSource.stop(); } catch(e) {}
               segmentBgmSource.disconnect();
            }
            
            accumulatedTime += video.duration; 
            currentSegmentIndex++;
            resolve();
          };
          
          video.onerror = (e) => {
             clearInterval(timeCheckInterval);
             clearTimeout(loadTimeout);
             console.error(`Error playing ${segment.name}`, e);
             currentSegmentIndex++;
             resolve();
          };
        });

        if (!isFinished) {
          await playNextSegment();
        }
      };

      await playNextSegment();

      if (drawInterval) clearInterval(drawInterval);
      
      await new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      if (chunks.length === 0) {
        throw new Error("No video data recorded (chunks empty)");
      }

      const finalBlob = new Blob(chunks, { type: mimeType });
      let ext = 'mp4';
      if (mimeType.includes('webm')) ext = 'webm';

      const downloadUrl = URL.createObjectURL(finalBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${composition.name.replace(/\s+/g, '_')}_9_16.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      
      video.pause();
      video.src = "";
      video.load();

    } catch (error) {
      console.error("Export failed", error);
      if (!isBatch) alert(`导出失败: ${composition.name} - ${error}`);
    } finally {
      if (drawInterval) clearInterval(drawInterval);
      if (audioCtx) {
        try {
           await new Promise(r => setTimeout(r, 100));
           await audioCtx.close();
        } catch (e) {
           console.error("Error closing AudioContext", e);
        }
      }

      if (!isBatch) setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleBatchExport = async () => {
    const targets = results.filter(r => selectedIds.has(r.id));
    
    if (targets.length === 0) {
      alert("请先勾选需要导出的视频！");
      return;
    }
    
    if (isExporting || batchStatus.active) return;

    setBatchStatus({ current: 0, total: targets.length, active: true });
    await new Promise(resolve => setTimeout(resolve, 100));

    for (let i = 0; i < targets.length; i++) {
      setBatchStatus(prev => ({ ...prev, current: i + 1 }));
      try {
        await handleExport(targets[i], true);
      } catch (e) {
        console.error(`Failed to export result ${i}`, e);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBatchStatus({ current: 0, total: 0, active: false });
    alert("批量导出任务完成！请检查下载文件夹。");
  };

  const getFolderById = useCallback((id: string) => folders.find(f => f.id === id), [folders]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-slate-300 relative">
      
      {/* Key Config Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-white">
               <KeyIcon />
               <h2 className="text-xl font-bold">设置 Gemini API Key</h2>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              请输入您的 Google Gemini API Key 以启用 AI 标题生成功能。<br/>
              <span className="text-xs text-gray-500">Key 将仅保存在您的本地浏览器中。</span>
            </p>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="在此粘贴 API Key (AIza...)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-6"
            />
            <div className="flex gap-3">
               <button 
                 onClick={() => setShowKeyModal(false)}
                 className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg"
               >
                 取消
               </button>
               <button 
                 onClick={saveApiKey}
                 className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold"
               >
                 保存
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay Editor Modal */}
      {editingFolder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl h-[85vh] flex overflow-hidden shadow-2xl">
            <div className="w-1/2 p-6 border-r border-gray-800 overflow-y-auto scrollbar-thin">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <TypeIcon /> 字幕设置
                </h2>
                <span className="text-xs text-indigo-400 bg-indigo-900/30 px-2 py-1 rounded border border-indigo-500/50">
                   {editingFolder.name}
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">字幕内容</label>
                  <textarea
                    value={tempOverlay.text}
                    onChange={(e) => setTempOverlay({ ...tempOverlay, text: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none h-24 resize-none whitespace-pre"
                    placeholder="在此输入标题文字..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">水平 (X%)</label>
                      <input type="range" min="0" max="100" value={tempOverlay.x} onChange={(e) => setTempOverlay({ ...tempOverlay, x: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">垂直 (Y%)</label>
                      <input type="range" min="0" max="100" value={tempOverlay.y} onChange={(e) => setTempOverlay({ ...tempOverlay, y: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">字号</label>
                      <input type="range" min="20" max="150" value={tempOverlay.fontSize} onChange={(e) => setTempOverlay({ ...tempOverlay, fontSize: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">字色</label>
                      <input type="color" value={tempOverlay.color} onChange={(e) => setTempOverlay({ ...tempOverlay, color: e.target.value })} className="w-full h-8 rounded cursor-pointer bg-transparent border-0" />
                    </div>
                </div>
                
                <div className="border-t border-gray-800 pt-4">
                    <label className="block text-xs font-bold text-indigo-400 uppercase mb-2">描边 (Stroke)</label>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <span className="text-[10px] text-gray-500 mb-1 block">粗细: {tempOverlay.strokeWidth}px</span>
                          <input type="range" min="0" max="20" value={tempOverlay.strokeWidth || 0} onChange={(e) => setTempOverlay({ ...tempOverlay, strokeWidth: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                       </div>
                       <div>
                          <span className="text-[10px] text-gray-500 mb-1 block">颜色</span>
                          <input type="color" value={tempOverlay.strokeColor || '#000000'} onChange={(e) => setTempOverlay({ ...tempOverlay, strokeColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                       </div>
                    </div>
                </div>

                <div className="border-t border-gray-800 pt-4">
                    <label className="block text-xs font-bold text-indigo-400 uppercase mb-2">阴影 (Shadow)</label>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <span className="text-[10px] text-gray-500 mb-1 block">模糊: {tempOverlay.shadowBlur}px</span>
                          <input type="range" min="0" max="50" value={tempOverlay.shadowBlur || 0} onChange={(e) => setTempOverlay({ ...tempOverlay, shadowBlur: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                       </div>
                       <div>
                          <span className="text-[10px] text-gray-500 mb-1 block">颜色</span>
                          <input type="color" value={tempOverlay.shadowColor || '#000000'} onChange={(e) => setTempOverlay({ ...tempOverlay, shadowColor: e.target.value })} className="w-full h-6 rounded cursor-pointer" />
                       </div>
                    </div>
                </div>

                <div className="border-t border-gray-800 pt-4">
                    <label className="block text-xs font-bold text-indigo-400 uppercase mb-2">背景 (Background)</label>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <span className="text-[10px] text-gray-500 mb-1 block">边距: {tempOverlay.bgPadding}px</span>
                          <input type="range" min="0" max="50" value={tempOverlay.bgPadding || 0} onChange={(e) => setTempOverlay({ ...tempOverlay, bgPadding: parseInt(e.target.value) })} className="w-full accent-indigo-500" />
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 mb-1 block">颜色</span>
                           <div className="flex gap-2">
                             <input type="color" value={tempOverlay.bgColor || '#000000'} onChange={(e) => setTempOverlay({ ...tempOverlay, bgColor: e.target.value })} className="flex-1 h-6 rounded cursor-pointer" />
                             <button 
                                onClick={() => setTempOverlay({ ...tempOverlay, bgColor: '' })}
                                className="text-[10px] px-2 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700"
                             >无</button>
                           </div>
                       </div>
                    </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={saveOverlay}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold transition-colors"
                  >
                    应用配置
                  </button>
                  <button 
                    onClick={removeOverlayFromFolder}
                    className="px-4 bg-gray-800 hover:bg-rose-900/50 hover:text-rose-400 text-gray-400 border border-gray-700 rounded-lg transition-colors"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className="w-1/2 bg-black flex items-center justify-center relative p-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGgyMHYyMEgwVjB6IiBmaWxsPSIjMTExIi8+PHBhdGggZD0iTTAgMGgxMHYxMEgwVjB6TTEwIDEwaDEwdjEwSDEwVjEweiIgZmlsbD0iIzIyMiIvPjwvc3ZnPg==')]">
                <button onClick={() => setEditingFolder(null)} className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700 z-50">
                  <XIcon />
                </button>
                
                <div className="relative w-[360px] aspect-[9/16] bg-gray-800 shadow-2xl rounded-lg overflow-hidden border border-gray-700 [container-type:size]">
                   <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm select-none">
                      <div className="text-center">
                         <FilmIcon />
                         <div className="mt-2">视频预览区域</div>
                      </div>
                   </div>
                   
                   <div 
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none leading-tight"
                      style={{
                        left: `${tempOverlay.x}%`,
                        top: `${tempOverlay.y}%`,
                        color: tempOverlay.color,
                        fontWeight: 'bold',
                        whiteSpace: 'pre',
                        fontSize: `${(tempOverlay.fontSize / 720) * 100}cqw`,
                        WebkitTextStroke: tempOverlay.strokeWidth ? `${(tempOverlay.strokeWidth / 720) * 100}cqw ${tempOverlay.strokeColor}` : 'none',
                        textShadow: tempOverlay.shadowBlur ? `0 0 ${(tempOverlay.shadowBlur / 720) * 100}cqw ${tempOverlay.shadowColor || 'black'}` : 'none',
                        backgroundColor: tempOverlay.bgColor || 'transparent',
                        padding: tempOverlay.bgPadding ? `${(tempOverlay.bgPadding / 720) * 100}cqw` : '0',
                      }}
                   >
                      {tempOverlay.text}
                   </div>

                   <div className="absolute inset-0 border-2 border-dashed border-indigo-500/20 pointer-events-none"></div>
                   <div className="absolute top-1/2 left-0 w-full h-px bg-indigo-500/20 pointer-events-none"></div>
                   <div className="absolute left-1/2 top-0 h-full w-px bg-indigo-500/20 pointer-events-none"></div>
                </div>
            </div>
          </div>
        </div>
      )}

      {batchStatus.active && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-64 mb-8 text-center">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-white mb-2">正在批量导出...</h2>
            <p className="text-indigo-400 font-mono text-lg">
              {batchStatus.current} / {batchStatus.total}
            </p>
          </div>
          <div className="w-96 bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-700">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${(batchStatus.current / batchStatus.total) * 100}%` }}
            ></div>
          </div>
          <p className="text-gray-500 mt-4 text-sm animate-pulse">请保持浏览器窗口前台运行，不要关闭。</p>
        </div>
      )}

      <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <FilmIcon />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">智能混剪 <span className="text-indigo-400">Pro</span></h1>
        </div>
        <div className="flex items-center gap-4">
           <button 
             onClick={() => setShowKeyModal(true)}
             className="text-gray-400 hover:text-white flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-xs transition-colors"
           >
              {apiKey ? <span className="text-emerald-400">●</span> : <span className="text-gray-500">○</span>}
              <SettingsIcon /> 
              <span>AI 设置</span>
           </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
          
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <FolderIcon /> 视频素材库
            </h2>
            <div className="relative group">
                <label className="flex flex-col items-center justify-center w-full p-4 border-2 border-dashed border-gray-700 rounded-lg hover:border-indigo-500 hover:bg-gray-800 transition-colors cursor-pointer">
                <input 
                    type="file" 
                    multiple 
                    webkitdirectory="" 
                    directory="" 
                    className="hidden" 
                    onChange={handleFolderUpload}
                />
                <div className="flex flex-col items-center gap-2 text-center">
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white">📂 导入素材总文件夹</span>
                    <span className="text-[10px] text-gray-500 leading-tight">
                        请选择包含各个分类子文件夹<br/>的总目录 (Root Folder)
                    </span>
                </div>
                </label>
            </div>
          </div>

          <div className="p-4 border-b border-gray-800 mt-6">
             <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <MusicIcon /> 背景音乐 (决定时长)
            </h2>
             <label className="flex items-center justify-between w-full p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer border border-gray-700">
                <input 
                  type="file" 
                  accept="audio/*"
                  className="hidden" 
                  onChange={handleBgmUpload}
                />
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-400">
                      <MusicIcon />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-sm font-medium text-gray-200 truncate">
                        {bgm ? bgm.name : '点击上传 BGM 音频'}
                    </span>
                    {bgm && <span className="text-xs text-gray-500">{Math.round(bgm.duration)}秒 • 自动循环视频填充</span>}
                  </div>
                </div>
             </label>
             {bgm && (
                 <button 
                    onClick={() => setBgm(null)}
                    className="mt-2 text-xs text-rose-400 hover:text-rose-300 w-full text-right"
                 >
                    清除音乐
                 </button>
             )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 mt-2 scrollbar-thin">
            {folders.map(folder => (
              <div key={folder.id} className={`bg-gray-800 rounded-lg p-3 border-l-4 ${folder.color} group relative`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-gray-200 truncate w-32" title={folder.name}>{folder.name}</span>
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={() => openOverlayEditor(folder)} 
                        className="text-gray-500 hover:text-white bg-gray-700 hover:bg-gray-600 p-1 rounded transition-colors"
                    >
                        <TypeIcon />
                    </button>
                    <button onClick={() => removeFolder(folder.id)} className="text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TrashIcon />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">{folder.files.length} 个片段</span>
                    {folder.files[0]?.overlay && (
                        <span className="text-[10px] text-emerald-500 flex items-center gap-1 mt-1">
                           <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                           已配置字幕
                        </span>
                    )}
                  </div>
                  <button 
                    onClick={() => addToSequence(folder.id)}
                    className="text-xs bg-gray-700 hover:bg-indigo-600 text-white px-2 py-1 rounded transition-colors"
                  >
                    + 加入序列
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-gray-950 min-w-[400px]">
          
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">混剪逻辑编排 (9:16)</h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-gray-900 p-1 rounded-lg border border-gray-800">
                    <span className="text-xs text-gray-400 px-2">生成数量:</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="100" 
                      value={generationCount}
                      onChange={(e) => setGenerationCount(parseInt(e.target.value))}
                      className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button 
                    onClick={generateCompositions}
                    disabled={isGenerating || sequence.length === 0}
                    className={`bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-semibold shadow-lg shadow-indigo-900/20 flex items-center gap-2 transition-all ${isGenerating ? 'opacity-75 cursor-wait' : ''}`}
                  >
                    {isGenerating ? (
                      <span className="animate-pulse">裂变中...</span>
                    ) : (
                      <>
                        <SparklesIcon />
                        <span>开始裂变合成</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {sequence.map((folderId, index) => {
                  const folder = getFolderById(folderId);
                  if (!folder) return null;
                  return (
                    <div key={`${folderId}-${index}`} className="flex items-center gap-4 bg-gray-900 p-3 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-mono font-bold text-gray-400 border border-gray-700">
                        {index + 1}
                      </div>
                      <div className={`h-2 w-2 rounded-full ${folder.color.replace('border-', 'bg-')}`}></div>
                      <div className="flex-1">
                        <div className="font-medium text-white">{folder.name}</div>
                        <div className="text-xs text-gray-500">随机抽取 1 个视频</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveSequenceItem(index, 'up')} disabled={index === 0} className="p-1 text-gray-500 hover:text-white disabled:opacity-30">
                          <ChevronUpIcon />
                        </button>
                        <button onClick={() => moveSequenceItem(index, 'down')} disabled={index === sequence.length - 1} className="p-1 text-gray-500 hover:text-white disabled:opacity-30">
                          <ChevronDownIcon />
                        </button>
                        <div className="w-px h-4 bg-gray-700 mx-2"></div>
                        <button onClick={() => removeFromSequence(index)} className="p-1 text-gray-500 hover:text-rose-500">
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {activeComposition && (
            <div className="h-96 bg-gray-900 border-t border-gray-800 shrink-0 flex">
               <div className="w-1/2 p-4 flex flex-col items-center bg-gray-950 relative">
                  <div className="w-full flex justify-between items-center mb-2 px-4 absolute top-4 left-0 z-10">
                      <span className="text-sm font-semibold text-white bg-black/50 px-2 py-1 rounded backdrop-blur-sm">{activeComposition.name}</span>
                      {isExporting && (
                        <span className="text-xs text-indigo-400 flex items-center gap-1 bg-indigo-900/80 px-2 py-1 rounded border border-indigo-500/30 backdrop-blur">
                          <LoaderIcon /> 渲染中 {exportProgress}%
                        </span>
                      )}
                  </div>
                  
                  <div className="h-full aspect-[9/16]">
                     <SeamlessPlayer segments={activeComposition.segments} bgm={bgm} />
                  </div>
               </div>
               
               <div className="w-1/2 p-4 border-l border-gray-800 flex flex-col overflow-y-auto bg-gray-900 scrollbar-thin">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-sm font-semibold text-white">操作与 AI 文案</h3>
                    <button 
                        onClick={() => handleExport(activeComposition)}
                        disabled={isExporting || batchStatus.active}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md"
                      >
                         {(isExporting && !batchStatus.active) ? <LoaderIcon /> : <DownloadIcon />}
                         导出竖屏成品 (9:16)
                      </button>
                  </div>
                  
                  <div className="mb-6">
                     <button 
                      onClick={() => handleAiAnalysis(activeComposition)}
                      disabled={isAiProcessing}
                      className="w-full text-xs bg-gradient-to-r from-gray-800 to-gray-700 border border-gray-600 text-white px-3 py-2 rounded-lg hover:from-gray-700 hover:to-gray-600 flex items-center justify-center gap-2 shadow transition-all disabled:opacity-50"
                    >
                      {isAiProcessing ? 'AI 分析中...' : (
                        <><SparklesIcon /> Gemini 智能生成标题与描述</>
                      )}
                    </button>
                  </div>

                  {activeComposition.aiTitle ? (
                    <div className="bg-gray-800/50 rounded-lg p-4 space-y-4 border border-gray-700/50">
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider font-bold">爆款标题</label>
                        <p className="text-white font-medium text-lg mt-1 leading-tight">{activeComposition.aiTitle}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider font-bold">描述与标签</label>
                        <p className="text-gray-300 text-sm mt-1 whitespace-pre-wrap">{activeComposition.aiDescription}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-800/30 rounded-lg p-6 border border-dashed border-gray-700 text-center text-gray-500 text-sm">
                       文案生成区
                    </div>
                  )}

                  <div className="mt-6">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2 block">
                        素材来源 ({activeComposition.segments.length}个) 
                        {bgm && <span className="text-indigo-400 ml-2"> *循环播放直至音乐结束</span>}
                    </label>
                    <ul className="space-y-1 max-h-40 overflow-y-auto pr-2 scrollbar-thin">
                      {activeComposition.segments.map((seg, i) => (
                        <li key={i} className="text-xs text-gray-400 flex items-center gap-2 bg-gray-800/50 p-1 rounded">
                          <span className="w-4 h-4 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px]">{i+1}</span>
                          <span className="truncate text-gray-300">{seg.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
               </div>
            </div>
          )}
        </main>

        <aside className="w-64 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-gray-800">
             <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-white">合成列表 ({results.length})</h2>
                <div className="flex items-center gap-2">
                   <span className="text-[10px] text-gray-500">全选</span>
                   <input 
                      type="checkbox" 
                      checked={results.length > 0 && selectedIds.size === results.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-0 cursor-pointer"
                   />
                </div>
             </div>

             <button 
                onClick={handleBatchExport}
                disabled={isExporting || batchStatus.active || selectedIds.size === 0}
                className="w-full px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <DownloadIcon />
                <span>导出选中 ({selectedIds.size})</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {results.map(comp => (
              <div
                key={comp.id}
                className={`w-full text-left rounded-lg border transition-all flex items-stretch ${
                  activeComposition?.id === comp.id 
                    ? 'bg-indigo-900/20 border-indigo-500/50' 
                    : 'bg-gray-800/50 border-transparent hover:bg-gray-800'
                }`}
              >
                <div 
                    className="flex items-center px-2 cursor-pointer hover:bg-white/5"
                    onClick={(e) => toggleSelection(comp.id, e)}
                >
                    <input 
                        type="checkbox" 
                        checked={selectedIds.has(comp.id)}
                        onChange={() => {}} 
                        className="rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-0 cursor-pointer pointer-events-none"
                    />
                </div>

                <button
                    className="flex-1 py-3 pr-3 text-left"
                    onClick={() => setActiveComposition(comp)}
                >
                    <div className={`font-medium text-sm truncate ${activeComposition?.id === comp.id ? 'text-white' : 'text-gray-400'}`}>
                        {comp.name}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                    <span className="text-xs opacity-60 text-gray-500">{comp.segments.length} 片段</span>
                    {comp.aiTitle && <SparklesIcon />}
                    </div>
                </button>
              </div>
            ))}
          </div>
        </aside>

      </div>
    </div>
  );
};

export default Main;
