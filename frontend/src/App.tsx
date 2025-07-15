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
    Chip,
    CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions,
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
    const [loading, setLoading] = useState(false);

    const [openDialog, setOpenDialog] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogMessage, setDialogMessage] = useState('');

    useEffect(() => {
        setSelectedImageNames(images.map(img => img.file.name));
    }, [images]);

    const showDialog = (title: string, message: string) => {
        setDialogTitle(title);
        setDialogMessage(message);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setDialogTitle('');
        setDialogMessage('');
    };

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

    const handleFetchModels = async () => {
        try {
            const response = await axios.get(`${VITE_BASE_URL}upload`)
        } catch (error) {
            console.error('Error fetching models:', error);
        }
    }

    const handleSend = async () => {
        if (images.length === 0 || models.length === 0) {
            showDialog("Błąd Wysyłki", "Proszę dodać zdjęcia i modele przed wysłaniem!");
            return;
        }

        setLoading(true);

        const formData = new FormData();

        const imageIds = images.map(img => img.file.name + '_' + img.file.size);

        images.forEach((img) => {
            formData.append('files', img.file);
        });

        formData.append('ids', imageIds.join(','));
        formData.append('models', models.join(','));

        try {
            const response = await axios.post(`${VITE_BASE_URL}upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            response.data.results.forEach((imageResult: any) => {
                const originalImageFile = images.find(
                    img => (img.file.name + '_' + img.file.size) === imageResult.id
                )?.file;

                if (originalImageFile && imageResult.results) {
                    imageResult.results.forEach((captionResult: any) => {
                        if (captionResult.model && captionResult.caption) {
                            addCaptionToImage(originalImageFile, captionResult.model, captionResult.caption);
                        }
                    });
                }
            });

            if (models.length > 0) {
                setSelectedModel(models[0]);
            }

            navigate('/gallery');

        } catch (error) {
            console.error('Error uploading images:', error);
        } finally {
            setLoading(false);
        }
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
                Porównaj modele z Hugging Face
            </Typography>

            <Button
                variant="outlined"
                color="primary"
                size="small"
                sx={{ mt: 2, mb: 2 }}
                onClick={handleFetchModels}
                disabled={loading}
            >
                Pobrane modele
            </Button>

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
                    disabled={loading}
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
                                    <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteText(modelName)} disabled={loading}>
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
            <FileUploader
                accept="image/*"
                multiple
                onFileChange={handleImagesChange}
                label="Prześlij zdjęcia"
                loading={loading}
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
                                disabled={loading}
                            />
                        ))}
                    </Box>
                </Box>
            )}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Button
                    variant="contained"
                    size="large"
                    sx={{ mt: 2 }}
                    onClick={handleSend}
                    disabled={loading}
                >
                    Wyślij i Przejdź do Galerii
                </Button>
            )}
            <Button
                variant="outlined"
                color="error"
                size="small"
                sx={{ mt: 2 }}
                onClick={reset}
                disabled={loading}
            >
                Wyczyść Wszystkie Dane (zdjęcia i modele)
            </Button>

            <Dialog
                open={openDialog}
                onClose={handleCloseDialog}
                aria-labelledby="dialog-title"
                aria-describedby="dialog-description"
            >
                <DialogTitle id="dialog-title">{dialogTitle}</DialogTitle>
                <DialogContent>
                    <Typography id="dialog-description">
                        {dialogMessage}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} autoFocus>
                        OK
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default App;