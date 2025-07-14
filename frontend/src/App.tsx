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
import { VITE_BASE_URL } from './utils.ts';
import axios from 'axios';

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

    // Make handleSend an async function
    const handleSend = async () => {
        if (images.length === 0 || models.length === 0) {
            alert("Proszę dodać zdjęcia i modele przed wysłaniem!");
            return;
        }

        alert(`Wysyłam ${images.length} zdjęć i ${models.length} modeli...`);

        // Create a FormData object to send multipart/form-data
        const formData = new FormData();

        // Append each image file
        images.forEach((img, index) => {
            formData.append('files', img.file); // 'files' must match your FastAPI parameter name
            formData.append('ids', img.file.name + img.file.size); // Generate a unique ID for each file
                                                                   // or use a more robust ID if you have one in context
        });

        // Append each model name
        // FastAPI expects a list, so you can append each model name separately
        // or send as a single comma-separated string if your backend handles it that way
        // Given your backend code: `models = models[0].split(",")`, it expects a single string.
        // So, we'll send it as one comma-separated string for 'models'.
        formData.append('models', models.join(','));


        try {
            // Send the data using axios.put (or axios.post, depending on your backend route)
            // The 'Content-Type': 'multipart/form-data' header is usually set automatically by browsers
            // when you pass a FormData object to axios, but explicitly setting it doesn't hurt.
            const response = await axios.post(`${VITE_BASE_URL}upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            console.log('Upload successful:', response.data);

            // Assuming the backend returns the processed results, you might want to update your context
            // or perform further actions based on `response.data`.
            // For now, we'll stick to your existing logic for adding captions locally (if still needed)
            // and navigating to the gallery.
            // If backend handles all captioning, you might remove the following loop.

            // If backend does the captioning, you might set captions here from `response.data`
            // For example:
            // response.data.results.forEach((result: any) => {
            //     if (result.captions) {
            //         Object.keys(result.captions).forEach(model => {
            //             const imageFile = images.find(img => img.file.name === result.id)?.file; // You'd need to map IDs to original files
            //             if (imageFile) {
            //                 addCaptionToImage(imageFile, model, result.captions[model]);
            //             }
            //         });
            //     }
            // });


            if (models.length > 0) {
                setSelectedModel(models[0]);
            }

            navigate('/gallery');

        } catch (error) {
            console.error('Error uploading images:', error);
            alert('Wystąpił błąd podczas wysyłania zdjęć. Sprawdź konsolę.');
        }

        // Removed the old local captioning loop, as the backend is now responsible
        // for generating captions and sending them back.
        // images.forEach(imageFromContext => {
        //     models.forEach(modelName => {
        //         addCaptionToImage(imageFromContext.file, modelName, `Opis dla ${imageFromContext.file.name} od ${modelName}`);
        //     });
        // });
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