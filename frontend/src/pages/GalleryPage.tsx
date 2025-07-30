import React, { useEffect, useMemo } from 'react';
import {
    Container,
    Box,
    Typography,
    Button,
    TextField,
    MenuItem,
    Card,
    CardMedia,
    CardContent,
    useMediaQuery,
    useTheme,
    IconButton,
    Paper,
    Divider,
    Tooltip,
    Fab,
} from '@mui/material';
import { Masonry } from '@mui/lab';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useAppContext } from '../contexts/AppContext.tsx';
import { useNavigate } from 'react-router-dom';
import HomeIcon from '@mui/icons-material/Home';
import DownloadIcon from '@mui/icons-material/Download';

function GalleryPage() {
    const { images, models, selectedModel, setSelectedModel, reset } = useAppContext();
    const navigate = useNavigate();
    const theme = useTheme();

    const isExtraSmallScreen = useMediaQuery(theme.breakpoints.down('xs'));
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const isMediumScreen = useMediaQuery(theme.breakpoints.down('md'));

    const downloadFile = (data: string, filename: string, type: string) => {
        const blob = new Blob([data], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportToCsv = () => {
        if (images.length === 0) return;

        let csvContent = "Nazwa Zdjęcia;Model;Opis\n";

        images.forEach(image => {
            image.captions.forEach(caption => {
                const fileName = `"${image.file.name.replace(/"/g, '""')}"`;
                const modelName = `"${caption.model.replace(/"/g, '""')}"`;
                const description = `"${caption.text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;

                csvContent += `${fileName};${modelName};${description}\n`;
            });
        });

        downloadFile(csvContent, 'captions.csv', 'text/csv;charset=utf-8;');
    };

    const exportToJson = () => {
        if (images.length === 0) return;

        const data = images.map(image => ({
            fileName: image.file.name,
            captions: image.captions.map(caption => ({
                model: caption.model,
                text: caption.text
            }))
        }));

        const jsonContent = JSON.stringify(data, null, 2);
        downloadFile(jsonContent, 'captions.json', 'application/json');
    };

    const getColumnCount = () => {
        if (isExtraSmallScreen) return 1;
        if (isSmallScreen) return 2;
        if (isMediumScreen) return 3;
        return 4;
    };

    const handleModelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedModel(event.target.value);
    };

    const handleModelNavigation = (direction: 'prev' | 'next') => {
        if (!selectedModel || models.length === 0) return;

        const currentIndex = models.indexOf(selectedModel);
        if (direction === 'prev') {
            const prevIndex = (currentIndex - 1 + models.length) % models.length;
            setSelectedModel(models[prevIndex]);
        } else {
            const nextIndex = (currentIndex + 1) % models.length;
            setSelectedModel(models[nextIndex]);
        }
    };

    useEffect(() => {
        if (!selectedModel && models.length > 0) {
            setSelectedModel(models[0]);
        }
        if (models.length === 0 && selectedModel) {
            setSelectedModel(null);
        }
    }, [models, selectedModel, setSelectedModel]);

    const handleGoHomeAndReset = () => {
        reset();
        navigate('/');
    };

    const imagesWithUrls = useMemo(() => {
        return images.map(image => ({
            ...image,
            previewUrl: URL.createObjectURL(image.file)
        }));
    }, [images]);

    useEffect(() => {
        return () => {
            imagesWithUrls.forEach(image => URL.revokeObjectURL(image.previewUrl));
        };
    }, [imagesWithUrls]);

    const displayedImages = useMemo(() => {
        return imagesWithUrls.map(image => {
            const captionText = selectedModel
                ? image.captions.find(c => c.model === selectedModel)?.text || 'Brak opisu dla tego modelu.'
                : 'Wybierz model, aby zobaczyć opis.';
            return {
                ...image,
                captionText
            };
        });
    }, [imagesWithUrls, selectedModel]);


    return (
        <Container maxWidth="xl" sx={{ mt: 4, mx: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 3 }}>
            <Typography
                variant="h4"
                component="h1"
                gutterBottom
                align="center"
                sx={{
                    fontWeight: 'bold',
                    color: theme.palette.primary.main,
                    mb: 2,
                }}
            >
                Galeria Wyników Analizy Zdjęć
            </Typography>
            <Typography variant="h6" component="h2" align="center" color="text.secondary" sx={{ mb: 4 }}>
                Przeglądaj opisy wygenerowane przez różne modele
            </Typography>

            <Divider sx={{ width: '80%', mb: 4 }} />

            <Paper
                elevation={6}
                sx={{
                    p: 3,
                    mb: 4,
                    borderRadius: '12px',
                    width: { xs: '80%', sm: '80%', md: '60%' },
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 3,
                    backgroundColor: theme.palette.background.paper,
                }}
            >
                <Tooltip title="Poprzedni model">
                    <IconButton
                        onClick={() => handleModelNavigation('prev')}
                        disabled={models.length <= 1}
                        color="primary"
                        size="small"
                        sx={{ p: 1 }}
                    >
                        <ArrowBackIosIcon fontSize="large" />
                    </IconButton>
                </Tooltip>
                <TextField
                    select
                    label="Wybierz model do wyświetlenia opisów"
                    value={selectedModel || ''}
                    onChange={handleModelChange}
                    fullWidth
                    sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 250 } }}
                    disabled={models.length <= 1}
                    variant="outlined"
                >
                    {models.length === 0 ? (
                        <MenuItem value="" disabled>Brak dostępnych modeli</MenuItem>
                    ) : (
                        models.map((modelName) => (
                            <MenuItem key={modelName} value={modelName}>
                                {modelName}
                            </MenuItem>
                        ))
                    )}
                </TextField>
                <Tooltip title="Następny model">
                    <IconButton
                        onClick={() => handleModelNavigation('next')}
                        disabled={models.length <= 1}
                        color="primary"
                        size="small"
                        sx={{ p: 1 }}
                    >
                        <ArrowForwardIosIcon fontSize="large" />
                    </IconButton>
                </Tooltip>
            </Paper>

            <Paper
                elevation={3}
                sx={{
                    p: 2,
                    mb: 4,
                    borderRadius: '8px',
                    width: { xs: '100%', sm: 'auto' },
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 2,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={exportToCsv}
                    disabled={images.length === 0}
                    startIcon={<DownloadIcon />}
                    sx={{ minWidth: { xs: '100%', sm: 180 } }}
                >
                    Eksportuj do CSV
                </Button>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={exportToJson}
                    disabled={images.length === 0}
                    startIcon={<DownloadIcon />}
                    sx={{ minWidth: { xs: '100%', sm: 180 } }}
                >
                    Eksportuj do JSON
                </Button>
            </Paper>

            {images.length === 0 ? (
                <Box sx={{ mt: 4, textAlign: 'center', p: 3, border: `1px dashed ${theme.palette.divider}`, borderRadius: '8px', width: '100%' }}>
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        Brak przesłanych zdjęć do wyświetlenia.
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Wróć do strony głównej, aby przesłać nowe zdjęcia i modele.
                    </Typography>
                </Box>
            ) : (
                <Masonry columns={getColumnCount()} spacing={3} sx={{ width: '100%' }}>
                    {displayedImages.map((image) => (
                        <Card
                            key={image.file.name + image.file.size}
                            elevation={4}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                '&:hover': {
                                    transform: 'scale(1.02)',
                                    transition: 'transform 0.2s ease-in-out',
                                    boxShadow: theme.shadows[8],
                                },
                            }}
                        >
                            <CardMedia
                                component="img"
                                image={image.previewUrl}
                                alt={image.file.name}
                                sx={{
                                    height: 'auto',
                                    maxHeight: 300,
                                    width: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                    bgcolor: theme.palette.background.default,
                                    p: 1,
                                }}
                            />
                            <CardContent sx={{ flexGrow: 1, p: 2 }}>
                                <Typography variant="subtitle2" color="text.primary" gutterBottom sx={{ fontWeight: 'bold' }}>
                                    {image.file.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
                                    Model: {selectedModel || 'Nie wybrano'}
                                </Typography>
                                <Typography variant="body1" sx={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {image.captionText}
                                </Typography>
                            </CardContent>
                        </Card>
                    ))}
                </Masonry>
            )}
            <Tooltip title="Wróć do strony głównej i zresetuj dane">
                <Fab
                    color="primary"
                    aria-label="home"
                    sx={{
                        position: 'fixed',
                        bottom: 32,
                        right: 32,
                        boxShadow: theme.shadows[6],
                        '&:hover': {
                            boxShadow: theme.shadows[10],
                        },
                    }}
                    onClick={handleGoHomeAndReset}
                >
                    <HomeIcon fontSize="large" />
                </Fab>
            </Tooltip>
        </Container>
    );
}

export default GalleryPage;
