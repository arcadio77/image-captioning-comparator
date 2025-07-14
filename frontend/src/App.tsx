import { useState, useEffect } from 'react';
import {
    Container,
    TextField,
    Button,
    List,
    ListItem,
    ListItemText,
    IconButton,
    Box,
    Typography,
    FormControl,
    Grid, InputLabel, Chip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploader from "./FileUploader.tsx";
import { useImageData } from './ImageDataContext';
import { useNavigate } from 'react-router-dom';

function App() {
    const { addImage, removeImage, images, models, addCaptionToImage, reset, setSelectedModel, addModel, removeModel } = useImageData();

    const navigate = useNavigate();

    const [inputText, setInputText] = useState('');

    const [selectedImageNames, setSelectedImageNames] = useState<string[]>([]);

    useEffect(() => {
        setSelectedImageNames(images.map(img => img.file.name));
    }, [images]);

    const handleAddText = () => {
        if (inputText.trim() !== '') {
            addModel(inputText.trim());
            setInputText('');
        }
    };

    const handleDeleteText = (modelToDelete: string) => {
        removeModel(modelToDelete);
    };

    const handleImagesChange = (files: File[] | File | null) => {
        if (files) {
            const filesArray = Array.isArray(files) ? files : [files];
            filesArray.forEach(file => addImage(file));
        }
    };

    const handleSend = () => {
        if (images.length === 0 || models.length === 0) {
            alert("Proszę dodać zdjęcia i modele przed wysłaniem!");
            return;
        }

        alert(`Wysyłam ${images.length} zdjęć i ${models.length} modeli...`);

        images.forEach(imageFromContext => {
            models.forEach(modelName => {
                addCaptionToImage(imageFromContext.file, modelName, `Opis dla ${imageFromContext.file.name} od ${modelName}`);
            });
        });

        if (models.length > 0) {
            setSelectedModel(models[0]);
        }

        navigate('/gallery');
    };

    return (
        <Container
            maxWidth="lg"
            sx={{
                mt: 4,
                mx: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 2,
            }}
        >
            <Typography variant="h4" component="h1" gutterBottom>
                Konfigurator Modeli i Obrazów
            </Typography>

            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    mb: 3,
                }}
            >
                <TextField
                    label="Przekopiuj nazwę modelu"
                    variant="outlined"
                    fullWidth
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            handleAddText();
                        }
                    }}
                    sx={{ mr: 2 }}
                />
                <Button
                    variant="contained"
                    onClick={handleAddText}
                    size="large"
                >
                    Dodaj
                </Button>
            </Box>

            <Box
                sx={{
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    p: 2,
                    mb: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <Typography variant="h6" component="h2" gutterBottom sx={{ textAlign: 'center' }}>
                    Dodane modele:
                </Typography>
                {models.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center' }}>Brak modeli</Typography>
                ) : (
                    <List sx={{ width: '100%' }}>
                        {models.map((modelName) => (
                            <ListItem
                                key={modelName}
                                secondaryAction={
                                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteText(modelName)}>
                                        <DeleteIcon />
                                    </IconButton>
                                }
                            >
                                <ListItemText primary={modelName} />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Box>

            <Grid
                item
                xs={12}
                sx = {{
                    mt: 2,
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
                {...({ component: "div" } as any)}
            >
                <FormControl
                    sx={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        '& .MuiInputLabel-outlined': {
                            transform: 'translate(14px, 20px) scale(1)',
                            '&.MuiInputLabel-shrink': {
                                transform: 'translate(14px, -6px) scale(0.75)',
                            },
                        },
                        '& .MuiOutlinedInput-root': {
                            paddingTop: '10px',
                        }
                    }}
                >
                    <InputLabel
                        shrink
                        sx={{
                            color: 'secondary.main',
                            '&.Mui-focused': {
                                color: 'secondary.main',
                            },
                        }}
                    >
                    </InputLabel>
                    <FileUploader
                        accept="image/*"
                        multiple
                        onFileChange={handleImagesChange}
                        label="Prześlij zdjęcia"
                    />
                    {selectedImageNames.length > 0 && (
                        <Box mt={2} sx={{ width: '100%', textAlign: 'center' }}>
                            <Typography variant="body2" gutterBottom color="text.secondary">
                                Wybrane zdjęcia:
                            </Typography>
                            <Box display="flex" flexWrap="wrap" gap={1} justifyContent="center">
                                {images.map((img) => (
                                    <Chip
                                        key={img.file.name + img.file.size}
                                        label={img.file.name}
                                        size="small"
                                        onDelete={() => removeImage(img.file)}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}
                </FormControl>
            </Grid>

            <Button
                variant="contained"
                size="large"
                sx={{ mt: 2 }}
                onClick={handleSend}
            >
                Wyślij i Przejdź do Galerii
            </Button>
            <Button
                variant="outlined"
                color="error"
                size="small"
                sx={{ mt: 2 }}
                onClick={reset}
            >
                Wyczyść Wszystkie Dane (zdjęcia i modele)
            </Button>
        </Container>
    );
}

export default App;