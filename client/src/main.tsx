import { render } from 'preact';
import { App } from './ui/app.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');
render(<App />, root);
