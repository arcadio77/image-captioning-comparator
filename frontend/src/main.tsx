import React, { StrictMode, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import GalleryPage from './GalleryPage.tsx';
import { ImageDataProvider } from './ImageDataContext.tsx';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import ModelsPage from "./ModelsPage.tsx";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
    const [mode, setMode] = useState<'light' | 'dark'>('light');

    const colorMode = useMemo(
        () => ({
            toggleColorMode: () => {
                setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
            },
        }),
        [],
    );

    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode,
                },
            }),
        [mode],
    );

    return (
        <StrictMode>
            <ColorModeContext.Provider value={colorMode}>
                <ThemeProvider theme={theme}>
                    <CssBaseline />
                    <BrowserRouter>
                        <Box
                            sx={{
                                position: 'fixed',
                                top: 16,
                                right: 16,
                                zIndex: 1000,
                            }}
                        >
                            <IconButton sx={{ ml: 1 }} onClick={colorMode.toggleColorMode} color="inherit">
                                {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                            </IconButton>
                        </Box>
                        <ImageDataProvider>
                            <Routes>
                                <Route path="/" element={<App />} />
                                <Route path="/gallery" element={<GalleryPage />} />
                                <Route path="/models" element={<ModelsPage />} />
                            </Routes>
                        </ImageDataProvider>
                    </BrowserRouter>
                </ThemeProvider>
            </ColorModeContext.Provider>
        </StrictMode>
    );
}

createRoot(document.getElementById('root')!).render(<Root />);