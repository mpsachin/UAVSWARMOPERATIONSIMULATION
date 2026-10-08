import React from 'react';
import { createRoot } from 'react-dom/client';
import UavSimulation from '../UavSwarmSimulationOperations';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UavSimulation />
  </React.StrictMode>,
);