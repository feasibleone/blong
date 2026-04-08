import {FileUpload} from '../primereact/index.js';

import {useRef, useState} from 'react';
import type {IWidgetProps} from '../types/widget.js';

// PrimeReact 8 declares chooseOptions/uploadOptions/cancelOptions via defaultProps,
// which React 19 no longer merges — pass them explicitly to prevent crashes.
const FILE_UPLOAD_OPTIONS = {label: undefined, icon: undefined, iconOnly: false, className: undefined, style: undefined} as const;

export function ImageWidget({
    name: _name,
    schema,
    value,
    onChange,
    error: _error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const uploadRef = useRef<FileUpload>(null);
    const {maxSize = 2_000_000} = schema.widget ?? {};
    const [preview, setPreview] = useState<string | null>(typeof value === 'string' ? value : null);

    if (readOnly || disabled) {
        return preview ? (
            <img
                src={preview}
                alt=""
                className="blong-image-preview"
                style={{maxWidth: 240, maxHeight: 160}}
            />
        ) : null;
    }

    const handleUpload = (e: {files: File[]}) => {
        const file = e.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const dataUrl = ev.target?.result as string;
            setPreview(dataUrl);
            onChange(dataUrl);
        };
        reader.readAsDataURL(file);
        uploadRef.current?.clear();
    };

    return (
        <div className="blong-image-widget">
            {preview && (
                <img
                    src={preview}
                    alt=""
                    className="blong-image-preview"
                    style={{maxWidth: 240, maxHeight: 160, display: 'block', marginBottom: 8}}
                />
            )}
            <FileUpload
                ref={uploadRef}
                mode="basic"
                accept="image/*"
                maxFileSize={maxSize}
                customUpload
                uploadHandler={handleUpload}
                className="blong-image"
                auto
                chooseLabel="Upload image"
                chooseOptions={FILE_UPLOAD_OPTIONS}
                uploadOptions={FILE_UPLOAD_OPTIONS}
                cancelOptions={FILE_UPLOAD_OPTIONS}
            />
        </div>
    );
}
