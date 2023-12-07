export interface ParseOptions {
    filename?: string;
    startRule?: "start";
    tracer?: any;
    [key: string]: any;
}
export type ParseFunction = <Options extends ParseOptions>(
    input: string,
    options?: Options,
) => Options extends { startRule: infer StartRule }
    ? StartRule extends "start"
        ? Top
        : Top
    : Top;

// These types were autogenerated by ts-pegjs
export type Top = (Macro | FunctionMacro | Text)[];
export type Ident = string;
export type ScopedIdent = string;
export type PathPart = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "pathPart"; name: Ident; index: PropIndex[] };
export type ScopedPathPart = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "pathPart"; name: ScopedIdent; index: PropIndex[] };
export type EmptyPathPart = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "pathPart"; name: ""; index: [] };
export type FullPath =
  | [EmptyPathPart, ...ScopedPathPartOrDD[]]
  | [ScopedPathPartOrDD, ...ScopedPathPartOrDD[]];
export type ScopedPathPartOrDD =
  | ScopedPathPart
  | ({
      position: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    } & { type: "pathPart"; name: ".."; index: [] });
export type PropAccess = PartialPathMacro;
export type ScopedPropAccess = ScopedPartialPathMacro;
export type Macro = FullPathMacro | PartialPathMacro;
export type PartialPathMacro = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & {
  type: "macro";
  version: "0.6";
  path: [PathPart];
  attributes: never[] | NonNullable<PropAttrs | null>;
  accessedProp: PropAccess | null;
};
export type ScopedPartialPathMacro = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & {
  type: "macro";
  version: "0.6";
  path: [ScopedPathPart];
  attributes: never[] | NonNullable<PropAttrs | null>;
  accessedProp: ScopedPropAccess | null;
};
export type FullPathMacro = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & {
  type: "macro";
  version: "0.6";
  path: FullPath;
  attributes: never[] | NonNullable<PropAttrs | null>;
  accessedProp: ScopedPropAccess | null;
};
export type FunctionMacro =
  | ({
      position: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    } & { type: "function"; version: "0.6"; macro: FullPathMacro; input: FunctionInput | null })
  | ({
      position: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    } & {
      type: "function";
      macro: PartialPathMacro;
      version: "0.6";
      input: FunctionInput | null;
    });
export type FunctionInput = FunctionArgumentList;
export type FunctionArgumentList = [
  BalancedParenTextNoComma,
  ...BalancedParenTextNoComma[]
];
export type BalancedParenTextNoComma = (Macro | FunctionMacro | Text)[];
export type BalancedParenText = (Macro | FunctionMacro | Text)[];
export type PropAttrs = Record<string, Attr>;
export type PropIndex = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "index"; value: (FunctionMacro | Macro | TextWithoutClosingSquareBrace)[] };
export type Attr =
  | ({
      position: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    } & { type: "attribute"; name: AttrName; children: AttrValue })
  | ({
      position: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    } & { type: "attribute"; name: AttrName; children: [] });
export type AttrName = string;
export type AttrValue =
  | (Macro | FunctionMacro | TextWithoutDoubleQuote)[]
  | (Macro | FunctionMacro | TextWithoutQuote)[];
export type Text = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type EmptyString = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: "" };
export type OpenParen = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: "(" };
export type CloseParen = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: ")" };
export type TextWithoutParenOrComma = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type TextWithoutParen = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type TextWithoutQuote = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type TextWithoutClosingSquareBrace = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type TextWithoutDoubleQuote = {
  position: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
} & { type: "text"; value: string };
export type _ = string;
export type EOF = undefined;