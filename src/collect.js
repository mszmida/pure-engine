const AbstractSyntaxTree = require('abstract-syntax-tree')
const { array } = require('pure-utilities')
const {
  getIdentifier,
  getLiteral,
  getTemplateAssignmentExpression,
  getObjectMemberExpression,
  getForLoop,
  getForLoopVariable,
  getForInLoop,
  getForInLoopVariable,
  getTemplateVariableDeclaration
} = require('./factory')
const {
  convertText,
  convertTag,
  convertAttribute,
  convertToExpression,
  convertKey
} = require('./convert')
const { parseYAML, parseJSON, parseJS } = require('./translations')
const walk = require('himalaya-walk')
const { SPECIAL_TAGS, SELF_CLOSING_TAGS, OPERATORS, OBJECT_VARIABLE, TEMPLATE_VARIABLE } = require('./enum')
const { getAction } = require('./action')
const { readFileSync, existsSync } = require('fs')
const { join, dirname } = require('path')
const parse = require('./parse')
const size = require('image-size')
const { normalize } = require('./array')
const { clone } = require('./object')
const { placeholderName, addPlaceholders } = require('./keywords')
let asyncCounter = 0

const digits = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10]
])

function getFreeIdentifier (variables) {
  return array.identifier(variables)
}

function findActions (attributes) {
  return attributes
    .filter(attr => attr.type === 'Action')
    .map((attr, index, array) => {
      if (attr.key === 'is_between') array.splice([index + 1], 1)
      return getAction(attr.key)
    }).filter(Boolean)
}

function findFile (path, options, callback) {
  if (!options.paths) { throw new Error('Compiler option is undefined: paths.') }
  let found = false
  for (let i = 0, ilen = options.paths.length; i < ilen; i += 1) {
    const location = join(options.paths[i], path)
    if (!existsSync(location)) continue
    callback(location)
    found = true
    break
  }
  if (!found) { throw new Error(`Asset not found: ${path}.`) }
}

function setDimension (fragment, attrs, keys, statistics, dimension, options) {
  if (keys.includes(dimension)) {
    const attr = attrs.find(attr => attr.key === dimension)
    if (attr.value === 'auto') {
      const { value: path } = attrs.find(attr => attr.key === 'src')
      findFile(path, options, location => {
        const dimensions = size(location)
        statistics.images.push({ path: location })
        fragment.attributes = fragment.attributes.map(attr => {
          if (attr.key === dimension) {
            attr.value = dimensions[dimension].toString()
          }
          return attr
        })
      })
    }
  }
}

function collectComponentsFromImport (fragment, statistics, components, component, options) {
  const attrs = fragment.attributes
  const name = attrs[0].key
  const path = attrs[1].value
  let paths = []
  if (options.paths) {
    paths = paths.concat(options.paths)
  } else {
    throw new Error('Compiler option is undefined: paths.')
  }
  if (component) {
    paths = paths.concat(dirname(component.path))
  }
  if (components) {
    paths = paths.concat(components.map(component => dirname(component.path)))
  }
  findFile(path, { paths }, location => {
    const content = readFileSync(location, 'utf8')
    components.push({ name, content, path: location })
    statistics.components.push({ name, content, path: location })
  })
}

function collectComponentsFromPartialOrRender (fragment, statistics, options) {
  const path = fragment.attributes[0].value
  findFile(path, options, location => {
    const content = readFileSync(location, 'utf8')
    statistics.partials.push({ path: location })
    fragment.children = parse(content)
  })
}

function collectComponentsFromPartialAttribute (fragment, statistics, options) {
  const attr = fragment.attributes.find(attr => attr.key === 'partial')
  if (attr) {
    const path = attr.value
    findFile(path, options, location => {
      const content = readFileSync(location, 'utf8')
      statistics.partials.push({ path: location })
      fragment.attributes = fragment.attributes.filter(attr => attr.key !== 'partial')
      fragment.children = parse(content)
    })
  }
}

