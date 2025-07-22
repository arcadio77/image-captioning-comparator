import { type ReactNode } from 'react';

export interface ImageWithCaptions {
    file: File;
    previewUrl: string;
    captions: { model: string; text: string }[];
}

export interface AppContextType {
    images: ImageWithCaptions[];
    addImage: (file: File) => void;
    removeImage: (fileToRemove: File) => void;
    addCaptionToImage: (file: File, model: string, captionText: string) => void;
    reset: () => void;
    models: string[];
    addModel: (modelName: string) => void;
    removeModel: (modelName: string) => void;
    selectedModel: string | null;
    setSelectedModel: (model: string | null) => void;
}

export interface WorkerInfo {
    id: string;
    cached_models: string[];
    loaded_models: string[];
}

export interface WorkersContextType {
    workers: WorkerInfo[];
    setWorkers: (workers: WorkerInfo[]) => void;
    downloading: Record<string, boolean>;
    setWorkerDownloading: (workerId: string, isDownloading: boolean) => void;
    addModel: (workerId: string, model: string) => void;
    removeModel: (workerId: string, model: string) => void;
}

export type ChildrenProps = {
    children: ReactNode;
};