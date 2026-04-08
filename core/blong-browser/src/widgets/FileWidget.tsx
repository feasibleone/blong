import {FileUpload} from '../primereact/index.js';

import {useRef} from 'react';
import type {IWidgetProps} from '../types/widget.js';

// PrimeReact 8 declares chooseOptions/uploadOptions/cancelOptions via defaultProps,
// which React 19 no longer merges — pass them explicitly to prevent crashes.
const FILE_UPLOAD_OPTIONS = {label: undefined, icon: undefined, iconOnly: false, className: undefined, style: undefined} as const;

export function FileWidget({
    name: _name,
    schema,
    onChange,
    error: _error,
    readOnly,
    disabled,
}: IWidgetProps) {
    const uploadRef = useRef<FileUpload>(null);
    const {accept, maxSize = 5_000_000} = schema.widget ?? {};

    if (readOnly || disabled) return null;

    return (
        <FileUpload
            ref={uploadRef}
            mode="basic"
            accept={accept ?? '*'}
            maxFileSize={maxSize}
            customUpload
            uploadHandler={e => {
                onChange(e.files[0] ?? null);
                uploadRef.current?.clear();
            }}
            className="blong-file"
            auto
            chooseLabel="Choose"
            chooseOptions={FILE_UPLOAD_OPTIONS}
            uploadOptions={FILE_UPLOAD_OPTIONS}
            cancelOptions={FILE_UPLOAD_OPTIONS}
        />
    );
}
