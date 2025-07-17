import {useEffect, useMemo, useState} from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress as MuiCircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    TextField,
    Typography,
} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploader from "./FileUploader.tsx";
import {useImageData} from './ImageDataContext';
import {useNavigate} from 'react-router-dom';
import {VITE_BASE_URL} from './utils.ts';
import axios from 'axios';

function App() {
    const theme = useTheme();

    const { addImage, removeImage, images, models, addCaptionToImage, reset, setSelectedModel, addModel, removeModel } = useImageData();

    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const [openAlertDialog, setOpenAlertDialog] = useState(false);
    const [alertDialogTitle, setAlertDialogTitle] = useState('');
    const [alertDialogMessage, setAlertDialogMessage] = useState('');

    const [openModelsDialog, setOpenModelsDialog] = useState(false);
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);

    const [modelFilterText, setModelFilterText] = useState('');
    const [fetchedModelFilterText, setFetchedModelFilterText] = useState('');

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
        setModelFilterText('');
        setFetchedModelFilterText('');
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
            const sortedModels = response.data.models.sort((a: string, b: string) => a.localeCompare(b));
            setFetchedModels(sortedModels);
            handleOpenModelsDialog();
        } catch (error) {
            console.error('Error fetching models:', error);
            showAlertDialog("Błąd", "Nie udało się pobrać listy modeli.");
        } finally {
            setFetchingModels(false);
        }
    };

    const handleAddAllModelsFromFetched = () => {
        fetchedModels.forEach(model => addModel(model));
        handleCloseModelsDialog();
    };


    const handleSend = async () => {
        if (images.length === 0 || models.length === 0) {
            showAlertDialog("Błąd wysyłania", "Proszę dodać modele i zdjęcia przed wysłaniem!");
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

    const filteredAndSortedModels = useMemo(() => {
        const sorted = [...models].sort((a, b) => a.localeCompare(b));
        if (!modelFilterText) {
            return sorted;
        }
        return sorted.filter(model =>
            model.toLowerCase().includes(modelFilterText.toLowerCase())
        );
    }, [models, modelFilterText]);

    const filteredFetchedModels = useMemo(() => {
        if (!fetchedModelFilterText) {
            return fetchedModels;
        }
        return fetchedModels.filter(model =>
            model.toLowerCase().includes(fetchedModelFilterText.toLowerCase())
        );
    }, [fetchedModels, fetchedModelFilterText]);

    const imageUrls = useMemo(() => {
        return images.map(image => ({
            name: image.file.name,
            size: image.file.size,
            url: URL.createObjectURL(image.file)
        }));
    }, [images]);

    useEffect(() => {
        return () => {
            imageUrls.forEach(img => URL.revokeObjectURL(img.url));
        };
    }, [imageUrls]);

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
                onClick={() => navigate('/models')}
                sx={{ mb: 0 }}
            >
                Zarządzaj workerami
            </Button>

            <Button
                variant="outlined"
                color="primary"
                size="small"
                sx={{ mt: 2, mb: 2 }}
                onClick={handleFetchModels}
                disabled={loading || fetchingModels}
            >
                {fetchingModels ? <MuiCircularProgress size={24} /> : "Dodaj modele"}
            </Button>

            <Box
                sx={{
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    border: `1px solid ${theme.palette.divider}`,
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
                {models.length > 0 && (
                    <TextField
                        label="Filtruj modele"
                        variant="outlined"
                        fullWidth
                        value={modelFilterText}
                        onChange={(e) => setModelFilterText(e.target.value)}
                        sx={{ mb: 2 }}
                        size="small"
                        disabled={loading}
                    />
                )}

                {filteredAndSortedModels.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                        {models.length === 0 ? "Brak modeli" : "Brak modeli pasujących do filtra"}
                    </Typography>
                ) : (
                    <List sx={{ width: '100%' }}>
                        {filteredAndSortedModels.map((modelName) => (
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
            {imageUrls.length > 0 && (
                <Box mt={2} sx={{ width: '100%', textAlign: 'center' }}>
                    <Typography variant="body2" gutterBottom color="text.secondary">
                        Wybrane zdjęcia:
                    </Typography>
                    <Grid container spacing={1} justifyContent="center">
                        {imageUrls.map((img) => (
                            <Grid item key={img.name + img.size} {...({ component: "div" } as any)}>
                                <Chip
                                    label={img.name}
                                    size="small"
                                    onDelete={() => removeImage(
                                        images.find(
                                            originalImg => originalImg.file.name === img.name && originalImg.file.size === img.size
                                        )?.file || new File([], '')
                                    )}
                                    disabled={loading}
                                    avatar={
                                        <img
                                            src={img.url}
                                            alt={img.name}
                                            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', padding:4 }}
                                        />
                                    }
                                    sx={{ height: 'auto', '& .MuiChip-label': { py: 0.5 }, '& .MuiChip-avatar': { width: 28, height: 28 } }}
                                />
                            </Grid>
                        ))}
                    </Grid>
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
                    <TextField
                        label="Filtruj pobrane modele"
                        variant="outlined"
                        fullWidth
                        value={fetchedModelFilterText}
                        onChange={(e) => setFetchedModelFilterText(e.target.value)}
                        sx={{ mb: 2 }}
                        size="small"
                        disabled={fetchingModels || loading}
                    />
                    {fetchingModels ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <MuiCircularProgress />
                        </Box>
                    ) : filteredFetchedModels.length === 0 ? (
                        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            Brak dostępnych modeli.
                        </Typography>
                    ) : (
                        <List>
                            {filteredFetchedModels.map((modelName) => (
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
                    <Button onClick={handleAddAllModelsFromFetched} disabled={filteredFetchedModels.length === 0 || loading}>
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