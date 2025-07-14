import { type ReactNode } from 'react';

export interface ImageWithCaptions {
    file: File;
    previewUrl: string;
    captions: { model: string; text: string }[];
}

export interface ImageDataContextType {
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

export type ChildrenProps = {
    children: ReactNode;
};