import React, { useEffect, useRef, useState } from 'react';
import { VideoFile, BgmFile } from '../types';
import { PlayIcon } from './Icon';

interface SeamlessPlayerProps {
  segments: VideoFile[];
  bgm?: BgmFile | null;
}

export const SeamlessPlayer: React.FC<SeamlessPlayerProps> = ({ segments, bgm }) => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePlayerId, setActivePlayerId] = useState<1 | 2>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stopAll();
    setCurrentIndex(0);
    setActivePlayerId(1);
    setIsPlaying(false);
    setError(null);

    if (segments.length > 0) {
      if (videoRef1.current) videoRef1.current.src = segments[0].url;
      if (videoRef2.current && segments.length > 1) videoRef2.current.src = segments[1].url;
    }
    
    if (audioRef.current && bgm) {
      audioRef.current.src = bgm.url;
      audioRef.current.currentTime = 0;
    }
  }, [segments, bgm]);

  const stopAll = () => {
    if (videoRef1.current) {
      videoRef1.current.pause();
      videoRef1.current.currentTime = 0;
    }
    if (videoRef2.current) {
      videoRef2.current.pause();
      videoRef2.current.currentTime = 0;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleAudioEnded = () => {
    if (bgm) {
      setIsPlaying(false);
      stopAll();
      if (videoRef1.current && segments.length > 0) videoRef1.current.src = segments[0].url;
      setCurrentIndex(0);
      setActivePlayerId(1);
    }
  };

  const handleVideoEnded = () => {
    let nextIndex = currentIndex + 1;

    if (bgm) {
      if (nextIndex >= segments.length) {
        nextIndex = 0;
      }
    } else {
      if (nextIndex >= segments.length) {
        setIsPlaying(false);
        stopAll();
        if (videoRef1.current) videoRef1.current.src = segments[0].url;
        setCurrentIndex(0);
        setActivePlayerId(1);
        return;
      }
    }

    const nextActiveId = activePlayerId === 1 ? 2 : 1;
    const nextVideoEl = nextActiveId === 1 ? videoRef1.current : videoRef2.current;
    
    if (nextVideoEl) {
      nextVideoEl.play().catch(e => console.error("Autoplay blocked", e));
    }
    
    setActivePlayerId(nextActiveId);
    setCurrentIndex(nextIndex);

    let preloadIndex = nextIndex + 1;
    if (bgm && preloadIndex >= segments.length) {
      preloadIndex = 0; 
    }

    if (preloadIndex < segments.length) {
      const inactivePlayer = activePlayerId === 1 ? videoRef1.current : videoRef2.current;
      if (inactivePlayer) {
        inactivePlayer.src = segments[preloadIndex].url;
        inactivePlayer.load();
      }
    }
  };

  const togglePlay = () => {
    const activeVideo = activePlayerId === 1 ? videoRef1.current : videoRef2.current;
    if (!activeVideo) return;

    if (isPlaying) {
      activeVideo.pause();
      if (bgm && audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      activeVideo.play()
        .then(() => setIsPlaying(true))
        .catch(e => console.error(e));
      
      if (bgm && audioRef.current) {
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      }
    }
  };

  if (segments.length === 0) {
    return (
      <div className="w-full h-full bg-gray-900 rounded-lg flex items-center justify-center text-gray-500 border border-gray-800 aspect-[9/16]">
        未选择任何视频片段
      </div>
    );
  }

  const currentSegment = segments[currentIndex];
  const overlay = currentSegment?.overlay;

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 group aspect-[9/16] [container-type:size]">
      {bgm && <audio ref={audioRef} onEnded={handleAudioEnded} />}

      <video
        ref={videoRef1}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-0 ${activePlayerId === 1 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
        onEnded={handleVideoEnded}
        onClick={togglePlay}
        playsInline
        muted={!!bgm} 
      />
      
      <video
        ref={videoRef2}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-0 ${activePlayerId === 2 ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
        onEnded={handleVideoEnded}
        onClick={togglePlay}
        playsInline
        muted={!!bgm}
      />

      {overlay && (
        <div 
          className="absolute z-20 pointer-events-none text-center leading-tight transition-all duration-300"
          style={{
            left: `${overlay.x}%`,
            top: `${overlay.y}%`,
            transform: 'translate(-50%, -50%)',
            color: overlay.color,
            fontSize: `${(overlay.fontSize / 720) * 100}cqw`,
            fontWeight: 'bold',
            whiteSpace: 'pre', 
            WebkitTextStroke: overlay.strokeWidth ? `${(overlay.strokeWidth / 720) * 100}cqw ${overlay.strokeColor}` : 'none',
            textShadow: overlay.shadowBlur ? `0 0 ${(overlay.shadowBlur / 720) * 100}cqw ${overlay.shadowColor || 'black'}` : 'none',
            backgroundColor: overlay.bgColor || 'transparent',
            padding: overlay.bgPadding ? `${(overlay.bgPadding / 720) * 100}cqw` : '0',
          }}
        >
          {overlay.text}
        </div>
      )}
      
      <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200 z-30 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
        <button 
          onClick={togglePlay}
          className="p-4 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all transform hover:scale-105"
        >
          <PlayIcon />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-xs font-mono text-gray-300 z-30">
        <div className="flex justify-between px-2">
            <span className="truncate max-w-[60%]">{currentSegment?.name}</span>
            {bgm ? (
              <span className="text-indigo-400">🎵 BGM同步中</span>
            ) : (
              <span>{currentIndex + 1} / {segments.length}</span>
            )}
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center text-white p-4 text-center z-40">
          {error}
        </div>
      )}
    </div>
  );
};
