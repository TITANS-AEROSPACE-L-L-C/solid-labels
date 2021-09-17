import { PluginObj } from '@babel/core';
import { addNamed } from '@babel/helper-module-imports';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

function getHookIdentifier(
  hooks: Map<string, t.Identifier>,
  path: NodePath,
  name: string,
): t.Identifier {
  const current = hooks.get(name);
  if (current) {
    return current;
  }
  const newID = addNamed(path, name, 'solid-js');
  hooks.set(name, newID);
  return newID;
}

function signalExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  if (!t.isExpressionStatement(body)) {
    throw new Error('Expected expression statement');
  }
  if (!t.isAssignmentExpression(body.expression)) {
    throw new Error('Expected assignment expression');
  }
  if (body.expression.operator !== '=') {
    throw new Error('Invalid assignment expression operator');
  }
  const signalIdentifier = body.expression.left;
  const stateIdentifier = body.expression.right;
  if (!t.isIdentifier(signalIdentifier)) {
    throw new Error('Expected identifier');
  }
  const readIdentifier = path.scope.generateUidIdentifier(signalIdentifier.name);
  const writeIdentifier = path.scope.generateUidIdentifier(`set${signalIdentifier.name}`);
  const expr = t.variableDeclaration(
    'const',
    [t.variableDeclarator(
      t.arrayPattern([
        readIdentifier,
        writeIdentifier,
      ]),
      t.callExpression(
        getHookIdentifier(hooks, path, 'createSignal'),
        [stateIdentifier],
      ),
    )],
  );

  path.replaceWith(expr);

  const parent = path.getFunctionParent();
  if (parent) {
    parent.traverse({
      ObjectProperty(p) {
        if (
          !p.scope.hasOwnBinding(signalIdentifier.name)
          && p.node.shorthand
          && t.isIdentifier(p.node.key)
          && p.node.key.name === signalIdentifier.name
          && t.isIdentifier(p.node.value)
          && p.node.value.name === signalIdentifier.name
        ) {
          p.insertAfter(
            t.objectMethod(
              'get',
              signalIdentifier,
              [],
              t.blockStatement([
                t.returnStatement(
                  t.callExpression(
                    readIdentifier,
                    [],
                  ),
                ),
              ]),
            ),
          );
          const param = p.scope.generateUidIdentifier('value');
          p.insertAfter(
            t.objectMethod(
              'set',
              signalIdentifier,
              [param],
              t.blockStatement([
                t.expressionStatement(
                  t.callExpression(
                    writeIdentifier,
                    [
                      t.arrowFunctionExpression(
                        [],
                        param,
                      ),
                    ],
                  ),
                ),
              ]),
            ),
          );
          p.remove();
        }
      },
      Identifier(p) {
        if (p.node.name !== signalIdentifier.name) {
          return;
        }
        // { x }
        if (t.isObjectMethod(p.parent) && p.parent.key === p.node) {
          return;
        }
        if (t.isObjectProperty(p.parent) && p.parent.key === p.node) {
          return;
        }
        // const x
        if (t.isVariableDeclarator(p.parent) && p.parent.id === p.node) {
          return;
        }
        // const [x]
        if (t.isArrayPattern(p.parent) && p.parent.elements.includes(p.node)) {
          return;
        }
        // (x) => {}
        if (t.isArrowFunctionExpression(p.parent) && p.parent.params.includes(p.node)) {
          return;
        }
        // x:
        if (t.isLabeledStatement(p.parent) && p.parent.label === p.node) {
          return;
        }
        // obj.x
        if (t.isMemberExpression(p.parent) && p.parent.property === p.node) {
          return;
        }
        if (
          !p.scope.hasOwnBinding(signalIdentifier.name)
        ) {
          p.replaceWith(
            t.callExpression(
              readIdentifier,
              [],
            ),
          );
        }
      },
      AssignmentExpression(p) {
        const identifier = p.node.left;
        const expression = p.node.right;
        if (
          t.isIdentifier(identifier)
          && !p.scope.hasOwnBinding(signalIdentifier.name)
          && identifier.name === signalIdentifier.name
        ) {
          const param = p.scope.generateUidIdentifier('current');
          p.replaceWith(
            t.callExpression(
              writeIdentifier,
              [
                t.arrowFunctionExpression(
                  [param],
                  t.assignmentExpression(
                    p.node.operator,
                    param,
                    expression,
                  ),
                ),
              ],
            ),
          );
        }
      },
    });
  }
}

function memoExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  if (!t.isExpressionStatement(body)) {
    throw new Error('Expected expression statement');
  }
  if (!t.isAssignmentExpression(body.expression)) {
    throw new Error('Expected assignment expression');
  }
  if (body.expression.operator !== '=') {
    throw new Error('Invalid assignment expression operator');
  }
  const memoIdentifier = body.expression.left;
  const stateIdentifier = body.expression.right;
  if (!t.isIdentifier(memoIdentifier)) {
    throw new Error('Expected identifier');
  }
  const readIdentifier = path.scope.generateUidIdentifier(memoIdentifier.name);
  const expr = t.variableDeclaration(
    'const',
    [t.variableDeclarator(
      readIdentifier,
      t.callExpression(
        getHookIdentifier(hooks, path, 'createMemo'),
        [
          t.arrowFunctionExpression(
            [],
            stateIdentifier,
          ),
        ],
      ),
    )],
  );

  path.replaceWith(expr);

  const parent = path.getFunctionParent();
  if (parent) {
    parent.traverse({
      ObjectProperty(p) {
        if (
          !p.scope.hasOwnBinding(memoIdentifier.name)
          && p.node.shorthand
          && t.isIdentifier(p.node.key)
          && p.node.key.name === memoIdentifier.name
          && t.isIdentifier(p.node.value)
          && p.node.value.name === memoIdentifier.name
        ) {
          p.insertAfter(
            t.objectMethod(
              'get',
              memoIdentifier,
              [],
              t.blockStatement([
                t.returnStatement(
                  t.callExpression(
                    readIdentifier,
                    [],
                  ),
                ),
              ]),
            ),
          );
          p.remove();
        }
      },
      Identifier(p) {
        if (p.node.name !== memoIdentifier.name) {
          return;
        }
        // { x }
        if (t.isObjectMethod(p.parent) && p.parent.key === p.node) {
          return;
        }
        if (t.isObjectProperty(p.parent) && p.parent.key === p.node) {
          return;
        }
        // const x
        if (t.isVariableDeclarator(p.parent) && p.parent.id === p.node) {
          return;
        }
        // const [x]
        if (t.isArrayPattern(p.parent) && p.parent.elements.includes(p.node)) {
          return;
        }
        // (x) => {}
        if (t.isArrowFunctionExpression(p.parent) && p.parent.params.includes(p.node)) {
          return;
        }
        // x:
        if (t.isLabeledStatement(p.parent) && p.parent.label === p.node) {
          return;
        }
        // obj.x
        if (t.isMemberExpression(p.parent) && p.parent.property === p.node) {
          return;
        }
        if (
          !p.scope.hasOwnBinding(memoIdentifier.name)
        ) {
          p.replaceWith(
            t.callExpression(
              readIdentifier,
              [],
            ),
          );
        }
      },
    });
  }
}

function effectExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'createEffect'),
      [
        callback,
      ],
    ),
  );
}

function computedExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'createComputed'),
      [
        callback,
      ],
    ),
  );
}

function renderEffectExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'createRenderEffect'),
      [
        callback,
      ],
    ),
  );
}

function mountExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'onMount'),
      [
        callback,
      ],
    ),
  );
}

function cleanupExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'onCleanup'),
      [
        callback,
      ],
    ),
  );
}

function errorExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'onError'),
      [
        callback,
      ],
    ),
  );
}

function rootExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'createRoot'),
      [
        callback,
      ],
    ),
  );
}

function untrackExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'untrack'),
      [
        callback,
      ],
    ),
  );
}

function batchExpression(
  hooks: Map<string, t.Identifier>,
  path: NodePath<t.LabeledStatement>,
  body: t.Statement,
): void {
  let callback: t.ArrowFunctionExpression;
  if (t.isBlockStatement(body)) {
    callback = t.arrowFunctionExpression(
      [],
      body,
    );
  } else if (t.isExpressionStatement(body) && t.isArrowFunctionExpression(body.expression)) {
    callback = body.expression;
  } else {
    throw new Error('Expected arrow function or block expression');
  }
  path.replaceWith(
    t.callExpression(
      getHookIdentifier(hooks, path, 'batch'),
      [
        callback,
      ],
    ),
  );
}

interface State {
  hooks: Map<string, t.Identifier>;
}

export default function solidReactivityPlugin(): PluginObj<State> {
  return {
    pre() {
      this.hooks = new Map();
    },
    visitor: {
      LabeledStatement(path, state) {
        const { label, body } = path.node;

        switch (label.name) {
          case 'signal':
            signalExpression(state.hooks, path, body);
            break;
          case 'effect':
            effectExpression(state.hooks, path, body);
            break;
          case 'computed':
            computedExpression(state.hooks, path, body);
            break;
          case 'renderEffect':
            renderEffectExpression(state.hooks, path, body);
            break;
          case 'memo':
            memoExpression(state.hooks, path, body);
            break;
          case 'mount':
            mountExpression(state.hooks, path, body);
            break;
          case 'cleanup':
            cleanupExpression(state.hooks, path, body);
            break;
          case 'error':
            errorExpression(state.hooks, path, body);
            break;
          case 'untrack':
            untrackExpression(state.hooks, path, body);
            break;
          case 'batch':
            batchExpression(state.hooks, path, body);
            break;
          case 'root':
            rootExpression(state.hooks, path, body);
            break;
          default:
            break;
        }
      },
    },
  };
}
