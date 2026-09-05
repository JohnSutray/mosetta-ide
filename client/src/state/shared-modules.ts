import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import * as jsxRuntime from 'preact/jsx-runtime';
import * as signals from '@preact/signals';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmCommands from '@codemirror/commands';
import * as cmLanguage from '@codemirror/language';
import * as cmSearch from '@codemirror/search';
import * as windows from '@ide/windows';
import * as code from '@ide/code';

export const sharedModules: Record<string, unknown> = {
  preact,
  'preact/hooks': hooks,
  'preact/jsx-runtime': jsxRuntime,
  '@preact/signals': signals,
  '@codemirror/state': cmState,
  '@codemirror/view': cmView,
  '@codemirror/commands': cmCommands,
  '@codemirror/language': cmLanguage,
  '@codemirror/search': cmSearch,
  '@ide/windows': windows,
  '@ide/code': code,
};
