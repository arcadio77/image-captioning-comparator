import React from 'react';
import {
    Box,
    Button,
    Grid,
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';

interface FileUploaderProps {
    accept?: string;
    multiple?: boolean;
    onFileChange: (files: File[] | File | null) => void;
    label: string;
    existingFile?: string;
}

const FileUploader = ({
                          accept,
                          multiple = false,
                          onFileChange,
                          label,
                          existingFile
                      }: FileUploaderProps) => {
    const [files, setFiles] = React.useState<File[] | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        const filesArray = Array.from(selectedFiles);
        setFiles(filesArray);

        if (multiple) {
            onFileChange(filesArray);
        } else {
            onFileChange(filesArray[0]);
        }

        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return (
        <Box border={1} borderColor="divider" borderRadius={1} p={2}>
            <Grid container alignItems="center" spacing={2} {...({ component: "div" } as any)}>
                <Grid item xs={12} sm={files || existingFile ? 8 : 12} {...({ component: "div" } as any)}>
                    <Button
                        variant="outlined"
                        component="label"
                        color="secondary"
                        startIcon={<CloudUpload />}
                        fullWidth
                    >
                        {label}
                        <input
                            type="file"
                            hidden
                            ref={inputRef}
                            accept={accept}
                            multiple={multiple}
                            onChange={handleFileChange}
                        />
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
};

export default FileUploader;