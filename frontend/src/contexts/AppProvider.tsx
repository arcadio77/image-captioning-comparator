import React, { useState, useMemo, useCallback } from 'react';
import type {ImageWithCaptions, ChildrenProps} from '../utils/types.ts';
import { AppContext } from './AppContext.tsx';

export const AppProvider: React.FC<ChildrenProps> = ({ children }) => {
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

    const addCaptionToImage = useCallback((file: File,
                                           model: string, captionText: string) => {
        setImages(prevImages =>
            prevImages.map(img =>
                img.file === file
                    ? { ...img, captions: [...img.captions.filter(c => c.model !== model),
                            { model, text: captionText }] }
                    : img
            )
        );
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

    const models = useMemo(() => {
        return [...explicitModels];
    }, [explicitModels]);

    const value = useMemo(() => ({
        images,
        addImage,
        removeImage,
        addCaptionToImage,
        reset,
        models,
        addModel,
        removeModel,
        selectedModel,
        setSelectedModel,
    }), [images, addImage, removeImage, addCaptionToImage, reset, models, addModel, removeModel, selectedModel,
        setSelectedModel]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};