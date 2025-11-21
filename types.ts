export interface OverlayConfig {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  bgColor?: string;
  bgPadding?: number;
}

export interface VideoFile {
  id: string;
  name: string;
  url: string;
  type: string;
  overlay?: OverlayConfig;
}

export interface BgmFile {
  id: string;
  name: string;
  url: string;
  duration: number;
}

export interface SourceFolder {
  id: string;
  name: string;
  files: VideoFile[];
  color: string;
}

export interface Composition {
  id: string;
  name: string;
  segments: VideoFile[];
  createdAt: number;
  aiTitle?: string;
  aiDescription?: string;
}

export enum AppView {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
}

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