function convertValueToNode (value, variables) {
  if (value.includes('{') && value.includes('}')) {
    value = value.replace(/{|}/g, '')
    const expression = convertToExpression(value)
    if (expression.type === 'Identifier') {
      return convertKey(value, variables)
    } else if (expression.type === 'Literal') {
      return getLiteral(expression.value)
    } else if (expression.type === 'BinaryExpression') {
      AbstractSyntaxTree.replace(expression, (node, parent) => {
        if (node.type === 'MemberExpression') {
          if (node.object.type === 'Identifier' && !node.object.transformed) {
            node.object.transformed = true
            const object = getIdentifier(OBJECT_VARIABLE)
            object.transformed = true
            node.object = {
              type: 'MemberExpression',
              object,
              property: node.object
            }
          }
        }
        return node
      })
      return expression
    }
  }
  return getLiteral(value)
}

function resolveComponent (component, fragment, components, statistics, options) {
  const localVariables = fragment.attributes
  let content = component.content
  localVariables.forEach(variable => {
    // is this the best way to ensure that a value is not an expresion?
    if (!variable.value.includes('{') && !variable.value.includes('}')) {
      content = content.replace(new RegExp(`{${variable.key}}`, 'g'), variable.value)
    }
  })
  const htmlTree = parse(content)
  let children = fragment.children
  walk(htmlTree, leaf => {
    leaf.imported = true
    if (leaf.tagName === component.name) {
      leaf.root = true
    }
    if (leaf.attributes) {
      // TODO optimize
      // check attributes and inline values
      // the code could be analyzed and simplified afterwards
      // to simplify some of the conditions
      // e.g. as a result you can get expressions like "hello" || ""
      leaf.attributes.forEach(attr => {
        const { value } = attr
        if (
          value &&
          value.startsWith('{') &&
          value.endsWith('}') &&
          // TODO reuse
          // add occurances method to pure-utilities
          (value.match(/{/g) || []).length === 1 &&
          (value.match(/}/g) || []).length === 1
        ) {
          let source = value.substr(1, value.length - 2)
          source = addPlaceholders(source)
          const ast = new AbstractSyntaxTree(source)
          let replaced = false
          ast.replace({
            enter: node => {
              // TODO investigate
              // this is too optimistic
              // should avoid member expressions etc.
              if (node.type === 'Identifier') {
                const variable = localVariables.find(variable => variable.key === node.name || variable.key === placeholderName(node.name))
                if (variable) {
                  replaced = true
                  return { type: 'Literal', value: variable.value }
                }
              }
              return node
            }
          })
          if (replaced) {
            attr.value = '{' + ast.toString().replace(/;$/, '') + '}'
          }
        }
      })
    }
  })

  const currentComponents = []
  let slots = 0
  walk(htmlTree, async (current, parent) => {
    if (current.tagName === 'import' || current.tagName === 'require') {
      collectComponentsFromImport(current, statistics, currentComponents, component, options)
    } else if (current.tagName === 'partial' || current.tagName === 'render') {
      collectComponentsFromPartialOrRender(current, statistics, options)
    } else if (current.attributes && current.attributes[0] && current.attributes[0].key === 'partial') {
      collectComponentsFromPartialAttribute(current, statistics, options)
    }
    const currentComponent = currentComponents.find(component => component.name === current.tagName)
    if (currentComponent && !current.root) {
      resolveComponent(currentComponent, current, components, statistics, options)
      current.used = true
    }
    if ((current.tagName === 'slot' || current.tagName === 'yield') && current.children.length === 0) {
      if (current.attributes.length === 0) {
        // putting a slot into a slot is problematic
        if (children.length === 1 && children[0].tagName === 'slot') {
          children = children[0].children
        }
        if (slots === 0) {
          current.children = children
        } else {
          current.children = clone(children)
        }
        slots += 1
      } else {
        const name = current.attributes[0].key
        walk(children, leaf => {
          if ((leaf.tagName === 'slot' || leaf.tagName === 'yield') && leaf.attributes.length > 0 && leaf.attributes[0].key === name) {
            // the following might not be super performant in case of components with multiple slots
            // we could do this only if a slot with given name is not unique (e.g. in if / else statements)
            if (slots > 2) {
              current.children = clone(leaf.children)
            } else {
              current.children = leaf.children
            }
            slots += 1
          }
        })
      }
    }
  })
  fragment.children = htmlTree
  // component usage, e.g. <list></list>
  // can be imported in the top component as well
  // which would result in unnecessary evaluation
  // we need to ignore it
  // but we can't ignore children nodes
  // can we do it better than marking the node as a slot?
  fragment.tagName = 'slot'
  return { fragment, localVariables }
}

