import { Core } from './core.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('no #root');

new Core(root, { page: true }).start();
