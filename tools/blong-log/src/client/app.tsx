/**
 * Client entry point - mounts the LogViewer React component.
 */

import React from 'react';
import {createRoot} from 'react-dom/client';

import {LogViewer} from './LogViewer.tsx';

const root = createRoot(document.getElementById('root')!);
root.render(<LogViewer />);