function appendIfStatement (node, tree, ast, depth) {
  tree.append({
    type: 'IfStatement',
    test: node,
    consequent: {
      type: 'BlockStatement',
      body: ast.body()
    },
    depth
  })
}

function getTest (action, keys, values, variables) {
  if (action.args === 1) {
    const key = keys[0] === 'not' ? keys[1] : keys[0]
    const node = getLiteralOrIdentifier(key, variables)
    return action.handler(node)
  } else if (action.args === 2) {
    let left = getLiteralOrIdentifier(keys[0], variables)
    let right = values[1] ? convertValueToNode(values[1], variables) : getLiteralOrIdentifier(keys[2], variables)
    return action.handler(left, right)
  } else if (action.args === 3) {
    const node = getLiteralOrIdentifier(keys[0], variables)
    const startRange = getLiteralOrIdentifier(keys[2], variables)
    const endRange = getLiteralOrIdentifier(keys[4], variables)
    return action.handler(node, startRange, endRange)
  }
}

function getLeftNodeFromAttribute (last, variables) {
  if (!last) return null
  return getLiteralOrIdentifier(last, variables)
}

function getRightNodeFromAttribute (current, next, variables) {
  if (current.value) return convertValueToNode(current.value, variables)
  return getLiteralOrIdentifier(next, variables)
}

function getLiteralOrIdentifier (attribute, variables) {
  const key = attribute.key || attribute
  return digits.has(key) ? getLiteral(digits.get(key)) : convertKey(key, variables)
}

function getCondition (attrs, variables) {
  let attributes = normalize(attrs)
  let keys = attributes.map(attr => attr.key)
  const values = attributes.map(attr => attr.value)
  const actions = findActions(attributes)
  if (actions.length === 0) {
    const key = keys[0]
    return convertKey(key, variables)
  } else if (actions.length === 1) {
    return getTest(actions[0], keys, values, variables)
  } else {
    const expressions = []
    for (let i = 0, ilen = attributes.length; i < ilen; i += 1) {
      const attribute = attributes[i]
      if (attribute.type === 'Identifier') {
        const last = attributes[i - 1]
        const next = attributes[i + 1]
        if (!next || OPERATORS.includes(next.key)) {
          let node = getLeftNodeFromAttribute(attribute, variables)
          if (last && last.key === 'not') {
            node = { type: 'UnaryExpression', operator: '!', prefix: true, argument: node }
          }
          expressions.push(node)
        }
      } else if (attribute.type === 'Action') {
        const action = actions.find(action => action.name === attribute.key)
        if (OPERATORS.includes(attribute.key)) {
          expressions.push(action)
        } else {
          if (action.args === 1) {
            if (action.name === 'not') {
              const next = attributes[i + 1]
              i += 1
              const left = getLeftNodeFromAttribute(next, variables)
              expressions.push(action.handler(left))
            } else {
              const previous = attributes[i - 1]
              const left = getLeftNodeFromAttribute(previous, variables)
              expressions.push(action.handler(left))
            }
          } else if (action.args === 2) {
            const previous = attributes[i - 1]
            const current = attributes[i]
            const next = attributes[i + 1]
            i += 1
            const left = getLeftNodeFromAttribute(previous, variables)
            const right = getRightNodeFromAttribute(current, next, variables)
            expressions.push(action.handler(left, right))
          } else if (action.args === 3) {
            const node = getLiteralOrIdentifier(attributes[i - 1], variables)
            const startRange = getLiteralOrIdentifier(attributes[i + 1], variables)
            const endRange = getLiteralOrIdentifier(attributes[i + 3], variables)
            expressions.push(action.handler(node, startRange, endRange))
          }
        }
      }
    }
    const stack = []
    const conditions = []
    for (let i = 0, ilen = expressions.length; i < ilen; i += 1) {
      const expression = expressions[i]
      if (OPERATORS.includes(expression.name)) {
        const left = stack.shift() || expressions[i - 1]
        const right = expressions[i + 1]
        i += 1
        const condition = expression.handler(left, right)
        stack.push(condition)
        conditions.push(condition)
      }
    }
    return conditions[conditions.length - 1]
  }
}

function getExtension (value) {
  const parts = value.split('.')
  const extension = parts[parts.length - 1]
  return extension === 'svg' ? 'svg+xml' : extension
}

