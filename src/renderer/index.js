import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import App from './App';

// エントリポイント: ルート要素を取得して <App /> をマウント
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
