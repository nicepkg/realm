import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@earendil-works/pi-tui";

export function editorTheme(): EditorTheme {
  return {
    borderColor: identityStyle,
    selectList: selectTheme(),
  };
}

export function selectTheme(): SelectListTheme {
  return {
    description: identityStyle,
    noMatch: identityStyle,
    scrollInfo: identityStyle,
    selectedPrefix: identityStyle,
    selectedText: identityStyle,
  };
}

export function settingsTheme(): SettingsListTheme {
  return {
    cursor: "-> ",
    description: identityStyle,
    hint: identityStyle,
    label: (text) => text,
    value: (text) => text,
  };
}

export function markdownTheme(): MarkdownTheme {
  return {
    bold: identityStyle,
    code: identityStyle,
    codeBlock: identityStyle,
    codeBlockBorder: identityStyle,
    heading: identityStyle,
    hr: identityStyle,
    italic: identityStyle,
    link: identityStyle,
    linkUrl: identityStyle,
    listBullet: identityStyle,
    quote: identityStyle,
    quoteBorder: identityStyle,
    strikethrough: identityStyle,
    underline: identityStyle,
  };
}

function identityStyle(text: string): string {
  return text;
}
