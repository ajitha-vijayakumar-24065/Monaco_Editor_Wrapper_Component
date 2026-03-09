// ─────────────────────────────────────────────────────────────────────────────
// constants.js — Default options, action-ID map, severity map, toolbar config
// ─────────────────────────────────────────────────────────────────────────────

/** Monaco built-in command/action IDs used with editor.trigger() */
var ACTION_IDS = {
  undo:              'undo',
  redo:              'redo',
  cut:               'editor.action.clipboardCutAction',
  copy:              'editor.action.clipboardCopyAction',
  indent:            'editor.action.indentLines',
  outdent:           'editor.action.outdentLines',
  commentLine:       'editor.action.commentLine',
  blockComment:      'editor.action.blockComment',
  deleteLine:        'editor.action.deleteLines',
  duplicateLine:     'editor.action.copyLinesDownAction',
  find:              'actions.find',
  findReplace:       'editor.action.startFindReplaceAction',
  format:            'editor.action.formatDocument',
  formatSelection:   'editor.action.formatSelection',
  toggleWordWrap:    'editor.action.toggleWordWrap',
  selectAll:         'editor.action.selectAll',
  triggerSuggest:    'editor.action.triggerSuggest'
};

/**
 * Map friendly severity string → monaco.MarkerSeverity numeric value
 * (Monaco enums are only available after loading, so we store numbers directly)
 */
var SEVERITY_MAP = {
  hint:    1,
  info:    2,
  warning: 4,
  error:   8
};

/** Default wrapper options */
var DEFAULT_OPTIONS = {
  value:           '',
  language:        'javascript',
  theme:           'vs',
  fontSize:        14,
  fontFamily:      "Consolas, 'Courier New', monospace",
  lineNumbers:     'on',
  wordWrap:        'off',
  formatOnType:    false,
  formatOnLoad:    false,
  readOnly:        false,
  minimap:         true,
  matchBrackets:   'always',
  tabSize:         4,
  insertSpaces:    true,
  autoSuggestions: [],
  validationFn:    null,
  validationDelay: 300,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  toolbar: {
    show:          true,
    buttons:       null,   // null = use DEFAULT_TOOLBAR_BUTTONS
    customButtons: []
  },
  callbacks: {},
  icons:     {}
};

/**
 * Default toolbar button definitions.
 * Each entry: { id, label, title, keybindingLabel, visible }
 * Icons are embedded SVG strings — small 16×16 paths.
 */
var DEFAULT_TOOLBAR_BUTTONS = [
  {
    id: 'undo',
    label: 'Undo',
    title: 'Undo (Ctrl+Z)',
    keybindingLabel: 'Ctrl+Z',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>'
  },
  {
    id: 'redo',
    label: 'Redo',
    title: 'Redo (Ctrl+Y)',
    keybindingLabel: 'Ctrl+Y',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>'
  },
  {
    id: 'cut',
    label: 'Cut',
    title: 'Cut (Ctrl+X)',
    keybindingLabel: 'Ctrl+X',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="20" r="3"/><circle cx="18" cy="20" r="3"/><line x1="4.9" y1="17.1" x2="19.1" y2="6.9"/><line x1="4.9" y1="6.9" x2="12" y2="12"/></svg>'
  },
  {
    id: 'copy',
    label: 'Copy',
    title: 'Copy (Ctrl+C)',
    keybindingLabel: 'Ctrl+C',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
  },
  {
    id: 'indent',
    label: 'Indent',
    title: 'Indent (Tab)',
    keybindingLabel: 'Tab',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>'
  },
  {
    id: 'outdent',
    label: 'Outdent',
    title: 'Outdent (Shift+Tab)',
    keybindingLabel: 'Shift+Tab',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>'
  },
  {
    id: 'commentLine',
    label: 'Comment',
    title: 'Toggle Line Comment (Ctrl+/)',
    keybindingLabel: 'Ctrl+/',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="14" y2="15"/><line x1="3" y1="3" x2="3" y2="21"/></svg>'
  },
  {
    id: 'blockComment',
    label: 'Block Comment',
    title: 'Toggle Block Comment (Shift+Alt+A)',
    keybindingLabel: 'Shift+Alt+A',
    visible: false,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="11" y2="18"/></svg>'
  },
  {
    id: 'deleteLine',
    label: 'Delete Line',
    title: 'Delete Line (Ctrl+Shift+K)',
    keybindingLabel: 'Ctrl+Shift+K',
    visible: false,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
  },
  {
    id: 'duplicateLine',
    label: 'Duplicate',
    title: 'Duplicate Line (Shift+Alt+Down)',
    keybindingLabel: 'Shift+Alt+↓',
    visible: false,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
  },
  {
    id: 'find',
    label: 'Find',
    title: 'Find (Ctrl+F)',
    keybindingLabel: 'Ctrl+F',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  },
  {
    id: 'format',
    label: 'Format',
    title: 'Format Document (Shift+Alt+F)',
    keybindingLabel: 'Shift+Alt+F',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>'
  },
  {
    id: 'wordWrap',
    label: 'Word Wrap',
    title: 'Toggle Word Wrap (Alt+Z)',
    keybindingLabel: 'Alt+Z',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h15a3 3 0 0 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/></svg>'
  },
  {
    id: 'theme',
    label: 'Dark Mode',
    title: 'Toggle Dark/Light Theme',
    keybindingLabel: '',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  },
  {
    id: 'reset',
    label: 'Reset',
    title: 'Reset to Original Content',
    keybindingLabel: '',
    visible: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.14"/></svg>'
  }
];

/** Supported languages for the demo dropdown */
var SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'json', 'sql', 'python',
  'html', 'css', 'yaml', 'markdown', 'plaintext'
];

/** CompletionItemKind string → numeric mapping */
var COMPLETION_KIND_MAP = {
  method:        0,
  function:      1,
  constructor:   2,
  field:         3,
  variable:      4,
  class:         5,
  struct:        6,
  interface:     7,
  module:        8,
  property:      9,
  event:         10,
  operator:      11,
  unit:          12,
  value:         13,
  constant:      14,
  enum:          15,
  enumMember:    16,
  keyword:       17,
  text:          18,
  color:         19,
  file:          20,
  reference:     21,
  customcolor:   22,
  folder:        23,
  typeParameter: 24,
  snippet:       25
};
