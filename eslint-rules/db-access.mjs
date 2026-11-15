// Architecture rule 1, enforced on the resolved path rather than on how it is spelt, so
// `@/db/./client`, `@/db//client`, `../../db/client` and `@/x/../db/client` are all the same file.
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');
const CLIENT = path.join(SRC, 'db', 'client');

export const DB_CLIENT_MESSAGE =
  'Only data-access modules (src/**/dal.ts, src/**/*-dal.ts, not under src/app), src/auth, src/db, src/audit and tests may use the database. Call a data-access function instead (architecture rule 1).';
export const DRIVER_MESSAGE =
  'Database drivers are used only in src/db (and src/test). Use getDb() from a data-access module (architecture rule 1).';

const DRIVER = /^(@neondatabase\/|@electric-sql\/pglite(\/|$)|drizzle-orm\/(neon-|pglite|node-postgres|postgres-js)|pg$|pg\/|postgres$|postgres\/)/;

/** True when the specifier, written in a file at `filename`, points at src/db/client (any extension or spelling). */
export function isDbClient(spec, filename) {
  let abs = null;
  if (spec.startsWith('@/')) abs = path.resolve(SRC, spec.slice(2));
  else if (spec.startsWith('.') || spec.startsWith('/')) abs = path.resolve(path.dirname(filename), spec);
  if (!abs) return false;
  const noExt = abs.replace(/\.(c|m)?[jt]sx?$/, '');
  return noExt === CLIENT || noExt === path.join(CLIENT, 'index');
}

/** True when the (normalised) bare specifier is a database driver. */
export function isDriver(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) return false;
  return DRIVER.test(path.posix.normalize(spec));
}

const literal = node => {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
};

/** Options: `{ allowClient: boolean }`. Drivers are always refused where this rule is on. */
const rule = {
  meta: { type: 'problem', schema: [{ type: 'object', properties: { allowClient: { type: 'boolean' } }, additionalProperties: false }] },
  create(context) {
    const allowClient = context.options[0]?.allowClient === true;
    const filename = context.filename;
    const check = (node, spec) => {
      if (spec === null) return;
      if (!allowClient && isDbClient(spec, filename)) context.report({ node, message: DB_CLIENT_MESSAGE });
      else if (isDriver(spec)) context.report({ node, message: DRIVER_MESSAGE });
    };
    return {
      ImportDeclaration: node => check(node, literal(node.source)),
      ExportNamedDeclaration: node => node.source && check(node, literal(node.source)),
      ExportAllDeclaration: node => check(node, literal(node.source)),
      ImportExpression: node => check(node, literal(node.source)),
      TSImportEqualsDeclaration: node =>
        node.moduleReference?.type === 'TSExternalModuleReference' && check(node, literal(node.moduleReference.expression)),
      CallExpression: node => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, literal(node.arguments[0]));
      },
    };
  },
};

const plugin = { rules: { 'db-access': rule } };

export default plugin;
