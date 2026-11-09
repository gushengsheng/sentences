import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// 不使用 StrictMode：引擎的 apply 会原地修改对局状态，
// StrictMode 的双重渲染/双重 effect 会导致 AI 动作被重复执行。
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
