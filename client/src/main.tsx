import { rpc } from './state/session.js';
import { render } from 'preact';
import { installHost } from '@ide/windows';
import { App } from './ui/app.js';
import { i18n } from './i18n/index.js';
import { keep, recall } from './state/persist.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('нет #root');

installHost({
  t: (key, params) => i18n.t(key, params),
  catchesKeys: () => false,
  keep: (key, value) => keep(key, value),
  recall: (key, fallback) => recall(key, fallback),
});

rpc.connect();
render(<App />, root);
