import React, { useState, useMemo, useCallback } from 'react';
import type { ChildrenProps, WorkerInfo} from '../utils/types.ts';
import {WorkersContext} from "./WorkersContext.tsx";

export const WorkersProvider: React.FC<ChildrenProps> = ({ children }) => {
    const [workers, setWorkers] = useState<WorkerInfo[]>([]);
    const [downloading, setDownloading] = useState<Record<string, boolean>>({});

    const setWorkerDownloading = useCallback((workerId: string, isDownloading: boolean) => {
        setDownloading(prev => ({
            ...prev,
            [workerId]: isDownloading,
        }));
    }, []);

    const addModel = useCallback((workerId: string, modelName: string) => {
        setWorkers(prevWorkers =>
            prevWorkers.map(worker => {
                if (worker.id != workerId){
                    return worker;
                }

                const newCachedModels = [...worker.cached_models, modelName];

                return {
                    ...worker,
                    cached_models: newCachedModels,
                };
            })
        )
    }, []);

    const removeModel = useCallback((workerId: string, modelName: string) => {
        setWorkers(prevWorkers =>
            prevWorkers.map(worker => {
                if (worker.id != workerId){
                    return worker;
                }

                const newCachedModels = worker.cached_models.filter(model => model !== modelName)
                const newLoadedModels = worker.loaded_models.filter(model => model !== modelName);

                return {
                    ...worker,
                    cached_models: newCachedModels,
                    loaded_models: newLoadedModels,
                };
            })
        )
    }, []);

    const value = useMemo(() => ({
        workers,
        setWorkers,
        downloading,
        setWorkerDownloading,
        addModel,
        removeModel,
    }), [workers, setWorkers, downloading, setWorkerDownloading, addModel, removeModel]);

    return (
        <WorkersContext.Provider value={value}>
            {children}
        </WorkersContext.Provider>
    );
}