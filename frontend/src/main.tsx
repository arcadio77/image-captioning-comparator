import React, { StrictMode, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import GalleryPage from './pages/GalleryPage.tsx';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import WorkersPage from "./pages/WorkersPage.tsx";
import { AppProvider } from "./contexts/AppProvider.tsx";
import {WorkersProvider} from "./contexts/WorkersProvider.tsx";

const ColorModeContext = React.createContext({ toggleColorMode: () => {} });

export default function Root() {
    const [mode, setMode] = useState<'light' | 'dark'>('light');

    const colorMode = useMemo(() => ({
            toggleColorMode: () => {
                setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
            },
        }), []);

    const theme = useMemo(() =>
            createTheme({
                palette: {
                    mode,
                },
            }), [mode]);

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
                        <AppProvider>
                        <WorkersProvider>
                            <Routes>
                                <Route path="/" element={<App />} />
                                <Route path="/gallery" element={<GalleryPage />} />
                                <Route path="/workers" element={<WorkersPage />} />
                            </Routes>
                        </WorkersProvider>
                        </AppProvider>
                    </BrowserRouter>
                </ThemeProvider>
            </ColorModeContext.Provider>
        </StrictMode>
    );
}

createRoot(document.getElementById('root')!).render(<Root />);