import {FileUpload, Image} from '../primereact/index.js';


import type {IWidgetProps} from '../types/widget.js';

// PrimeReact 8 declares chooseOptions via defaultProps which React 19 no longer merges.
const FILE_UPLOAD_OPTIONS = {label: undefined, icon: undefined, iconOnly: false, className: undefined, style: undefined} as const;

/**
 * ImageUploadWidget — advanced FileUpload with image preview.
 * `value` can be a string URL or an array of File objects `[{objectURL: string}]`.
 */
export function ImageUploadWidget({
    name: _name,
    schema,
    value,
    onChange,
    readOnly,
    disabled,
}: IWidgetProps) {
    const {maxSize = 2_000_000, basePath = ''} = schema.widget ?? {};

    let src: string | null = null;
    if (Array.isArray(value)) {
        src = (value[0] as {objectURL?: string})?.objectURL ?? null;
    } else if (value) {
        src = basePath + String(value);
    }

    const imagePreview = src ? (
        <Image imageClassName="w-full" preview src={src} />
    ) : (
        <div>No picture...</div>
    );

    if (readOnly || disabled) {
        return src ? <Image imageClassName="w-full" preview src={src} /> : null;
    }

    return (
        <FileUpload
            accept="image/*"
            multiple={false}
            maxFileSize={maxSize}
            onSelect={e => onChange([...e.files])}
            chooseOptions={FILE_UPLOAD_OPTIONS}
            uploadOptions={FILE_UPLOAD_OPTIONS}
            cancelOptions={FILE_UPLOAD_OPTIONS}
            headerTemplate={options => {
                const {className, chooseButton} = options;
                return <div className={className}>{chooseButton}</div>;
            }}
            itemTemplate={() => imagePreview}
            emptyTemplate={() => imagePreview}
            className="blong-image-upload"
        />
    );
}
