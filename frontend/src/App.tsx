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
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    MenuItem,
    Select,
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

interface WorkerInfo {
    id: string;
    cached_models: string[];
    loaded_models: string[];
}

function App() {
    const theme = useTheme();

    const { addImage, removeImage, images, models, addCaptionToImage, reset, setSelectedModel, addModel, removeModel } = useImageData();

    const navigate = useNavigate();

    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);

    const [openAlertDialog, setOpenAlertDialog] = useState(false);
    const [alertDialogTitle, setAlertDialogTitle] = useState('');
    const [alertDialogMessage, setAlertDialogMessage] = useState('');

    const [downloadingModel, setDownloadingModel] = useState(false);

    const [openModelsDialog, setOpenModelsDialog] = useState(false);
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);

    const [modelFilterText, setModelFilterText] = useState('');
    const [fetchedModelFilterText, setFetchedModelFilterText] = useState('');

    const [availableWorkers, setAvailableWorkers] = useState<WorkerInfo[]>([]);
    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    const [fetchingWorkers, setFetchingWorkers] = useState(false);

    const fetchWorkers = async () => {
        setFetchingWorkers(true);
        try {
            const response = await axios.get(`${VITE_BASE_URL}workers`);
            setAvailableWorkers(response.data.workers);
            if (response.data.workers.length === 1) {
                setSelectedWorkerId(response.data.workers[0].id);
            }
        } catch (error) {
            console.error('Błąd podczas pobierania listy workerów:', error);
            showAlertDialog("Błąd", "Nie udało się pobrać listy dostępnych workerów.");
        } finally {
            setFetchingWorkers(false);
        }
    };

    useEffect(() => {
        fetchWorkers();
    }, []);

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

    const handleDownloadModel = async () => {
        if (inputText.trim() === '') {
            showAlertDialog("Błąd", "Proszę podać nazwę modelu do pobrania.");
            return;
        }
        if (!selectedWorkerId) {
            showAlertDialog("Błąd", "Proszę wybrać workera, do którego chcesz pobrać model.");
            return;
        }

        setDownloadingModel(true);
        const modelToDownload = inputText.trim();
        try {
            const response = await axios.post(
                `${VITE_BASE_URL}download_model`,
                {},
                {
                    params: {
                        worker: selectedWorkerId,
                        model: modelToDownload,
                    },
                }
            );

            if (response.status === 200) {
                addModel(modelToDownload);
                setInputText('');
            } else {
                showAlertDialog("Błąd", `Wystąpił nieoczekiwany błąd podczas pobierania modelu: ${response.status}`);
            }

        } catch (error) {
            console.error('Błąd podczas pobierania modelu:', error);
        } finally {
            setDownloadingModel(false);
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

            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    mb: 3,
                    gap: 2,
                }}
            >
                <FormControl sx={{ minWidth: 120 }} size="small" disabled={loading || downloadingModel || fetchingWorkers}>
                    <InputLabel id="worker-select-label">Worker</InputLabel>
                    <Select
                        labelId="worker-select-label"
                        id="worker-select"
                        value={selectedWorkerId}
                        label="Worker"
                        onChange={(e) => setSelectedWorkerId(e.target.value as string)}
                        required
                    >
                        {fetchingWorkers ? (
                            <MenuItem disabled>
                                <MuiCircularProgress size={16} sx={{ mr: 1 }} /> Ładowanie workerów...
                            </MenuItem>
                        ) : availableWorkers.length === 0 ? (
                            <MenuItem value="" disabled>Brak dostępnych workerów</MenuItem>
                        ) : (
                            availableWorkers.map((worker) => (
                                <MenuItem key={worker.id} value={worker.id}>
                                    {worker.id}
                                </MenuItem>
                            ))
                        )}
                    </Select>
                </FormControl>

                <TextField
                    label="Przekopiuj nazwę modelu"
                    variant="standard"
                    fullWidth
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    sx={{
                        mr: 2,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '4px',
                    }}
                    disabled={loading || fetchingWorkers || downloadingModel}
                />
                <Button
                    variant="outlined"
                    onClick={handleDownloadModel}
                    size="large"
                    disabled={loading || downloadingModel || !selectedWorkerId || fetchingWorkers}
                >
                    {downloadingModel ? <MuiCircularProgress size={24} /> : "Pobierz nowy model"}
                </Button>
            </Box>

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