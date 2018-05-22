const assert = require('assert')
const { normalize } = require('./array')

// assert.deepEqual(normalize(['not', 'foo']), ['not', 'foo'])
// assert.deepEqual(normalize(['foo', 'is', 'positive']), ['foo', 'is_positive'])
// assert.deepEqual(normalize(['foo', 'is', 'negative']), ['foo', 'is_negative'])
// assert.deepEqual(normalize(['foo', 'is', 'finite']), ['foo', 'is_finite'])
// assert.deepEqual(normalize(['foo', 'is', 'infinite']), ['foo', 'is_infinite'])
// assert.deepEqual(normalize(['foo', 'is', 'present']), ['foo', 'is_present'])
// assert.deepEqual(normalize(['foo', 'are', 'present']), ['foo', 'are_present'])
// // assert.deepEqual(normalize(['is', 'empty']), '')
// // assert.deepEqual(normalize(['are', 'empty']), '')
// // assert.deepEqual(normalize(['is', 'null']), '')
// // assert.deepEqual(normalize(['is', 'undefined']), '')
// // assert.deepEqual(normalize(['is', 'void']), '')
// // assert.deepEqual(normalize(['is', 'even']), '')
// // assert.deepEqual(normalize(['is', 'odd']), '')
// // assert.deepEqual(normalize(['is', 'an', 'array']), '')
// // assert.deepEqual(normalize(['is', 'an', 'object']), '')
// // assert.deepEqual(normalize(['is', 'a', 'regexp']), '')
// // assert.deepEqual(normalize(['is', 'a', 'regex']), '')
// // assert.deepEqual(normalize(['is', 'a', 'number']), '')
// // assert.deepEqual(normalize(['is', 'a', 'string']), '')
// // assert.deepEqual(normalize(['is', 'a', 'symbol']), '')
// // assert.deepEqual(normalize(['is', 'a', 'map']), '')
// // assert.deepEqual(normalize(['is', 'a', 'weakmap']), '')
// // assert.deepEqual(normalize(['is', 'a', 'set']), '')
// // assert.deepEqual(normalize(['is', 'a', 'weakset']), '')
// // assert.deepEqual(normalize(['is', 'a', 'boolean']), '')
// // assert.deepEqual(normalize(['is', 'a', 'date']), '')
// // assert.deepEqual(normalize(['is', 'true']), '')
// // assert.deepEqual(normalize(['is', 'false']), '')
// // assert.deepEqual(normalize(['is', 'truthy']), '')
// // assert.deepEqual(normalize(['is', 'falsy']), '')
// assert.deepEqual(normalize(['foo', 'has', 'a', 'whitespace']), ['foo', 'has_a_whitespace'])
// // assert.deepEqual(normalize(['has', 'a', 'newline']), '')
// // assert.deepEqual(normalize(['has', 'a', 'number']), '')
// // assert.deepEqual(normalize(['has', 'numbers']), '')
// assert.deepEqual(normalize(['foo', 'or', 'bar']), ['foo', 'or', 'bar'])
// assert.deepEqual(normalize(['foo', 'and', 'bar']), ['foo', 'and', 'bar'])
// assert.deepEqual(normalize(['foo', 'eq', 'bar']), ['foo', 'eq', 'bar'])
// assert.deepEqual(normalize(['foo', 'neq', 'bar']), ['foo', 'neq', 'bar'])
// assert.deepEqual(normalize(['foo', 'does', 'not', 'equal', 'bar']), ['foo', 'does_not_equal', 'bar'])
// assert.deepEqual(normalize(['foo', 'is', 'not', 'equal', 'to', 'bar']), ['foo', 'is_not_equal_to', 'bar'])
// // assert.deepEqual(normalize(['gt']), '')
// assert.deepEqual(normalize(['foo', 'is', 'greater', 'than', 'bar']), ['foo', 'is_greater_than', 'bar'])
// // assert.deepEqual(normalize(['lt']), '')
// assert.deepEqual(normalize(['foo', 'is', 'less', 'than', 'bar']), ['foo', 'is_less_than', 'bar'])
// // assert.deepEqual(normalize(['gte']), '')
// assert.deepEqual(normalize(['foo', 'is', 'greater', 'than', 'or', 'equals', 'bar']), ['foo', 'is_greater_than_or_equals', 'bar'])
// // assert.deepEqual(normalize(['lte']), '')
// assert.deepEqual(normalize(['foo', 'is', 'less', 'than', 'or', 'equals', 'bar']), ['foo', 'is_less_than_or_equals', 'bar'])
// // assert.deepEqual(normalize(['equals']), '')
// assert.deepEqual(normalize(['foo', 'bitwise', 'or', 'bar']), ['foo', 'bitwise_or', 'bar'])
// // assert.deepEqual(normalize(['bitwise', 'and']), '')
// // assert.deepEqual(normalize(['bitwise', 'xor']), '')
// // assert.deepEqual(normalize(['bitwise', 'not']), '')
assert.deepEqual(normalize([
  { key: 'not', value: null }, { key: 'foo', value: null }
]), [{ key: 'not', value: null, type: 'Action' }, { key: 'foo', value: null, type: 'Identifier' } ])

assert.deepEqual(normalize([
  { key: 'foo', value: null },
  { key: 'is', value: null },
  { key: 'positive', value: null }
]), [
  { key: 'foo', value: null, type: 'Identifier' },
  { key: 'is_positive', value: null, type: 'Action' }
])

assert.deepEqual(normalize([
  { key: 'foo', value: null },
  { key: 'is', value: null },
  { key: 'less', value: null },
  { key: 'than', value: null },
  { key: 'or', value: null },
  { key: 'equals', value: null },
  { key: 'bar', value: null }
]), [
  { key: 'foo', value: null, type: 'Identifier' },
  { key: 'is_less_than_or_equals', value: null, type: 'Action' },
  { key: 'bar', value: null, type: 'Identifier' }
])
