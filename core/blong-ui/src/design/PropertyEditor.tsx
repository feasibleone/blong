/**
 * PropertyEditor — sidebar panel showing editable properties of the selected element.
 */
import {useDesignMode} from './useDesignMode.js';

export function PropertyEditor() {
    const {active, selected, config, updateConfig} = useDesignMode();
    if (!active || !selected) {
        return (
            <div className="blong-property-editor blong-property-editor--empty">
                <p className="blong-property-editor__hint">
                    Select an element to edit its properties
                </p>
            </div>
        );
    }

    if (selected.type === 'card') {
        const cardConfig = config.cards[selected.id] ?? {};
        return (
            <div className="blong-property-editor">
                <h3 className="blong-property-editor__title">Card: {selected.id}</h3>
                <div className="blong-property-editor__field">
                    <label htmlFor="card-label">Label</label>
                    <input
                        id="card-label"
                        type="text"
                        value={cardConfig.label ?? ''}
                        onChange={e =>
                            updateConfig({
                                cards: {
                                    ...config.cards,
                                    [selected.id]: {...cardConfig, label: e.target.value},
                                },
                            })
                        }
                    />
                </div>
                <div className="blong-property-editor__field">
                    <label>
                        <input
                            type="checkbox"
                            checked={cardConfig.collapsible ?? false}
                            onChange={e =>
                                updateConfig({
                                    cards: {
                                        ...config.cards,
                                        [selected.id]: {
                                            ...cardConfig,
                                            collapsible: e.target.checked,
                                        },
                                    },
                                })
                            }
                        />{' '}
                        Collapsible
                    </label>
                </div>
            </div>
        );
    }

    return (
        <div className="blong-property-editor">
            <h3 className="blong-property-editor__title">
                {selected.type} · {selected.id}
            </h3>
            <p className="blong-property-editor__hint">
                Property editing for this element type is coming soon.
            </p>
        </div>
    );
}
