import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme/tokens.css';
import './styles.css';
import './theme/fleet.css';
import App from './App';
import { LoopDemo } from './loop/LoopDemo';
import './theme/readability.css';
// The unattended TV loop lives at /loop_demo; everything else is the demonstrator.
const loop = location.pathname.replace(/\/+$/, '') === '/loop_demo';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{loop ? <LoopDemo/> : <App/>}</React.StrictMode>);
