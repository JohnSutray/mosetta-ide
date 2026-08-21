import { render } from 'preact';
import { rpc } from './state/session.js';
import { App } from './ui/app.js';
import '@xterm/xterm/css/xterm.css';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');

rpc.connect();
render(<App />, root);
