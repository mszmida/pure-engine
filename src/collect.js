const AbstractSyntaxTree = require('@buxlabs/ast')
const { array } = require('@buxlabs/utils')
const {
  getIdentifier,
  getLiteral,
  getTemplateAssignmentExpression,
  getObjectMemberExpression,
  getForLoop,
  getForLoopVariable
} = require('./factory')
const { convertHtmlOrTextAttribute, convertText, getNodes } = require('./convert')
const { walk } = require('./parser')
const { SPECIAL_TAGS, SELF_CLOSING_TAGS } = require('./enum')

function getLoopIndex (variables) {
  return array.identifier(variables)
}

function getLoopGuard (variables) {
  return array.identifier(variables)
}

function collect (tree, fragment, variables) {
  if (fragment.used) return
  fragment.used = true
  const tag = fragment.tagName
  const attrs = fragment.attributes
  if (fragment.type === 'element' && !SPECIAL_TAGS.includes(tag)) {
    const nodes = getNodes(fragment, variables)
    nodes.forEach(node => tree.append(node))
    fragment.children.forEach(node => {
      collect(tree, node, variables)
    })
    if (!SELF_CLOSING_TAGS.includes(tag)) {
      const attr = fragment.attributes.find(attr => attr.key === 'tag' || attr.key === 'tag.bind')
      if (attr) {
        const property = attr.key === 'tag' ? attr.value.substring(1, attr.value.length - 1) : attr.value
        tree.append(getTemplateAssignmentExpression(getLiteral('</')))
        tree.append(getTemplateAssignmentExpression(getObjectMemberExpression(property)))
        tree.append(getTemplateAssignmentExpression(getLiteral('>')))
      } else {
        tree.append(getTemplateAssignmentExpression(getLiteral(`</${tag}>`)))
      }
    }
  } else if (fragment.type === 'text') {
    const nodes = convertText(fragment.content, variables)
    return nodes.forEach(node => tree.append(node))
  } else if (tag === 'if') {
    const ast = new AbstractSyntaxTree('')
    walk(fragment, current => {
      collect(ast, current, variables)
    })
    const { key } = attrs[0]
    const [prefix] = key.split('.')
    tree.append({
      type: 'IfStatement',
      test: variables.includes(prefix) ? getIdentifier(key) : getObjectMemberExpression(key),
      consequent: {
        type: 'BlockStatement',
        body: ast.ast.body
      }
    })
  } else if (tag === 'elseif') {
    let leaf = tree.ast.body[tree.ast.body.length - 1]
    if (leaf.type === 'IfStatement') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, current => {
        collect(ast, current, variables)
      })
      while (leaf.alternate && leaf.alternate.type === 'IfStatement') {
        leaf = leaf.alternate
      }
      const { key } = attrs[0]
      const [prefix] = key.split('.')
      leaf.alternate = {
        type: 'IfStatement',
        test: variables.includes(prefix) ? getIdentifier(key) : getObjectMemberExpression(key),
        consequent: {
          type: 'BlockStatement',
          body: ast.ast.body
        }
      }
    }
  } else if (tag === 'else') {
    let leaf = tree.ast.body[tree.ast.body.length - 1]
    if (leaf.type === 'IfStatement') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, current => {
        collect(ast, current, variables)
      })
      while (leaf.alternate && leaf.alternate.type === 'IfStatement') {
        leaf = leaf.alternate
      }
      leaf.alternate = {
        type: 'BlockStatement',
        body: ast.ast.body
      }
    }
  } else if (tag === 'each' || tag === 'for') {
    const ast = new AbstractSyntaxTree('')
    const [variable, , parent] = attrs.map(attr => attr.key)
    variables.push(variable)
    const index = getLoopIndex(variables.concat(parent))
    variables.push(index)
    const guard = getLoopGuard(variables.concat(parent))
    variables.push(guard)
    ast.append(getForLoopVariable(variable, parent, variables, index))
    walk(fragment, current => {
      collect(ast, current, variables)
    })
    tree.append(getForLoop(parent, ast.ast.body, variables, index, guard))
    variables.pop()
    variables.pop()
    variables.pop()
  } else if (tag === 'slot' && attrs && attrs.length > 0) {
    const leaf = convertHtmlOrTextAttribute(fragment, variables)
    if (leaf) {
      tree.append(getTemplateAssignmentExpression(leaf))
    }
  } else if (tag === 'try') {
    const ast = new AbstractSyntaxTree('')
    walk(fragment, current => {
      collect(ast, current, variables)
    })

    tree.append({
      type: 'TryStatement',
      block: {
        type: 'BlockStatement',
        body: ast.ast.body
      }
    })
  } else if (tag === 'catch') {
    const leaf = tree.ast.body[tree.ast.body.length - 1]
    if (leaf.type === 'TryStatement') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, current => {
        collect(ast, current, variables)
      })
      leaf.handler = {
        type: 'CatchClause',
        param: {
          type: 'Identifier',
          name: 'exception'
        },
        body: {
          type: 'BlockStatement',
          body: ast.ast.body
        }
      }
    }
  }
}

module.exports = collect
