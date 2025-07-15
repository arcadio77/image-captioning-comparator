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
    Dialog, DialogTitle, DialogContent, DialogActions,
    ListItemButton,
    CircularProgress as MuiCircularProgress,
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

    const [openAlertDialog, setOpenAlertDialog] = useState(false);
    const [alertDialogTitle, setAlertDialogTitle] = useState('');
    const [alertDialogMessage, setAlertDialogMessage] = useState('');

    const [openModelsDialog, setOpenModelsDialog] = useState(false);
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);

    useEffect(() => {
        setSelectedImageNames(images.map(img => img.file.name));
    }, [images]);

    const showAlertDialog = (title: string, message: string) => {
        setAlertDialogTitle(title);
        setAlertDialogMessage(message);
        setOpenAlertDialog(true);
    };

    const handleCloseAlertDialog = () => {
        setOpenAlertDialog(false);
        setAlertDialogTitle('');
        setAlertDialogMessage('');
    };

    const handleOpenModelsDialog = () => {
        setOpenModelsDialog(true);
    };

    const handleCloseModelsDialog = () => {
        setOpenModelsDialog(false);
        setFetchedModels([]);
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
        setFetchingModels(true);
        try {
            const response = await axios.get(`${VITE_BASE_URL}models`);
            setFetchedModels(response.data.models);
            handleOpenModelsDialog();
        } catch (error) {
            console.error('Error fetching models:', error);
            showAlertDialog("Błąd", "Nie udało się pobrać listy modeli.");
        } finally {
            setFetchingModels(false);
        }
    }

    const handleAddAllModelsFromFetched = () => {
        fetchedModels.forEach(model => addModel(model));
        handleCloseModelsDialog();
    };


    const handleSend = async () => {
        if (images.length === 0 || models.length === 0) {
            showAlertDialog("Błąd Wysyłki", "Proszę dodać zdjęcia i modele przed wysłaniem!");
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
            showAlertDialog("Błąd", `Wystąpił błąd podczas wysyłania zdjęć: 
            ${axios.isAxiosError(error) && error.response ? error.response.data.message || error.message : 'Nieznany błąd'}`);
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
            <Typography variant="h5" component="h1" gutterBottom>
                Porównaj modele do image captioningu z Hugging Face
            </Typography>

            <Button
                variant="outlined"
                color="primary"
                size="small"
                sx={{ mt: 2, mb: 2 }}
                onClick={handleFetchModels}
                disabled={loading || fetchingModels}
            >
                {fetchingModels ? <MuiCircularProgress size={24} /> : "Pobrane modele"}
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
                    disabled={loading}
                />
                <Button
                    variant="outlined"
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
                    <MuiCircularProgress />
                </Box>
            ) : (
                <Button
                    variant="outlined"
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
                sx={{
                    mt: 2,
                    '&:hover': {
                        backgroundColor: (theme) => theme.palette.error.light + '1A',
                        borderColor: (theme) => theme.palette.error.dark,
                    },
                }}
                onClick={reset}
                disabled={loading}
            >
                Wyczyść Wszystkie Dane (zdjęcia i modele)
            </Button>
            <Dialog
                open={openAlertDialog}
                onClose={handleCloseAlertDialog}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
            >
                <DialogTitle id="alert-dialog-title">{alertDialogTitle}</DialogTitle>
                <DialogContent>
                    <Typography id="alert-dialog-description">
                        {alertDialogMessage}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAlertDialog} autoFocus>
                        OK
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={openModelsDialog}
                onClose={handleCloseModelsDialog}
                aria-labelledby="models-dialog-title"
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle id="models-dialog-title">Wybierz modele do dodania</DialogTitle>
                <DialogContent dividers>
                    {fetchingModels ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <MuiCircularProgress />
                        </Box>
                    ) : fetchedModels.length === 0 ? (
                        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            Brak dostępnych modeli.
                        </Typography>
                    ) : (
                        <List>
                            {fetchedModels.map((modelName) => (
                                <ListItem
                                    key={modelName}
                                    disablePadding
                                    secondaryAction={
                                        <IconButton
                                            edge="end"
                                            aria-label="add"
                                            onClick={() => addModel(modelName)}
                                            disabled={models.includes(modelName) || loading}
                                        >
                                            {models.includes(modelName) ? "Dodano" : "Dodaj"}
                                        </IconButton>
                                    }
                                >
                                    <ListItemButton
                                        onClick={() => addModel(modelName)}
                                        disabled={models.includes(modelName) || loading}
                                    >
                                        <ListItemText primary={modelName} />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleAddAllModelsFromFetched} disabled={fetchedModels.length === 0 || loading}>
                        Dodaj wszystkie modele
                    </Button>
                    <Button onClick={handleCloseModelsDialog}>
                        Zamknij
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default App;