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
} from '@mui/material';
import { Masonry } from '@mui/lab';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useAppContext } from '../contexts/AppContext.tsx';
import { useNavigate } from 'react-router-dom';

function GalleryPage() {
    const { images, models, selectedModel, setSelectedModel, reset } = useAppContext();
    const navigate = useNavigate();
    const theme = useTheme();
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

        let csvContent = "Nazwa Zdjęcia,Model,Opis\n"; // Headers

        images.forEach(image => {
            image.captions.forEach(caption => {
                const fileName = `"${image.file.name.replace(/"/g, '""')}"`;
                const modelName = `"${caption.model.replace(/"/g, '""')}"`;
                const description = `"${caption.text.replace(/"/g, '""')}"`;
                csvContent += `${fileName},${modelName},${description}\n`;
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
        if (isSmallScreen) return 1;
        if (isMediumScreen) return 2;
        return 3;
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


    return (
        <Container maxWidth="lg" sx={{ mt: 4, mx: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Galeria Zdjęć z Opisami
            </Typography>

            <Box sx={{ mb: 3, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <IconButton onClick={() => handleModelNavigation('prev')} disabled={models.length <= 1}>
                    <ArrowBackIosIcon />
                </IconButton>
                <TextField
                    select
                    label="Wybierz model"
                    value={selectedModel || ''}
                    onChange={handleModelChange}
                    sx={{ minWidth: 250 }}
                    disabled={models.length <= 1}
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
                <IconButton onClick={() => handleModelNavigation('next')} disabled={models.length <= 1}>
                    <ArrowForwardIosIcon />
                </IconButton>
            </Box>

            <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={exportToCsv} disabled={images.length === 0}>
                    Eksportuj do CSV
                </Button>
                <Button variant="outlined" onClick={exportToJson} disabled={images.length === 0}>
                    Eksportuj do JSON
                </Button>
            </Box>

            {images.length === 0 ? (
                <Box sx={{ mt: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">Brak przesłanych zdjęć.</Typography>
                </Box>
            ) : (
                <Masonry columns={getColumnCount()} spacing={2} sx={{ width: '100%' }}>
                    {imagesWithUrls.map((image) => (
                        <Card key={image.file.name + image.file.size} raised sx={{ display: 'flex', flexDirection: 'column' }}>
                            <CardMedia
                                component="img"
                                image={image.previewUrl}
                                alt={image.file.name}
                                sx={{
                                    height: 'auto',
                                    width: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                }}
                            />
                            <CardContent sx={{ flexGrow: 1 }}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                    {image.file.name}
                                </Typography>
                                <Typography variant="body2">
                                    {selectedModel
                                        ? image.captions.find(c => c.model === selectedModel)?.text || 'Brak opisu'
                                        : 'Wybierz model, aby zobaczyć opis.'}
                                </Typography>
                            </CardContent>
                        </Card>
                    ))}
                </Masonry>
            )}
            <Button
                variant="outlined"
                color="primary"
                size="large"
                sx={{ mt: 4, mb: 2 }}
                onClick={handleGoHomeAndReset}
            >
                Powrót do Strony Głównej i Reset
            </Button>
        </Container>
    );
}

export default GalleryPage;