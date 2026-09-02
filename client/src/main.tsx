import { rpc } from './state/session.js';
import { render } from 'preact';
import { App } from './ui/app.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');

rpc.connect();
render(<App />, root);
