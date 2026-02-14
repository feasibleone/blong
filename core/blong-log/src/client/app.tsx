/**
 * Client entry point - mounts the LogViewer React component.
 */

import React from 'react';
import {createRoot} from 'react-dom/client';

import '@svar-ui/react-grid/all.css';

import {LogViewer} from './LogViewer.js';

const root = createRoot(document.getElementById('root')!);
root.render(<LogViewer />);
