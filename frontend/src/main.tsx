// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import GalleryPage from './GalleryPage.tsx';
import { ImageDataProvider } from './ImageDataContext.tsx'; // Your context provider
import { BrowserRouter, Routes, Route } from 'react-router-dom';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <ImageDataProvider>
                <Routes>
                    <Route path="/" element={<App />} />
                    <Route path="/gallery" element={<GalleryPage />} />
                </Routes>
            </ImageDataProvider>
        </BrowserRouter>
    </StrictMode>,
);