import { createContext, useContext } from 'react';
import type {WorkersContextType} from "../utils/types.ts";

export const WorkersContext = createContext<WorkersContextType| undefined>(undefined);

export const useWorkersContext = () => {
    const context = useContext(WorkersContext);
    if (context === undefined) {
        throw new Error('useWorkersContext must be used within an WorkersProvider');
    }
    return context;
}