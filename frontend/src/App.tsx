import {useMemo, useState} from 'react';
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
    Link,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    TextField,
    Typography,
    Paper,
    Divider,
} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploader from "./utils/FileUploader.tsx";
import {useAppContext} from './contexts/AppContext.tsx';
import {useNavigate} from 'react-router-dom';
import {VITE_BASE_URL} from './utils/utils.ts';
import axios from 'axios';

function App() {
    const theme = useTheme();

    const { addImage, removeImage, images, models, addCaptionToImage, reset, setSelectedModel, addModel, removeModel } = useAppContext();

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
            <Typography
                variant="h4"
                component="h1"
                gutterBottom
                align="center"
                sx={{
                    fontWeight: 'bold',
                    color: theme.palette.primary.main,
                    mb: 3,
                }}
            >
                Porównywarka Modeli Image Captioning
            </Typography>
            <Typography variant="h6" component="h2" align="center" color="text.secondary" sx={{ mb: 4 }}>
                Odkryj możliwości opisywania zdjęć z wykorzystaniem modeli Hugging Face
            </Typography>

            <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link
                    href="https://huggingface.co/models?pipeline_tag=image-to-text&sort=trending"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                        color: theme.palette.info.main,
                        textDecoration: 'none',
                        '&:hover': {
                            textDecoration: 'underline',
                        },
                        fontWeight: 'medium',
                    }}
                >
                    Katalog modeli image-to-text
                </Link>
                <Link
                    href="https://huggingface.co/models?pipeline_tag=image-text-to-text&sort=trending"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                        color: theme.palette.info.main,
                        textDecoration: 'none',
                        '&:hover': {
                            textDecoration: 'underline',
                        },
                        fontWeight: 'medium',
                    }}
                >
                    Katalog modeli image-text-to-text
                </Link>
            </Box>

            <Divider sx={{ width: '80%', mb: 4 }} />

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 4, width: '100%', justifyContent: 'center' }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleFetchModels}
                    disabled={loading || fetchingModels}
                    sx={{
                        minWidth: { xs: '100%', sm: 'auto' },
                        px: 4, py: 1.5,
                        fontWeight: 'bold',
                        boxShadow: theme.shadows[3],
                        '&:hover': { boxShadow: theme.shadows[6] },
                    }}
                >
                    {fetchingModels ? <MuiCircularProgress size={24} sx={{ color: 'white' }} /> : "Dodaj modele"}
                </Button>
                <Button
                    variant="outlined"
                    onClick={() => navigate('/workers')}
                    disabled={loading || fetchingModels}
                    sx={{
                        minWidth: { xs: '100%', sm: 'auto' },
                        px: 4, py: 1.5,
                    }}
                >
                    Zarządzaj workerami
                </Button>
            </Box>
            <Paper
                elevation={3}
                sx={{
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    p: 3,
                    mb: 4,
                    borderRadius: '8px',
                    boxShadow: theme.shadows[5],
                }}
            >
                <Typography variant="h6" component="h2" gutterBottom align="center" sx={{ mb: 2 }}>
                    Dodane modele do porównania:
                </Typography>
                {models.length > 0 && (
                    <TextField
                        label="Filtruj dodane modele"
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
                    <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                        {models.length === 0 ? "Brak dodanych modeli." : "Brak modeli pasujących do filtra."}
                    </Typography>
                ) : (
                    <List>
                        {filteredAndSortedModels.map((modelName) => (
                            <ListItem
                                key={modelName}
                                secondaryAction={
                                    <IconButton edge="end" aria-label="delete" onClick={() => removeModel(modelName)} disabled={loading}>
                                        <DeleteIcon/>
                                    </IconButton>
                                }
                                sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}
                            >
                                <ListItemText primary={modelName} />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>
            <Paper
                elevation={3}
                sx={{
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    p: 3,
                    mb: 4,
                    borderRadius: '8px',
                    boxShadow: theme.shadows[5],
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <FileUploader
                    accept="image/*"
                    multiple
                    onFileChange={handleImagesChange}
                    label="Prześlij zdjęcia"
                    loading={loading}
                />
                {images.length > 0 && (
                    <Box mt={3} sx={{ width: '100%', textAlign: 'center' }}>
                        <Typography variant="subtitle1" gutterBottom color="text.secondary" sx={{ mb: 2 }}>
                            Wybrane zdjęcia ({images.length}):
                        </Typography>
                        <Grid container spacing={1} justifyContent="center">
                            {images.map((img) => (
                                <Grid item key={img.file.name + img.file.size} sx={{ display: 'flex' }} {...({ component: "div" } as any)}>
                                    <Chip
                                        label={img.file.name.length > 20 ? img.file.name.substring(0, 17) + '...' : img.file.name}
                                        size="medium"
                                        onDelete={() => removeImage(
                                            images.find(
                                                originalImg => originalImg.file.name === img.file.name && originalImg.file.size === img.file.size
                                            )?.file || new File([], '')
                                        )}
                                        disabled={loading}
                                        avatar={
                                            <img
                                                src={img.previewUrl}
                                                alt={img.file.name}
                                                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                                            />
                                        }
                                        sx={{
                                            height: 'auto',
                                            py: 0.8,
                                            borderRadius: '20px',
                                            bgcolor: theme.palette.action.selected,
                                            '& .MuiChip-label': { px: 1 },
                                            '& .MuiChip-avatar': { width: 32, height: 32, mx: '4px!important' }
                                        }}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                )}
            </Paper>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mt: 3, mb: 4, width: '100%', justifyContent: 'center' }}>
                <Button
                    variant="contained"
                    color="success"
                    sx={{
                        minWidth: { xs: '100%', sm: 'auto' },
                        px: 5, py: 1.5,
                        fontWeight: 'bold',
                        boxShadow: theme.shadows[3],
                        '&:hover': { boxShadow: theme.shadows[6] },
                    }}
                    onClick={handleSend}
                    disabled={loading || images.length === 0 || models.length === 0}
                >
                    {loading ? <MuiCircularProgress size={24} sx={{ color: 'white' }} /> : "Wyślij i Przejdź do Galerii"}
                </Button>
                <Button
                    variant="outlined"
                    color="error"
                    sx={{
                        minWidth: { xs: '100%', sm: 'auto' },
                        px: 4, py: 1.5,
                        '&:hover': {
                            backgroundColor: (theme) => theme.palette.error.light + '1A',
                            borderColor: (theme) => theme.palette.error.dark,
                        },
                    }}
                    onClick={reset}
                    disabled={loading}
                >
                    Wyczyść Wszystkie Dane
                </Button>
            </Box>
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
                        label="Filtruj dostępne modele"
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
                        <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
                            Brak dostępnych modeli pasujących do filtra.
                        </Typography>
                    ) : (
                        <List sx={{ maxHeight: 400, overflow: 'auto', border: `1px solid ${theme.palette.divider}`, borderRadius: '4px' }}>
                            {filteredFetchedModels.map((modelName) => (
                                <ListItem
                                    key={modelName}
                                    disablePadding
                                    secondaryAction={
                                        models.includes(modelName) ? (
                                            <Chip label="Dodano" color="success" size="small" />
                                        ) : (
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => addModel(modelName)}
                                                disabled={loading}
                                            >
                                                Dodaj
                                            </Button>
                                        )
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
                    <Button onClick={handleAddAllModelsFromFetched} disabled={filteredFetchedModels.length === 0 || loading || fetchedModels.every(model => models.includes(model))}>
                        Dodaj wszystkie widoczne modele
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