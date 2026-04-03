/**
 * ComponentPalette — sidebar listing available widgets and cards to drag in.
 */
import type {WidgetType} from '../types/widget.js';
import {useDesignMode} from './useDesignMode.js';

const WIDGET_TYPES: Array<{type: WidgetType; icon: string; label: string}> = [
    {type: 'input', icon: 'pi-pencil', label: 'Text Input'},
    {type: 'textArea', icon: 'pi-align-left', label: 'Textarea'},
    {type: 'number', icon: 'pi-hashtag', label: 'Number'},
    {type: 'boolean', icon: 'pi-check-square', label: 'Boolean'},
    {type: 'date', icon: 'pi-calendar', label: 'Date'},
    {type: 'dropdown', icon: 'pi-chevron-down', label: 'Dropdown'},
    {type: 'multiSelect', icon: 'pi-list', label: 'Multi Select'},
    {type: 'table', icon: 'pi-table', label: 'Table'},
    {type: 'file', icon: 'pi-upload', label: 'File Upload'},
    {type: 'image', icon: 'pi-image', label: 'Image'},
    {type: 'code', icon: 'pi-code', label: 'Code'},
];

export function ComponentPalette() {
    const {active} = useDesignMode();
    if (!active) return null;

    return (
        <div className="blong-component-palette">
            <section className="blong-component-palette__section">
                <h4 className="blong-component-palette__heading">Widgets</h4>
                <ul className="blong-component-palette__list">
                    {WIDGET_TYPES.map(({type, icon, label}) => (
                        <li
                            key={type}
                            className="blong-component-palette__item"
                            draggable
                            data-widget-type={type}
                        >
                            <i className={`pi ${icon}`} />
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>
            </section>
            <section className="blong-component-palette__section">
                <h4 className="blong-component-palette__heading">Layout</h4>
                <ul className="blong-component-palette__list">
                    <li
                        className="blong-component-palette__item"
                        draggable
                        data-element-type="card"
                    >
                        <i className="pi pi-stop" />
                        <span>New Card</span>
                    </li>
                </ul>
            </section>
        </div>
    );
}