async function collect (tree, fragment, variables, filters, components, statistics, translations, store, depth, options, promises, errors) {
  try {
    if (fragment.used) return
    depth += 1
    fragment.used = true
    const tag = fragment.tagName
    const attrs = fragment.attributes
    const keys = attrs ? attrs.map(attr => attr.key) : []
    const component = components.find(component => component.name === tag)
    const { languages, translationsPaths } = options
    if (component && !fragment.imported) {
      const { localVariables } = resolveComponent(component, fragment, components, statistics, options)
      localVariables.forEach(variable => variables.push(variable.key))
      const ast = new AbstractSyntaxTree('')
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      // TODO instead of doing this we could pass the variables down the road together
      // with the values and set them there instead of replacing here
      // if the passed value is an expression we could assign it to a free variable
      // and then use inside of the template
      // this would have a better performance than the current solution

      // this part of the code also deserves to have more specs
      // e.g. this possibly will cause issues if the identifier is a part of a more complex node
      ast.replace({
        enter: node => {
          const variable = localVariables.find(variable => variable.key === node.name)
          if (node.type === 'Identifier' && variable) {
            return convertText(variable.value, variables, filters, translations, languages, translationsPaths)[0]
          }
        }
      })
      const body = ast.body()
      body.forEach(node => tree.append(node))
      localVariables.forEach(() => variables.pop())
    } else if (tag === 'content') {
      const { key } = attrs[1]
      store[key] = fragment
      fragment.children.forEach(child => {
        child.used = true
      })
    } else if (tag === 'translate') {
      const attribute = fragment.attributes[0]
      if (attribute) {
        const { key } = attribute
        fragment.used = true
        fragment.children = [{ type: 'text', content: `{'${key}' | translate}` }]
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        const body = ast.body()
        body.forEach(node => tree.append(node))
      }
    } else if ((tag === 'script' && keys.includes('inline')) || options.inline.includes('scripts')) {
      if (keys.includes('src')) {
        const { value: path } = attrs.find(attr => attr.key === 'src')
        let content = `<script`
        fragment.attributes.forEach(attribute => {
          const { key, value } = attribute
          if (key !== 'src' && key !== 'inline') {
            content += ` ${key}="${value}"`
          }
        })
        content += '>'
        findFile(path, options, location => {
          content += readFileSync(location, 'utf8')
          statistics.scripts.push({ path: location })
        })
        content += `</script>`
        tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(content)))
      } else {
        const leaf = fragment.children[0]
        leaf.used = true
        const ast = new AbstractSyntaxTree(leaf.content)
        ast.each('VariableDeclarator', node => variables.push(node.id.name))
        const body = ast.body()
        body.forEach(node => tree.append(node))
      }
    } else if (tag === 'script' && keys.includes('store')) {
      const leaf = fragment.children[0]
      leaf.used = true
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('<script>')))
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('const STORE = ')))
      tree.append(getTemplateAssignmentExpression(options.variables.template, {
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'JSON'
            },
            property: {
              type: 'Identifier',
              name: 'stringify'
            },
            computed: false
          },
          arguments: [
            {
              type: 'Identifier',
              name: OBJECT_VARIABLE
            }
          ]
        }
      }))
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(`\n${leaf.content}`)))
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('</script>')))
    } else if (tag === 'script' && keys.includes('compiler')) {
      const { value } = attrs.find(attr => attr.key === 'compiler')
      const compiler = options.compilers[value]
      if (typeof compiler === 'function') {
        const attr = attrs.find(attr => attr.key === 'options')
        let params
        if (attr && attr.value) {
          params = JSON.parse(attr.value)
        }
        const leaf = fragment.children[0]
        leaf.used = true
        const result = compiler(leaf.content, params)
        if (typeof result === 'string') {
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('<script>')))
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(result)))
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('</script>')))
        } else if (result instanceof Promise) {
          asyncCounter += 1
          const ASYNC_PLACEHOLDER_TEXT = `ASYNC_PLACEHOLDER_${asyncCounter}`
          tree.append(getLiteral(ASYNC_PLACEHOLDER_TEXT))
          promises.push(result)
          const source = await result
          tree.walk((node, parent) => {
            if (node.type === 'Literal' && node.value === ASYNC_PLACEHOLDER_TEXT) {
              const index = parent.body.findIndex(element => {
                return element.type === 'Literal' && node.value === ASYNC_PLACEHOLDER_TEXT
              })
              parent.body.splice(index, 1)
              parent.body.splice(index + 0, 0, getTemplateAssignmentExpression(options.variables.template, getLiteral('<script>')))
              parent.body.splice(index + 1, 0, getTemplateAssignmentExpression(options.variables.template, getLiteral(source)))
              parent.body.splice(index + 2, 0, getTemplateAssignmentExpression(options.variables.template, getLiteral('</script>')))
            }
          })
        }
      }
    } else if (tag === 'link' && (keys.includes('inline') || options.inline.includes('stylesheets'))) {
      const { value: path } = attrs.find(attr => attr.key === 'href')
      let content = '<style>'
      findFile(path, options, location => {
        content += readFileSync(location, 'utf8')
        statistics.stylesheets.push({ path: location })
      })
      content += '</style>'
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(content)))
    } else if ((tag === 'script' && keys.includes('i18n')) || tag === 'i18n') {
      let leaf = fragment.children[0]
      if (!leaf) {
        if (keys.includes('from')) {
          const { value: path } = attrs.find(attr => attr.key === 'from')
          const parts = path.split('.')
          const extension = parts[parts.length - 1]
          findFile(path, options, location => {
            leaf = { content: readFileSync(location, 'utf8') }
            statistics.translations.push({ path: location })
          })
          keys.push(extension)
        } else {
          throw new Error('The translation script cannot be empty')
        }
      }
      leaf.used = true
      let data = {}
      if (keys.includes('yaml')) {
        data = parseYAML(leaf.content)
      } else if (keys.includes('json')) {
        data = parseJSON(leaf.content)
      } else {
        data = parseJS(leaf.content)
      }
      for (let key in data) {
        if (translations[key]) { throw new Error('Translation already exists') }
        translations[key] = data[key]
      }
    } else if (tag === 'style' || tag === 'script' || tag === 'template') {
      let content = `<${tag}`
      fragment.attributes.forEach(attribute => {
        content += ` ${attribute.key}="${attribute.value}"`
      })
      content += '>'
      fragment.children.forEach(node => {
        node.used = true
        content += node.content
      })
      content += `</${tag}>`
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(content)))
    } else if (tag === '!doctype') {
      tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('<!doctype html>')))
    } else if (fragment.type === 'element' && !SPECIAL_TAGS.includes(tag)) {
      if (tag === 'svg' && keys.includes('from')) {
        const attr = attrs.find(attr => attr.key === 'from')
        const { value: path } = attr
        if (!path) { throw new Error('Attribute empty on the svg tag: from.') }
        findFile(path, options, location => {
          const content = parse(readFileSync(location, 'utf8'))[0]
          statistics.svgs.push({ path: location })
          fragment.attributes = content.attributes
          fragment.children = content.children
        })
      } else if (tag === 'img') {
        if (attrs.find(attr => attr.key === 'size')) {
          const index = attrs.findIndex(attr => attr.key === 'size')
          const [width, height] = attrs[index].value.split('x')
          attrs.push({ key: 'width', value: width })
          attrs.push({ key: 'height', value: height })
          attrs.splice(index, 1)
        }
        setDimension(fragment, attrs, keys, statistics, 'width', options)
        setDimension(fragment, attrs, keys, statistics, 'height', options)
        if (keys.includes('inline') || options.inline.includes('images')) {
          fragment.attributes = fragment.attributes.map(attr => {
            if (attr.key === 'inline') return null
            if (attr.key === 'src') {
              const extension = getExtension(attr.value)
              const extensions = ['png', 'jpg', 'jpeg', 'gif', 'svg+xml']
              if (extensions.includes(extension)) {
                const path = attr.value
                findFile(path, options, location => {
                  const content = readFileSync(location, 'base64')
                  statistics.images.push({ path: location })
                  attr.value = `data:image/${extension};base64, ${content}`
                })
              }
            }
            return attr
          }).filter(Boolean)
        }
      }
      if (keys.includes('content')) {
        const { value } = attrs[0]
        if (store[value]) {
          fragment.children = store[value].children
          fragment.children.forEach(child => {
            child.used = false
          })
        }
        if (fragment.tagName !== 'meta') {
          fragment.attributes = fragment.attributes.filter(attribute => attribute.key !== 'content')
        }
      }
      collectComponentsFromPartialAttribute(fragment, statistics, options)
      const nodes = convertTag(fragment, variables, filters, translations, languages, translationsPaths, options)
      nodes.forEach(node => {
        if (node.type === 'IfStatement') {
          node.depth = depth
          return tree.append(node)
        }
        tree.append(getTemplateAssignmentExpression(options.variables.template, node))
      })
      walk(fragment, async node => {
        await collect(tree, node, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      if (!SELF_CLOSING_TAGS.includes(tag)) {
        const attr = fragment.attributes.find(attr => attr.key === 'tag' || attr.key === 'tag.bind')
        if (attr) {
          const property = attr.key === 'tag' ? attr.value.substring(1, attr.value.length - 1) : attr.value
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('</')))
          tree.append(getTemplateAssignmentExpression(options.variables.template, getObjectMemberExpression(property)))
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral('>')))
        } else {
          tree.append(getTemplateAssignmentExpression(options.variables.template, getLiteral(`</${tag}>`)))
        }
      }
    } else if (fragment.type === 'text') {
      const nodes = convertText(fragment.content, variables, filters, translations, languages, translationsPaths)
      return nodes.forEach(node => tree.append(getTemplateAssignmentExpression(options.variables.template, node)))
    } else if (tag === 'if') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      const condition = getCondition(attrs, variables)
      appendIfStatement(condition, tree, ast, depth)
    } else if (tag === 'elseif') {
      let leaf = tree.last(`IfStatement[depth="${depth}"]`)
      if (leaf) {
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        while (leaf.alternate && leaf.alternate.type === 'IfStatement') {
          leaf = leaf.alternate
        }
        const condition = getCondition(attrs, variables)
        leaf.alternate = {
          type: 'IfStatement',
          test: condition,
          consequent: {
            type: 'BlockStatement',
            body: ast.body()
          },
          depth
        }
      }
    } else if (tag === 'else') {
      let leaf = tree.last(`IfStatement[depth="${depth}"]`)
      if (leaf) {
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        while (leaf.alternate && leaf.alternate.type === 'IfStatement') {
          leaf = leaf.alternate
        }
        leaf.alternate = {
          type: 'BlockStatement',
          body: ast.body()
        }
      }
    } else if (tag === 'for') {
      if (attrs.length <= 3) {
        const ast = new AbstractSyntaxTree('')
        const [left, operator, right] = attrs
        let range
        if (right && right.key === 'range' && right.value) {
          if (right.value.includes('...')) {
            range = right.value.split('...').map(Number)
          } else if (right.value.includes('..')) {
            range = right.value.split('..').map(Number)
            range[1] += 1
          } else {
            range = [0, Number(right.value) + 1]
          }
        }
        const variable = left.key
        let parent = operator.value || `{${right.key}}`
        const name = convertAttribute('html', parent, variables, translations, languages, translationsPaths)

        variables.push(variable)
        parent = parent.substring(1, parent.length - 1) // TODO: Handle nested properties
        const index = getFreeIdentifier(variables.concat(parent))
        variables.push(index)
        const guard = getFreeIdentifier(variables.concat(parent))
        variables.push(guard)
        ast.append(getForLoopVariable(variable, name, variables, index, range))
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        tree.append(getForLoop(name, ast.body(), variables, index, guard, range))
        variables.pop()
        variables.pop()
        variables.pop()
      } else if (attrs.length <= 5) {
        const ast = new AbstractSyntaxTree('')
        const [key, , value, operator, right] = attrs
        const keyIdentifier = key.key
        const valueIdentifier = value.key
        variables.push(keyIdentifier)
        variables.push(valueIdentifier)

        let parent = operator.value || `{${right.key}}`
        const name = convertAttribute('html', parent, variables, translations, languages, translationsPaths)
        ast.append(getForInLoopVariable(keyIdentifier, valueIdentifier, name))

        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        tree.append(getForInLoop(keyIdentifier, name, ast.body()))
        variables.pop()
        variables.pop()
      }
    } else if (tag === 'slot' || tag === 'yield') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      const body = ast.body()
      body.forEach(node => tree.append(node))
    } else if (tag === 'try') {
      const ast = new AbstractSyntaxTree('')
      const variable = `_${TEMPLATE_VARIABLE}`
      ast.append(getTemplateVariableDeclaration(variable))
      options.variables.template = variable
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      ast.append(getTemplateAssignmentExpression(TEMPLATE_VARIABLE, { type: 'Identifier', name: variable }))
      options.variables.template = TEMPLATE_VARIABLE
      tree.append({
        type: 'TryStatement',
        block: {
          type: 'BlockStatement',
          body: ast.body()
        }
      })
    } else if (tag === 'catch') {
      const leaf = tree.last('TryStatement')
      if (leaf) {
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        leaf.handler = {
          type: 'CatchClause',
          param: {
            type: 'Identifier',
            name: 'exception'
          },
          body: {
            type: 'BlockStatement',
            body: ast.body()
          }
        }
      }
    } else if (tag === 'unless') {
      const ast = new AbstractSyntaxTree('')
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      const { key } = attrs[0]
      tree.append({
        type: 'IfStatement',
        test: {
          type: 'UnaryExpression',
          operator: '!',
          prefix: true,
          argument: convertKey(key, variables)
        },
        consequent: {
          type: 'BlockStatement',
          body: ast.body()
        },
        depth
      })
    } else if (tag === 'elseunless') {
      let leaf = tree.last(`IfStatement[depth="${depth}"]`)
      if (leaf) {
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        while (leaf.alternate && leaf.alternate.type === 'IfStatement') {
          leaf = leaf.alternate
        }
        const { key } = attrs[0]
        leaf.alternate = {
          type: 'IfStatement',
          test: {
            type: 'UnaryExpression',
            operator: '!',
            prefix: true,
            argument: convertKey(key, variables)
          },
          consequent: {
            type: 'BlockStatement',
            body: ast.body()
          },
          depth
        }
      }
    } else if (tag === 'switch') {
      tree.append({
        type: 'SwitchStatement',
        discriminant: {
          type: 'Literal',
          value: true
        },
        attribute: attrs[0],
        cases: []
      })
    } else if (tag === 'case') {
      let leaf = tree.last('SwitchStatement')
      if (leaf) {
        const attributes = [leaf.attribute]
        attrs.forEach(attr => {
          attributes.push(attr)
          if (OPERATORS.includes(attr.key)) {
            attributes.push(leaf.attribute)
          }
        })
        const condition = getCondition(attributes, variables)
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        ast.append({
          type: 'BreakStatement',
          label: null
        })
        leaf.cases.push({
          type: 'SwitchCase',
          consequent: ast.body(),
          test: condition
        })
      }
    } else if (tag === 'default') {
      let leaf = tree.last('SwitchStatement')
      if (leaf) {
        const ast = new AbstractSyntaxTree('')
        walk(fragment, async current => {
          await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
        })
        ast.append({
          type: 'BreakStatement',
          label: null
        })
        leaf.cases.push({
          type: 'SwitchCase',
          consequent: ast.body(),
          test: null
        })
      }
    } else if (tag === 'foreach' || tag === 'each') {
      const ast = new AbstractSyntaxTree('')
      let left, right, key, value

      if (attrs.length === 3) {
        [left, , right] = attrs
      } else if (attrs.length === 5) {
        [key, , value, , right] = attrs
      }

      if (left) {
        variables.push(left.key)
      } else if (key && value) {
        variables.push(key.key)
        variables.push(value.key)
      }
      walk(fragment, async current => {
        await collect(ast, current, variables, filters, components, statistics, translations, store, depth, options, promises, errors)
      })
      if (left) {
        variables.pop()
      } else if (key && value) {
        variables.pop()
        variables.pop()
      }
      tree.append({
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            object: convertKey(right.key, variables),
            property: {
              type: 'Identifier',
              name: tag === 'foreach' ? 'forEach' : 'each'
            },
            computed: false
          },
          arguments: [
            {
              type: 'FunctionExpression',
              params: [
                left ? {
                  type: 'Identifier',
                  name: left.key
                } : null,
                key ? {
                  type: 'Identifier',
                  name: key.key
                } : null,
                value ? {
                  type: 'Identifier',
                  name: value.key
                } : null
              ].filter(Boolean),
              body: {
                type: 'BlockStatement',
                body: ast.body()
              }
            }
          ]
        }
      })
    } else if (tag === 'import' || tag === 'require') {
      collectComponentsFromImport(fragment, statistics, components, null, options)
    } else if (tag === 'partial' || tag === 'render') {
      collectComponentsFromPartialOrRender(fragment, statistics, options)
    }
    depth -= 1
  } catch (exception) {
    errors.push(exception)
  }
}

module.exports = collect
