import React, { useState, useEffect } from 'react';
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
    CircularProgress, IconButton,
} from '@mui/material';
import { Masonry } from '@mui/lab';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useImageData } from './ImageDataContext';
import { useNavigate } from 'react-router-dom';

function GalleryPage() {
    const { images, models, selectedModel, setSelectedModel, addCaptionToImage, reset } = useImageData();
    const navigate = useNavigate();
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const isMediumScreen = useMediaQuery(theme.breakpoints.down('md'));

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

    const [generatingCaptions, setGeneratingCaptions] = useState(false);

    useEffect(() => {
        const generateAllCaptions = async () => {
            if (images.length === 0 || !selectedModel) {
                setGeneratingCaptions(false);
                return;
            }

            setGeneratingCaptions(true);
            for (const img of images) {
                const existingCaption = img.captions.find(c => c.model === selectedModel);
                console.log(selectedModel);
                if (!existingCaption) {
                    const caption = img.captions.find(c => c.model === selectedModel);
                    console.log(caption);
                    const captionText = caption?.text;
                    console.log(captionText);
                    if (captionText != null) {
                        addCaptionToImage(img.file, selectedModel, captionText);
                    }
                }
            }
            setGeneratingCaptions(false);
        };

        generateAllCaptions();
    }, [images, selectedModel, addCaptionToImage]);

    const handleGoHomeAndReset = () => {
        reset();
        navigate('/');
    };


    return (
        <Container maxWidth="lg" sx={{ mt: 4, mx: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Galeria Zdjęć z Opisami
            </Typography>

            <Box sx={{ mb: 3, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                <IconButton onClick={() => handleModelNavigation('prev')} disabled={models.length <= 1 || generatingCaptions}>
                    <ArrowBackIosIcon />
                </IconButton>
                <TextField
                    select
                    label="Wybierz model"
                    value={selectedModel || ''}
                    onChange={handleModelChange}
                    sx={{ minWidth: 250 }}
                    disabled={models.length === 0 || generatingCaptions}
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
                <IconButton onClick={() => handleModelNavigation('next')} disabled={models.length <= 1 || generatingCaptions}>
                    <ArrowForwardIosIcon />
                </IconButton>
            </Box>

            {generatingCaptions && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    <Typography>Generowanie opisów dla modelu "{selectedModel}"...</Typography>
                </Box>
            )}

            {images.length === 0 ? (
                <Box sx={{ mt: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">Brak przesłanych zdjęć.</Typography>
                    <Button variant="contained" sx={{ mt: 2 }} onClick={() => navigate('/')}>
                        Prześlij zdjęcia na stronie głównej
                    </Button>
                </Box>
            ) : (
                <Masonry columns={getColumnCount()} spacing={2} sx={{ width: '100%' }}>
                    {images.map((image, index) => (
                        <Card key={index} raised sx={{ display: 'flex', flexDirection: 'column' }}>
                            <CardMedia
                                component="img"
                                image={image.previewUrl}
                                alt={image.file.name}
                                sx={{
                                    height: 'auto',
                                    width: '100%',
                                    objectFit: 'cover',
                                    display: 'block',
                                    borderBottom: '1px solid #eee'
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