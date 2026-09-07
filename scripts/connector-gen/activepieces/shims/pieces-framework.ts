// Stand-in for @activepieces/pieces-framework.
//
// Only the descriptor surface matters: `createAction` and friends return their
// argument unchanged so the extractor can read `name`, `displayName`,
// `description`, `aiMetadata`, and `props` straight off the module export, and
// each `Property.*` factory tags its options with the type the real framework
// would assign. Nothing here runs a flow.

type Options = Record<string, unknown>;

const tag = (type: string) => (options: Options = {}) => ({ ...options, type });

export const Property = {
  ShortText: tag("SHORT_TEXT"),
  LongText: tag("LONG_TEXT"),
  SecretText: tag("SECRET_TEXT"),
  Number: tag("NUMBER"),
  Checkbox: tag("CHECKBOX"),
  DateTime: tag("DATE_TIME"),
  Json: tag("JSON"),
  Object: tag("OBJECT"),
  Array: tag("ARRAY"),
  File: tag("FILE"),
  Color: tag("COLOR"),
  MarkDown: tag("MARKDOWN"),
  Dropdown: tag("DROPDOWN"),
  StaticDropdown: tag("STATIC_DROPDOWN"),
  MultiSelectDropdown: tag("MULTI_SELECT_DROPDOWN"),
  StaticMultiSelectDropdown: tag("STATIC_MULTI_SELECT_DROPDOWN"),
  DynamicProperties: tag("DYNAMIC"),
  Custom: tag("CUSTOM"),
};

export const PieceAuth = {
  SecretText: tag("SECRET_TEXT"),
  BasicAuth: tag("BASIC_AUTH"),
  CustomAuth: tag("CUSTOM_AUTH"),
  OAuth2: tag("OAUTH2"),
  None: () => undefined,
};

export function createAction<T>(descriptor: T): T {
  return descriptor;
}

export function createTrigger<T>(descriptor: T): T {
  return descriptor;
}

export function createPiece<T>(descriptor: T): T {
  return descriptor;
}

export const PieceCategory = new Proxy({}, { get: (_target, key) => String(key) });
export const TriggerStrategy = new Proxy({}, { get: (_target, key) => String(key) });
export const AuthenticationType = new Proxy({}, { get: (_target, key) => String(key) });
export const OAuth2PropertyValue = {};
export const PiecePropValueSchema = {};
export const StaticPropsValue = {};
