import {useEffect, useMemo, useState} from 'react';
import {
    Box,
    Button,
    CircularProgress as MuiCircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    Select,
    TextField,
    Typography,
} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import {useNavigate} from 'react-router-dom';
import {VITE_BASE_URL} from '../utils/utils.ts';
import axios from 'axios';
import {useWorkersContext} from "../contexts/WorkersContext.tsx";

function WorkersPage() {
    const theme = useTheme();
    const navigate = useNavigate();

    const {workers, setWorkers, downloading, setWorkerDownloading, addModel, removeModel} = useWorkersContext();

    const [inputText, setInputText] = useState('');

    const [openAlertDialog, setOpenAlertDialog] = useState(false);
    const [alertDialogTitle, setAlertDialogTitle] = useState('');
    const [alertDialogMessage, setAlertDialogMessage] = useState('');

    const [deletingModel, setDeletingModel] = useState(false);

    const [modelFilterText, setModelFilterText] = useState('');

    const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
    const [fetchingWorkers, setFetchingWorkers] = useState(false);

    const isThisWorkerDownloading = downloading[selectedWorkerId] || false;

    const [workerSpecificCachedModels, setWorkerSpecificCachedModels] = useState<string[]>([]);
    const [workerSpecificLoadedModels, setWorkerSpecificLoadedModels] = useState<string[]>([]);

    const fetchWorkers = async () => {
        setFetchingWorkers(true);
        try {
            const response = await axios.get(`${VITE_BASE_URL}workers`);
            setWorkers(response.data.workers);
            if (response.data.workers.length === 1) {
                setSelectedWorkerId(response.data.workers[0].id);
            }
        } catch (error) {
            console.error('Error fetching workers:', error);
            showAlertDialog("Błąd", "Nie udało się pobrać dostępnych workerów.");
        } finally {
            setFetchingWorkers(false);
        }
    };

    useEffect(() => {
        fetchWorkers();
    }, []);

    useEffect(() => {
        if (selectedWorkerId && workers.length > 0) {
            const worker = workers.find(w => w.id === selectedWorkerId);
            if (worker) {
                setWorkerSpecificCachedModels(worker.cached_models);
                setWorkerSpecificLoadedModels(worker.loaded_models);
            } else {
                setWorkerSpecificCachedModels([]);
                setWorkerSpecificLoadedModels([]);
            }
        } else {
            setWorkerSpecificCachedModels([]);
            setWorkerSpecificLoadedModels([]);
        }
    }, [selectedWorkerId, workers]);


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

    const handleDeleteModel = async (modelToDelete: string) => {
        if (!selectedWorkerId) {
            showAlertDialog("Błąd", "Wybierz workera, z którego chcesz usunąć model.");
            return;
        }

        setDeletingModel(true);
        try {
            const response = await axios.delete(
                `${VITE_BASE_URL}delete_model`,
                {
                    params: {
                        worker: selectedWorkerId,
                        model: modelToDelete,
                    },
                }
            );

            if (response.status === 200) {
                removeModel(selectedWorkerId, modelToDelete);
            } else {
                showAlertDialog("Błąd", `Nieoczekiwany błąd podczas usuwania: ${response.status}`);
            }
        } catch (error) {
            console.error('Error deleting model:', error);
            if (axios.isAxiosError(error) && error.response) {
                showAlertDialog("Błąd", `Nie udało się usunąć modelu: ${error.response.data.detail || error.message}`);
            } else {
                showAlertDialog("Błąd", `Nie udało się usunąć modelu: ${String(error)}`);
            }
        } finally {
            setDeletingModel(false);
        }
    };


    const handleDownloadModel = async () => {
        if (inputText.trim() === '') {
            showAlertDialog("Błąd", "Podaj nazwę modelu do pobrania.");
            return;
        }
        if (!selectedWorkerId) {
            showAlertDialog("Błąd", "Wybierz workera, na którego chcesz pobrać model.");
            return;
        }

        setWorkerDownloading(selectedWorkerId, true);
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
                setInputText('');
                addModel(selectedWorkerId, modelToDownload);
            } else {
                showAlertDialog("Błąd", `Nieoczekiwany błąd podczas pobierania: ${response.status}`);
            }
        } catch (error) {
            console.error('Error downloading model:', error);
            if (axios.isAxiosError(error) && error.response) {
                showAlertDialog("Błąd", `Nie udało się pobrać modelu: ${error.response.data.detail || error.message}`);
            } else {
                showAlertDialog("Błąd", `Nie udało się pobrać modelu: ${String(error)}`);
            }
        } finally {
            setWorkerDownloading(selectedWorkerId, false);
        }
    };

    const filteredAndSortedWorkerModels = useMemo(() => {
        const sorted = [...workerSpecificCachedModels].sort((a, b) => a.localeCompare(b));
        if (!modelFilterText) {
            return sorted;
        }
        return sorted.filter(model =>
            model.toLowerCase().includes(modelFilterText.toLowerCase())
        );
    }, [workerSpecificCachedModels, modelFilterText]);

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
                Zarządzanie pobranymi modelami na workerach
            </Typography>

            <Button
                variant="outlined"
                onClick={() => navigate('/')}
                sx={{ mb: 0 }}
            >
                Powrót
            </Button>

            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: { xs: '100%', sm: '80%', md: '70%', lg: '60%' },
                    mb: 3,
                    gap: 2,
                }}
            >
                <FormControl sx={{ minWidth: 120 }} size="small" disabled={fetchingWorkers}>
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
                                <MuiCircularProgress size={16} sx={{ mr: 1 }} /> Ładowanie
                            </MenuItem>
                        ) : workers.length === 0 ? (
                            <MenuItem value="" disabled>Brak dostępnych workerów</MenuItem>
                        ) : (
                            workers.map((worker) => (
                                <MenuItem key={worker.id} value={worker.id}>
                                    {worker.id}
                                </MenuItem>
                            ))
                        )}
                    </Select>
                </FormControl>

                <TextField
                    label="Nazwa modelu Hugging Face"
                    variant="standard"
                    fullWidth
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    sx={{
                        mr: 2,
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '4px',
                    }}
                    disabled={isThisWorkerDownloading || !selectedWorkerId || fetchingWorkers}
                />
                <Button
                    variant="outlined"
                    onClick={handleDownloadModel}
                    size="large"
                    disabled={isThisWorkerDownloading || !selectedWorkerId || inputText.trim() === '' || fetchingWorkers}
                >
                    {isThisWorkerDownloading ? <MuiCircularProgress size={24} /> : "Pobierz model"}
                </Button>
            </Box>

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
                    Modele pobrane na wybranym workerze:
                </Typography>
                <TextField
                    label="Filtruj modele"
                    variant="outlined"
                    fullWidth
                    value={modelFilterText}
                    onChange={(e) => setModelFilterText(e.target.value)}
                    sx={{ mb: 2 }}
                    size="small"
                    disabled={deletingModel}
                />

                {filteredAndSortedWorkerModels.length === 0 ? (
                    <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                        {selectedWorkerId ? "Brak modeli w pamięci na tym workerze lub brak dopasowania do filtra." : "Wybierz workera, aby wyświetlić modele."}
                    </Typography>
                ) : (
                    <List sx={{ width: '100%' }}>
                        {filteredAndSortedWorkerModels.map((modelName) => (
                            <ListItem
                                key={modelName}
                                secondaryAction={
                                    <IconButton
                                        edge="end"
                                        aria-label="delete"
                                        onClick={() => handleDeleteModel(modelName)}
                                        disabled={deletingModel || !selectedWorkerId}
                                    >
                                        {deletingModel && modelName === inputText ? <MuiCircularProgress size={24} /> : <DeleteIcon />}
                                    </IconButton>
                                }
                            >
                                <ListItemText primary={modelName} />
                            </ListItem>
                        ))}
                    </List>
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                    Załadowane modele na workerze: {workerSpecificLoadedModels.join(', ') || 'Brak'}
                </Typography>
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
        </Container>
    );
}

export default WorkersPage;