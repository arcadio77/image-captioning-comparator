import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type {ImageWithCaptions, ImageDataContextType, ChildrenProps} from './types';

const ImageDataContext = createContext<ImageDataContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useImageData = () => {
    const context = useContext(ImageDataContext);
    if (context === undefined) {
        throw new Error('useImageData must be used within an ImageDataProvider');
    }
    return context;
};

export const ImageDataProvider: React.FC<ChildrenProps> = ({ children }) => {
    const [images, setImages] = useState<ImageWithCaptions[]>([]);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [explicitModels, setExplicitModels] = useState<string[]>([]);

    const addImage = useCallback((file: File) => {
        const existing = images.find(img => img.file.name === file.name && img.file.size === file.size);
        if (existing) return;

        const previewUrl = URL.createObjectURL(file);
        setImages(prevImages => [
            ...prevImages,
            { file, previewUrl, captions: [] }
        ]);
    }, [images]);

    const removeImage = useCallback((fileToRemove: File) => {
        setImages(prevImages => {
            const updatedImages = prevImages.filter(img => img.file !== fileToRemove);
            const removedImage = prevImages.find(img => img.file === fileToRemove);
            if (removedImage) {
                URL.revokeObjectURL(removedImage.previewUrl);
            }
            return updatedImages;
        });
    }, []);

    const addCaptionToImage = useCallback((file: File, model: string, captionText: string) => {
        setImages(prevImages =>
            prevImages.map(img =>
                img.file === file
                    ? { ...img, captions: [...img.captions.filter(c => c.model !== model), { model, text: captionText }] }
                    : img
            )
        );
        setExplicitModels(prev => (prev.includes(model) ? prev : [...prev, model]));
    }, []);

    const reset = useCallback(() => {
        images.forEach(img => URL.revokeObjectURL(img.previewUrl));
        setImages([]);
        setExplicitModels([]);
        setSelectedModel(null);
    }, [images]);

    const addModel = useCallback((modelName: string) => {
        setExplicitModels(prev => (prev.includes(modelName) ? prev : [...prev, modelName]));
    }, []);

    const removeModel = useCallback((modelName: string) => {
        setExplicitModels(prev => prev.filter(model => model !== modelName));
    }, []);

    const allModels = useMemo(() => {
        const fromCaptions = new Set<string>();
        images.forEach(img => {
            img.captions.forEach(caption => fromCaptions.add(caption.model));
        });
        return Array.from(new Set([...explicitModels, ...Array.from(fromCaptions)]));
    }, [explicitModels, images]);

    const value = useMemo(() => ({
        images,
        addImage,
        removeImage,
        addCaptionToImage,
        reset,
        models: allModels,
        addModel,
        removeModel,
        selectedModel,
        setSelectedModel,
    }), [images, addImage, removeImage, addCaptionToImage, reset, allModels, addModel, removeModel, selectedModel, setSelectedModel]);

    return (
        <ImageDataContext.Provider value={value}>
            {children}
        </ImageDataContext.Provider>
    );
};