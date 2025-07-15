import React from 'react';
import {
    Button,
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';

interface FileUploaderProps {
    accept?: string;
    multiple?: boolean;
    onFileChange: (files: File[] | File | null) => void;
    label: string;
    loading: boolean;
}

const FileUploader = ({
                          accept,
                          multiple = false,
                          onFileChange,
                          label,
                          loading,
                      }: FileUploaderProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        const filesArray = Array.from(selectedFiles);

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
        <Button
            variant="outlined"
            component="label"
            color="secondary"
            startIcon={<CloudUpload />}
            size="medium"
            disabled={loading}
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
    );
};

export default FileUploader;